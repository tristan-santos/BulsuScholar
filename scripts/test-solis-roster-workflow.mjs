// Usage: node scripts/test-solis-roster-workflow.mjs /path/to/pglite/dist/index.js
import assert from "node:assert/strict"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const results = []
const cycle = "2026-2027-1ST"
const previousCycle = "2025-2026-2ND"
const extract = (sql, name) => {
	const start = sql.indexOf(`create or replace function public.${name}(`)
	assert.ok(start >= 0, `Missing function ${name}`)
	return sql.slice(start, sql.indexOf("$$;", start) + 3)
}
const load = async (path, names) => {
	const sql = await readFile(path, "utf8")
	for (const name of names) await db.exec(extract(sql, name))
}
const check = async (id, coreFunction, expectedResult, action) => {
	try {
		await action()
		results.push({ id, coreFunction, expectedResult, actualResult: "As expected", status: "Pass" })
	} catch (error) {
		results.push({ id, coreFunction, expectedResult, actualResult: error.message, status: "Fail" })
		throw error
	}
}
const put = (table, id, data, parent) => table === "student_scholarship_state"
	? db.query("insert into public.student_scholarship_state(id,student_id,data) values($1,$1,$2)", [id, data])
	: parent
	? db.query(`insert into public.${table}(id,parent_id,data) values($1,$2,$3)`, [id, parent, data])
	: db.query(`insert into public.${table}(id,data) values($1,$2)`, [id, data])
const get = async (table, id) => (await db.query(`select data from public.${table} where id=$1`, [id])).rows[0]?.data
const reconcile = async (id, source = "verified_login") => (await db.query("select public.reconcile_student_roster($1,$2) as result", [id, source])).rows[0].result
const assign = async (id, grantor, roster) => (await db.query("select public.assign_authoritative_roster_scholarship($1,$2,$3) as result", [id, grantor, roster])).rows[0].result
const student = (id, extra = {}) => put("students", id, { fullName: "Ana Santos", status: "Active", ...extra })
const roster = (id, sid, extra = {}, grantor = "g1") => put("grantor_portal_scholars", id, {
	studentId: sid, fullName: "Ana Santos", scholarshipId: grantor === "g1" ? "program1" : "program2",
	scholarshipTitle: "Official scholarship", academicCycle: cycle, status: "Active", ...extra,
}, grantor)
const app = (id, sid, extra = {}) => put("scholarship_applications", id, {
	studentId: sid, grantorId: "g2", scholarshipId: "program2", announcementId: "program2",
	academicCycle: cycle, semesterTag: cycle, status: "Applied", ...extra,
})
try {
	await db.exec("create role anon; create role authenticated; create role service_role")
	for (const table of ["students", "pending_students", "admins", "providers", "grantor_portals", "system_configuration",
		"studentNotifications", "grantorNotifications", "signup_account_decisions", "roster_import_batches", "roster_assignment_conflicts", "roster_import_audit_events"]) {
		await db.exec(`create table public."${table}"(id text primary key, data jsonb not null default '{}', created_at timestamptz default now(), updated_at timestamptz default now())`)
	}
	for (const table of ["grantor_portal_scholars", "grantor_portal_announcements", "roster_import_rows"]) {
		await db.exec(`create table public.${table}(id text primary key, parent_id text, data jsonb not null default '{}', created_at timestamptz default now(), updated_at timestamptz default now())`)
	}
	await db.exec(`create table public.student_scholarship_state(id text primary key, student_id text not null unique references public.students(id), data jsonb not null, updated_at timestamptz default now());
		create table public.student_scholarship_invitations(id text primary key, student_id text, grantor_id text, data jsonb, status text);
		create table public.scholarship_waitlist_entries(id text primary key, student_id text, grantor_id text, announcement_id text, status text);
		create table public.scholarship_applications(id text primary key, data jsonb, student_id text, grantor_id text, scholarship_id text, academic_cycle text, status text, closed_at timestamptz, updated_at timestamptz default now());
		create function public.resolve_roster_assignment_conflict(text,text,text,text) returns jsonb language sql as $$ select '{}'::jsonb $$;
		create function public.save_grantor_scope_policy_v3(text,text,text,boolean,jsonb,text) returns jsonb language sql as $$ select '{}'::jsonb $$;
		grant select,insert,update,delete on all tables in schema public to service_role;`)
	await load("supabase/migrations/20260906124238_multiple_applications_one_choice.sql", ["scholarship_application_open", "scholarship_document_versions"])
	await load("supabase/migrations/20260918130000_automatic_roster_and_login_security.sql", ["authoritative_roster_tracking", "complete_authoritative_roster_application"])
	await load("supabase/migrations/20260923120000_student_profile_document_verification.sql", ["scholarship_documents_complete_for_application"])
	await load("supabase/migrations/20260923120000_student_profile_document_verification.sql", ["scholarship_document_url"])
	// Scope/capacity internals are covered by their own suites. These fixtures let
	// the real latest waitlist eligibility function run without a location catalog.
	await db.exec(`create function public.grantor_scope_snapshot(text,jsonb) returns jsonb language sql as $$ select '{"eligible":true}'::jsonb $$;
		create function public.reserve_or_waitlist_scholarship(text,text,text,text,text) returns jsonb language sql as $$ select '{"disposition":"queued"}'::jsonb $$;
		alter table public.scholarship_waitlist_entries add column application_snapshot jsonb;
	`)
	await load("supabase/migrations/20261019045159_region3_grantor_location_scope.sql", ["waitlist_dynamic_eligibility_reason"])
	await load("supabase/migrations/20261009050000_normalize_student_scholarship_data.sql", ["sync_scholarship_application_columns"])
	await load("supabase/migrations/20260923124643_scholarship_roster_workflow.sql", ["protect_roster_import_audit_event"])
	await db.exec("create trigger audit_immutable before update or delete on public.roster_import_audit_events for each row execute function public.protect_roster_import_audit_event()")
	await db.exec("create trigger sync_application before insert or update on public.scholarship_applications for each row execute function public.sync_scholarship_application_columns()")
	await load("supabase/scholarship-slots.sql", ["release_scholarship_slot_for_application"])
	await db.exec("alter function public.release_scholarship_slot_for_application(text,jsonb) rename to release_scholarship_slot_before_choice")
	await db.exec(await readFile("supabase/migrations/20261020130000_normalized_scholarship_commitment_guards.sql", "utf8"))
	await db.exec("create trigger roster_guard before insert or update on public.grantor_portal_scholars for each row execute function public.guard_scholarship_roster_commitment()")
	const migration = await readFile("supabase/migrations/20261023070747_solis_cycle_aware_roster_reconciliation.sql", "utf8")
	await db.exec(migration)
	await db.exec("set role service_role")
	await put("system_configuration", "academic_cycle", { semesterTag: cycle })
	await put("admins", "admin", { role: "full_admin" })
	await put("admins", "reviewer", { role: "student_reviewer" })
	for (const id of ["g1", "g2"]) {
		await put("providers", id, { status: "Active", grantorType: id === "g1" ? "external" : "internal" })
		await put("grantor_portals", id, { status: "Active" })
		await put("grantor_portal_announcements", id === "g1" ? "program1" : "program2", { status: "Open", applicationEnabled: true, slotsConfigured: true, totalSlots: 10, remainingSlots: 8 }, id)
	}
	await check("SOL-SYS-01", "Private RPC permissions", "Anonymous and authenticated roles cannot execute any new roster function", async () => {
		const grants = await db.query(`select p.proname, has_function_privilege('anon',p.oid,'execute') as anon, has_function_privilege('authenticated',p.oid,'execute') as authenticated
			from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'roster_%' or p.proname in ('reconcile_student_roster','resolve_roster_assignment_conflict_v2','save_grantor_profile_policy'))`)
		assert.ok(grants.rows.length >= 8)
		for (const grant of grants.rows) assert.equal(grant.anon || grant.authenticated, false, grant.proname)
	})
	await check("SOL-SYS-02", "External roster exact assignment", "Exact ID and normalized name assign one scholarship in normalized state", async () => {
		await student("s1")
		await roster("r1", "s1")
		const result = await reconcile("s1")
		assert.equal(result.status, "assigned")
		assert.equal((await get("student_scholarship_state", "s1")).scholarshipCommitment.applicationId, result.applicationId)
		assert.equal((await get("students", "s1")).scholarshipCommitment, undefined)
		assert.equal(result.application.academicCycle, cycle)
	})
	await check("SOL-SYS-03", "Repeated verified login", "Existing application ID, progress, and notification counts remain unchanged", async () => {
		const before = await db.query('select count(*)::int as count from public."studentNotifications"')
		const first = await reconcile("s1")
		const second = await reconcile("s1")
		assert.equal(second.idempotent, true)
		assert.equal(first.applicationId, second.applicationId)
		assert.deepEqual(await db.query('select count(*)::int as count from public."studentNotifications"'), before)
	})
	await check("SOL-SYS-04", "Name mismatch", "A similar/different name never authorizes assignment; an idempotent warning is recorded", async () => {
		await student("mismatch")
		await roster("mismatch-r", "mismatch", { fullName: "Anna Santos" })
		assert.equal((await reconcile("mismatch")).reason, "roster_identity_mismatch")
		await reconcile("mismatch")
		assert.equal((await db.query("select count(*)::int as count from public.roster_assignment_conflicts where data->>'studentId'='mismatch'")).rows[0].count, 1)
		assert.equal((await db.query("select count(*)::int as count from public.scholarship_applications where student_id='mismatch'")).rows[0].count, 0)
	})
	await check("SOL-SYS-05", "Same-cycle completed scholarship", "A completed current-cycle award is preserved and a second scholarship is flagged", async () => {
		await student("completed")
		await app("finished", "completed", { status: "Finished", tracking: { completedStepIds: ["finish"] }, signedSoe: { path: "preserved.pdf" } })
		await roster("completed-r", "completed")
		assert.equal((await reconcile("completed")).reason, "scholarship_already_committed")
		assert.equal((await get("scholarship_applications", "finished")).signedSoe.path, "preserved.pdf")
	})
	await check("SOL-SYS-06", "Previous-cycle completed award", "Historical completed progress remains unchanged and does not block a current-cycle assignment", async () => {
		await student("history")
		await app("past", "history", { academicCycle: previousCycle, semesterTag: previousCycle, status: "Finished", signedSoe: { path: "old.pdf" } })
		await roster("history-r", "history")
		assert.equal((await reconcile("history")).status, "assigned")
		assert.equal((await get("scholarship_applications", "past")).signedSoe.path, "old.pdf")
		assert.equal((await get("scholarship_applications", "past")).status, "Finished")
	})
	await check("SOL-SYS-07", "Competing pending application", "Pending competitor is archived, its reserved slot released once, uploaded files retained", async () => {
		await student("pending")
		await app("pending-app", "pending", { slotReserved: true, otherRequirementUploads: [{ path: "retained.png" }] })
		await roster("pending-r", "pending")
		const before = (await get("grantor_portal_announcements", "program2")).remainingSlots
		await reconcile("pending")
		await reconcile("pending")
		const closed = await get("scholarship_applications", "pending-app")
		assert.equal(closed.status, "Archived")
		assert.ok(closed.slotReleasedAt)
		assert.equal(closed.otherRequirementUploads[0].path, "retained.png")
		assert.equal((await get("grantor_portal_announcements", "program2")).remainingSlots, before + 1)
	})
	await check("SOL-SYS-08", "Matching pending application", "Convert matching current-cycle application without changing its ID or tracking", async () => {
		await student("convert")
		await app("keep-id", "convert", { grantorId: "g1", scholarshipId: "program1", announcementId: "program1", tracking: { currentStage: "document_uploading", completedStepIds: ["application"] } })
		await roster("convert-r", "convert")
		const result = await reconcile("convert")
		assert.equal(result.applicationId, "keep-id")
		assert.equal(result.application.status, "Awaiting Documents")
		assert.deepEqual(result.application.tracking.completedStepIds, ["application"])
	})
	await check("SOL-SYS-09", "Unknown legacy cycle", "An untagged roster is flagged for verification, not guessed as a current award", async () => {
		await student("legacy")
		await roster("legacy-r", "legacy", { academicCycle: null })
		assert.equal((await reconcile("legacy")).reason, "roster_cycle_requires_verification")
	})
	await check("SOL-SYS-10", "Multiple active rosters", "No scholarship is auto-selected; Full Admin receives conflict records", async () => {
		await student("multiple")
		await roster("multi1", "multiple")
		await roster("multi2", "multiple", {}, "g2")
		await roster("multi-old", "multiple", { academicCycle: previousCycle }, "g2")
		assert.equal((await reconcile("multiple")).status, "conflict")
		assert.equal((await db.query("select count(*)::int as count from public.scholarship_applications where student_id='multiple'")).rows[0].count, 0)
	})
	const resolve = async (conflict, mode, reason = "Verified original documents and provider award.", actor = "admin", selected = "") =>
		(await db.query("select public.resolve_roster_assignment_conflict_v2($1,$2,$3,$4,$5) as result", [conflict, mode, selected, actor, reason])).rows[0].result
	const conflictId = async (sid) => (await db.query("select id from public.roster_assignment_conflicts where data->>'studentId'=$1 order by id", [sid])).rows[0].id
	await check("SOL-SYS-11", "Resolution authorization and reason", "Reviewers and blank reasons cannot change a conflict", async () => {
		const id = await conflictId("multiple")
		await assert.rejects(resolve(id, "candidate", "Verified documents fully", "reviewer"), /full_admin_required/)
		await assert.rejects(resolve(id, "candidate", ""), /roster_resolution_reason_required/)
	})
	await check("SOL-SYS-12", "Resolve competing roster alternatives", "Full Admin chooses one with a reason, preserves previous cycles, repeated resolution is idempotent", async () => {
		const id = await conflictId("multiple")
		await resolve(id, "existing", undefined, "admin", "multi1")
		assert.equal((await get("grantor_portal_scholars", "multi2")).archived, true)
		assert.equal((await get("grantor_portal_scholars", "multi-old")).archived, undefined)
		assert.equal((await reconcile("multiple")).status, "assigned")
		assert.equal((await resolve(id, "existing", undefined, "admin", "multi1")).idempotent, true)
		assert.ok((await get("roster_assignment_conflicts", id)).resolution.reason)
	})
	await check("SOL-SYS-13", "Keep current completed award", "Conflicting roster is archived without replacing the completed scholarship", async () => {
		const id = await conflictId("completed")
		await assert.rejects(resolve(id, "candidate"), /existing_award_must_be_preserved/)
		await resolve(id, "keep_current")
		assert.equal((await get("grantor_portal_scholars", "completed-r")).archived, true)
		assert.equal((await get("scholarship_applications", "finished")).status, "Finished")
	})
	await check("SOL-SYS-14", "New account activation", "Unconfirmed account cannot activate; confirmed promotion assigns roster atomically", async () => {
		await put("pending_students", "new", { fullName: "Ana Santos", email: "new@example.test", authUserId: "auth-new", isPending: true })
		await roster("new-r", "new")
		const approve = () => db.query("select public.approve_pending_student_account('new','auth-new','new@example.test','admin') as result")
		await assert.rejects(approve(), /student_email_not_confirmed/)
		assert.equal(await get("students", "new"), undefined)
		await db.query("update public.pending_students set data=data || '{\"emailConfirmedAt\":\"2026-10-23T00:00:00Z\"}' where id='new'")
		assert.equal((await approve()).rows[0].result.rosterAssigned, true)
		assert.equal((await approve()).rows[0].result.alreadyActive, true)
		assert.equal(await get("pending_students", "new"), undefined)
	})
	await check("SOL-SYS-15", "Atomic import and repetition", "New import creates one roster/application; retry does not duplicate it", async () => {
		await student("import")
		await put("roster_import_batches", "batch", { actorType: "grantor", actorId: "g1", status: "ready" })
		await put("roster_import_rows", "row", { studentId: "import", fullName: "Ana Santos", grantorId: "g1", scholarshipId: "program1", academicCycle: cycle, scholarshipTitle: "Official scholarship", disposition: "new_assignment" }, "batch")
		const commit = async () => (await db.query("select public.commit_roster_import_batch('batch','grantor','g1') as result")).rows[0].result
		assert.equal((await commit()).counts.created, 1)
		assert.equal((await commit()).idempotent, true)
		assert.equal((await db.query("select count(*)::int as count from public.scholarship_applications where student_id='import'")).rows[0].count, 1)
	})
	await check("SOL-SYS-16", "Stale import", "A semester change after preview rejects the entire import without inserting a roster", async () => {
		await put("roster_import_batches", "stale", { actorType: "grantor", actorId: "g1", status: "ready" })
		await put("roster_import_rows", "stale-row", { studentId: "future", fullName: "Ana Santos", grantorId: "g1", scholarshipId: "program1", academicCycle: previousCycle }, "stale")
		await assert.rejects(db.query("select public.commit_roster_import_batch('stale','grantor','g1')"), /academic_cycle_changed/)
		assert.equal((await db.query("select count(*)::int as count from public.grantor_portal_scholars where data->>'studentId'='future'")).rows[0].count, 0)
	})
	const reserve = (sid, id) => db.query("select public.reserve_scholarship_application($1,'program2','g2',$2,$2) as result", [sid, id])
	await check("SOL-SYS-17", "Existing scholar applies elsewhere", "Current awarded student is blocked before a new application or slot decrement", async () => {
		const before = (await get("grantor_portal_announcements", "program2")).remainingSlots
		await assert.rejects(reserve("s1", "blocked-app"), /scholarship_already_committed/)
		assert.equal(await get("scholarship_applications", "blocked-app"), undefined)
		assert.equal((await get("grantor_portal_announcements", "program2")).remainingSlots, before)
	})
	await check("SOL-SYS-18", "Historical award applies again", "Previous-cycle completed award and roster do not block a current-cycle application", async () => {
		await student("history-apply", { gwa: "1.5" })
		await app("history-finished", "history-apply", { status: "Finished", academicCycle: previousCycle, semesterTag: previousCycle })
		await roster("old-roster", "history-apply", { academicCycle: previousCycle }, "g2")
		await put("student_scholarship_state", "history-apply", { scholarshipCommitment: { applicationId: "history-finished" } })
		await db.query("update public.student_scholarship_state set student_id=id where id='history-apply'")
		assert.equal((await reserve("history-apply", "new-cycle-app")).rows[0].result.applicationId, "new-cycle-app")
		assert.equal((await get("scholarship_applications", "new-cycle-app")).academicCycle, cycle)
		assert.equal((await get("scholarship_applications", "history-finished")).status, "Finished")
	})
	await check("SOL-SYS-19", "Cancelled and terminated awards", "An ended inactive commitment does not count as an active award", async () => {
		for (const status of ["Cancelled", "Terminated", "Inactive"]) {
			const sid = `ended-${status}`
			await student(sid, { gwa: "1.5" })
			await app(`ended-app-${status}`, sid, { status })
			await put("student_scholarship_state", sid, { scholarshipCommitment: { applicationId: `ended-app-${status}` } })
			await db.query("update public.student_scholarship_state set student_id=id where id=$1", [sid])
			assert.equal((await reserve(sid, `allowed-${status}`)).rows[0].result.applicationId, `allowed-${status}`)
		}
	})
	await check("SOL-SYS-20", "Pending applications are not awards", "A student may submit another pending application; repeated same-offering submission is idempotent", async () => {
		await student("pending-apply", { gwa: "1.25" })
		await app("another-pending", "pending-apply", { grantorId: "g1", scholarshipId: "program1" })
		await reserve("pending-apply", "allowed-pending")
		assert.equal((await reserve("pending-apply", "retry-pending")).rows[0].result.idempotent, true)
		assert.equal(await get("scholarship_applications", "retry-pending"), undefined)
	})
	await check("SOL-SYS-21", "Waitlist revalidation", "A queued student with a newly assigned normalized award is ineligible for a later offer", async () => {
		await db.query("insert into public.scholarship_waitlist_entries(id,student_id,grantor_id,announcement_id,status) values('entry','s1','g2','program2','queued')")
		assert.equal((await db.query("select public.waitlist_dynamic_eligibility_reason('entry') as reason")).rows[0].reason, "scholarship_already_committed")
		await assert.rejects(db.query("select public.reserve_or_waitlist_scholarship('s1','program2','g2','other','OTHER')"), /scholarship_already_committed/)
	})
	await check("SOL-SYS-22", "Verified identity correction", "Full Admin may assign a mismatched roster only through a reasoned, audited resolution", async () => {
		const id = await conflictId("mismatch")
		await resolve(id, "candidate")
		assert.equal((await reconcile("mismatch")).status, "assigned")
		assert.equal((await get("roster_assignment_conflicts", id)).candidate.rosterData.fullName, "Anna Santos")
		assert.equal((await get("grantor_portal_scholars", "mismatch-r")).identityVerifiedBy, "admin")
	})
	await check("SOL-SYS-23", "Legacy roster resolution", "Verified legacy alternatives can be resolved without touching explicitly historical records", async () => {
		await student("legacy-multiple")
		await roster("legacy-one", "legacy-multiple", { academicCycle: null })
		await roster("legacy-two", "legacy-multiple", { academicCycle: null }, "g2")
		await roster("legacy-history", "legacy-multiple", { academicCycle: previousCycle }, "g2")
		await reconcile("legacy-multiple")
		await resolve(await conflictId("legacy-multiple"), "candidate")
		assert.equal((await reconcile("legacy-multiple")).status, "assigned")
		assert.equal((await get("grantor_portal_scholars", "legacy-history")).archived, undefined)
	})
	await check("SOL-SYS-24", "Whole-batch rollback", "Failure on a later row rolls back earlier row inserts and leaves the batch uncommitted", async () => {
		await put("roster_import_batches", "atomic-batch", { actorType: "grantor", actorId: "g1", status: "ready" })
		await put("roster_import_rows", "atomic-a", { studentId: "not-active-yet", fullName: "Ana Santos", grantorId: "g1", scholarshipId: "program1", academicCycle: cycle }, "atomic-batch")
		await put("roster_import_rows", "atomic-b", { studentId: "bad", fullName: "", grantorId: "g1", scholarshipId: "program1", academicCycle: cycle }, "atomic-batch")
		await assert.rejects(db.query("select public.commit_roster_import_batch('atomic-batch','grantor','g1')"), /invalid_roster_identity/)
		assert.equal((await db.query("select count(*)::int as count from public.grantor_portal_scholars where data->>'studentId'='not-active-yet'")).rows[0].count, 0)
		assert.equal((await get("roster_import_batches", "atomic-batch")).status, "ready")
	})
	await check("SOL-SYS-25", "Immutable audit trail", "Recorded system assignments cannot be rewritten or deleted", async () => {
		await assert.rejects(db.query("update public.roster_import_audit_events set data='{}'"), /roster_import_audit_is_immutable/)
		await assert.rejects(db.query("delete from public.roster_import_audit_events"), /roster_import_audit_is_immutable/)
	})
	await check("SOL-SYS-26", "Archived grantor with existing award", "Verified login preserves an existing office-managed award after grantor archival", async () => {
		await db.query("update public.providers set data=data || '{\"archived\":true}' where id='g1'")
		assert.equal((await reconcile("s1")).idempotent, true)
		await db.query("update public.providers set data=data || '{\"archived\":false}' where id='g1'")
	})
	await check("SOL-SYS-27", "Grantor type permissions and persistence", "Full Admin changes type in provider and portal metadata without changing the authorization role", async () => {
		await db.query("update public.providers set data=data || '{\"role\":\"provider\"}' where id='g2'")
		const save = (actor, type) => db.query("select public.save_grantor_profile_policy('g2','government',$1,'',false,'[]',$2)", [type, actor])
		await assert.rejects(save("reviewer", "external"), /full_admin_required/)
		await assert.rejects(save("admin", "student"), /invalid_grantor_type/)
		await save("admin", "external")
		assert.equal((await get("providers", "g2")).grantorType, "external")
		assert.equal((await get("grantor_portals", "g2")).grantorType, "external")
		assert.equal((await get("providers", "g2")).role, "provider")
	})
	console.log(`PASS: ${results.length} Solis roster SQL cases (isolated PostgreSQL/PGlite; synthetic data).`)
} catch (error) {
	console.error(error.message, error.where || "", error.internalQuery || "")
	process.exitCode = 1
} finally {
	await mkdir("test-results", { recursive: true })
	await writeFile("test-results/solis-system-cases.json", JSON.stringify({ generatedAt: new Date().toISOString(), environment: "Isolated PostgreSQL/PGlite", dataset: "Synthetic fixtures; no production student records", cases: results }, null, 2) + "\n")
	await db.close()
}
