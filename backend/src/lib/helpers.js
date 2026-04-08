// Shared date/time helpers used across routes and services.

function nowIso() {
  return new Date().toISOString();
}

/** Returns a YYYY-MM-DD string for today + `days` days. */
function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function isDue(dueDateYmd) {
  return dueDateYmd <= todayYmd();
}

module.exports = { nowIso, addDaysIso, todayYmd, isDue };
