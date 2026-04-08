const express = require("express");
const db = require("../../db");
const { chargeInstallment } = require("../services/installments");
const { todayYmd, isDue } = require("../lib/helpers");

const router = express.Router();

// POST /v1/jobs/charge-due
// Guarded by X-Job-Token header. Charges all pending installments that are due.
router.post("/charge-due", async (req, res) => {
  const token = req.headers["x-job-token"];
  if (!process.env.JOB_TOKEN || token !== process.env.JOB_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const due = db
    .prepare(
      "SELECT id, due_date, next_retry_date FROM installments WHERE status='pending'"
    )
    .all();

  const today = todayYmd();
  const targets = due
    .filter((x) => isDue(x.due_date))
    .filter((x) => !x.next_retry_date || x.next_retry_date <= today)
    .map((x) => x.id);

  const results = [];
  for (const id of targets) {
    // eslint-disable-next-line no-await-in-loop
    results.push({ id, ...(await chargeInstallment(id)) });
  }

  res.json({ ran: targets.length, results });
});

module.exports = router;
