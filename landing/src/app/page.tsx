/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";

const DEMO_IFRAME_URL =
  process.env.NEXT_PUBLIC_FLEXIPAY_DEMO_URL || "http://localhost:4242/demo.html";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_FLEXIPAY_API_URL || "http://localhost:4242";

const GITHUB_URL =
  process.env.NEXT_PUBLIC_FLEXIPAY_GITHUB_URL || "https://github.com/";

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Page() {
  const [demoLoading, setDemoLoading] = useState(true);
  const [demoTimedOut, setDemoTimedOut] = useState(false);
  const [demoKey, setDemoKey] = useState(0);

  const timeoutMs = 9000;

  useEffect(() => {
    setDemoLoading(true);
    setDemoTimedOut(false);

    const t = setTimeout(() => setDemoTimedOut(true), timeoutMs);
    return () => clearTimeout(t);
  }, [demoKey]);

  return (
    <main className="min-h-screen bg-white text-zinc-900">
      {/* Background accents */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-zinc-200 via-white to-zinc-200 blur-3xl opacity-70" />
        <div className="absolute bottom-[-240px] right-[-220px] h-[520px] w-[520px] rounded-full bg-zinc-100 blur-3xl opacity-80" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-zinc-200/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-black text-white">
              <span className="text-xs font-semibold tracking-tight">F</span>
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <div className="font-semibold tracking-tight">Flexipay</div>
              </div>
            </div>
          </div>

          <nav className="hidden items-center gap-6 text-sm text-zinc-600 md:flex">
            <button
              type="button"
              onClick={() => scrollToId("how-it-works")}
              className="hover:text-zinc-900"
            >
              How it works
            </button>
            <button
              type="button"
              onClick={() => scrollToId("agent")}
              className="hover:text-zinc-900"
            >
              Agent
            </button>
            <button
              type="button"
              onClick={() => scrollToId("api")}
              className="hover:text-zinc-900"
            >
              API
            </button>
            <button
              type="button"
              onClick={() => scrollToId("demo")}
              className="hover:text-zinc-900"
            >
              Demo
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          {/* Left */}
          <div>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-6xl">
              BNPL widget.{" "}
              <span className="relative">
                <span className="absolute -inset-2 -z-10 rounded-3xl bg-zinc-100" />
                AI recovery.
              </span>{" "}
              Built for marketplaces.
            </h1>

            <p className="mt-6 max-w-xl text-lg text-zinc-600">
              Drop in a script tag, let buyers pay 50% now and 50% in 30 days.
              When installments fail, the AI recovery agent decides whether to
              retry, request re-authentication, or send a reminder — automatically.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl bg-black px-6 py-3 text-sm font-medium text-white hover:opacity-90"
              >
                View on GitHub →
              </a>

              <a
                href={DEMO_IFRAME_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-zinc-200 bg-white/70 px-6 py-3 text-sm font-medium hover:bg-zinc-50"
              >
                Open live demo →
              </a>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3 text-sm text-zinc-600">
              <Stat label="Setup" value="Less than 10 min" />
              <Stat label="Payments" value="Stripe" />
              <Stat label="Recovery" value="Claude API" />
            </div>
          </div>

          {/* Right — Checkout overview */}
          <div className="rounded-3xl border border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur">
            <div className="mb-4 text-sm font-medium">Checkout overview</div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center gap-4">
                <img
                  src="/sneaker.avif"
                  alt="Sneakers"
                  className="h-20 w-20 rounded-xl border border-zinc-200 object-cover"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">Sneakers</div>
                  <div className="text-xs text-zinc-500">Premium edition</div>
                </div>
                <div className="text-sm font-semibold">€129.90</div>
              </div>

              <div className="mt-4 rounded-xl border border-zinc-200 p-4">
                <div className="text-sm font-semibold">Pay in two instalments</div>

                <div className="mt-2 space-y-1 text-xs text-zinc-600">
                  <div>
                    • Today: <b>€64.95</b>
                  </div>
                  <div>
                    • In 30 days: <b>€64.95</b>
                  </div>
                </div>

                <button className="mt-4 w-full rounded-xl bg-black py-3 text-sm font-medium text-white hover:opacity-90">
                  Pay 50% now
                </button>

                <div className="mt-2 text-center text-[11px] text-zinc-500">
                  Secured payment • Powered by Flexipay
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-24">
        <div className="rounded-3xl border border-zinc-200 bg-white/80 p-8 shadow-sm backdrop-blur">
          <h2 className="text-3xl font-semibold">How it works</h2>
          <p className="mt-3 text-zinc-600">
            Three steps from integration to automatic recovery.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Step
              number="1"
              title="Add the widget"
              description="Drop a single script tag into your checkout page. Configure your merchant ID and the widget renders automatically — no rebuild needed."
            />
            <Step
              number="2"
              title="Buyer pays 50% now"
              description="The buyer completes the first instalment via Stripe Checkout. The second instalment is scheduled 30 days later and charged off-session."
            />
            <Step
              number="3"
              title="AI handles the rest"
              description="When the second charge fails, the AI recovery agent reads the decline code, retry history, and order context — then decides the best next action."
            />
          </div>
        </div>
      </section>

      {/* AI Recovery Agent */}
      <section id="agent" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-24">
        <div className="rounded-3xl border border-zinc-200 bg-white/80 p-8 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-3xl font-semibold">AI Recovery Agent</h2>
              <p className="mt-3 max-w-2xl text-zinc-600">
                When an installment fails, the agent receives the Stripe decline code, retry
                count, amount, and whether the buyer paid the first instalment on time. It calls
                Claude via the Anthropic API and returns a structured decision — no hardcoded rules.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <DecisionCard
              decline="insufficient_funds"
              action="retry_tomorrow"
              message="Your card was declined due to insufficient funds. We will try again tomorrow — no action needed."
              reasoning="First failure, buyer paid on time before. A 24-hour retry gives the account time to reload."
            />
            <DecisionCard
              decline="authentication_required"
              action="send_sca_link"
              message="Your bank requires additional verification. Please complete the secure payment link below."
              reasoning="3DS challenge required. Silent retry will keep failing. A hosted Stripe Checkout link is the correct path."
            />
            <DecisionCard
              decline="card_expired"
              action="send_reminder"
              message="Your card on file has expired. Please update your payment method to complete your order."
              reasoning="Retrying will not help. The buyer needs to act — a direct reminder is more effective than automated retries."
            />
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600">
            <span className="font-medium text-zinc-900">Graceful degradation.</span>{" "}
            If <code className="rounded bg-zinc-200 px-1 py-0.5 text-xs">ANTHROPIC_API_KEY</code> is
            not set, the agent is skipped and the service falls back to the deterministic retry
            policy (Day+1, Day+3, Day+7).
          </div>
        </div>
      </section>

      {/* API */}
      <section id="api" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-24">
        <div className="rounded-3xl border border-zinc-200 bg-white/80 p-8 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-3xl font-semibold">API-first product</h2>
              <p className="mt-3 max-w-2xl text-zinc-600">
                A simple REST API + an embeddable widget. Start with a quote, then create a checkout
                session. Webhooks keep statuses reliable.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
              <a
                href={DEMO_IFRAME_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl bg-black px-6 py-3 text-sm font-medium text-white hover:opacity-90"
              >
                Open live demo →
              </a>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <div className="text-sm font-semibold">1) Get a quote</div>
              <div className="mt-2 text-sm text-zinc-600">
                Returns a 2x instalment schedule (50/50).
              </div>
              <pre className="mt-4 overflow-auto rounded-xl bg-zinc-50 p-4 text-xs text-zinc-800">
{`curl -X POST ${API_BASE_URL}/v1/quote \\
  -H "Content-Type: application/json" \\
  -d '{"amount":129.90,"currency":"EUR"}'`}
              </pre>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <div className="text-sm font-semibold">2) Create checkout session</div>
              <div className="mt-2 text-sm text-zinc-600">
                Creates an order + instalments, then redirects to Stripe Checkout for the first payment.
              </div>
              <pre className="mt-4 overflow-auto rounded-xl bg-zinc-50 p-4 text-xs text-zinc-800">
{`curl -X POST ${API_BASE_URL}/v1/checkout/session \\
  -H "Content-Type: application/json" \\
  -d '{"merchantId":"merchant_demo","orderRef":"demo-123","amount":129.90,"currency":"EUR"}'`}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-24">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="mb-2 text-3xl font-semibold">Live demo</h2>
            <p className="text-zinc-600">
              Embedded demo is convenient, but payment redirects often behave better in a new tab.
            </p>
          </div>

          <div className="hidden gap-3 sm:flex">
            <a
              href={DEMO_IFRAME_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              Open in new tab →
            </a>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          {/* Browser chrome */}
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </div>

            <div className="hidden max-w-[55%] flex-1 px-4 sm:block">
              <div className="truncate rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600">
                {DEMO_IFRAME_URL}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDemoKey((k) => k + 1)}
                className="rounded-xl bg-black px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                title="Reload embedded demo"
              >
                Reload
              </button>
            </div>
          </div>

          {/* Embed area */}
          <div className="relative hidden md:block">
            <iframe
              key={demoKey}
              src={DEMO_IFRAME_URL}
              className="h-[560px] w-full"
              title="Flexipay demo"
              onLoad={() => setDemoLoading(false)}
            />

            {demoLoading && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white/70 backdrop-blur">
                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 shadow-sm">
                  Loading demo…
                </div>
              </div>
            )}

            {demoTimedOut && (
              <div className="absolute inset-0 grid place-items-center bg-white/80 backdrop-blur">
                <div className="max-w-md rounded-3xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
                  <div className="text-sm font-semibold">The embedded demo may be blocked</div>
                  <div className="mt-2 text-sm text-zinc-600">
                    Some payment redirects can behave differently inside an iframe. For the best experience,
                    open the demo in a new tab.
                  </div>
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <a
                      href={DEMO_IFRAME_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl bg-black px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
                    >
                      Open in new tab →
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs text-zinc-500">
          If the embedded demo hangs, use <b>Open in new tab</b>. This is normal with some payment flows.
        </div>
      </section>

      {/* Built with */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="rounded-3xl border border-zinc-200 bg-white/80 p-8 shadow-sm backdrop-blur">
          <h2 className="text-3xl font-semibold">Built with</h2>
          <p className="mt-3 text-zinc-600">
            Open-source stack, no proprietary infrastructure.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-5">
            <TechCard name="Node.js" role="Runtime" />
            <TechCard name="Express" role="API server" />
            <TechCard name="Stripe" role="Payments & webhooks" />
            <TechCard name="SQLite" role="Persistence" />
            <TechCard name="Claude API" role="AI recovery agent" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-8 text-center text-sm text-zinc-600">
        © {new Date().getFullYear()} Flexipay - All rights reserved
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white/70 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-sm font-semibold text-white">
        {number}
      </div>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <div className="mt-2 text-sm text-zinc-600">{description}</div>
    </div>
  );
}

function DecisionCard({
  decline,
  action,
  message,
  reasoning,
}: {
  decline: string;
  action: string;
  message: string;
  reasoning: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="inline-block rounded-lg bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700">
        {decline}
      </div>
      <div className="mt-3 inline-block rounded-lg bg-black px-2 py-1 font-mono text-xs text-white">
        {action}
      </div>
      <div className="mt-3 text-sm text-zinc-800">{message}</div>
      <div className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500 italic">
        {reasoning}
      </div>
    </div>
  );
}

function TechCard({ name, role }: { name: string; role: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center">
      <div className="text-sm font-semibold">{name}</div>
      <div className="mt-1 text-xs text-zinc-500">{role}</div>
    </div>
  );
}
