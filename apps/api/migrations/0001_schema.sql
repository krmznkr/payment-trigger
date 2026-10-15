-- Schema transcribed verbatim from the case study brief (section 4).

CREATE TABLE legal_entities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL
);

CREATE TABLE bank_accounts (
  id INTEGER PRIMARY KEY,
  legal_entity_id INTEGER NOT NULL REFERENCES legal_entities(id),
  iban TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  currency TEXT NOT NULL
);

CREATE TABLE parks (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  legal_entity_id INTEGER NOT NULL REFERENCES legal_entities(id)
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  stripe_customer_id TEXT -- nullable: not every customer has a Stripe customer yet
);

CREATE TABLE invoices (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  park_id INTEGER NOT NULL REFERENCES parks(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL, -- current status snapshot: open | overdue | paid | void
  created_at TEXT NOT NULL,
  due_date TEXT NOT NULL
);

CREATE TABLE payment_status_history (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  old_status TEXT, -- NULL for the first row of an invoice
  new_status TEXT NOT NULL,
  changed_at TEXT NOT NULL
);
