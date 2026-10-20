// No real student data or external writes: install mocks before application imports.
window.__requirementFixtureReady = (async () => {
	const originalFetch = window.fetch.bind(window)
	const application = { id: "fixture-app", applicationId: "fixture-app", applicationNumber: "TEST-001", studentId: "fixture-student", grantorId: "fixture-grantor", name: "Fixture Scholarship", provider: "Fixture Grantor", providerType: "private", status: "Applied", semesterTag: "2026-2027-1ST", lifecycleVersion: 2,
		otherRequirements: [{ id: "photo", name: "1x1 Photo", fileType: "PNG", uploadCount: 1 }, { id: "essay", name: "Personal Essay", fileType: "PDF", uploadCount: 1 }], otherRequirementUploads: {}, tracking: { completedStepIds: ["application", "grantor_approval"] } }
	const student = { id: "fixture-student", studentnumber: "fixture-student", fname: "Sample", lname: "Student", isValidated: true, isPending: false, year: "2", course: "Information Technology", email: "sample@example.test", scholarships: [application] }
	const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })
	window.__requirementRequests = []
	window.__failRequirementUpload = false
	window.__failRequirementPreview = false
	window.fetch = async (input, options = {}) => {
		const url = new URL(typeof input === "string" ? input : input.url, location.href)
		if (url.origin === location.origin) return originalFetch(input, options)
		window.__requirementRequests.push({ path: url.pathname, method: options.method || "GET" })
		if (url.pathname === "/portal/data/query") {
			const { table } = JSON.parse(options.body || "{}")
			return json({ ok: true, rows: table === "students" ? [{ id: student.id, data: student }] : table === "scholarship_applications" ? [{ id: application.id, data: application }] : [] })
		}
		if (url.pathname.startsWith("/student/scholarships/") && options.method === "POST") {
			if (window.__failRequirementUpload) { window.__failRequirementUpload = false; return json({ detail: "requirement_upload_limit_reached" }, 409) }
			const key = url.pathname.split("/")[5]
			const files = options.body.getAll("files").map((file, index) => ({ id: `file-${key}-${index}`, name: file.name, type: file.type, url: `/scholarship-applications/fixture-app/requirements/${key}/files/file-${key}-${index}` }))
			application.otherRequirementUploads[key] = { files }
			return json({ ok: true, application })
		}
		if (url.pathname.startsWith("/scholarship-applications/")) {
			if (window.__failRequirementPreview) { window.__failRequirementPreview = false; return json({ detail: "requirement_file_not_found" }, 404) }
			return originalFetch(url.pathname.includes("essay") ? "/docs/ThesisPaper/AnswerToTheQuestion.pdf" : "/src/assets/logo.png")
		}
		if (url.pathname.endsWith("/preflight")) return json({ ok: true, eligible: false, blockers: [] })
		return json({ ok: true, actorId: student.id, actorType: "student", portal: {}, branding: {}, entries: [], offers: [] })
	}
	const { setPortalIdentity } = await import("/src/services/portalSessionStorage.js")
	setPortalIdentity(student.id, "student")
	history.pushState({}, "", "/student-dashboard/scholarships")
})()
