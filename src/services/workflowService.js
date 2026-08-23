import { postPortalJson } from "./portalApi"

const BACKEND_API_URL = (
	import.meta.env.VITE_BACKEND_API_URL ||
	import.meta.env.VITE_DOCUMENT_SCAN_API_URL ||
	"https://bulsuscholar.onrender.com"
).replace(/\/$/, "")

async function postWorkflow(path, payload = {}) {
	return postPortalJson(BACKEND_API_URL, path, payload, "Workflow")
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

export function recommendScholarshipsWorkflow(payload = {}) {
	return postWorkflow("/scholarships/recommend", payload)
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
