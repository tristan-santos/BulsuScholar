-- Reset both seed grantors to password: Grantor@123
-- Encryption: AES-256-GCM (same as src/services/authService.js)
-- Secret: default app secret when VITE_PASSWORD_SECRET is not set
--   bulsucholar-default-secret-key-32!!!
--
-- If you use a custom VITE_PASSWORD_SECRET in .env, run this first:
--   node scripts/encrypt-password.mjs "Grantor@123"
-- Then replace ENCRYPTED_PASSWORD below with the printed value.

UPDATE providers
SET
	data = jsonb_set(
		data,
		'{password}',
		to_jsonb('prI2LqRIzLQXvhVXYGS9XNku0Msvu2jDFe0Z4VbCc+R8SbiCRihM'::text),
		true
	),
	updated_at = now()
WHERE id IN ('grantor_tina', 'grantor_kuya_win');

-- Verify
SELECT
	id,
	data->>'providerName' AS provider_name,
	data->>'email' AS email,
	data->>'password' AS encrypted_password
FROM providers
WHERE id IN ('grantor_tina', 'grantor_kuya_win');
