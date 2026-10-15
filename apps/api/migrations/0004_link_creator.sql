-- The run that completed the link. Lets any run record the triggering row's decision
-- identically ("link created by run N"), whichever run gets to record it first.
ALTER TABLE payment_links ADD COLUMN created_by_run_id INTEGER REFERENCES trigger_runs(id);
