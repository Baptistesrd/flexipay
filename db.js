// db.js
const Database = require("better-sqlite3");

const db = new Database("data.sqlite");

// IMPORTANT: SQL complet, pas de "..." ou de texte hors SQL
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    order_ref TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    created_at TEXT NOT NULL,
    stripe_customer_id TEXT,
    stripe_payment_method_id TEXT
  );

  CREATE TABLE IF NOT EXISTS installments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    n INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id)
  );
`);

module.exports = db;

