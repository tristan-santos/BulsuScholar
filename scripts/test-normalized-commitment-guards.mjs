// Usage: node scripts/test-normalized-commitment-guards.mjs /path/to/pglite/dist/index.js
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const extractFunction = (sql, name) => {
	const start = sql.indexOf(`create or replace function public.${name}(`)
	assert.ok(start >= 0)
	return sql.slice(start, sql.indexOf("$$;", start) + 3)
}
try {
	await db.exec(`
		create role anon; create role authenticated; create role service_role;
		create table public.students(id text primary key, data jsonb);
		create table public.student_scholarship_state(id text primary key, student_id text unique, data jsonb);
		create table public.scholarship_applications(id text primary key, data jsonb);
		create table public.soe_requests(id text primary key, data jsonb);
		create table public.grantor_portal_scholars(id text primary key, parent_id text, data jsonb);
		grant select, insert, update on all tables in schema public to service_role;
	`)
	const original = await readFile("supabase/migrations/20260906124238_multiple_applications_one_choice.sql", "utf8")
	await db.exec(extractFunction(original, "scholarship_application_open"))
	await db.exec(extractFunction(original, "guard_scholarship_material_identity"))
	await db.exec("create trigger scholarship_material_identity_guard before insert or update on public.soe_requests for each row execute function public.guard_scholarship_material_identity()")
	await db.query("insert into public.students values ('student', $1)", [{ scholarshipLifecycleVersion: 2 }])
	await db.query("insert into public.student_scholarship_state values ('student', 'student', $1)", [{ scholarshipLifecycleVersion: 2, scholarshipCommitment: { applicationId: "app", applicationNumber: "APP-1", grantorId: "grantor" } }])
	await db.query("insert into public.scholarship_applications values ('app', $1)", [{ studentId: "student", applicationNumber: "APP-1", grantorId: "grantor", status: "Applied" }])
	const request = { studentId: "student", applicationId: "app", applicationNumber: "APP-1", status: "Pending" }
	await assert.rejects(db.query("insert into public.soe_requests values ('request', $1)", [request]), /scholarship_choice_required/)
	await db.exec(await readFile("supabase/migrations/20261020130000_normalized_scholarship_commitment_guards.sql", "utf8"))
	await db.exec("create trigger scholarship_roster_commitment_guard before insert or update on public.grantor_portal_scholars for each row execute function public.guard_scholarship_roster_commitment()")
	const privileges = await db.query("select has_function_privilege('anon', 'public.scholarship_guard_student_state(text)', 'execute') as anon, has_function_privilege('authenticated', 'public.scholarship_guard_student_state(text)', 'execute') as authenticated, has_function_privilege('service_role', 'public.scholarship_guard_student_state(text)', 'execute') as service")
	assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service: true })
	await db.exec("set role service_role")
	await db.query("insert into public.soe_requests values ('request', $1)", [request])
	await db.query("update public.soe_requests set data=data || '{\"status\":\"Approved\"}' where id='request'")
	assert.equal("Approved", (await db.query("select data from public.soe_requests where id='request'")).rows[0].data.status)
	await assert.rejects(db.query("update public.soe_requests set data=data || '{\"applicationNumber\":\"WRONG\"}' where id='request'"), /application_closed/)
	await assert.rejects(db.query("update public.soe_requests set data=data || '{\"applicationId\":\"foreign\"}' where id='request'"), /application_closed/)
	await db.query("insert into public.grantor_portal_scholars values ('roster','grantor',$1)", [{ studentId: "student", status: "Active" }])
	assert.equal("app", (await db.query("select data from public.grantor_portal_scholars where id='roster'")).rows[0].data.applicationId)
	await assert.rejects(db.query("insert into public.grantor_portal_scholars values ('foreign','wrong-grantor',$1)", [{ studentId: "student", status: "Active" }]), /scholarship_choice_required/)
	// A present but empty normalized state must not resurrect a stale legacy choice.
	await db.query("update public.students set data=data || $1 where id='student'", [{ scholarshipCommitment: { applicationId: "app", applicationNumber: "APP-1" } }])
	await db.query("update public.student_scholarship_state set data='{\"scholarshipLifecycleVersion\":2}' where student_id='student'")
	await assert.rejects(db.query("update public.soe_requests set data=data || '{\"status\":\"Approved\"}' where id='request'"), /scholarship_choice_required/)
	// Legacy students without a normalized row retain the existing compatibility behavior.
	await db.query("insert into public.students values ('legacy',$1)", [{ scholarshipLifecycleVersion: 2, scholarshipCommitment: { applicationId: "old", applicationNumber: "OLD-1" } }])
	await db.query("insert into public.soe_requests values ('legacy-request',$1)", [{ studentId: "legacy", applicationNumber: "OLD-1" }])
	await db.exec("begin; set local bulsuscholar.choice_write='true'")
	await db.query("insert into public.soe_requests values ('atomic-request',$1)", [request])
	await db.exec("rollback")
	console.log("PASS: reproduced old failure; normalized approval and roster updates succeed, mismatches/no-choice remain blocked, legacy and atomic paths preserved, private grants verified.")
} finally {
	await db.close()
}
