const crypto = require("crypto");
const db = require("../../db");

/** Validates Bearer token against the merchant's stored api_key. */
function requireMerchantAuth(req, res, next) {
  const merchantId = req.params.merchantId || req.body.merchantId;
  if (!merchantId) return res.status(400).json({ error: "merchantId missing" });

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing bearer token" });

  const m = db.prepare("SELECT * FROM merchants WHERE id=?").get(merchantId);
  if (!m) return res.status(404).json({ error: "merchant not found" });
  if (m.api_key !== token) return res.status(403).json({ error: "invalid api key" });

  req.merchant = m;
  next();
}

/** Validates Bearer token against ADMIN_KEY env var. */
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || token !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

/** Generates a cryptographically random 48-char hex API key. */
function randomKey() {
  return crypto.randomBytes(24).toString("hex");
}

module.exports = { requireMerchantAuth, requireAdmin, randomKey };
