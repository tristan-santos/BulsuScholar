// Isolated browser data; every external request is intercepted before app imports.
window.__adminRequirementsFixtureReady = (async () => {
	const originalFetch = window.fetch.bind(window)
	const file = (kind) => ({ url: `/student/profile/documents/fixture-${kind}/content`, path: `students/fixture-student/verified-documents/${kind}`, name: kind === "identity" ? "ID.png" : kind.toUpperCase() })
	const application = { id: "fixture-app", applicationId: "fixture-app", studentId: "fixture-student", applicationNumber: "APP-001", grantorId: "fixture-grantor", name: "Fixture Scholarship", scholarshipName: "Fixture Scholarship", status: "Applied", lifecycleVersion: 2,
		otherRequirements: [{ id: "photo", name: "1x1 Photo", fileType: "PNG" }, { id: "essay", name: "Personal Essay", fileType: "PDF" }],
		otherRequirementUploads: { photo: { files: [{ name: "Old Photo.png", path: "students/fixture-student/other-requirements/old/photo.png", type: "image/png" }] }, essay: { files: [{ id: "essay-file", name: "Essay.pdf", url: "/scholarship-applications/fixture-app/requirements/essay/files/essay-file", type: "application/pdf" }] } } }
	const student = { id: "fixture-student", fname: "Sample", lname: "Student", year: "2", course: "Information Technology", email: "sample@example.test", scholarships: [application], corFile: file("cor"), rogFile: file("rog"), schoolIdFile: file("identity"), scholarshipApplicationFile: file("profile") }
	const tables = {
		admins: [{ id: "fixture-admin", role: "full_admin", fname: "Fixture", lname: "Admin", permissions: ["students", "requirements", "grantors", "scholarships", "announcements", "reports"] }],
		students: [student], scholarship_applications: [application],
		soe_requests: [{ id: "fixture-request", studentId: student.id, fullName: "Sample Student", applicationId: application.id, applicationNumber: "APP-001", requestNumber: "REQ-001", scholarshipName: "Fixture Scholarship", status: "Pending", requestDate: new Date().toISOString(), createdAt: new Date().toISOString(), materials: { soe: { requested: true, status: "pending" }, application_form: { requested: true, status: "pending" } } }],
	}
	const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })
	window.__adminDocumentRequests = []
	window.__failAdminDocument = false
	window.fetch = async (input, options = {}) => {
		const url = new URL(typeof input === "string" ? input : input.url, location.href)
		if (url.origin === location.origin) return originalFetch(input, options)
		window.__adminDocumentRequests.push({ path: url.pathname, method: options.method || "GET" })
		if (url.pathname === "/portal/data/query") {
			const payload = JSON.parse(options.body || "{}")
			let rows = (tables[payload.table] || []).map((data) => ({ id: data.id, data }))
			if (payload.id) rows = rows.filter((row) => row.id === payload.id)
			return json({ ok: true, rows })
		}
		if (url.pathname.startsWith("/student/profile/documents/") || url.pathname.startsWith("/scholarship-applications/")) {
			if (window.__failAdminDocument) { window.__failAdminDocument = false; return json({ detail: "document_file_not_found" }, 404) }
			return originalFetch(url.pathname.includes("identity") || url.pathname.includes("photo") ? "/src/assets/logo.png" : "/docs/ThesisPaper/AnswerToTheQuestion.pdf")
		}
		return json({ ok: true, actorId: "fixture-admin", actorType: "admin", portal: {}, branding: {}, notifications: [], submissions: [] })
	}
	const { setPortalIdentity } = await import("/src/services/portalSessionStorage.js")
	setPortalIdentity("fixture-admin", "admin")
	history.pushState({}, "", "/admin/requirements")
})()
