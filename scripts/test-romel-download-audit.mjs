import assert from "node:assert/strict"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const results = []
try {
	await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table public.signed_soe_submissions(id text primary key)")
	await db.exec(`create function public.finalize_signed_soe_submission(text,text,text,text,text,text,text,text,bigint) returns jsonb language plpgsql as $$begin insert into public.signed_soe_submissions values ($1,null); return jsonb_build_object('submissionId',$1); end; $$; grant select,insert,update on public.signed_soe_submissions to service_role`)
	await db.exec(await readFile("supabase/migrations/20261023140524_protected_download_audit.sql", "utf8"))
	for (const role of ["anon", "authenticated", "service_role"]) {
		const { rows } = await db.query(`select has_table_privilege($1,'public.protected_download_events','select') as read, has_table_privilege($1,'public.protected_download_events','insert') as append, has_table_privilege($1,'public.protected_download_events','update') as update, has_table_privilege($1,'public.protected_download_events','delete') as delete, has_table_privilege($1,'public.protected_download_events','truncate') as truncate`, [role])
		assert.deepEqual(rows[0], { read: role === "service_role", append: role === "service_role", update: false, delete: false, truncate: false })
		results.push({ id: `RM-SQL-${results.length + 1}`, test: `${role} grants`, status: "Pass" })
	}
	const privilege = await db.query("select has_function_privilege('anon','public.protect_download_audit_history()','execute') as anon, has_function_privilege('authenticated','public.protect_download_audit_history()','execute') as authenticated")
	assert.deepEqual(privilege.rows[0], { anon: false, authenticated: false })
	results.push({ id: "RM-SQL-4", test: "Privileged trigger function inaccessible to client roles", status: "Pass" })
	await db.exec("set role service_role")
	await db.exec("insert into public.protected_download_events(id,actor_id,actor_type,resource,protection,format,outcome) values ('00000000-0000-0000-0000-000000000001','test','admin','submission:1','pdf-aes-256','application/pdf','prepared')")
	assert.equal((await db.query("select count(*)::int as n from public.protected_download_events")).rows[0].n, 1)
	await assert.rejects(db.exec("delete from public.protected_download_events"), /permission denied/)
	await assert.rejects(db.exec("update public.protected_download_events set outcome='failed'"), /permission denied/)
	results.push({ id: "RM-SQL-5", test: "Service append/read permitted; updates and deletion denied", status: "Pass" })
	await db.exec("reset role")
	await assert.rejects(db.exec("delete from public.protected_download_events"), /download_audit_is_append_only/)
	results.push({ id: "RM-SQL-6", test: "Immutable trigger blocks owner row deletion", status: "Pass" })
	await db.exec("set role anon")
	await assert.rejects(db.exec("select * from public.protected_download_events"), /permission denied/)
	results.push({ id: "RM-SQL-7", test: "Anonymous actual SELECT denied", status: "Pass" })
	await db.exec("reset role")
	const grants = await db.query("select has_function_privilege('anon','public.finalize_protected_signed_soe_submission(text,text,text,text,text,text,text,text,bigint,jsonb)','execute') as anon, has_function_privilege('authenticated','public.finalize_protected_signed_soe_submission(text,text,text,text,text,text,text,text,bigint,jsonb)','execute') as authenticated, has_function_privilege('service_role','public.finalize_protected_signed_soe_submission(text,text,text,text,text,text,text,text,bigint,jsonb)','execute') as service")
	assert.deepEqual(grants.rows[0], { anon: false, authenticated: false, service: true })
	results.push({ id: "RM-SQL-8", test: "Atomic signed-SOE wrapper restricted to service role", status: "Pass" })
	await db.exec("set role service_role")
	const parameters = ["submission", "student", "application", "cycle", "private", "original.pdf", "soe.pdf", "application/pdf", 100, { bucket: "private", path: "original.pdf.preview.pdf" }]
	await db.query("select public.finalize_protected_signed_soe_submission($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", parameters)
	assert.deepEqual((await db.query("select processing_file from public.signed_soe_submissions where id='submission'")).rows[0].processing_file, parameters[9])
	results.push({ id: "RM-SQL-9", test: "Signed-SOE original finalization plus derivative linked in one transaction", status: "Pass" })
	parameters[0] = "invalid"
	parameters[9] = { bucket: "private", path: "another-student.pdf" }
	await assert.rejects(db.query("select public.finalize_protected_signed_soe_submission($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", parameters), /invalid_processing_reference/)
	assert.equal((await db.query("select count(*)::int as n from public.signed_soe_submissions where id='invalid'")).rows[0].n, 0)
	results.push({ id: "RM-SQL-10", test: "Invalid processing path rejects before original finalization", status: "Pass" })
	await mkdir("test-results", { recursive: true })
	await writeFile("test-results/romel-sql.json", JSON.stringify({ environment: "Local PGlite, not live Supabase", results }, null, 2))
	console.log(`PASS: ${results.length} migration/grant/immutability checks`)
} finally { await db.close() }
