# Administrator Single-Grantor Roster Import

## Where to Find It

Administrator > Scholarship Programs > Import > choose a spreadsheet.

- Select an existing grantor, or type a new grantor name and confirm it with the checkmark.
- Selecting a grantor disables typing; return to Select grantor to unlock typing.
- Typing disables the dropdown. The pencil unlocks a confirmed name; X clears it.
- Every retained row uses that one grantor. Grantor/provider/sponsor columns recognized in the spreadsheet header are discarded; there is no per-row grantor selector.
- Row checkboxes, select-all and Remove Selected remain available.
- Changes invalidate the preview. Preview again before Commit Import.

The grantor portal and the separate manual-scholar form retain their existing workflows.

## New Grantors

Confirmation only updates temporary UI state. Preview saves validation batches, not permanent grantors.

A successful database commit creates a reusable external, private-classification grantor record without login credentials, together with private roster-only scholarship programs. No Supabase Auth user, invitation, public announcement or open application opportunity is created. Location enforcement is disabled by default.

Existing normalized grantor names must be selected rather than recreated. Archived/inactive grantors cannot receive an import. Non-login grantors appear in the existing provider list after the normal data refresh and can receive later imports.

Provider creation, program registration, duplicate/conflict revalidation, roster insertion, eligible account assignment and audit writes share one transaction. Failure rolls back the new grantor/programs and any preceding roster writes. Existing account/cycle/commitment guards remain in force. Missing student IDs retain the existing unlinked-record behavior.

## Deployment

1. Apply `supabase/migrations/20261102164522_admin_single_grantor_roster_import.sql` before deploying the backend.
2. Deploy the backend, then the frontend.
3. Test a controlled existing-grantor import and a new typed-grantor import in staging.
4. Confirm new programs do not appear as public announcements and repeat a blocked cross-grantor case.

The migration adds the private `roster_programs` table, service-role-only helpers and a protected commit wrapper. It retains the existing transaction implementation, changing only its recognized-program lookup to include the private registry. The migration checks the existing function definitions and fails explicitly if they have changed unexpectedly.

No migration or deployment was executed against a live Supabase project during this implementation.

## Local Verification

```powershell
py -3.12 -m unittest backend.tests.test_roster_workflow_service backend.tests.test_solis_system_revision backend.tests.test_admin_single_grantor_import backend.tests.test_portal_data_service
npm run lint
npm run build
npm run test:frontend
```

An isolated PostgreSQL/PGlite suite runs the actual migration, commit and assignment functions against synthetic tables:

```powershell
node scripts/test-admin-single-grantor-import.mjs /absolute/path/to/@electric-sql/pglite/dist/index.js
```

Start Vite, then run the full-admin browser fixture:

```powershell
npm run dev -- --host 127.0.0.1 --port 5177
./scripts/test-admin-single-grantor-browser.ps1
```

The browser fixture intercepts external API requests and uses synthetic records. It checks the real administrator modal at 1440, 1366, 1024, 768 and 390 pixels in light/dark modes. This proves frontend interactions in the fixture, not authenticated production operation. Local SQL tests prove isolated transaction behavior, not live concurrency or deployment status.

Generated local evidence is under `test-results/admin-single-grantor-*.json` and `test-results/admin-roster-*-light.png` / `*-dark.png`.
