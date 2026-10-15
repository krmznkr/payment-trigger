-- Seed data transcribed verbatim from the case study brief (section 4).

INSERT INTO legal_entities (id, name, country) VALUES
  (1, 'Storage24 München Nord GmbH', 'DE'),
  (2, 'Storage24 München Süd GmbH', 'DE'),
  (3, 'Storage24 France SAS', 'FR');

INSERT INTO bank_accounts (id, legal_entity_id, iban, bank_name, currency) VALUES
  (1, 1, 'DE12 5001 0517 0001234567', 'Deutsche Bank', 'EUR'),
  (2, 2, 'DE44 7002 0270 0009876543', 'Commerzbank', 'EUR'),
  (3, 3, 'FR76 3000 6000 0112345678901', 'Société Générale', 'EUR');

INSERT INTO parks (id, name, city, country, legal_entity_id) VALUES
  (10, 'Storage24 München Nord', 'Munich', 'DE', 1),
  (11, 'Storage24 München Süd', 'Munich', 'DE', 2),
  (12, 'Storage24 Lyon', 'Lyon', 'FR', 3);

INSERT INTO customers (id, full_name, email, stripe_customer_id) VALUES
  (100, 'Anna Keller', 'anna.keller@example.com', 'cus_A1B2C3'),
  (101, 'Marc Petit', 'marc.petit@example.fr', NULL),
  (102, 'Julia Wagner', 'julia.wagner@example.com', 'cus_D4E5F6');

INSERT INTO invoices (id, customer_id, park_id, amount_cents, currency, status, created_at, due_date) VALUES
  (1001, 100, 10, 15000, 'EUR', 'paid', '2026-06-01', '2026-06-15'),
  (1002, 100, 11, 24000, 'EUR', 'overdue', '2026-07-01', '2026-07-15'),
  (1003, 101, 12, 18000, 'EUR', 'open', '2026-08-10', '2026-08-24'),
  (1004, 102, 10, 9800, 'EUR', 'void', '2026-05-20', '2026-06-03');

INSERT INTO payment_status_history (id, invoice_id, old_status, new_status, changed_at) VALUES
  (1, 1001, NULL, 'open', '2026-06-01T09:00:00Z'),
  (2, 1001, 'open', 'paid', '2026-06-10T14:32:00Z'),
  (3, 1002, NULL, 'open', '2026-07-01T09:00:00Z'),
  (4, 1002, 'open', 'overdue', '2026-07-16T00:05:00Z'),
  (5, 1003, NULL, 'open', '2026-08-10T09:00:00Z'),
  (6, 1004, NULL, 'open', '2026-05-20T09:00:00Z'),
  (7, 1004, 'open', 'void', '2026-05-25T11:00:00Z');
