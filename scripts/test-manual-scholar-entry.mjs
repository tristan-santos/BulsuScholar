import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import vm from "node:vm"
import { getManualScholarIssues } from "../src/utils/rosterImportPreview.js"
import { normalizeContactNumber } from "../src/utils/contactNumber.js"

// Exercise the actual manual submit handler with workflow calls intercepted.
const source = await readFile("src/pages/ProviderDashboard.jsx", "utf8")
const payloadSource = source.slice(source.indexOf("function scholarPayload("), source.indexOf("function scholarToForm("))
const start = source.indexOf("const handleCreateScholar = ") + "const handleCreateScholar = ".length
const handlerSource = source.slice(start, source.indexOf("\n\tconst handleSaveScholar", start)).trim()
const form = Object.fromEntries(["studentId", "fname", "mname", "lname", "email", "cpNumber", "street", "city", "province", "barangay", "postalCode", "course", "scholarshipTitle", "status", "notes"].map((key) => [key, ""]))
Object.assign(form, { fname: "Dan Nicole", mname: "S.", lname: "Besinal", course: "Bachelor in Industrial Technology", yearLevel: "4", scholarshipTitle: "Future Leaders" })

function scenario(preview) {
	const calls = { previews: [], commits: [], warnings: [], closed: 0 }
	const context = vm.createContext({
		console, grantorId: "grantor_johnvher", grantorName: "Johnvher", grantorProviderType: "Private",
		busy: "", importData: null, createForm: { ...form }, uploadFile: null, serverRosterPreview: null,
		getManualScholarIssues, normalizeContactNumber,
		setBusy: () => {},
		setServerRosterPreview: (value) => { context.serverRosterPreview = value },
		previewRosterImportWorkflow: async (payload) => { calls.previews.push(payload); return preview },
		commitRosterImportWorkflow: async (payload) => { calls.commits.push(payload); return { ok: true, counts: { created: 1 } } },
		closeCreateModal: () => { calls.closed++ },
		getGrantorWorkflowErrorMessage: (error) => error.message,
		toast: { warning: (message) => calls.warnings.push(message), error: (message) => { throw new Error(message) }, info: () => {}, success: () => {} },
	})
	vm.runInContext(payloadSource, context)
	const submit = vm.runInContext(`(${handlerSource})`, context)
	return { calls, submit, context }
}

const duplicate = scenario({ status: "blocked", rows: [{ disposition: "conflicting_active_roster", reason: "Duplicate prevented: already under San Martin." }] })
await duplicate.submit()
assert.equal(duplicate.calls.previews.length, 1)
assert.equal(duplicate.calls.previews[0].rows[0].studentId, "")
assert.equal(duplicate.calls.previews[0].rows[0].fullName, "Dan Nicole S. Besinal")
assert.equal(duplicate.calls.previews[0].sourceFileName, "Manual grantor entry")
assert.equal(duplicate.calls.commits.length, 0)
assert.match(duplicate.calls.warnings[0], /San Martin/)

const sameList = scenario({ status: "ready", batchId: "same-list", rows: [{ disposition: "already_imported" }] })
await sameList.submit()
assert.equal(sameList.calls.commits.length, 0)
assert.match(sameList.calls.warnings[0], /already exists/)

const fresh = scenario({ status: "ready", batchId: "fresh", rows: [{ disposition: "ready_unlinked" }] })
await fresh.submit()
assert.equal(fresh.calls.commits.length, 0)
await fresh.submit()
assert.equal(fresh.calls.commits.length, 1)
assert.equal(fresh.calls.commits[0].batchId, "fresh")
assert.equal(fresh.calls.closed, 1)

console.log("Manual entry passed: optional student ID/contact, shared preview, cross-grantor block, same-list duplicate block, verified new-record commit.")
