# BulsuScholar

BulsuScholar is a scholarship-management portal for students, grantors,
administrators, and the root operator. The frontend is a Vite/React application,
the API is FastAPI, and Supabase provides Auth, PostgreSQL, Realtime, and Storage.

## Local Development

```powershell
npm.cmd install
npm.cmd run dev
```

Run the backend separately:

```powershell
npm.cmd run pyRun
```

Copy `.env.example` to `.env` and provide local credentials. Never commit `.env`
or place service-role, Brevo, Railway, Vercel, or root secrets in a `VITE_*`
variable.

## Verification

```powershell
npm.cmd run lint
npm.cmd run build
python -m compileall backend
python -m unittest discover -s backend/tests -p "test_*.py"
```

Deployment and email configuration are documented under `docs/deployment/` and
`docs/email/`. Applied database history lives in `supabase/migrations/` and must
not be deleted or rewritten.

## Destructive Reset

The production reset is intentionally separate from migrations. Back up Supabase,
run `supabase/reset-all-data-except-root.sql` in the SQL Editor, and then run the
service-role cleanup command described in that file. The reset preserves only the
root Auth identity and `root_admins` record, and leaves Maintenance Mode enabled.
