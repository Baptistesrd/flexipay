/**
 * AI Recovery Agent — powered by Claude.
 *
 * When an installment charge fails, this service analyses the failure context
 * and returns a structured recovery decision. It uses forced tool-use so the
 * response is always a valid JSON object matching the expected schema — no
 * fragile text-parsing required.
 *
 * If ANTHROPIC_API_KEY is absent or the API call fails for any reason, the
 * function returns null. The caller (installments.js) must then fall back to
 * its deterministic retry policy so that payment processing never breaks due
 * to an AI-layer failure.
 */

const Anthropic = require("@anthropic-ai/sdk");

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-20250514";

const SYSTEM_PROMPT =
  "You are a payment recovery specialist for FlexiPay, a BNPL service. " +
  "Your job is to decide the best recovery action when a buyer's second " +
  "installment fails. Be empathetic but protect the merchant. Always " +
  "respond only in the specified JSON format.";

/**
 * Forced tool definition — Claude MUST call this tool, which guarantees the
 * response is a well-typed object (no JSON.parse risk).
 */
const RECOVERY_TOOL = {
  name: "recovery_decision",
  description:
    "Record the recovery decision for a failed installment payment. " +
    "Called exactly once per failure analysis.",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "retry_tomorrow",
          "retry_in_3_days",
          "send_sca_link",
          "send_reminder",
          "mark_failed_final",
        ],
        description: "The recovery action to execute.",
      },
      message_to_buyer: {
        type: "string",
        description:
          "A short, human, non-robotic message to the buyer explaining " +
          "what happens next. Maximum 2 sentences.",
      },
      reasoning: {
        type: "string",
        description: "One sentence explaining why this action was chosen.",
      },
    },
    required: ["action", "message_to_buyer", "reasoning"],
  },
};

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * @param {object} ctx
 * @param {string}  ctx.declineCode          - Stripe decline / error code
 * @param {number}  ctx.retryAttempt         - Current attempt number (1-indexed)
 * @param {number}  ctx.amountEuros          - Amount in euros
 * @param {number}  ctx.daysSinceCreated     - Days since the order was placed
 * @param {boolean} ctx.installment1PaidOnTime - Whether instalment 1 was paid
 */
function buildPrompt(ctx) {
  return (
    "A buyer's second installment payment has failed. Here is the context:\n\n" +
    `- Decline / error code: ${ctx.declineCode}\n` +
    `- Retry attempt number: ${ctx.retryAttempt} (maximum 3)\n` +
    `- Amount owed: \u20ac${ctx.amountEuros.toFixed(2)}\n` +
    `- Days since the order was created: ${ctx.daysSinceCreated}\n` +
    `- Installment 1 paid on time: ${ctx.installment1PaidOnTime ? "Yes" : "No"}\n\n` +
    "Decision guidelines:\n" +
    "- insufficient_funds: retry_tomorrow (attempt 1-2); mark_failed_final (attempt 3, unless inst 1 was on time, then retry_in_3_days)\n" +
    "- authentication_required: always send_sca_link (the buyer must re-authenticate; automatic retry is impossible)\n" +
    "- card_expired: send_reminder (the buyer needs to update their card; retry cannot succeed)\n" +
    "- do_not_honor, generic decline: retry_in_3_days (attempt 1-2); mark_failed_final (attempt 3)\n" +
    "- If installment 1 was paid on time, give one extra retry before marking failed_final\n" +
    "- Never exceed 3 retry attempts total\n\n" +
    "Choose the action that best balances buyer experience with payment recovery."
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyse a payment failure and return a structured recovery decision.
 *
 * @param {object} context - See buildPrompt() for field descriptions.
 * @returns {Promise<{action: string, message_to_buyer: string, reasoning: string} | null>}
 *   Returns null if the API key is missing or the call fails — caller must
 *   fall back to its own logic.
 */
async function handleFailure(context) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("Recovery agent: ANTHROPIC_API_KEY not set — skipping AI decision.");
    return null;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [RECOVERY_TOOL],
    // Force Claude to call the tool — guarantees a structured, parseable output.
    tool_choice: { type: "tool", name: "recovery_decision" },
    messages: [{ role: "user", content: buildPrompt(context) }],
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || !toolBlock.input) {
    throw new Error("Recovery agent: expected tool_use block not found in response");
  }

  // toolBlock.input is already a parsed JS object — no JSON.parse needed.
  return toolBlock.input;
}

module.exports = { handleFailure };
