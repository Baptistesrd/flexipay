const db = require("../../db");
const stripe = require("./stripe");
const { nowIso } = require("../lib/helpers");

/**
 * Attempts to charge a single installment off-session via Stripe.
 *
 * Race-condition fix (Task 3):
 *   We use a single atomic UPDATE … WHERE status='pending' as the lock.
 *   SQLite serialises writes, so if two concurrent job ticks both reach
 *   this point, exactly one will see changes=1 and proceed; the other
 *   sees changes=0 and returns a "skipped" result immediately.
 *   The previous two-step read+write pattern allowed both ticks to pass
 *   the status check before either had written "processing".
 */
async function chargeInstallment(installmentId) {
  // ── Atomic lock ───────────────────────────────────────────────────────────
  // Only succeeds (changes = 1) when the row is currently 'pending'.
  const lock = db
    .prepare(
      "UPDATE installments SET status='processing', updated_at=? WHERE id=? AND status='pending'"
    )
    .run(nowIso(), installmentId);

  if (lock.changes === 0) {
    // Another tick won the race, or the row is already in a terminal state.
    const inst = db
      .prepare("SELECT id, status FROM installments WHERE id=?")
      .get(installmentId);

    if (!inst) return { ok: false, error: "installment_not_found" };
    if (inst.status === "paid") return { ok: true, skipped: "already_paid" };
    if (inst.status === "processing") return { ok: true, skipped: "already_processing" };
    if (inst.status === "action_required") return { ok: false, error: "action_required" };
    if (inst.status === "failed_final") return { ok: false, error: "failed_final" };
    if (inst.status === "cancelled") return { ok: false, error: "cancelled" };
    return { ok: false, error: `unexpected_status_${inst.status}` };
  }

  // ── We hold the lock — fetch full records ─────────────────────────────────
  const inst = db.prepare("SELECT * FROM installments WHERE id=?").get(installmentId);
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(inst.order_id);

  if (!order) {
    db.prepare("UPDATE installments SET status='pending', updated_at=? WHERE id=?").run(
      nowIso(),
      installmentId
    );
    return { ok: false, error: "order_not_found" };
  }

  if (!order.stripe_customer_id || !order.stripe_payment_method_id) {
    db.prepare("UPDATE installments SET status='pending', updated_at=? WHERE id=?").run(
      nowIso(),
      installmentId
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
    const code = e?.raw?.code || e?.code || null;
    const msg = e?.raw?.message || e.message || "payment_failed";

    // SCA required — buyer must re-authenticate; no automatic retry.
    if (code === "authentication_required") {
      db.prepare(
        "UPDATE installments SET status='action_required', last_error=?, updated_at=? WHERE id=?"
      ).run(msg, nowIso(), inst.id);
      return { ok: false, action_required: true, error: msg };
    }

    // Generic failure — retry policy: Day +1, +3, +7 (max 3 retries).
    const current = db
      .prepare("SELECT retry_count FROM installments WHERE id=?")
      .get(inst.id);
    const retryCount = (current?.retry_count || 0) + 1;

    const retryOffsets = [null, 1, 3, 7]; // index = retryCount
    const days = retryCount <= 3 ? retryOffsets[retryCount] : null;
    const nextRetry = days
      ? (() => {
          const d = new Date();
          d.setDate(d.getDate() + days);
          return d.toISOString().slice(0, 10);
        })()
      : null;

    db.prepare(
      "UPDATE installments SET status=?, last_error=?, retry_count=?, next_retry_date=?, updated_at=? WHERE id=?"
    ).run(
      retryCount <= 3 ? "pending" : "failed_final",
      msg,
      retryCount,
      nextRetry,
      nowIso(),
      inst.id
    );

    return { ok: false, error: msg, retryCount, nextRetry };
  }
}

module.exports = { chargeInstallment };
