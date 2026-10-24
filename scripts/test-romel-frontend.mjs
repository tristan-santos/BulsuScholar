// Run with: node --experimental-vm-modules scripts/test-romel-frontend.mjs
import assert from "node:assert/strict"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import vm from "node:vm"

const source = await readFile("src/services/protectedDownloadService.js", "utf8")
const context = vm.createContext({ crypto, Uint8Array, FormData, Blob, DOMException, AbortController, setTimeout, clearTimeout, URL, Response, fetch: () => { throw new Error("Unexpected external fetch") } })
const module = new vm.SourceTextModule(source, { context })
await module.link(async (specifier) => {
	const values = specifier.includes("backendApi") ? { requireBackendApiUrl: () => "https://local.test" } : { buildPortalRequestHeaders: async () => ({ Authorization: "Bearer synthetic" }) }
	return new vm.SyntheticModule(Object.keys(values), function () { Object.entries(values).forEach(([key, value]) => this.setExport(key, value)) }, { context })
})
await module.evaluate()
const service = module.namespace
const results = []
function pass(test) { results.push({ id: `RM-FE-${results.length + 1}`, test, status: "Pass" }) }

const passwords = new Set(Array.from({ length: 1000 }, () => service.generateDownloadPassword()))
assert.equal(passwords.size, 1000)
assert.ok([...passwords].every((password) => /^[A-Za-z0-9_-]{32}$/.test(password)))
pass("1000 fresh 32-character passwords; cryptographic random source")
assert.ok(source.includes("crypto.getRandomValues"))
assert.ok(!/localStorage|sessionStorage|indexedDB|console\./.test(source))
pass("Download service contains no persistent password store or console logging")

let calls = 0
service.setDownloadPresenter((resolve) => resolve(null))
context.fetch = async () => { calls++; throw new Error("Unexpected request") }
assert.equal(await service.protectedPost("/document/download"), null)
assert.equal(calls, 0)
pass("Cancelled download sends no request")

const password = "A".repeat(32)
service.setDownloadPresenter((resolve) => resolve(password))
context.fetch = async (url, init) => {
	calls++
	assert.ok(!url.includes(password))
	assert.ok(!JSON.stringify(init.headers).includes(password))
	assert.equal(JSON.parse(init.body).downloadProtection.password, password)
	return new Response(new Blob(["encrypted fixture"], { type: "application/pdf" }), { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="protected-document.pdf"' } })
}
const output = await service.protectedPost("/document/download")
assert.equal(output.filename, "protected-document.pdf")
assert.equal(calls, 1)
pass("One request; password only in POST body, not URL or headers")

const form = new FormData()
form.append("files", new Blob(["first"]), "first.pdf")
form.append("files", new Blob(["second"]), "second.pdf")
let attempts = 0
service.setDownloadPresenter((resolve, options) => resolve(options.file === 0 ? "first-secret" : "second-secret"))
const response = await service.fetchWithFilePasswords("https://local.test/upload", { body: form }, { batch: true, fetcher: async (_url, options) => {
	attempts++
	if (attempts < 3) return Response.json({ detail: { code: "file_password_required", fileIndex: attempts - 1 } }, { status: 422 })
	assert.deepEqual(JSON.parse(options.body.get("file_passwords")), { "0": "first-secret", "1": "second-secret" })
	return Response.json({ ok: true })
} })
assert.equal(response.status, 200)
assert.equal(attempts, 3)
assert.equal(form.has("file_passwords"), false)
pass("Mixed-password batch mappings are per-file and cleared after success")

service.setDownloadPresenter((resolve) => resolve(null))
await assert.rejects(service.fetchWithFilePasswords("https://local.test/upload", { body: form }, { fetcher: async () => Response.json({ detail: "file_password_required" }, { status: 422 }) }), { name: "AbortError" })
assert.equal(form.has("file_password"), false)
pass("Cancelled encrypted upload clears temporary password fields")

let failures = 0
await service.fetchWithFilePasswords("https://local.test/upload", { body: form }, { fetcher: async () => { failures++; return Response.json({ detail: "submission_failed" }, { status: 503 }) } })
assert.equal(failures, 1)
pass("Non-password mutation failure is never retried")

const queued = []
service.setDownloadPresenter((resolve) => queued.push(resolve))
const firstPrompt = service.requestDownloadPassword({ upload: true })
const secondPrompt = service.requestDownloadPassword({ upload: true })
assert.equal(queued.length, 1)
queued[0]("first")
assert.equal(await firstPrompt, "first")
await Promise.resolve()
assert.equal(queued.length, 2)
queued[1]("second")
assert.equal(await secondPrompt, "second")
pass("Concurrent encrypted-preview prompts are queued, not overwritten")

let resolvePrompt
service.setDownloadPresenter((resolve) => { resolvePrompt = resolve })
const waiting = service.protectedPost("/same/download")
await assert.rejects(service.protectedPost("/same/download"), /already being prepared/)
resolvePrompt(null)
assert.equal(await waiting, null)
pass("Repeated click on the same pending download cannot issue a duplicate request")

service.setDownloadPresenter((resolve) => resolve(password))
let started
const startedPromise = new Promise((resolve) => { started = resolve })
context.fetch = async (_url, init) => new Promise((_resolve, reject) => {
	init.signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true })
	started()
})
const interrupted = service.protectedPost("/interrupted/download")
await startedPromise
service.abortProtectedDownloads()
await assert.rejects(interrupted, { name: "AbortError" })
pass("Navigation/page-exit cancellation aborts in-flight preparation")

service.setDownloadPresenter((resolve) => { resolvePrompt = resolve })
const cancelledFirst = service.requestDownloadPassword({ upload: true })
const cancelledSecond = service.requestDownloadPassword({ upload: true })
resolvePrompt(null)
assert.equal(await cancelledFirst, null)
assert.equal(await cancelledSecond, null)
pass("Cancelling a queued upload interaction clears all waiting password prompts")

await mkdir("test-results", { recursive: true })
await writeFile("test-results/romel-frontend.json", JSON.stringify({ environment: "Isolated JS module with local fetch stubs", results }, null, 2))
console.log(`PASS: ${results.length} protected-download frontend checks`)
