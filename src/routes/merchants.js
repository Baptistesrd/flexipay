const express = require("express");
const db = require("../../db");
const { requireMerchantAuth } = require("../middleware/auth");

const router = express.Router();

// GET /v1/merchants/:merchantId/transactions
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
        i.updated_at
      FROM orders o
      JOIN installments i ON i.order_id = o.id
      WHERE o.merchant_id = ?
      ORDER BY o.created_at DESC, i.n ASC`
    )
    .all(merchantId);

  res.json({ rows });
});

module.exports = router;
