import { postPortalJson } from "./portalApi"
import { requireBackendApiUrl } from "../config/backendApi"

async function postWorkflow(path, payload = {}, options = {}) {
	return postPortalJson(requireBackendApiUrl("Workflow backend"), path, payload, "Workflow", {
		actor: {
			actorId: payload.actorId,
			actorType: payload.actorType,
		},
		...options,
	})
}

export function applyScholarshipWorkflow(payload = {}) {
	return postWorkflow("/workflows/scholarship/apply", payload)
}

export function chooseScholarshipWorkflow(payload = {}) {
	return postWorkflow("/workflows/scholarship/choose", payload)
}

export function withdrawScholarshipWorkflow(payload = {}) {
	return postWorkflow("/workflows/scholarship/withdraw", payload)
}

export function updateScholarshipDocumentsWorkflow(payload = {}) {
	return postWorkflow("/workflows/scholarship/documents", payload)
}

export function adminReviewWorkflow(payload = {}) {
	return postWorkflow("/workflows/admin/review", payload)
}

export function updateGrantorArchiveStateWorkflow(payload = {}) {
	return postWorkflow("/workflows/admin/grantors/archive-state", payload)
}

export function inviteArchivedGrantorScholarsWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/scholars/invite-back", payload)
}

export function rejectScholarshipInvitationWorkflow(payload = {}) {
	return postWorkflow("/workflows/scholarship/invitation/reject", payload)
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
	return postWorkflow("/workflows/grantor/announcements/create", payload, { timeoutMs: 45000 })
}

export function republishGrantorAnnouncementWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/announcements/republish", payload, { timeoutMs: 45000 })
}

export function updateGrantorAnnouncementWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/announcements/update", payload)
}

export function configureGrantorAnnouncementSlotsWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/announcements/slots", payload)
}

export function requestGrantorPasswordChangeWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/password/request", payload)
}

export function updateGrantorProfileWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/profile/update", payload)
}
