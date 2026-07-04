insert into admins (id, data, updated_at)
values (
	'admin_01',
	'{
		"adminId": "admin_01",
		"fname": "System",
		"mname": "Test",
		"lname": "Administrator",
		"fullName": "System Test Administrator",
		"name": "System Test Administrator",
		"email": "admin@bulsu.edu.ph",
		"password": "geTEp4l7S3KGl+0oBp5uLzk1qmIzFFPlzSmNO3tV6zJwsVvywQ==",
		"role": "admin",
		"userType": "admin",
		"isValidated": true,
		"status": "Active",
		"createdAt": "2026-06-15T00:00:00.000Z",
		"updatedAt": "2026-06-15T00:00:00.000Z"
	}'::jsonb,
	now()
)
on conflict (id) do update
set
	data = excluded.data,
	updated_at = now();
