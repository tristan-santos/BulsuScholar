// Loaded before application modules so trackedFetch also uses isolated transport.
const fixture = window.__mpinFixture = { role: "student", enabled: false, configured: false, downloads: 0, mutations: 0, cancelled: 0, errors: [], proofs: new Set() }
window.addEventListener("error", (event) => fixture.errors.push(event.message))
const nativeFetch = window.fetch
window.fetch = async (url, options = {}) => {
	if (!String(url).includes("/security/mpin") && !String(url).includes("/fixture-download") && !String(url).includes("/workflows/scholarship/apply")) return nativeFetch(url, options)
	const payload = JSON.parse(options.body || "{}")
	const ok = (data) => Response.json(data)
	const denied = (message, status = 403) => Response.json({ detail: { code: message, message } }, { status })
	if (String(url).endsWith("/status")) return ok({ enabled: fixture.enabled, configured: fixture.configured })
	if (String(url).endsWith("/policy")) return ok({ required: fixture.enabled && !(fixture.role !== "student" && payload.path.includes("download")), encrypt: fixture.role === "student", action: "application" })
	if (String(url).endsWith("/email")) return ok({ sent: true })
	if (String(url).endsWith("/settings")) {
		if (["enable", "reset"].includes(payload.operation) && payload.code !== "000001") return denied("Invalid email code")
		if (["change", "disable"].includes(payload.operation) && payload.pin !== "012345") return denied("Incorrect MPIN")
		fixture.enabled = payload.operation !== "disable"; fixture.configured = true
		return ok({ enabled: fixture.enabled })
	}
	if (String(url).endsWith("/verify")) {
		if (payload.pin !== "012345") return denied("Incorrect MPIN")
		const token = crypto.randomUUID(); fixture.proofs.add(token)
		return ok({ token })
	}
	if (String(url).includes("/workflows/scholarship/apply")) {
		if (fixture.enabled && !fixture.proofs.delete(options.headers["X-MPIN-Authorization"])) return denied("mpin_required", 428)
		fixture.mutations++; return ok({ ok: true })
	}
	fixture.downloads++
	return new Response(new Blob(["isolated file fixture"], { type: "application/pdf" }), { headers: { "content-disposition": 'attachment; filename="document.pdf"' } })
}
