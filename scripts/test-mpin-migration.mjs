import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const results = []
const check = (test) => results.push({ test, status: "Pass" })
try {
	await db.exec("create role anon; create role authenticated; create role service_role bypassrls")
	await db.exec("create function public.protect_download_audit_history() returns trigger language plpgsql as $$ begin raise exception 'download_audit_is_append_only'; end $$")
	await db.exec(await readFile("supabase/migrations/20261025040250_optional_mpin_role_download_policy.sql", "utf8"))
	for (const role of ["anon", "authenticated"]) {
		const { rows } = await db.query("select has_table_privilege($1, 'public.mpin_security', 'select') as settings, has_table_privilege($1, 'public.mpin_authorizations', 'select') as tokens, has_table_privilege($1, 'public.mpin_security_events', 'select') as events, has_function_privilege($1,'public.mpin_transaction(text,text,jsonb)','execute') as rpc", [role])
		assert.deepEqual(rows[0], { settings: false, tokens: false, events: false, rpc: false })
		check(`${role}: settings, tokens, events and RPC inaccessible`)
	}
	await db.exec("set role service_role")
	const rpc = async (operation, values = {}, principal = "student:fixture") => (await db.query("select public.mpin_transaction($1,$2,$3) as result", [principal, operation, values])).rows[0].result
	assert.deepEqual(await rpc("read"), { version: 0, enabled: false }); check("New account defaults OFF")
	assert.equal((await rpc("commit", { version: 0, state: { enabled: true, generation: 1 }, event: "enable" })).committed, true)
	assert.equal((await rpc("commit", { version: 0, state: { enabled: false }, event: "disable" })).committed, false); check("Stale settings updates cannot overwrite current state")
	const issue = async (token, version, generation = 1) => rpc("commit", { version, state: { enabled: true, generation }, event: "action_verified", ticket: { token, session: "session", path: "/download", digest: "payload", generation } })
	await issue("one", 1)
	const consume = (token, extras = {}, principal) => rpc("consume", { token, session: "session", path: "/download", digest: "payload", ...extras }, principal)
	for (const change of [{ session: "other" }, { path: "/other" }, { digest: "other" }]) assert.equal((await consume("one", change)).consumed, false)
	assert.equal((await consume("one", {}, "student:other")).consumed, false); check("Proof bound to actor, session, route and operation")
	assert.equal((await consume("one")).consumed, true)
	assert.equal((await consume("one")).consumed, false); check("Atomic one-use consumption prevents replay")
	await issue("expired", 2)
	await db.exec("reset role; update public.mpin_authorizations set expires_at = now()-interval '1 second'; set role service_role")
	assert.equal((await consume("expired")).consumed, false); check("Expired authorization denied")
	await issue("old-generation", 3)
	await rpc("commit", { version: 4, state: { enabled: true, generation: 2 }, event: "reset" })
	assert.equal((await consume("old-generation")).consumed, false); check("Reset invalidates outstanding proofs")
	await assert.rejects(db.exec("delete from public.mpin_security_events"), /permission denied/); check("Service cannot delete security audit")
	await db.exec("reset role")
	await assert.rejects(db.exec("update public.mpin_security_events set event='changed'"), /download_audit_is_append_only/); check("Audit append-only even for owner updates")
	const rls = await db.query("select count(*)::int as n from pg_class where relname in ('mpin_security','mpin_authorizations','mpin_security_events') and relrowsecurity")
	assert.equal(rls.rows[0].n, 3); check("RLS enabled for all three new tables")
	await writeFile("test-results/mpin-sql.json", JSON.stringify({ environment: "Isolated PGlite, not live Supabase", results }, null, 2))
	console.log(`PASS: ${results.length} MPIN SQL checks`)
} finally { await db.close() }
