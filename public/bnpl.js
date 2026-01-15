(function () {
  function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function eurosToCents(amountEuros) {
    // évite les erreurs float: 129.90 -> 12990
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

  function render(container, opts) {
    const { amountCents, currency, merchantId, apiBase } = opts;

    container.innerHTML = `
      <div style="border:1px solid #ddd; padding:12px; border-radius:12px; font-family:system-ui;">
        <div style="font-weight:650; margin-bottom:6px;">Payez en 2 fois</div>
        <div data-bnpl-lines style="margin-bottom:10px; color:#333;">Calcul...</div>
        <button data-bnpl-btn style="padding:10px 12px; border-radius:10px; border:0; background:black; color:white; cursor:pointer;">
          Payer 50% maintenant
        </button>
        <div data-bnpl-msg style="margin-top:8px; font-size:12px; color:#666;"></div>
      </div>
    `;

    const lines = container.querySelector("[data-bnpl-lines]");
    const btn = container.querySelector("[data-bnpl-btn]");
    const msg = container.querySelector("[data-bnpl-msg]");

    // On envoie un amount "euros" à ton API existante (qui attend number en euros)
    const amountEuros = amountCents / 100;

    postJSON(`${apiBase}/v1/quote`, { amount: amountEuros, currency })
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
      btn.disabled = true;
      btn.style.opacity = "0.7";
      try {
        const session = await postJSON(`${apiBase}/v1/checkout/session`, {
          merchantId,
          orderRef: `demo-${Date.now()}`,
          amount: amountEuros,
          currency,
        });

        window.location.href = session.checkoutUrl;
      } catch (e) {
        msg.textContent = "Erreur : " + (e.message || "inconnue");
        btn.disabled = false;
        btn.style.opacity = "1";
      }
    });
  }

  function mountOne(el, apiBase) {
    // Préfère data-amount-cents si dispo, sinon data-amount (euros)
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

    if (amountCents == null || amountCents <= 0) {
      el.textContent = "BNPL: montant invalide";
      return;
    }

    render(el, { amountCents, currency, merchantId, apiBase });
  }

  window.BNPL = {
    mount: (selector, apiBase = "http://localhost:4242") => {
      const els = document.querySelectorAll(selector);
      els.forEach((el) => mountOne(el, apiBase));
    },
  };
})();
