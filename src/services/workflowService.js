const BACKEND_API_URL = (
	import.meta.env.VITE_BACKEND_API_URL ||
	import.meta.env.VITE_DOCUMENT_SCAN_API_URL ||
	"http://localhost:8000"
).replace(/\/$/, "")

async function postWorkflow(path, payload = {}) {
	const response = await fetch(`${BACKEND_API_URL}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	})
	const data = await response.json().catch(() => ({}))
	if (!response.ok || data?.ok === false) {
		const detail = data?.detail || data?.reason || data?.error || data?.result || data?.results || data
		const message = typeof detail === "string" ? detail : JSON.stringify(detail)
		throw new Error(message || `Workflow request failed: ${response.status}`)
	}
	return data
}

export function applyScholarshipWorkflow(payload = {}) {
	return postWorkflow("/workflows/scholarship/apply", payload)
}

export function adminReviewWorkflow(payload = {}) {
	return postWorkflow("/workflows/admin/review", payload)
}

export function materialRequestWorkflow(payload = {}) {
	return postWorkflow("/workflows/materials/update", payload)
}

export function validateStudentSignupWorkflow(payload = {}) {
	return postWorkflow("/workflows/student/signup/validate", payload)
}

export function finalizeStudentSignupWorkflow(payload = {}) {
	return postWorkflow("/workflows/student/signup/finalize", payload)
}

export function createGrantorScholarsWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/scholars/create", payload)
}

export function updateGrantorScholarWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/scholars/update", payload)
}

export function updateGrantorScholarsWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/scholars/update-many", payload)
}

export function createGrantorAnnouncementWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/announcements/create", payload)
}

export function updateGrantorAnnouncementWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/announcements/update", payload)
}

export function requestGrantorPasswordChangeWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/password/request", payload)
}

export function updateGrantorProfileWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/profile/update", payload)
}
