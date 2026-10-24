// Local synthetic browser fixture. Never forwards an external API mutation.
window.__solisFixtureReady = (async () => {
	const originalFetch = window.fetch.bind(window)
	const params = new URLSearchParams(location.search)
	const permissions = ["students", "grantors", "scholarships", "requirements", "announcements", "reports"]
	const grantor = { id: "fixture-grantor", providerId: "fixture-grantor", providerName: "Sample External Provider", fname: "Sample", lname: "Provider", email: "provider@example.test", status: "Active", grantorClassification: "government", grantorType: "external", organization: "Sample municipal scholarship office" }
	const admin = { id: "fixture-admin", role: params.get("reviewer") ? "student_reviewer" : "full_admin", permissions, fname: "Fixture", lname: "Admin" }
	const tables = { admins: [admin], providers: [grantor], grantor_portals: [grantor] }
	const conflicts = [
		{ id: "conflict1", studentId: "SYN-001", fullName: "Ana Santos", academicCycle: "2026-2027-1ST", protectedAward: true, reason: "This student already holds a completed award for this semester. Keep the existing award.", candidate: { scholarshipTitle: "Municipal Scholarship" }, activeRosterOptions: [] },
		{ id: "conflict2", studentId: "SYN-002", fullName: "Sample Student With A Long Name For Layout Validation", academicCycle: "2026-2027-1ST", protectedAward: false, reason: "The roster name differs from the account name. Verify identity and award records.", candidate: { scholarshipTitle: "External Provider Scholarship" }, activeRosterOptions: [{ rosterId: "existing", scholarshipTitle: "Current Roster Scholarship" }] },
	]
	const json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } })
	window.__solisRequests = []
	window.fetch = async (input, options = {}) => {
		const url = new URL(typeof input === "string" ? input : input.url, location.href)
		if (url.origin === location.origin) return originalFetch(input, options)
		const body = typeof options.body === "string" ? JSON.parse(options.body) : {}
		window.__solisRequests.push({ path: url.pathname, body })
		if (url.pathname === "/portal/data/query") {
			let rows = (tables[body.table] || []).map((data) => ({ id: data.id, data }))
			if (body.id) rows = rows.filter((row) => row.id === body.id)
			return json({ ok: true, rows })
		}
		if (url.pathname === "/workflows/admin/roster-conflicts") return json({ ok: true, conflicts: conflicts.map((conflict) => ({ ...conflict, status: "open" })) })
		if (url.pathname === "/workflows/admin/roster-conflicts/resolve") return json({ ok: true, conflictId: body.conflictId })
		if (url.pathname.includes("grantor-scope")) return json({ ok: true, grantorId: grantor.id, classification: "government", grantorType: "external", policy: { enabled: false, name: "", locations: [] } })
		return json({ ok: true, actorId: admin.id, actorType: "admin", portal: {}, branding: {}, notifications: [], submissions: [] })
	}
	const { setPortalIdentity } = await import("/src/services/portalSessionStorage.js")
	setPortalIdentity(admin.id, "admin")
	if (params.get("dark")) localStorage.setItem("bulsuscholar_theme", "dark")
	history.pushState({}, "", params.get("section") === "grantors" ? "/admin/grantors" : "/admin/scholarships")
})()
