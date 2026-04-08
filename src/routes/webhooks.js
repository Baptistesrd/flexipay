const express = require("express");
const db = require("../../db");
const stripe = require("../services/stripe");
const { nowIso } = require("../lib/helpers");

const router = express.Router();

// POST /webhook/stripe
// Must use express.raw() — raw body required for Stripe signature verification.
// This route is mounted BEFORE express.json() in server.js.
router.post("/stripe", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ── Idempotency ─────────────────────────────────────────────────────────────
  try {
    const already = db.prepare("SELECT id FROM stripe_events WHERE id=?").get(event.id);
    if (already) return res.json({ received: true, duplicate: true });

    db.prepare("INSERT INTO stripe_events (id, type, created_at) VALUES (?,?,?)").run(
      event.id,
      event.type,
      nowIso()
    );
  } catch (e) {
    console.error("Webhook idempotence error:", e);
  }

  // ── checkout.session.completed ──────────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;

    (async () => {
      try {
        if (!orderId) return;

        const pi = await stripe.paymentIntents.retrieve(session.payment_intent);

        db.prepare(
          "UPDATE orders SET stripe_customer_id=?, stripe_payment_method_id=? WHERE id=?"
        ).run(session.customer, pi.payment_method, orderId);

        const inst1 = db
          .prepare("SELECT * FROM installments WHERE order_id=? AND n=1")
          .get(orderId);

        if (inst1) {
          db.prepare(
            "UPDATE installments SET status='paid', stripe_payment_intent_id=?, last_error=NULL, updated_at=? WHERE id=?"
          ).run(pi.id, nowIso(), inst1.id);
        }

        console.log("✅ checkout.session.completed => PM saved", orderId);
      } catch (e) {
        console.error("Webhook checkout.session.completed handler error:", e);
      }
    })();
  }

  // ── payment_intent.succeeded ────────────────────────────────────────────────
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;
    const orderId = pi.metadata?.orderId;
    const installmentN = Number(pi.metadata?.installment);
    const installmentId = pi.metadata?.installmentId;

    try {
      if (installmentId) {
        db.prepare(
          "UPDATE installments SET status='paid', stripe_payment_intent_id=?, last_error=NULL, updated_at=? WHERE id=?"
        ).run(pi.id, nowIso(), installmentId);
      } else if (orderId && installmentN) {
        db.prepare(
          "UPDATE installments SET status='paid', stripe_payment_intent_id=?, last_error=NULL, updated_at=? WHERE order_id=? AND n=?"
        ).run(pi.id, nowIso(), orderId, installmentN);
      }
      console.log("✅ payment_intent.succeeded", pi.id);
    } catch (e) {
      console.error("PI succeeded handler error:", e);
    }
  }

  // ── payment_intent.payment_failed ───────────────────────────────────────────
  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object;
    const msg = pi.last_payment_error?.message || "payment_failed";
    const installmentId = pi.metadata?.installmentId;
    const orderId = pi.metadata?.orderId;
    const installmentN = Number(pi.metadata?.installment);

    try {
      if (installmentId) {
        db.prepare(
          "UPDATE installments SET status='failed', stripe_payment_intent_id=?, last_error=?, updated_at=? WHERE id=?"
        ).run(pi.id, msg, nowIso(), installmentId);
      } else if (orderId && installmentN) {
        db.prepare(
          "UPDATE installments SET status='failed', stripe_payment_intent_id=?, last_error=?, updated_at=? WHERE order_id=? AND n=?"
        ).run(pi.id, msg, nowIso(), orderId, installmentN);
      }
      console.log("❌ payment_intent.payment_failed", pi.id, msg);
    } catch (e) {
      console.error("PI failed handler error:", e);
    }
  }

  res.json({ received: true });
});

module.exports = router;
