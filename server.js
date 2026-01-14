// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const Stripe = require("stripe");

const db = require("./db");

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ============================
// 0) Webhook Stripe (RAW BODY)
// IMPORTANT: doit être défini AVANT express.json()
// ============================
app.post("/webhook/stripe", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Quand le client finit Checkout => on enregistre le moyen de paiement + on marque l'échéance 1 payée
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;

    (async () => {
      try {
        if (!orderId) return;

        // Récupère le PaymentIntent pour obtenir payment_method
        const pi = await stripe.paymentIntents.retrieve(session.payment_intent);

        // Sauvegarde customer + payment_method pour paiement 2 off-session
        db.prepare(
          "UPDATE orders SET stripe_customer_id=?, stripe_payment_method_id=? WHERE id=?"
        ).run(session.customer, pi.payment_method, orderId);

        // Marque échéance 1 = paid
        const inst1 = db.prepare("SELECT * FROM installments WHERE order_id=? AND n=1").get(orderId);
        if (inst1) {
          db.prepare("UPDATE installments SET status=? WHERE id=?").run("paid", inst1.id);
        }

        console.log("✅ Webhook checkout.session.completed => installment 1 paid, PM saved", orderId);
      } catch (e) {
        console.error("Webhook handler error:", e);
      }
    })();
  }

  res.json({ received: true });
});

// ============================
// 1) Middlewares normaux
// ============================
app.use(cors());
app.use(express.json());

// Sert /demo.html et /bnpl.js depuis /public
app.use(express.static(path.join(__dirname, "public")));
// Sert /admin/index.html depuis /admin
app.use("/admin", express.static(path.join(__dirname, "admin")));

// ============================
// Helpers
// ============================
function nowIso() {
  return new Date().toISOString();
}
function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ============================
// 2) Routes
// ============================
app.get("/", (req, res) => res.send("OK"));

// Quote 2x 50/50
app.post("/v1/quote", (req, res) => {
  const { amount, currency = "EUR" } = req.body;
  if (!amount || typeof amount !== "number") {
    return res.status(400).json({ error: "amount (number) required" });
  }

  const totalCents = Math.round(amount * 100);
  const first = Math.ceil(totalCents / 2);
  const second = totalCents - first;

  res.json({
    currency,
    totalCents,
    installments: [
      { n: 1, amountCents: first, dueDate: addDaysIso(0) },
      { n: 2, amountCents: second, dueDate: addDaysIso(30) }
    ]
  });
});

// Crée commande + échéances + Stripe Checkout (paiement 1/2)
app.post("/v1/checkout/session", async (req, res) => {
  try {
    const { merchantId, orderRef, amount, currency = "EUR" } = req.body;

    if (!merchantId) return res.status(400).json({ error: "merchantId required" });
    if (!amount || typeof amount !== "number") return res.status(400).json({ error: "amount required" });
    if (!process.env.BASE_URL) return res.status(500).json({ error: "BASE_URL missing in .env" });
    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "STRIPE_SECRET_KEY missing in .env" });

    const totalCents = Math.round(amount * 100);
    const first = Math.ceil(totalCents / 2);
    const second = totalCents - first;

    const orderId = crypto.randomUUID();
    const inst1Id = crypto.randomUUID();
    const inst2Id = crypto.randomUUID();

    // DB: order + installments
    db.prepare(
      "INSERT INTO orders (id, merchant_id, order_ref, amount_cents, currency, created_at) VALUES (?,?,?,?,?,?)"
    ).run(orderId, merchantId, orderRef || null, totalCents, currency, nowIso());

    db.prepare(
      "INSERT INTO installments (id, order_id, n, amount_cents, due_date, status, created_at) VALUES (?,?,?,?,?,?,?)"
    ).run(inst1Id, orderId, 1, first, addDaysIso(0), "pending", nowIso());

    db.prepare(
      "INSERT INTO installments (id, order_id, n, amount_cents, due_date, status, created_at) VALUES (?,?,?,?,?,?,?)"
    ).run(inst2Id, orderId, 2, second, addDaysIso(30), "pending", nowIso());

    // Stripe: Checkout Session pour payer 1/2
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: "Paiement 1/2 (50%)" },
            unit_amount: first
          }
        }
      ],
      payment_intent_data: {
        // permet de réutiliser la carte plus tard en off-session
        setup_future_usage: "off_session",
        metadata: { orderId, installment: "1" }
      },
      metadata: { orderId },
      success_url: `${process.env.BASE_URL}/demo.html?success=1&orderId=${orderId}`,
      cancel_url: `${process.env.BASE_URL}/demo.html?canceled=1`
    });

    res.json({ orderId, checkoutUrl: session.url });
  } catch (e) {
    console.error("checkout/session error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
});

// Reporting
app.get("/v1/merchants/:merchantId/transactions", (req, res) => {
  const { merchantId } = req.params;

  const rows = db.prepare(`
    SELECT 
      o.id as order_id,
      o.order_ref,
      o.amount_cents,
      o.currency,
      o.created_at,
      o.stripe_customer_id,
      o.stripe_payment_method_id,
      i.n,
      i.amount_cents as installment_cents,
      i.due_date,
      i.status
    FROM orders o
    JOIN installments i ON i.order_id = o.id
    WHERE o.merchant_id = ?
    ORDER BY o.created_at DESC, i.n ASC
  `).all(merchantId);

  res.json({ rows });
});

// ============================
// 3) Start
// ============================
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
