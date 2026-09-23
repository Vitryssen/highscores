-- The deployed site now uses grand_prix_monthly; the all-time view kept for the transition goes.
drop view public.grand_prix;

select internal.assert_security();
