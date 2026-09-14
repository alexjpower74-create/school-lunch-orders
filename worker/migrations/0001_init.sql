-- School Lunch Orders, one deployment = one school. Money is integer cents. Dates are school-local YYYY-MM-DD; instants are
-- ISO strings in UTC. Arrays (allergies, allergens, days, ack_allergens) are JSON text. Nothing old in the ledger is edited:
-- a void only sets voided = 1.

CREATE TABLE school (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  school_name TEXT NOT NULL,
  sample INTEGER NOT NULL DEFAULT 0,
  payment_instructions TEXT NOT NULL DEFAULT '',
  cutoff_days_before INTEGER NOT NULL DEFAULT 1,
  cutoff_time TEXT NOT NULL DEFAULT '09:00',
  year_start TEXT,
  year_end TEXT
);

CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  grade TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'kitchen', 'teacher')),
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  class_id TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE families (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE children (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  family_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  class_id TEXT NOT NULL,
  allergies TEXT NOT NULL DEFAULT '[]',
  removed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX children_family ON children (family_id);

CREATE TABLE items (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 0 AND 5000),
  ingredients TEXT NOT NULL DEFAULT '',
  allergens TEXT NOT NULL DEFAULT '[]',
  vegetarian INTEGER NOT NULL DEFAULT 0,
  days TEXT NOT NULL DEFAULT '[]',
  max_per_child INTEGER,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE menu (
  date TEXT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY (date, item_id)
);

CREATE TABLE no_school (
  date TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('holiday', 'pd_day', 'closure')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE orders (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  family_id TEXT NOT NULL,
  placed_at TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  item_count INTEGER NOT NULL
);

CREATE TABLE lines (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  date TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 10),
  unit_price_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'closed')),
  ack_allergens TEXT NOT NULL DEFAULT '[]',
  placed_at TEXT NOT NULL,
  changed_at TEXT
);
CREATE INDEX lines_date ON lines (date, status);
CREATE INDEX lines_family ON lines (family_id, date);

CREATE TABLE deliveries (
  date TEXT NOT NULL,
  child_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('delivered', 'absent')),
  staff_id TEXT,
  at TEXT NOT NULL,
  PRIMARY KEY (date, child_id)
);

CREATE TABLE entries (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  family_id TEXT NOT NULL,
  at TEXT NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('order', 'cancel', 'closure', 'payment', 'adjustment')),
  amount_cents INTEGER NOT NULL,
  label TEXT NOT NULL,
  method TEXT,
  note TEXT NOT NULL DEFAULT '',
  voided INTEGER NOT NULL DEFAULT 0,
  voided_at TEXT
);
CREATE INDEX entries_family ON entries (family_id, seq);
CREATE INDEX entries_date ON entries (date);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('family', 'staff')),
  subject_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_subject ON sessions (kind, subject_id);

CREATE TABLE pin_attempts (ip TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX pin_attempts_ip ON pin_attempts (ip, at);

CREATE TABLE code_attempts (ip TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX code_attempts_ip ON code_attempts (ip, at);
