// Ephemeral PostgreSQL verification only; never loads credentials or connects to Supabase.
import assert from "node:assert/strict"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"

const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const cycle = "2026-2027-1ST", results = []
const extract = (sql, name) => {
	const start = sql.indexOf(`create or replace function public.${name}(`)
	assert.ok(start >= 0, name)
	return sql.slice(start, sql.indexOf("$$;", start) + 3)
}
const load = async (path, names) => {
	const sql = await readFile(path, "utf8")
	for (const name of names) await db.exec(extract(sql, name))
}
const put = (table, id, data, parent) => db.query(`insert into public."${table}"(id,${parent ? "parent_id," : ""}data) values($1,${parent ? "$3," : ""}$2)`, parent ? [id, data, parent] : [id, data])
const md5 = (s) => createHash("md5").update(s).digest("hex")
const key = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
const grantorId = (name) => "roster_grantor_" + md5(key(name))
const programId = (gid, title) => "roster_program_" + md5(`${gid}:${key(title)}`)
const batch = async (id, name, rows, mode = "new") => {
	const gid = mode === "new" ? grantorId(name) : name
	const programs = [...new Set(rows.map((r) => r.title || "Test Award"))].map((title) => ({ id: programId(gid, title), title }))
	await put("roster_import_batches", id, { actorType: "admin", actorId: "admin", status: "ready",
		grantorSelection: { mode, grantorId: gid, name }, pendingPrograms: programs })
	for (const [i,r] of rows.entries()) {
		const title = r.title || "Test Award", sid = r.withoutId ? "" : r.studentId || `${id}-${i}`
		const fullName=r.fullName || "Sample Scholar"
		await put("roster_import_rows", `${id}-${i}`, { academicCycle: cycle, studentId: sid, fullName, grantorId: gid,
			scholarshipId: programId(gid,title), scholarshipTitle: title, blocking: false,
			rosterData: { studentId: sid, fullName, course: "BSIT", yearLevel: "4" } }, id)
	}
	return gid
}
const commit = async (id, type = "admin", actor = "admin") => (await db.query("select public.commit_roster_import_batch($1,$2,$3) as result", [id,type,actor])).rows[0].result
const check = async (name, fn) => { await fn(); results.push({ name, status: "Pass" }) }
try {
	// Share the existing Solis suite's isolated schema/dependency setup, not its test execution.
	const fixture = await readFile("scripts/test-solis-roster-workflow.mjs", "utf8")
	const setup = fixture.slice(fixture.indexOf("\ntry {") + 7, fixture.indexOf('\tawait check("SOL-SYS-01"'))
	await new (Object.getPrototypeOf(async function() {}).constructor)("db","assert","readFile","put","load","cycle",setup)(db,assert,readFile,put,load,cycle)
	await db.exec("reset role")
	await load("supabase/migrations/20261026031448_optional_student_number_roster.sql",["roster_import_identity"])
	await db.exec(await readFile("supabase/migrations/20261026034945_cross_grantor_roster_identity_guard.sql","utf8"))
	await load("supabase/migrations/20261026043502_manual_roster_name_and_course_matching.sql",["roster_import_profile_key"])
	await db.exec(await readFile("supabase/migrations/20261102164522_admin_single_grantor_roster_import.sql","utf8"))
	await db.exec("set role service_role")
	await check("Private registry and RPC grants",async () => {
		const grants = (await db.query(`select has_table_privilege('anon','public.roster_programs','select') as a,
			has_table_privilege('authenticated','public.roster_programs','insert') as b,
			has_function_privilege('anon','public.commit_roster_import_batch(text,text,text)','execute') as c,
			has_function_privilege('authenticated','public.roster_program_recognized(text,text)','execute') as d`)).rows[0]
		assert.deepEqual(Object.values(grants),[false,false,false,false])
	})
	await check("Create one non-login grantor and two private programs",async () => {
		const gid = await batch("new-one","Fixture Foundation",[{}, {title:"Second Award"}])
		const result = await commit("new-one")
		assert.equal(result.counts.created,2)
		const provider = (await db.query("select data from providers where id=$1",[gid])).rows[0].data
		assert.equal(provider.nonLogin,true); assert.equal(provider.authUserId,undefined)
		assert.equal((await db.query("select count(*)::int as n from roster_programs where parent_id=$1",[gid])).rows[0].n,2)
		assert.equal((await db.query("select count(*)::int as n from grantor_portal_announcements where parent_id=$1",[gid])).rows[0].n,0)
		assert.equal((await commit("new-one")).idempotent,true)
	})
	await check("New grantor supports real official assignment",async () => {
		await put("students","assigned-student",{fullName:"Sample Scholar",status:"Active"})
		await batch("award","Assignment Foundation",[{studentId:"assigned-student"}])
		assert.equal((await commit("award")).counts.assigned,1)
		const state=(await db.query("select data from student_scholarship_state where student_id='assigned-student'")).rows[0].data
		assert.equal(state.scholarshipCommitment.grantorId,grantorId("Assignment Foundation"))
	})
	await check("No-ID roster remains unlinked",async () => {
		await batch("unlinked","Unlinked Foundation",[{withoutId:true,fullName:"Unlinked Scholar"}])
		const result=await commit("unlinked")
		assert.equal(result.counts.unlinked,1); assert.equal(result.counts.assigned,0)
	})
	await check("Existing grantor client contract is unchanged",async () => {
		await put("roster_import_batches","legacy",{actorType:"grantor",actorId:"g1",status:"ready"})
		await put("roster_import_rows","legacy-1",{academicCycle:cycle,studentId:"legacy-future",fullName:"Legacy Scholar",grantorId:"g1",scholarshipId:"program1",scholarshipTitle:"Legacy Award",blocking:false,rosterData:{}},"legacy")
		assert.equal((await commit("legacy","grantor","g1")).counts.created,1)
	})
	await check("Existing non-login grantor can receive a later program",async () => {
		const gid = grantorId("Fixture Foundation")
		await batch("more",gid,[{title:"Third Award"}],"existing")
		assert.equal((await commit("more")).counts.created,1)
	})
	await check("Stale concurrent name creation cannot duplicate provider",async () => {
		await batch("race-a","Concurrent Foundation",[{}]); await batch("race-b","Concurrent Foundation",[{}])
		await commit("race-a")
		await assert.rejects(commit("race-b"),/grantor_name_exists_select_existing/)
	})
	await check("Partial roster failure rolls back provider, programs and preceding rows",async () => {
		await put("grantor_portal_scholars","conflicting",{studentId:"already-awarded",fullName:"Sample Scholar",scholarshipId:"program2",academicCycle:cycle,status:"Active"},"g2")
		const gid = await batch("rollback","Rollback Foundation",[{studentId:"fresh-first"},{studentId:"already-awarded"}])
		await assert.rejects(commit("rollback"),/scholarship_already_committed/)
		for(const [table,column] of [["providers","id"],["roster_programs","parent_id"],["grantor_portal_scholars","parent_id"]]) {
			assert.equal((await db.query(`select count(*)::int as n from ${table} where ${column}=$1`,[gid])).rows[0].n,0)
		}
		assert.equal((await db.query("select count(*)::int as n from roster_import_audit_events where data->>'batchId'='rollback'")).rows[0].n,0)
	})
	await check("Archived grantor after preview is blocked",async () => {
		const gid = grantorId("Fixture Foundation")
		await batch("inactive",gid,[{title:"Inactive Award"}],"existing")
		await db.query("update providers set data=data || '{\"archived\":true}'::jsonb where id=$1",[gid])
		await assert.rejects(commit("inactive"),/grantor_archived/)
	})
	await check("Wrong actor and changed cycle do not create a grantor",async () => {
		const gid = await batch("stale","Stale Foundation",[{}])
		await assert.rejects(commit("stale","grantor","admin"),/owner_mismatch/)
		await db.query("update roster_import_rows set data=data || '{\"academicCycle\":\"2026-2027-2ND\"}'::jsonb where parent_id='stale'")
		await assert.rejects(commit("stale"),/academic_cycle_changed/)
		assert.equal((await db.query("select count(*)::int as n from providers where id=$1",[gid])).rows[0].n,0)
	})
	await mkdir("test-results",{recursive:true})
	await writeFile("test-results/admin-single-grantor-sql.json",JSON.stringify({environment:"Ephemeral PGlite; no live database access",results},null,2))
	console.log(JSON.stringify({passed:results.length,results}))
} catch (error) {
	console.error(JSON.stringify({message:error.message,code:error.code,detail:error.detail,where:error.where}))
	process.exitCode=1
} finally { await db.close() }
