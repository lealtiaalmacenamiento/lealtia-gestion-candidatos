-- Drop both versions and recreate with correct signature
DROP FUNCTION IF EXISTS calculate_campaign_datasets_for_user(bigint);
DROP FUNCTION IF EXISTS calculate_campaign_datasets_for_user(uuid);
