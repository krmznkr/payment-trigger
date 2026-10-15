## Out of scope / what I'd do next

In priority order. Nothing here was rushed in; each item is either a production
concern beyond a 3-hour take-home or depends on something the brief left out of scope.

1. **Deactivate links on paid/void, and allow one *active* link per invoice.** Today
   nothing deactivates a link, so a paid invoice's link stays payable (double-payment
   risk), and a re-triggered invoice would reuse a dead link.
   - Add a `generation` column and enforce uniqueness only for pending/created links
     (a partial unique index). Deactivated rows stay as history.
   - Use the key `payment-link:invoice:<id>:<generation>`. Reuse the active link,
     otherwise claim the next generation.
   - Not built: it needs the webhook trigger (design note), which is out of scope.
2. **Real Stripe wrapper.**
   - Payment Link versus Checkout Session decision (assumption 6).
   - Classify errors, and reconcile by metadata before switching keys after a stored
     500 (assumption 8).
   - An HTTP timeout shorter than the claim lease (assumption 9).
   - Lowercase currency, and `metadata.invoice_id` on the link.
3. **Authentication and data exposure.** The demo is public by design. Anyone can read
   customer emails and IBANs, and any website can `POST /api/runs` or reset the demo
   (checked). Put the app behind Cloudflare Access or a token, mask emails and IBANs,
   and drop the demo endpoints outside demo stages.
4. **Scale-out.** Measured: about 5 D1 queries per newly overdue invoice, against D1's
   limit of 1,000 per invocation (50 on free). A cap of 100 invoices per run keeps
   each run safe and later runs continue the backlog. For real volume:
   - A Cron Trigger and a queue (one message per invoice).
   - Select new rows in SQL instead of loading whole tables.
   - Indexes on `payment_status_history(invoice_id)`.
5. **Rollouts.** Old and new Workers serve side by side for 10–30 s or more after a
   deploy. Write migrations as expand-then-contract, and consider gradual deployments
   with version checks.
6. **Smaller items.**
   - Due dates in each park's local time zone.
   - Alerting when an invoice stays inconsistent or unroutable for N runs.
   - A test for a run that dies mid-way on real D1. Resumability is designed in
     (claims, leases, per-row decisions) but only tested in SQLite.
