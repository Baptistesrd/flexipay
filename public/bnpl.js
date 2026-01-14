(function () {
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

  function render(container, opts) {
    const { amount, currency, merchantId, apiBase } = opts;

    container.innerHTML = `
      <div style="border:1px solid #ddd; padding:12px; border-radius:10px; font-family:system-ui;">
        <div style="font-weight:600; margin-bottom:6px;">Payez en 2 fois</div>
        <div id="bnpl-lines" style="margin-bottom:10px; color:#333;">Calcul...</div>
        <button id="bnpl-btn" style="padding:10px 12px; border-radius:10px; border:0; background:black; color:white; cursor:pointer;">
          Payer 50% maintenant
        </button>
        <div id="bnpl-msg" style="margin-top:8px; font-size:12px; color:#666;"></div>
      </div>
    `;

    const lines = container.querySelector("#bnpl-lines");
    const btn = container.querySelector("#bnpl-btn");
    const msg = container.querySelector("#bnpl-msg");

    postJSON(`${apiBase}/v1/quote`, { amount, currency })
      .then((q) => {
        const i1 = q.installments[0];
        const i2 = q.installments[1];
        lines.innerHTML = `
          1) Aujourd’hui : <b>${centsToEuros(i1.amountCents)} ${currency}</b><br/>
          2) Le ${i2.dueDate} : <b>${centsToEuros(i2.amountCents)} ${currency}</b>
        `;
      })
      .catch(() => (lines.textContent = "Impossible de calculer."));

    btn.addEventListener("click", async () => {
      msg.textContent = "Création de la session...";
      try {
        const session = await postJSON(`${apiBase}/v1/checkout/session`, {
          merchantId,
          orderRef: `demo-${Date.now()}`,
          amount,
          currency,
        });

        window.location.href = window.location.href = session.checkoutUrl;
      } catch (e) {
        msg.textContent = "Erreur : " + e.message;
      }
    });
  }

  window.BNPL = {
    mount: (selector, apiBase = "http://localhost:4242") => {
      const el = document.querySelector(selector);
      if (!el) return;

      const amount = Number(el.dataset.amount);
      const currency = el.dataset.currency || "EUR";
      const merchantId = el.dataset.merchant || "merchant_demo";

      render(el, { amount, currency, merchantId, apiBase });
    },
  };
})();
