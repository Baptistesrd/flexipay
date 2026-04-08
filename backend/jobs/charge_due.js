// jobs/charge_due.js
require("dotenv").config();

async function run() {
  const url = `${process.env.BASE_URL}/v1/jobs/charge-due`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-job-token": process.env.JOB_TOKEN
    }
  });

  const json = await r.json();
  console.log(new Date().toISOString(), json);
}

setInterval(run, 60_000); // toutes les 60s (MVP)
run();
