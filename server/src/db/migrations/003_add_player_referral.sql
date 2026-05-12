ALTER TABLE players
  ADD COLUMN IF NOT EXISTS referral_code TEXT,
  ADD COLUMN IF NOT EXISTS has_referral BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE players
SET has_referral = TRUE
WHERE referral_code IS NOT NULL
  AND has_referral = FALSE;
