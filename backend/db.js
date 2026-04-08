// db.js
const Database = require("better-sqlite3");
const db = new Database("data.sqlite");

// 1) Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,
    name TEXT,
    api_key TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

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
    stripe_payment_intent_id TEXT,
    last_error TEXT,
    updated_at TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_date TEXT,
    FOREIGN KEY(order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS stripe_events (
    id TEXT PRIMARY KEY,
    type TEXT,
    created_at TEXT NOT NULL
  );
`);

// 2) Safe column additions for existing databases
function hasColumn(table, col) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === col);
}

function addColumnIfMissing(table, col, ddl) {
  if (hasColumn(table, col)) return;
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run();
  console.log(`DB migrate: added ${table}.${col}`);
}

// installments: runtime columns
addColumnIfMissing("installments", "stripe_payment_intent_id", "stripe_payment_intent_id TEXT");
addColumnIfMissing("installments", "last_error", "last_error TEXT");
addColumnIfMissing("installments", "updated_at", "updated_at TEXT");
addColumnIfMissing("installments", "retry_count", "retry_count INTEGER DEFAULT 0");
addColumnIfMissing("installments", "next_retry_date", "next_retry_date TEXT");

// orders: lifecycle status (active | cancelled | completed)
addColumnIfMissing("orders", "status", "status TEXT NOT NULL DEFAULT 'active'");

// installments: AI recovery agent columns
addColumnIfMissing("installments", "agent_decision", "agent_decision TEXT");
addColumnIfMissing("installments", "agent_message", "agent_message TEXT");
addColumnIfMissing("installments", "sca_url", "sca_url TEXT");

module.exports = db;
