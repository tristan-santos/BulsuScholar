import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { collectOtherRequirementDocuments } from "../src/services/otherRequirementService.js"

globalThis.__documentTest = { reads: [], profileReads: [],
	storage: { from: () => { throw new Error("Direct Storage access is not allowed for protected documents") } },
}
const state = globalThis.__documentTest
let source = await readFile("src/services/supabaseStorageService.js", "utf8")
source = source.replace('import { supabase } from "./supabaseClient"', 'const supabase = { storage: globalThis.__documentTest.storage }')
	.replace('import { trackOperation } from "./operationTracker"', 'const trackOperation = (_type, action) => action()')
	.replace('import { requireBackendApiUrl } from "../config/backendApi"', 'const requireBackendApiUrl = () => "https://api.test"')
	.replace('import { buildPortalRequestHeaders, PortalApiError } from "./portalApi"', 'const buildPortalRequestHeaders = async () => ({Authorization:"Bearer verified"}); class PortalApiError extends Error { constructor(message, options) {super(message); Object.assign(this, options)} }')
	.replace('import { getStudentVerificationDocumentBlob } from "./studentProfileService"', 'const getStudentVerificationDocumentBlob = async (id) => {globalThis.__documentTest.profileReads.push(id); return new Blob(["pdf"],{type:"application/pdf"})}')
	.replaceAll("import.meta.env.", "globalThis.__documentTest.env.")
	.replaceAll("await fetch(", "await globalThis.__documentTest.fetch(")
state.env = {}
state.fetch = async (url, options) => { state.reads.push({ url, options }); return new Response("image", { headers: { "content-type": "image/png" } }) }
const { getStorageObjectBlob } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)

await getStorageObjectBlob({ submissionId: "cor-id", path: "private-cor" })
await getStorageObjectBlob({ url: "/student/profile/documents/rog-id/content", path: "private-rog" })
assert.deepEqual(state.profileReads, ["cor-id", "rog-id"])
const documents = collectOtherRequirementDocuments({ applicationId: "app", otherRequirements: [{ id: "photo", name: "Photo", fileType: "PNG" }], otherRequirementUploads: { photo: { files: [null, { path: "students/student/other-requirements/photo.png", name: "Photo.png" }] } } })
assert.equal(1, documents.length)
assert.equal("/scholarship-applications/app/requirements/photo/files/legacy-1", documents[0].url)
assert.equal("students/student/other-requirements/photo.png", documents[0].path)
await getStorageObjectBlob(documents[0])
assert.equal("https://api.test/scholarship-applications/app/requirements/photo/files/legacy-1", state.reads[0].url)
assert.equal("Bearer verified", state.reads[0].options.headers.Authorization)
state.fetch = async () => new Response(JSON.stringify({ detail: "admin_permission_required" }), { status: 403 })
await assert.rejects(getStorageObjectBlob(documents[0]), (error) => error.status === 403)
console.log("PASS: primary document IDs and URLs use authenticated content, legacy additional files keep indices and metadata, permissions fail closed.")
