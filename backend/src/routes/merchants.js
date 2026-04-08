const express = require("express");
const db = require("../../db");
const { requireMerchantAuth } = require("../middleware/auth");

// Two routers exported from this file:
//   router            → mounted at /v1/merchants in server.js
//   installmentsRouter → mounted at /v1/installments in server.js
const router = express.Router();
const installmentsRouter = express.Router();

// ── GET /v1/merchants/:merchantId/transactions ────────────────────────────────
// Returns all orders + installments for a merchant, including the AI agent
// decision fields added in Task 3.
router.get("/:merchantId/transactions", requireMerchantAuth, (req, res) => {
  const { merchantId } = req.params;

  const rows = db
    .prepare(
      `SELECT
        o.id            AS order_id,
        o.order_ref,
        o.amount_cents,
        o.currency,
        o.status        AS order_status,
        o.created_at,
        o.stripe_customer_id,
        o.stripe_payment_method_id,
        i.id            AS installment_id,
        i.n,
        i.amount_cents  AS installment_cents,
        i.due_date,
        i.status,
        i.retry_count,
        i.next_retry_date,
        i.stripe_payment_intent_id,
        i.last_error,
        i.updated_at,
        i.agent_decision,
        i.agent_message,
        i.sca_url
      FROM orders o
      JOIN installments i ON i.order_id = o.id
      WHERE o.merchant_id = ?
      ORDER BY o.created_at DESC, i.n ASC`
    )
    .all(merchantId)
    .map((row) => ({
      ...row,
      // Parse the stored JSON string so consumers get a proper object, not a string.
      agent_decision: row.agent_decision ? JSON.parse(row.agent_decision) : null,
    }));

  res.json({ rows });
});

// ── GET /v1/installments/:installmentId/recovery ──────────────────────────────
// Returns the full AI recovery decision + reasoning for a specific installment.
// Auth: merchantId as query param + Bearer token (same scheme as transactions).
// The merchant's ownership of the installment is verified server-side.
installmentsRouter.get("/:installmentId/recovery", (req, res) => {
  const { installmentId } = req.params;
  const merchantId = req.query.merchantId;

  // ── Auth ──────────────────────────────────────────────────────────────────
  if (!merchantId) {
    return res.status(400).json({ error: "merchantId query param required" });
  }

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing bearer token" });

  const merchant = db.prepare("SELECT * FROM merchants WHERE id=?").get(merchantId);
  if (!merchant) return res.status(404).json({ error: "merchant not found" });
  if (merchant.api_key !== token) return res.status(403).json({ error: "invalid api key" });

  // ── Fetch installment + verify ownership ──────────────────────────────────
  const row = db
    .prepare(
      `SELECT
        i.id,
        i.n,
        i.amount_cents,
        i.due_date,
        i.status,
        i.retry_count,
        i.last_error,
        i.updated_at,
        i.agent_decision,
        i.agent_message,
        i.sca_url,
        o.merchant_id
      FROM installments i
      JOIN orders o ON o.id = i.order_id
      WHERE i.id = ?`
    )
    .get(installmentId);

  if (!row) return res.status(404).json({ error: "installment not found" });
  if (row.merchant_id !== merchantId) return res.status(403).json({ error: "forbidden" });

  const decision = row.agent_decision ? JSON.parse(row.agent_decision) : null;

  res.json({
    installmentId: row.id,
    n: row.n,
    amountCents: row.amount_cents,
    status: row.status,
    retryCount: row.retry_count,
    lastError: row.last_error,
    updatedAt: row.updated_at,
    agentDecision: decision,
    agentMessage: row.agent_message || null,
    scaUrl: row.sca_url || null,
  });
});

module.exports = { router, installmentsRouter };
