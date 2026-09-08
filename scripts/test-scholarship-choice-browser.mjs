import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import { mkdir } from "node:fs/promises"

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
	? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright")
const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:5174"
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
await mkdir("test-results", { recursive: true })
const now = new Date().toISOString()
const year = new Date().getFullYear()
const semesterTag = new Date().getMonth() >= 6 ? `${year}-${year + 1}-1ST` : `${year - 1}-${year}-2ND`
const entries = [1, 2].map((n) => ({
	id: `test-number-${n}`, applicationId: `test-application-${n}`, applicationNumber: `test-number-${n}`,
	name: `Test Scholarship ${n}`, grantorId: `test-grantor-${n}`, grantorName: `Test Grantor ${n}`,
	provider: `Test Scholarship ${n}`, providerType: "other", status: "Applied", isLocked: false,
	lifecycleVersion: 2, semesterTag, appliedAt: now, appliedViaAnnouncement: true,
	applicationFormFile: { name: `profile-${n}.pdf`, url: `https://example.invalid/profile-${n}.pdf` },
	tracking: { completedStepIds: ["account", "announcement_apply", "scholarship_apply", "document_uploading", "application_form", "document_review"], history: [] },
}))
const originalStudent = { id: "test-student", studentnumber: "test-student", fname: "Test", lname: "Student",
	status: "Active", isValidated: true, gwa: "1.75", scholarshipLifecycleVersion: 2,
	corFile: { url: "https://example.invalid/cor.pdf", semesterTag },
	cogFile: { url: "https://example.invalid/rog.pdf", semesterTag },
	schoolIdFile: { url: "https://example.invalid/id.pdf", semesterTag }, scholarships: entries }
let student = structuredClone(originalStudent)
const mutations = []
let materialRequests = []
await context.addInitScript(() => {
	sessionStorage.setItem("bulsuscholar_userId", "test-student")
	sessionStorage.setItem("bulsuscholar_userType", "student")
})
await context.route("**/*", async (route) => {
	const request = route.request()
	const url = new URL(request.url())
	if (url.origin === new URL(baseUrl).origin) return route.continue()
	const respond = (data) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) })
	if (url.pathname.includes("/rest/v1/")) {
		const table = url.pathname.split("/").at(-1)
		if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
			mutations.push({ path: url.pathname, body: request.postDataJSON() })
			return respond([])
		}
		let rows = []
		if (table === "students") rows = [{ id: student.id, data: student }]
		if (table === "scholarship_applications") rows = entries.map((entry) => ({ id: entry.applicationId,
			data: { ...entry, id: entry.applicationId, studentId: student.id, fullName: "Test Student" } }))
		if (["providers", "grantor_portals"].includes(table)) rows = entries.map((entry) => ({ id: entry.grantorId,
			data: { id: entry.grantorId, name: entry.grantorName, grantorName: entry.grantorName, status: "Active" } }))
		if (table === "admin_settings") rows = [{ id: "profile", data: {} }]
		if (table === "soe_requests") rows = materialRequests.map((data) => ({ id: data.id, data }))
		const filter = url.searchParams.get("id")
		if (filter?.startsWith("eq.")) rows = rows.filter((row) => row.id === filter.slice(3))
		return respond(rows)
	}
	if (url.pathname === "/workflows/scholarship/choose") {
		const payload = request.postDataJSON()
		mutations.push({ path: url.pathname, body: payload })
		assert.equal(payload.confirmed, true)
		const selected = entries.find((entry) => entry.applicationId === payload.applicationId)
		assert.ok(selected)
		student = { ...student, scholarships: [{ ...selected, isLocked: true, status: "Finalized" }],
			scholarshipCommitment: { applicationId: selected.applicationId } }
		const materialRequest = { id: "test-request", applicationNumber: selected.applicationNumber,
			scholarshipId: selected.id, studentId: student.id, status: "Pending", semesterTag,
			materials: { soe: { requested: true, status: "pending", requestedAt: now } } }
		materialRequests = [materialRequest]
		return respond({ ok: true, student, materialRequest })
	}
	if (url.pathname === "/workflows/scholarship/withdraw") {
		const payload = request.postDataJSON()
		mutations.push({ path: url.pathname, body: payload })
		student = { ...student, scholarships: student.scholarships.filter((entry) => entry.applicationId !== payload.applicationId) }
		return respond({ ok: true, student })
	}
	if (url.pathname.startsWith("/workflows/") || url.pathname.startsWith("/scholarships/")) {
		return respond({ ok: true, recommendations: [], results: [] })
	}
	return route.abort()
})
try {
	const page = await context.newPage()
	const errors = []
	page.on("pageerror", (error) => errors.push(error.message))
	for (const width of [1440, 390, 320]) {
		student = structuredClone(originalStudent)
		materialRequests = []
		await page.setViewportSize({ width, height: 900 })
		await page.goto(`${baseUrl}/student-dashboard/scholarships`)
		await page.locator(".student-kwsp-tracker-shell").nth(1).waitFor()
		assert.equal(await page.locator(".student-kwsp-tracker-shell").count(), 2)
		assert.equal(await page.locator(".scholarship-application-form-upload input").count(), 2)
		const before = mutations.length
		await page.locator(".student-scholarship-request-soe").first().click()
		const modal = page.getByRole("dialog", { name: "Scholarship selection confirmation" })
		await modal.waitFor()
		assert.ok((await modal.innerText()).includes("Test Scholarship 1"))
		await modal.getByRole("button", { name: "Cancel", exact: true }).click()
		assert.equal(mutations.length, before)
		await page.locator(".student-scholarship-request-soe").first().click()
		await modal.locator("h3").click()
		assert.equal(await modal.isVisible(), true)
		await page.locator(".student-soe-modal-backdrop").click({ position: { x: 2, y: 2 } })
		assert.equal(await modal.count(), 0)
		assert.equal(mutations.length, before)
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
		assert.equal(overflow, false, `page overflows at ${width}px`)
		await page.evaluate(() => window.scrollTo(0, 0))
		await page.screenshot({ path: `test-results/scholarship-choice-${width}.png`, fullPage: true })
	}
	await page.locator(".student-scholarship-request-soe").first().click()
	await page.getByRole("button", { name: "Confirm Choice" }).click()
	await page.waitForFunction(() => document.querySelectorAll(".student-kwsp-tracker-shell").length === 1)
	assert.equal(await page.getByRole("button", { name: "Withdraw Application", exact: true }).count(), 0)
	assert.equal(mutations.filter((item) => item.path.endsWith("/choose")).length, 1)
	student = structuredClone(originalStudent)
	materialRequests = []
	await page.reload()
	await page.locator(".student-kwsp-tracker-shell").nth(1).waitFor()
	await page.getByRole("button", { name: "Withdraw Application", exact: true }).first().click()
	await page.getByRole("dialog", { name: "Withdraw application" }).getByRole("button", { name: "Withdraw", exact: true }).click()
	await page.waitForFunction(() => document.querySelectorAll(".student-kwsp-tracker-shell").length === 1)
	assert.equal(mutations.filter((item) => item.path.endsWith("/withdraw")).length, 1)
	await page.locator(".student-scholarship-request-soe").first().click()
	await page.getByRole("dialog", { name: "Scholarship selection confirmation" }).waitFor()
	await page.getByRole("button", { name: "Cancel", exact: true }).click()
	assert.deepEqual(errors, [])
	console.log("PASS: stacked trackers, independent form inputs, cancel/outside/inside clicks, confirmed choice, withdrawal, 1440/390/320px, no runtime errors")
} finally {
	await browser.close()
}
