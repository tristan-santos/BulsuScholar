// Local browser-only fixture. No requests below write to production services.
window.__grantorFixtureReady = (async () => {
	const originalFetch = window.fetch.bind(window)
	const profile = { id: "image-fixture", providerName: "Scholarship Office", providerType: "Government", email: "fixture@example.test", passwordChanged: true, status: "Active" }
	const json = (value) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } })
	window.__grantorFixtureRequests = []
	window.fetch = async (input, options = {}) => {
		const url = new URL(typeof input === "string" ? input : input.url, location.href)
		if (url.origin === location.origin) return originalFetch(input, options)
		if (url.pathname.startsWith("/storage/v1/object/")) {
			window.__grantorFixtureRequests.push({ path: url.pathname, upload: true })
			return json({ Key: url.pathname.replace("/storage/v1/object/", ""), Id: "fixture-image" })
		}
		const payload = typeof options.body === "string" ? JSON.parse(options.body) : {}
		window.__grantorFixtureRequests.push({ path: url.pathname, payload })
		if (url.pathname.endsWith("/audience/preview")) return json({ ok: true, previewId: "fixture-audience", recipientCount: 1 })
		if (url.pathname.endsWith("/announcements/create")) return json({ ok: true, id: "fixture-announcement" })
		if (url.pathname === "/portal/data/query") {
			const rows = ["providers", "grantor_portals"].includes(payload.table) ? [{ id: profile.id, data: profile }] : []
			return json({ ok: true, rows })
		}
		return json({ ok: true, actorId: profile.id, actorType: "grantor", portal: {}, branding: {}, notifications: [], students: [], count: 0 })
	}
	const { setPortalIdentity } = await import("/src/services/portalSessionStorage.js")
	setPortalIdentity(profile.id, "provider")
	history.pushState({}, "", "/provider-dashboard/announcements")
	window.dispatchEvent(new PopStateEvent("popstate"))
})()
