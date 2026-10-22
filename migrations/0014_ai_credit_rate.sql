-- AI credits change from 100 to the euro to 10 to the euro (1 credit = 10 cents),
-- so each request uses a tenth as many credits. Every stored amount is divided by
-- ten, which keeps what each organisation holds, has bought and has spent at the
-- same euro value. Amounts are milli-credits, so the division loses at most a
-- hundredth of a cent.
UPDATE ai_accounts
   SET balance_mc         = balance_mc / 10,
       purchased_mc       = purchased_mc / 10,
       period_grant_mc    = period_grant_mc / 10,
       allowance_override = CASE WHEN allowance_override IS NULL THEN NULL ELSE allowance_override / 10 END;

UPDATE ai_ledger SET amount_mc = amount_mc / 10;
