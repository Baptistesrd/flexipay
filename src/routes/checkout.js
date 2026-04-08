const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const db = require("../../db");
const stripe = require("../services/stripe");
const { nowIso, addDaysIso } = require("../lib/helpers");

const router = express.Router();

// ── Rate limiters (Task 5) ────────────────────────────────────────────────────

const quoteLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ error: "Too many requests. Please slow down." }),
});

const sessionLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res
      .status(429)
      .json({ error: "Too many checkout requests. Please try again in a minute." }),
});

// ── POST /v1/quote ────────────────────────────────────────────────────────────

router.post("/quote", quoteLimit, (req, res) => {
  const { amount, currency = "EUR" } = req.body;

  if (amount == null || typeof amount !== "number") {
    return res.status(400).json({ error: "amount (number) required" });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }

  const totalCents = Math.round(amount * 100);
  const first = Math.ceil(totalCents / 2);
  const second = totalCents - first;

  res.json({
    currency,
    totalCents,
    installments: [
      { n: 1, amountCents: first, dueDate: addDaysIso(0) },
      { n: 2, amountCents: second, dueDate: addDaysIso(30) },
    ],
  });
});

// ── POST /v1/checkout/session ─────────────────────────────────────────────────

router.post("/checkout/session", sessionLimit, async (req, res) => {
  try {
    const { merchantId, orderRef, amount, currency = "EUR" } = req.body;

    if (!merchantId) return res.status(400).json({ error: "merchantId required" });
    if (amount == null || typeof amount !== "number")
      return res.status(400).json({ error: "amount required" });
    if (!Number.isFinite(amount) || amount <= 0)
      return res.status(400).json({ error: "amount must be positive" });
    if (!process.env.BASE_URL)
      return res.status(500).json({ error: "BASE_URL missing in .env" });

    const m = db.prepare("SELECT id FROM merchants WHERE id=?").get(merchantId);
    if (!m) return res.status(404).json({ error: "merchant not found" });

    const totalCents = Math.round(amount * 100);
    const first = Math.ceil(totalCents / 2);
    const second = totalCents - first;

    const orderId = crypto.randomUUID();
    const inst1Id = crypto.randomUUID();
    const inst2Id = crypto.randomUUID();

    db.prepare(
      "INSERT INTO orders (id, merchant_id, order_ref, amount_cents, currency, status, created_at) VALUES (?,?,?,?,?,?,?)"
    ).run(orderId, merchantId, orderRef || null, totalCents, currency, "active", nowIso());

    db.prepare(
      `INSERT INTO installments
        (id, order_id, n, amount_cents, due_date, status, created_at, updated_at, retry_count, next_retry_date)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(inst1Id, orderId, 1, first, addDaysIso(0), "pending", nowIso(), nowIso(), 0, null);

    db.prepare(
      `INSERT INTO installments
        (id, order_id, n, amount_cents, due_date, status, created_at, updated_at, retry_count, next_retry_date)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(inst2Id, orderId, 2, second, addDaysIso(30), "pending", nowIso(), nowIso(), 0, null);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: "Paiement 1/2 (50%)" },
            unit_amount: first,
          },
        },
      ],
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: { orderId, installment: "1", installmentId: inst1Id, merchantId },
      },
      metadata: { orderId, merchantId },
      success_url: `${process.env.BASE_URL}/demo.html?success=1&orderId=${orderId}`,
      // orderId in cancel_url lets demo.html call the cancel endpoint (Task 2).
      cancel_url: `${process.env.BASE_URL}/demo.html?canceled=1&orderId=${orderId}`,
    });

    res.json({ orderId, checkoutUrl: session.url });
  } catch (e) {
    console.error("checkout/session error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
});

// ── POST /v1/orders/:orderId/cancel ──────────────────────────────────────────
// Called by demo.html when Stripe redirects back with ?canceled=1.
// The orderId is a UUID (unguessable) so no additional auth is required.
// Marks all pending installments + the order itself as cancelled.

router.post("/orders/:orderId/cancel", (req, res) => {
  const { orderId } = req.params;

  const order = db.prepare("SELECT id, status FROM orders WHERE id=?").get(orderId);
  if (!order) return res.status(404).json({ error: "order not found" });
  if (order.status === "cancelled") return res.json({ ok: true, skipped: "already_cancelled" });
  if (order.status !== "active") {
    return res.status(409).json({ error: `order cannot be cancelled (status: ${order.status})` });
  }

  db.prepare(
    "UPDATE installments SET status='cancelled', updated_at=? WHERE order_id=? AND status='pending'"
  ).run(nowIso(), orderId);

  db.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run(orderId);

  res.json({ ok: true });
});

module.exports = router;
