// Run against an isolated PostgreSQL-compatible PGlite instance, never production.
// Usage: node scripts/test-private-requirement-rpc.mjs /path/to/pglite/dist/index.js
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const functionSql = (source, name) => {
	const start = source.indexOf(`create or replace function public.${name}(`)
	assert.ok(start >= 0)
	return source.slice(start, source.indexOf("$$;", start) + 3)
}
try {
	await db.exec(`
		create role anon; create role authenticated; create role service_role;
		create table public.students(id text primary key, data jsonb, updated_at timestamptz default now());
		create table public.scholarship_applications(id text primary key, data jsonb, updated_at timestamptz default now());
		create table public."systemLogs"(id text primary key, data jsonb, updated_at timestamptz default now());
		grant select, insert, update on all tables in schema public to service_role;
		create function public.scholarship_recoverable_completed_steps(jsonb) returns jsonb language sql as $$ select '[]'::jsonb $$;
		create function public.scholarship_documents_complete_for_application(jsonb,jsonb) returns boolean language sql as $$ select false $$;
		create function public.scholarship_resume_step_id(jsonb,jsonb) returns text language sql as $$ select 'document_upload' $$;
		create function public.scholarship_document_versions(jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;
	`)
	const original = await readFile("supabase/migrations/20260906124238_multiple_applications_one_choice.sql", "utf8")
	const workflow = await readFile("supabase/migrations/20260918120000_preserve_tracking_during_document_compliance.sql", "utf8")
	await db.exec(functionSql(original, "scholarship_application_open"))
	await db.exec(functionSql(workflow, "update_scholarship_application_documents"))
	await db.exec(await readFile("supabase/migrations/20261020120000_private_scholarship_requirement_uploads.sql", "utf8"))
	const privileges = await db.query(`select has_function_privilege('anon', 'public.append_scholarship_requirement_files(text,text,text,jsonb)', 'execute') as anon,
		has_function_privilege('authenticated', 'public.append_scholarship_requirement_files(text,text,text,jsonb)', 'execute') as authenticated,
		has_function_privilege('service_role', 'public.append_scholarship_requirement_files(text,text,text,jsonb)', 'execute') as service`)
	assert.deepEqual(privileges.rows[0], { anon: false, authenticated: false, service: true })
	await db.query("insert into public.students(id,data) values ($1,$2)", ["owner", { isValidated: true }])
	const app = { studentId: "owner", status: "Applied", otherRequirements: [{ name: "1x1 Photo", fileType: "PNG", uploadCount: 2 }], otherRequirementUploads: { preserved: { files: [{ id: "historical" }] } } }
	await db.query("insert into public.scholarship_applications(id,data) values ($1,$2)", ["app", app])
	await db.exec("set role service_role")
	const upload = (id, student = "owner", type = "image/png", key = "1x1_photo") => db.query(
		"select public.append_scholarship_requirement_files($1,$2,$3,$4) as result",
		[student, "app", key, [{ id, bucket: "private", path: `students/${student}/other-requirements/app/${id}.png`, type }]],
	)
	await assert.rejects(upload("foreign", "intruder"), /student_account_blocked/)
	await assert.rejects(upload("invalid", "owner", "application/pdf"), /invalid_application_documents/)
	await assert.rejects(upload("unknown", "owner", "image/png", "unknown"), /scholarship_requirement_not_found/)
	await upload("first")
	const { rows } = await upload("second")
	const uploads = rows[0].result.application.otherRequirementUploads
	assert.equal(2, uploads["1x1_photo"].files.length)
	assert.equal("historical", uploads.preserved.files[0].id)
	await assert.rejects(upload("overflow"), /requirement_upload_limit_reached/)
	assert.equal(2, (await db.query('select count(*)::integer as count from public."systemLogs"')).rows[0].count)
	await db.query("update public.scholarship_applications set data = data || '{\"status\":\"Withdrawn\"}'::jsonb where id='app'")
	await assert.rejects(upload("closed"), /application_closed/)
	console.log("PASS: migration executes; grants, owner/type/key/count guards, append preservation, audit and closed-state rollback verified.")
} finally {
	await db.close()
}
