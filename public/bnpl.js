(function () {
  function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function eurosToCents(amountEuros) {
    return Math.round((amountEuros + Number.EPSILON) * 100);
  }

  function centsToEuros(cents) {
    return (cents / 100).toFixed(2);
  }

  async function postJSON(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  function injectStyle(container) {
    const style = document.createElement("style");
    style.textContent = `
      .bnpl-card {
        border: 1px solid #e4e4e7;
        border-radius: 16px;
        padding: 14px;
        font-family: system-ui, -apple-system, sans-serif;
      }

      .bnpl-title {
        font-weight: 600;
        margin-bottom: 6px;
        font-size: 14px;
      }

      .bnpl-lines {
        font-size: 13px;
        margin-bottom: 12px;
        color: #333;
        line-height: 1.4;
      }

      .bnpl-btn {
        width: 100%;
        padding: 14px;
        border-radius: 14px;
        border: none;
        background: #000;
        color: #fff;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
      }

      .bnpl-btn:disabled {
        opacity: 0.6;
      }

      .bnpl-msg {
        margin-top: 8px;
        font-size: 12px;
        color: #666;
        text-align: center;
      }

      @media (min-width: 768px) {
        .bnpl-btn {
          font-size: 14px;
          padding: 12px;
        }
      }
    `;
    container.appendChild(style);
  }

  function render(container, opts) {
    const { amountCents, currency, merchantId, apiBase } = opts;

    container.innerHTML = `
      <div class="bnpl-card">
        <div class="bnpl-title">Pay in 2 instalments</div>
        <div class="bnpl-lines">Calculating…</div>
        <button class="bnpl-btn">Pay 50% now</button>
        <div class="bnpl-msg"></div>
      </div>
    `;

    injectStyle(container);

    const lines = container.querySelector(".bnpl-lines");
    const btn = container.querySelector(".bnpl-btn");
    const msg = container.querySelector(".bnpl-msg");

    const amountEuros = amountCents / 100;

    postJSON(`${apiBase}/v1/quote`, { amount: amountEuros, currency })
      .then((q) => {
        const i1 = q.installments[0];
        const i2 = q.installments[1];
        lines.innerHTML = `
          Today: <b>${centsToEuros(i1.amountCents)} ${currency}</b><br/>
          In 30 days: <b>${centsToEuros(i2.amountCents)} ${currency}</b>
        `;
      })
      .catch(() => {
        lines.textContent = "Unable to calculate instalments";
      });

    btn.addEventListener("click", async () => {
      msg.textContent = "Redirecting to secure payment…";
      btn.disabled = true;

      try {
        const session = await postJSON(`${apiBase}/v1/checkout/session`, {
          merchantId,
          orderRef: `demo-${Date.now()}`,
          amount: amountEuros,
          currency,
        });

        window.location.href = session.checkoutUrl;
      } catch (e) {
        msg.textContent = "Payment error. Please try again.";
        btn.disabled = false;
      }
    });
  }

  function mountOne(el, apiBase) {
    const currency = el.dataset.currency || "EUR";
    const merchantId = el.dataset.merchant || "merchant_demo";

    let amountCents = null;

    if (el.dataset.amountCents) {
      const c = toNumber(el.dataset.amountCents);
      if (c != null) amountCents = Math.round(c);
    } else if (el.dataset.amount) {
      const euros = toNumber(el.dataset.amount);
      if (euros != null) amountCents = eurosToCents(euros);
    }

    if (!amountCents || amountCents <= 0) {
      el.textContent = "BNPL: invalid amount";
      return;
    }

    render(el, { amountCents, currency, merchantId, apiBase });
  }

  window.BNPL = {
    mount: (selector, apiBase = window.location.origin) => {
      document.querySelectorAll(selector).forEach((el) =>
        mountOne(el, apiBase)
      );
    },
  };
})();
