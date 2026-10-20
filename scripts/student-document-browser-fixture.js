// Isolated local data; all external requests are mocked before application imports.
window.__studentDocumentFixtureReady = (async () => {
	const originalFetch = window.fetch.bind(window)
	const student = { id: "student-doc-fixture", studentnumber: "student-doc-fixture", fname: "Sample", lname: "Student", year: "2", section: "A", course: "Information Technology", email: "sample@example.test", permanentAddress: {} }
	const types = ["cor", "rog", "identity", "profile"]
	const submissions = types.map((documentType) => ({ id: `fixture-${documentType}`, documentType, academicCycle: "2026-2027-1ST", status: "pending", name: documentType === "identity" ? "Student-ID.png" : `${documentType}.pdf`, documentKind: documentType === "identity" ? "student_id" : documentType }))
	const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })
	window.__studentDocumentRequests = []
	window.__failStudentPreview = false
	window.fetch = async (input, options = {}) => {
		const url = new URL(typeof input === "string" ? input : input.url, location.href)
		if (url.origin === location.origin) return originalFetch(input, options)
		window.__studentDocumentRequests.push({ path: url.pathname, method: options.method || "GET" })
		if (url.pathname === "/student/profile/workspace") return json({ ok: true, student, draft: student, academicCycle: "2026-2027-1ST", requirements: { rogRequired: true }, verification: Object.fromEntries(submissions.map((item) => [item.documentType, { status: item.status }])), submissions })
		if (url.pathname.startsWith("/student/profile/documents/") && options.method === "POST") {
			const kind = url.pathname.split("/").pop()
			const submission = submissions.find((item) => item.documentType === kind)
			submission.status = "approved"
			return json({ ok: true, submission })
		}
		if (url.pathname.startsWith("/student/profile/documents/") && url.pathname.endsWith("/content")) {
			if (window.__failStudentPreview) { window.__failStudentPreview = false; return json({ detail: "document_storage_unavailable" }, 503) }
			return originalFetch(url.pathname.includes("identity") ? "/src/assets/logo.png" : "/docs/ThesisPaper/AnswerToTheQuestion.pdf")
		}
		if (url.pathname === "/portal/data/query") return json({ ok: true, rows: [] })
		return json({ ok: true, portal: {}, branding: {}, notifications: [], actorId: student.id, actorType: "student" })
	}
	const { setPortalIdentity } = await import("/src/services/portalSessionStorage.js")
	setPortalIdentity(student.id, "student")
	history.pushState({}, "", "/student-dashboard/profile")
})()
