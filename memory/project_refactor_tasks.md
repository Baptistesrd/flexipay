---
name: FlexiPay Security & Refactor Tasks
description: Completed 5-task hardening refactor — modular src/ structure, security cleanup, race fix, cancel flow, rate limiting
type: project
---

Tasks completed 2026-04-08:
1. Removed hardcoded credentials from source; added .env.example; admin/index.html now uses localStorage + settings form
2. Cancel flow: cancel_url now includes orderId; POST /v1/orders/:orderId/cancel endpoint added; demo.html shows success/cancel banners
3. Atomic lock in chargeInstallment() — single UPDATE WHERE status='pending', check changes=1
4. server.js refactored into src/{routes,services,middleware,lib/} modules
5. express-rate-limit applied: /v1/quote (30/min), /v1/checkout/session (10/min)

**Why:** Pre-feature hardening before adding new capabilities.
**How to apply:** All new routes go in src/routes/. All Stripe calls go through src/services/stripe.js. All new env vars go in .env.example too.

Critical outstanding issue: .env with real Stripe keys and data.sqlite are in git history across all 6 commits. Keys should be rotated.
