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

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function isDue(dueDateYmd) {
  return dueDateYmd <= todayYmd();
}

// ============================
// Seed merchant demo (dev)
// ============================
function seedMerchantDemo() {
  try {
    const exists = db.prepare("SELECT id FROM merchants WHERE id=?").get("merchant_demo");
    if (!exists) {
      db.prepare("INSERT INTO merchants (id, name, api_key, created_at) VALUES (?,?,?,?)").run(
        "merchant_demo",
        "Demo Merchant",
        "demo_secret_key_change_me",
        nowIso()
      );
      console.log("✅ Seed merchant_demo api_key=demo_secret_key_change_me");
    }
  } catch (e) {
    console.warn("⚠️ seedMerchantDemo skipped (merchants table missing?):", e.message);
  }
}
seedMerchantDemo();

// ============================
// Auth helpers
// ============================
function requireMerchantAuth(req, res, next) {
  const merchantId = req.params.merchantId || req.body.merchantId;
  if (!merchantId) return res.status(400).json({ error: "merchantId missing" });

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing bearer token" });

  const m = db.prepare("SELECT * FROM merchants WHERE id=?").get(merchantId);
  if (!m) return res.status(404).json({ error: "merchant not found" });

  if (m.api_key !== token) return res.status(403).json({ error: "invalid api key" });

  req.merchant = m;
  next();
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || token !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

function randomKey() {
  return crypto.randomBytes(24).toString("hex");
}

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

  // ============================
  // 2.1) Idempotence webhook
  // ============================
  try {
    const already = db.prepare("SELECT id FROM stripe_events WHERE id=?").get(event.id);
    if (already) return res.json({ received: true, duplicate: true });

    db.prepare("INSERT INTO stripe_events (id, type, created_at) VALUES (?,?,?)").run(
      event.id,
      event.type,
      nowIso()
    );
  } catch (e) {
    // En local tu veux que ça passe quand même; en prod, corrige db.js si nécessaire.
    console.error("Webhook idempotence error:", e);
  }

  // ============================
  // checkout.session.completed => sauver customer + payment_method
  // ============================
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

        // Optionnel: marquer échéance 1 paid ici (PI succeeded le fera aussi)
        const inst1 = db
          .prepare("SELECT * FROM installments WHERE order_id=? AND n=1")
          .get(orderId);

        if (inst1) {
          db.prepare(`
            UPDATE installments
            SET status='paid', stripe_payment_intent_id=?, last_error=NULL, updated_at=?
            WHERE id=?
          `).run(pi.id, nowIso(), inst1.id);
        }

        console.log("✅ checkout.session.completed => PM saved", orderId);
      } catch (e) {
        console.error("Webhook checkout.session.completed handler error:", e);
      }
    })();
  }

  // ============================
  // payment_intent.succeeded => maj installment
  // ============================
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;
    const orderId = pi.metadata?.orderId;
    const installmentN = Number(pi.metadata?.installment);
    const installmentId = pi.metadata?.installmentId;

    try {
      if (installmentId) {
        db.prepare(`
          UPDATE installments
          SET status='paid', stripe_payment_intent_id=?, last_error=NULL, updated_at=?
          WHERE id=?
        `).run(pi.id, nowIso(), installmentId);
      } else if (orderId && installmentN) {
        db.prepare(`
          UPDATE installments
          SET status='paid', stripe_payment_intent_id=?, last_error=NULL, updated_at=?
          WHERE order_id=? AND n=?
        `).run(pi.id, nowIso(), orderId, installmentN);
      }

      console.log("✅ payment_intent.succeeded", pi.id);
    } catch (e) {
      console.error("PI succeeded handler error:", e);
    }
  }

  // ============================
  // payment_intent.payment_failed => maj installment
  // ============================
  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object;
    const msg = pi.last_payment_error?.message || "payment_failed";
    const installmentId = pi.metadata?.installmentId;
    const orderId = pi.metadata?.orderId;
    const installmentN = Number(pi.metadata?.installment);

    try {
      if (installmentId) {
        db.prepare(`
          UPDATE installments
          SET status='failed', stripe_payment_intent_id=?, last_error=?, updated_at=?
          WHERE id=?
        `).run(pi.id, msg, nowIso(), installmentId);
      } else if (orderId && installmentN) {
        db.prepare(`
          UPDATE installments
          SET status='failed', stripe_payment_intent_id=?, last_error=?, updated_at=?
          WHERE order_id=? AND n=?
        `).run(pi.id, msg, nowIso(), orderId, installmentN);
      }

      console.log("❌ payment_intent.payment_failed", pi.id, msg);
    } catch (e) {
      console.error("PI failed handler error:", e);
    }
  }

  res.json({ received: true });
});

// ============================
// 1) Middlewares normaux
// ============================
const allowlist = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true); // curl/postman
      if (allowlist.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
  })
);

app.use(express.json());

// Static
app.use(express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin")));

// ============================
// 2.4) Healthcheck
// ============================
app.get("/health", (req, res) => {
  try {
    db.prepare("SELECT 1").get();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================
// 3.1) Admin create merchant
// ============================
app.post("/v1/admin/merchants", requireAdmin, (req, res) => {
  const { id, name } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });

  const exists = db.prepare("SELECT id FROM merchants WHERE id=?").get(id);
  if (exists) return res.status(409).json({ error: "merchant already exists" });

  const apiKey = randomKey();
  db.prepare("INSERT INTO merchants (id, name, api_key, created_at) VALUES (?,?,?,?)").run(
    id,
    name || null,
    apiKey,
    nowIso()
  );

  res.json({ id, name: name || null, apiKey });
});

// ============================
// 2) Routes
// ============================
app.get("/", (req, res) => res.send("OK"));

// Quote 2x 50/50
app.post("/v1/quote", (req, res) => {
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

// Checkout Session (pay 1/2)
app.post("/v1/checkout/session", async (req, res) => {
  try {
    const { merchantId, orderRef, amount, currency = "EUR" } = req.body;

    if (!merchantId) return res.status(400).json({ error: "merchantId required" });
    if (amount == null || typeof amount !== "number") return res.status(400).json({ error: "amount required" });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "amount must be positive" });

    if (!process.env.BASE_URL) return res.status(500).json({ error: "BASE_URL missing in .env" });
    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "STRIPE_SECRET_KEY missing in .env" });

    // 3.2) Vérifier que le merchant existe
    const m = db.prepare("SELECT id FROM merchants WHERE id=?").get(merchantId);
    if (!m) return res.status(404).json({ error: "merchant not found" });

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
      cancel_url: `${process.env.BASE_URL}/demo.html?canceled=1`,
    });

    res.json({ orderId, checkoutUrl: session.url });
  } catch (e) {
    console.error("checkout/session error:", e);
    res.status(500).json({ error: e.message || "server error" });
  }
});

// Reporting (protégé)
app.get("/v1/merchants/:merchantId/transactions", requireMerchantAuth, (req, res) => {
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
      i.id as installment_id,
      i.n,
      i.amount_cents as installment_cents,
      i.due_date,
      i.status,
      i.retry_count,
      i.next_retry_date,
      i.stripe_payment_intent_id,
      i.last_error,
      i.updated_at
    FROM orders o
    JOIN installments i ON i.order_id = o.id
    WHERE o.merchant_id = ?
    ORDER BY o.created_at DESC, i.n ASC
  `).all(merchantId);

  res.json({ rows });
});

// ============================
// Off-session charge logic
// ============================
async function chargeInstallment(installmentId) {
  const inst = db.prepare("SELECT * FROM installments WHERE id=?").get(installmentId);

  if (!inst) return { ok: false, error: "installment_not_found" };
  if (inst.status === "paid") return { ok: true, skipped: "already_paid" };
  if (inst.status === "processing") return { ok: true, skipped: "already_processing" };
  if (inst.status === "action_required") return { ok: false, error: "action_required" };
  if (inst.status === "failed_final") return { ok: false, error: "failed_final" };

  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(inst.order_id);
  if (!order) return { ok: false, error: "order_not_found" };

  if (!order.stripe_customer_id || !order.stripe_payment_method_id) {
    return { ok: false, error: "missing_customer_or_pm" };
  }

  // lock simple
  db.prepare("UPDATE installments SET status=?, updated_at=? WHERE id=?").run(
    "processing",
    nowIso(),
    inst.id
  );

  try {
    const pi = await stripe.paymentIntents.create({
      amount: inst.amount_cents,
      currency: order.currency.toLowerCase(),
      customer: order.stripe_customer_id,
      payment_method: order.stripe_payment_method_id,
      confirm: true,
      off_session: true,
      metadata: {
        orderId: order.id,
        installment: String(inst.n),
        installmentId: inst.id,
        merchantId: order.merchant_id,
      },
    });

    db.prepare(`
      UPDATE installments
      SET status='paid', stripe_payment_intent_id=?, last_error=NULL, updated_at=?
      WHERE id=?
    `).run(pi.id, nowIso(), inst.id);

    return { ok: true, payment_intent: pi.id };
  } catch (e) {
    const code = e?.raw?.code || e?.code || null;
    const msg = e?.raw?.message || e.message || "payment_failed";

    // 2.2) SCA case
    if (code === "authentication_required") {
      db.prepare(`
        UPDATE installments
        SET status=?, last_error=?, updated_at=?
        WHERE id=?
      `).run("action_required", msg, nowIso(), inst.id);

      return { ok: false, action_required: true, error: msg };
    }

    // 2.3) Retry policy max 3 (J+1, J+3, J+7)
    const current = db.prepare("SELECT retry_count FROM installments WHERE id=?").get(inst.id);
    const retryCount = (current?.retry_count || 0) + 1;

    let nextRetry = null;
    const days = retryCount === 1 ? 1 : retryCount === 2 ? 3 : retryCount === 3 ? 7 : null;
    if (days) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      nextRetry = d.toISOString().slice(0, 10);
    }

    db.prepare(`
      UPDATE installments
      SET status=?, last_error=?, retry_count=?, next_retry_date=?, updated_at=?
      WHERE id=?
    `).run(retryCount <= 3 ? "pending" : "failed_final", msg, retryCount, nextRetry, nowIso(), inst.id);

    return { ok: false, error: msg, retryCount, nextRetry };
  }
}

// Job endpoint (protégé par token)
app.post("/v1/jobs/charge-due", async (req, res) => {
  const token = req.headers["x-job-token"];
  if (!process.env.JOB_TOKEN || token !== process.env.JOB_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  // 2.3C) pending + due + retry_date OK
  const due = db.prepare(`
    SELECT id, due_date, next_retry_date
    FROM installments
    WHERE status IN ('pending')
  `).all();

  const today = todayYmd();
  const targets = due
    .filter((x) => isDue(x.due_date))
    .filter((x) => !x.next_retry_date || x.next_retry_date <= today)
    .map((x) => x.id);

  const results = [];
  for (const id of targets) {
    // eslint-disable-next-line no-await-in-loop
    results.push({ id, ...(await chargeInstallment(id)) });
  }

  res.json({ ran: targets.length, results });
});

// ============================
// Start
// ============================
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
