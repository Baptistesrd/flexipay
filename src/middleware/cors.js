const cors = require("cors");

const allowlist = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl / server-to-server / Postman
    if (allowlist.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
});
