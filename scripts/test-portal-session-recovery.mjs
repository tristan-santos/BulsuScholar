import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = (await readFile("src/services/portalApi.js", "utf8"))
	.replace('import { supabase } from "./supabaseClient"', 'const supabase = globalThis.__portalTest.authClient')
	.replace('import { trackedFetch } from "./operationTracker"', 'const trackedFetch = (...args) => globalThis.__portalTest.fetch(...args)')
	.replace('import { getPortalIdentity } from "./portalSessionStorage"', 'const getPortalIdentity = () => globalThis.__portalTest.identity')
const state = { identity: { userId: "admin", userType: "admin" }, refreshes: 0, sends: 0, token: "old" }
globalThis.__portalTest = state
state.authClient = { auth: {
	getSession: async () => ({ data: { session: { access_token: state.token, refresh_token: "refresh" } } }),
	refreshSession: async () => { state.refreshes++; state.token = "new"; return { data: { session: { access_token: "new" } } } },
} }
const { postPortalJson } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
const reset = () => { state.refreshes = 0; state.sends = 0; state.token = "old" }

state.fetch = async (_url, options) => { state.sends++; return options.headers.Authorization === "Bearer new" ? json({ ok: true, rows: [] }) : json({ detail: "invalid_authentication_session" }, 401) }
await postPortalJson("https://backend.test", "/portal/data/query", {})
assert.equal(2, state.sends)
assert.equal(1, state.refreshes)

for (const detail of ["admin_session_revoked", "portal_session_revoked", "email_verification_required", "authentication_required"]) {
	reset()
	state.fetch = async () => { state.sends++; return json({ detail }, 401) }
	await assert.rejects(postPortalJson("https://backend.test", "/portal/data/query", {}), (error) => error.reason === detail)
	assert.equal(1, state.sends)
	assert.equal(0, state.refreshes)
}

reset()
state.fetch = async () => { state.sends++; return json({ detail: "invalid_authentication_session" }, 401) }
await assert.rejects(postPortalJson("https://backend.test", "/workflows/material-request", {}))
assert.equal(1, state.sends)
assert.equal(0, state.refreshes)

reset()
await assert.rejects(postPortalJson("https://backend.test", "/portal/data/query", {}))
assert.equal(2, state.sends, "Read retry must stop after one failure")

reset()
let release
state.authClient.auth.refreshSession = async () => { state.refreshes++; await new Promise((resolve) => { release = resolve }); state.token = "new"; return { data: { session: {} } } }
state.fetch = async (_url, options) => { state.sends++; return options.headers.Authorization === "Bearer new" ? json({ ok: true }) : json({ detail: "invalid_authentication_session" }, 401) }
const reads = [postPortalJson("https://backend.test", "/portal/data/query", {}), postPortalJson("https://backend.test", "/portal/data/query", {})]
await new Promise((resolve) => setTimeout(resolve, 50))
assert.equal(1, state.refreshes, "Concurrent reads must share token refresh")
release()
await Promise.all(reads)
assert.equal(4, state.sends)
console.log("PASS: expired read token recovery, single retry, concurrent refresh, no mutation replay, and no OTP/revocation bypass.")
