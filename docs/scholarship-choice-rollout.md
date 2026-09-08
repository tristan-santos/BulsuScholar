# Scholarship Choice Rollout

Status: database migrations applied and application deployment ready. The
backend must deploy before the frontend begins using the enabled workflow.

## Deployment Order

1. Confirm `20260905195006_scholarship_slot_capacity_prerequisites.sql` and
   `20260906124238_multiple_applications_one_choice.sql` are present in migration
   history. Both are already applied to the linked production project.
2. Deploy the backend with `ENABLE_SCHOLARSHIP_CHOICE=true` and verify the new
   archive, Invite Back, and invitation rejection routes in production OpenAPI.
3. Deploy the frontend. The workflow is enabled unless
   `VITE_ENABLE_SCHOLARSHIP_CHOICE=false` is explicitly configured.
4. Pause scholarship mutations during any required legacy audit. Run
   `select public.migrate_legacy_scholarship_choices();` using the service role.
   For a staged audit, pass an array of selected student IDs instead.
5. Review students marked `commitmentRequiresResolution`. Do not clear the flag
   without resolving their existing awards. Pending legacy reviews require a new
   review because their original document versions cannot be established.
6. Configure missing announcement capacity and reconcile existing reservations.
   Existing awards remain locked; unconfigured offerings cannot take new applications.
7. Do not roll back to older clients after migrating lifecycle data.

## Behavior

- Pending applications reserve capacity but do not commit a scholarship.
- Confirmed SOE submission chooses one application. Application form downloads
  are preparation only. Application review is scoped by application identity.
- Choice, material request, competitor closure, slot release, and inbox records
  are written in one database transaction. Deterministic inbox IDs make retries
  safe; a failed inbox insert rolls back the operation rather than dropping alerts.
- Withdrawal archives the application, releases its reservation once, and applies
  a 24-hour cooldown only for that grantor.
- Closed application history is read-only. Grantor archive details use historical
  records, not the student's subsequently selected scholarship.
- Shared-file replacement invalidates pending application reviews. Per-application
  forms and additional uploads remain separate. Rejected material requests retain
  commitment and can be corrected and resubmitted.
- KWSP roster promotion occurs at confirmed choice, not pre-choice final screening.
  Rejecting that chosen application retires its managed roster record and slot.
- A global transaction advisory lock serializes scholarship mutations, including
  legacy writes. This favors consistency over throughput. Monitor lock wait times
  before introducing a narrower lock scheme.

## Verification

```powershell
python -B -m unittest discover -s backend/tests -v
node scripts/test-scholarship-choice-policy.mjs
npm.cmd run build
npm.cmd run lint
```

Run `supabase/tests/scholarship-choice.sql` after the two SQL prerequisites inside
`BEGIN; ... ROLLBACK;`. Fixtures use dedicated IDs and must not overwrite users.
The tests cover retries, separate grantors, review invalidation, legacy awards,
withdrawal cooldowns, roster timing, slot returns, and closed-record protection.

For mocked browser verification, run a Vite server with the frontend flag enabled
and execute `node scripts/test-scholarship-choice-browser.mjs`. Install Playwright
or supply `PLAYWRIGHT_MODULE` pointing to its module. The script blocks external
network writes and does not verify deployed API integration.

Remaining release gates:

- Simultaneous-session choice, reservation, and withdrawal tests on isolated staging.
- End-to-end student/admin/grantor verification against the deployed staging API.
- Grantor archive desktop/mobile browser checks and refreshed student browser checks.
- Live migration, legacy audit, and coordinated backend/frontend deployment.
