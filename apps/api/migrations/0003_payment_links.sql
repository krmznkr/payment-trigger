-- Trigger bookkeeping. Not part of the brief's schema.

-- One trigger run (manual button or a scheduled job).
CREATE TABLE trigger_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  summary_json TEXT
);

-- Every history row is handled exactly once. A row without a decision is "new":
-- that is what "the status just changed" means here, independent of wall-clock age.
-- Retryable outcomes (routing error, stub failure) are not recorded, so the row stays new.
CREATE TABLE trigger_decisions (
  change_id INTEGER PRIMARY KEY REFERENCES payment_status_history(id),
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  outcome TEXT NOT NULL,
  run_id INTEGER NOT NULL REFERENCES trigger_runs(id),
  decided_at TEXT NOT NULL
);

-- At most one payment link per invoice. The row is claimed (pending) before the
-- Stripe call and completed after it, so concurrent runs cannot both call Stripe.
CREATE TABLE payment_links (
  invoice_id INTEGER PRIMARY KEY REFERENCES invoices(id),
  trigger_change_id INTEGER NOT NULL REFERENCES payment_status_history(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  params_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'created')),
  claimed_at TEXT NOT NULL,
  stripe_payment_link_id TEXT,
  url TEXT,
  created_at TEXT
);

-- What the Stripe stub was called with, for reviewers. Written by the mock itself.
CREATE TABLE stripe_stub_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  params_json TEXT NOT NULL,
  result_json TEXT,
  error TEXT,
  called_at TEXT NOT NULL
);
