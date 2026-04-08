// Entry point — loads env, wires middleware and routes, starts the server.
require("dotenv").config();

const express = require("express");
const path = require("path");

const db = require("./db");
const corsMiddleware = require("./src/middleware/cors");
const { randomKey } = require("./src/middleware/auth");
const { nowIso } = require("./src/lib/helpers");

const webhooksRouter = require("./src/routes/webhooks");
const checkoutRouter = require("./src/routes/checkout");
const { router: merchantsRouter, installmentsRouter } = require("./src/routes/merchants");
const adminRouter = require("./src/routes/admin");
const jobsRouter = require("./src/routes/jobs");

const app = express();

// ── Seed demo merchant ────────────────────────────────────────────────────────
// Uses DEMO_MERCHANT_API_KEY from .env so the key is never hardcoded in source.
// If the env var is absent a random key is generated and printed once — set it
// in .env to keep a stable key across restarts.
function seedMerchantDemo() {
  try {
    const exists = db.prepare("SELECT id FROM merchants WHERE id=?").get("merchant_demo");
    if (!exists) {
      const apiKey = process.env.DEMO_MERCHANT_API_KEY || randomKey();
      db.prepare(
        "INSERT INTO merchants (id, name, api_key, created_at) VALUES (?,?,?,?)"
      ).run("merchant_demo", "Demo Merchant", apiKey, nowIso());

      if (!process.env.DEMO_MERCHANT_API_KEY) {
        console.warn(
          "⚠️  DEMO_MERCHANT_API_KEY not set in .env — generated a random key for merchant_demo.\n" +
          "   Add it to .env to keep a stable key: DEMO_MERCHANT_API_KEY=" + apiKey
        );
      } else {
        console.log("✅ Seeded merchant_demo");
      }
    }
  } catch (e) {
    console.warn("⚠️  seedMerchantDemo skipped:", e.message);
  }
}
seedMerchantDemo();

// ── Webhook router (raw body — MUST come before express.json) ─────────────────
app.use("/webhook", webhooksRouter);

// ── Standard middleware ───────────────────────────────────────────────────────
app.use(corsMiddleware);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin")));

// ── Utility routes ────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.send("OK"));

app.get("/health", (_req, res) => {
  try {
    db.prepare("SELECT 1").get();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/v1", checkoutRouter);                    // /v1/quote, /v1/checkout/session, /v1/orders/:id/cancel
app.use("/v1/merchants", merchantsRouter);        // /v1/merchants/:id/transactions
app.use("/v1/installments", installmentsRouter);  // /v1/installments/:id/recovery
app.use("/v1/admin", adminRouter);                // /v1/admin/merchants
app.use("/v1/jobs", jobsRouter);                  // /v1/jobs/charge-due

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`🚀 FlexiPay listening on http://localhost:${PORT}`));
