-- Test the calculate_campaign_datasets_for_user function for paopecina3@gmail.com
SELECT 
  u.id,
  u.email,
  calculate_campaign_datasets_for_user(u.id) as calculated_datasets
FROM usuarios u
WHERE u.email = 'paopecina3@gmail.com';
