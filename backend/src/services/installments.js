const db = require("../../db");
const stripe = require("./stripe");
const recoveryAgent = require("./recoveryAgent");
const { nowIso, addDaysIso } = require("../lib/helpers");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Days elapsed since an ISO timestamp. */
function daysSince(isoString) {
  return Math.floor((Date.now() - new Date(isoString).getTime()) / 86_400_000);
}

/** Was installment 1 for this order paid? */
function inst1WasPaid(orderId) {
  const inst1 = db
    .prepare("SELECT status FROM installments WHERE order_id=? AND n=1")
    .get(orderId);
  return inst1?.status === "paid";
}

// ── Action executor ───────────────────────────────────────────────────────────

/**
 * Applies the AI agent's recovery decision to the database.
 * Returns a plain result object for logging / API response.
 *
 * @param {object} decision - { action, message_to_buyer, reasoning }
 * @param {object} inst     - Full installment row
 * @param {object} order    - Full order row
 * @param {number} retryCount - New retry count (already incremented)
 * @param {string} errorMsg - Original Stripe error message
 */
async function executeDecision(decision, inst, order, retryCount, errorMsg) {
  const { action, message_to_buyer, reasoning } = decision;
  const decisionJson = JSON.stringify(decision);

  switch (action) {
    case "retry_tomorrow": {
      const nextRetry = addDaysIso(1);
      db.prepare(
        `UPDATE installments
         SET status='pending', last_error=?, retry_count=?, next_retry_date=?,
             agent_decision=?, agent_message=?, updated_at=?
         WHERE id=?`
      ).run(errorMsg, retryCount, nextRetry, decisionJson, message_to_buyer, nowIso(), inst.id);
      return { ok: false, action, retryCount, nextRetry, agentMessage: message_to_buyer, reasoning };
    }

    case "retry_in_3_days": {
      const nextRetry = addDaysIso(3);
      db.prepare(
        `UPDATE installments
         SET status='pending', last_error=?, retry_count=?, next_retry_date=?,
             agent_decision=?, agent_message=?, updated_at=?
         WHERE id=?`
      ).run(errorMsg, retryCount, nextRetry, decisionJson, message_to_buyer, nowIso(), inst.id);
      return { ok: false, action, retryCount, nextRetry, agentMessage: message_to_buyer, reasoning };
    }

    case "send_sca_link": {
      // Generate a Stripe Checkout Session the buyer can visit to re-authenticate.
      // Metadata links back to this installment so the webhook can mark it paid.
      let scaUrl = null;
      try {
        if (!process.env.BASE_URL) throw new Error("BASE_URL missing");
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer: order.stripe_customer_id,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: order.currency.toLowerCase(),
                product_data: { name: "Paiement 2/2 \u2014 auth\u00e9ntification requise" },
                unit_amount: inst.amount_cents,
              },
            },
          ],
          payment_intent_data: {
            metadata: {
              orderId: order.id,
              installment: String(inst.n),
              installmentId: inst.id,
              merchantId: order.merchant_id,
            },
          },
          metadata: { orderId: order.id, merchantId: order.merchant_id },
          success_url: `${process.env.BASE_URL}/demo.html?success=1&orderId=${order.id}`,
          cancel_url: `${process.env.BASE_URL}/demo.html?canceled=1&orderId=${order.id}`,
        });
        scaUrl = session.url;
      } catch (stripeErr) {
        console.error("SCA session creation failed:", stripeErr.message);
      }

      db.prepare(
        `UPDATE installments
         SET status='action_required', last_error=?, sca_url=?,
             agent_decision=?, agent_message=?, updated_at=?
         WHERE id=?`
      ).run(errorMsg, scaUrl, decisionJson, message_to_buyer, nowIso(), inst.id);
      return { ok: false, action, scaUrl, agentMessage: message_to_buyer, reasoning };
    }

    case "send_reminder": {
      // Email sending is out of scope — log the intent and schedule a retry.
      console.log(
        `[reminder] installment=${inst.id} order=${order.id} message="${message_to_buyer}"`
      );
      const nextRetry = addDaysIso(1);
      db.prepare(
        `UPDATE installments
         SET status='pending', last_error=?, retry_count=?, next_retry_date=?,
             agent_decision=?, agent_message=?, updated_at=?
         WHERE id=?`
      ).run(errorMsg, retryCount, nextRetry, decisionJson, message_to_buyer, nowIso(), inst.id);
      return { ok: false, action, retryCount, nextRetry, agentMessage: message_to_buyer, reasoning };
    }

    case "mark_failed_final":
    default: {
      db.prepare(
        `UPDATE installments
         SET status='failed_final', last_error=?, retry_count=?,
             agent_decision=?, agent_message=?, updated_at=?
         WHERE id=?`
      ).run(errorMsg, retryCount, decisionJson, message_to_buyer, nowIso(), inst.id);
      return { ok: false, action: "mark_failed_final", retryCount, agentMessage: message_to_buyer, reasoning };
    }
  }
}

/**
 * Deterministic fallback used when the AI agent is unavailable.
 * Reproduces the pre-agent retry policy exactly.
 */
function deterministicFallback(inst, errorMsg, stripeErrorCode) {
  // SCA: buyer must re-authenticate, cannot be retried off-session.
  if (stripeErrorCode === "authentication_required") {
    db.prepare(
      "UPDATE installments SET status='action_required', last_error=?, updated_at=? WHERE id=?"
    ).run(errorMsg, nowIso(), inst.id);
    return { ok: false, action_required: true, error: errorMsg };
  }

  const current = db.prepare("SELECT retry_count FROM installments WHERE id=?").get(inst.id);
  const retryCount = (current?.retry_count || 0) + 1;
  const offsets = [null, 1, 3, 7]; // index = retryCount
  const days = retryCount <= 3 ? offsets[retryCount] : null;
  const nextRetry = days ? addDaysIso(days) : null;

  db.prepare(
    `UPDATE installments
     SET status=?, last_error=?, retry_count=?, next_retry_date=?, updated_at=?
     WHERE id=?`
  ).run(
    retryCount <= 3 ? "pending" : "failed_final",
    errorMsg,
    retryCount,
    nextRetry,
    nowIso(),
    inst.id
  );
  return { ok: false, error: errorMsg, retryCount, nextRetry };
}

// ── Main charge function ──────────────────────────────────────────────────────

/**
 * Attempts to charge a single installment off-session via Stripe.
 *
 * Atomic lock: a single UPDATE … WHERE status='pending' is used to claim the
 * row before any async work begins. SQLite serialises writes, so if two
 * concurrent job ticks race here, exactly one gets changes=1 and proceeds;
 * the other sees changes=0 and returns immediately.
 */
async function chargeInstallment(installmentId) {
  // ── Atomic lock ───────────────────────────────────────────────────────────
  const lock = db
    .prepare(
      "UPDATE installments SET status='processing', updated_at=? WHERE id=? AND status='pending'"
    )
    .run(nowIso(), installmentId);

  if (lock.changes === 0) {
    const inst = db.prepare("SELECT id, status FROM installments WHERE id=?").get(installmentId);
    if (!inst) return { ok: false, error: "installment_not_found" };
    if (inst.status === "paid") return { ok: true, skipped: "already_paid" };
    if (inst.status === "processing") return { ok: true, skipped: "already_processing" };
    if (inst.status === "action_required") return { ok: false, error: "action_required" };
    if (inst.status === "failed_final") return { ok: false, error: "failed_final" };
    if (inst.status === "cancelled") return { ok: false, error: "cancelled" };
    return { ok: false, error: `unexpected_status_${inst.status}` };
  }

  // ── Fetch full records ────────────────────────────────────────────────────
  const inst = db.prepare("SELECT * FROM installments WHERE id=?").get(installmentId);
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(inst.order_id);

  if (!order) {
    db.prepare("UPDATE installments SET status='pending', updated_at=? WHERE id=?").run(
      nowIso(), installmentId
    );
    return { ok: false, error: "order_not_found" };
  }

  if (!order.stripe_customer_id || !order.stripe_payment_method_id) {
    db.prepare("UPDATE installments SET status='pending', updated_at=? WHERE id=?").run(
      nowIso(), installmentId
    );
    return { ok: false, error: "missing_customer_or_pm" };
  }

  // ── Stripe off-session charge ─────────────────────────────────────────────
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

    db.prepare(
      "UPDATE installments SET status='paid', stripe_payment_intent_id=?, last_error=NULL, updated_at=? WHERE id=?"
    ).run(pi.id, nowIso(), inst.id);

    return { ok: true, payment_intent: pi.id };

  } catch (e) {
    const stripeCode = e?.raw?.decline_code || e?.raw?.code || e?.code || "unknown";
    const errorMsg = e?.raw?.message || e.message || "payment_failed";

    // Build context for the AI agent.
    const context = {
      declineCode: stripeCode,
      retryAttempt: (inst.retry_count || 0) + 1,
      amountEuros: inst.amount_cents / 100,
      daysSinceCreated: daysSince(inst.created_at),
      installment1PaidOnTime: inst1WasPaid(order.id),
    };

    // ── AI recovery decision ──────────────────────────────────────────────
    let decision = null;
    try {
      decision = await recoveryAgent.handleFailure(context);
    } catch (agentErr) {
      console.warn("Recovery agent error — using deterministic fallback:", agentErr.message);
    }

    if (decision) {
      const retryCount = context.retryAttempt; // 1-indexed, already incremented
      return executeDecision(decision, inst, order, retryCount, errorMsg);
    }

    // ── Deterministic fallback ────────────────────────────────────────────
    return deterministicFallback(inst, errorMsg, stripeCode);
  }
}

module.exports = { chargeInstallment };
