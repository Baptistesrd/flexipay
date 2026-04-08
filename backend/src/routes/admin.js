const express = require("express");
const db = require("../../db");
const { requireAdmin, randomKey } = require("../middleware/auth");
const { nowIso } = require("../lib/helpers");

const router = express.Router();

// POST /v1/admin/merchants
router.post("/merchants", requireAdmin, (req, res) => {
  const { id, name } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });

  const exists = db.prepare("SELECT id FROM merchants WHERE id=?").get(id);
  if (exists) return res.status(409).json({ error: "merchant already exists" });

  const apiKey = randomKey();
  db.prepare(
    "INSERT INTO merchants (id, name, api_key, created_at) VALUES (?,?,?,?)"
  ).run(id, name || null, apiKey, nowIso());

  res.json({ id, name: name || null, apiKey });
});

module.exports = router;
