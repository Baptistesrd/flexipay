# FlexiPay Backend

Node.js/Express BNPL API. Buyers pay 50% at checkout via Stripe; the second instalment is charged off-session 30 days later. Failed charges are handled by an AI recovery agent powered by the Claude API.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values before starting.

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Port to listen on. Defaults to `4242`. Railway injects this automatically. |
| `BASE_URL` | **Yes** | Public base URL of this server (no trailing slash). Used to build Stripe redirect URLs. Example: `https://flexipay.up.railway.app` |
| `STRIPE_SECRET_KEY` | **Yes** | Stripe secret key. Use `sk_test_…` for development, `sk_live_…` for production. |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | Stripe webhook signing secret (`whsec_…`). Get it from the Stripe dashboard after creating the webhook endpoint. |
| `JOB_TOKEN` | **Yes** | Bearer token for the `POST /v1/jobs/charge-due` endpoint. Generate with `openssl rand -hex 32`. |
| `ADMIN_KEY` | **Yes** | Bearer token for `POST /v1/admin/merchants`. Generate with `openssl rand -hex 32`. |
| `DEMO_MERCHANT_API_KEY` | No | API key for the `merchant_demo` account seeded at startup. If omitted a random key is generated and printed to stdout on first run. |
| `CORS_ORIGINS` | No | Comma-separated list of allowed origins (no trailing slashes). Example: `https://your-frontend.com,http://localhost:3000`. Requests with no `Origin` header (curl, server-to-server) are always allowed. |
| `ANTHROPIC_API_KEY` | No | Key for the AI recovery agent. When absent the agent is skipped and deterministic retry logic (Day+1, Day+3, Day+7) is used instead. Get a key at https://console.anthropic.com/settings/keys |

---

## Run Locally

```bash
cd backend
cp .env.example .env
# Edit .env with your Stripe test keys and tokens

npm install
npm run dev       # nodemon — restarts on file changes
# or
node server.js    # single run
```

The server starts on `http://localhost:4242` by default.

To forward Stripe webhooks locally:
```bash
stripe listen --forward-to localhost:4242/webhook
```

---

## Endpoints

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Returns `{"ok":true}` + runs a DB ping. Used by Railway healthcheck. |

### Checkout

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/quote` | None | Returns a 2-instalment schedule for a given amount. Rate limited: 30 req/min. |
| `POST` | `/v1/checkout/session` | None | Creates an order + instalments and returns a Stripe Checkout URL for the first payment. Rate limited: 10 req/min. |
| `POST` | `/v1/orders/:orderId/cancel` | None (orderId is a UUID) | Cancels an order and all its pending instalments. Called by `demo.html` on Stripe cancel redirect. |

### Merchants

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/merchants/:merchantId/transactions` | `Authorization: Bearer <api_key>` | Returns all orders and instalments for a merchant, including AI agent decision fields. |

### Installments

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/installments/:installmentId/recovery?merchantId=…` | `Authorization: Bearer <api_key>` | Returns the full AI recovery decision, message, and SCA URL for a specific failed instalment. |

### Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/admin/merchants` | `Authorization: Bearer <ADMIN_KEY>` | Creates a new merchant. Returns the generated `apiKey`. Body: `{"id":"…","name":"…"}` |

### Jobs

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/v1/jobs/charge-due` | `X-Job-Token: <JOB_TOKEN>` | Charges all pending instalments that are due today. Run on a daily cron (e.g. Railway cron job at `0 8 * * *`). |

### Webhooks

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/webhook` | Stripe signature (`STRIPE_WEBHOOK_SECRET`) | Handles `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`. Idempotent. |

### Static

| Path | Description |
|---|---|
| `GET /` | Serves `public/` — includes `demo.html` |
| `GET /admin` | Serves `admin/` — merchant dashboard |

---

## Quote Example

```bash
curl -X POST http://localhost:4242/v1/quote \
  -H "Content-Type: application/json" \
  -d '{"amount":129.90,"currency":"EUR"}'
```

```json
{
  "currency": "EUR",
  "totalCents": 12990,
  "installments": [
    { "n": 1, "amountCents": 6495, "dueDate": "2026-04-11" },
    { "n": 2, "amountCents": 6495, "dueDate": "2026-05-11" }
  ]
}
```

## Checkout Session Example

```bash
curl -X POST http://localhost:4242/v1/checkout/session \
  -H "Content-Type: application/json" \
  -d '{"merchantId":"merchant_demo","orderRef":"order-001","amount":129.90,"currency":"EUR"}'
```

```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/..."
}
```
