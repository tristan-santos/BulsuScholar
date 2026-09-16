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
	return postWorkflow("/workflows/scholarship/apply", payload, { operation: "application.submit" })
}

export function chooseScholarshipWorkflow(payload = {}) {
	return postWorkflow("/workflows/scholarship/choose", payload, { operation: "scholarship.choose" })
}

export function withdrawScholarshipWorkflow(payload = {}) {
	return postWorkflow("/workflows/scholarship/withdraw", payload, { operation: "application.withdraw" })
}

export function resolveArchivedGrantorScholarshipWorkflow(payload = {}) {
	return postWorkflow("/workflows/scholarship/archived-grantor-decision", payload, { operation: "record.save" })
}

export function updateScholarshipDocumentsWorkflow(payload = {}) {
	return postWorkflow("/workflows/scholarship/documents", payload, { operation: "document.upload" })
}

export function adminReviewWorkflow(payload = {}) {
	const decision = String(payload.decision || payload.status || "").toLowerCase()
	return postWorkflow("/workflows/admin/review", payload, {
		operation: decision.includes("reject") ? "record.reject" : "record.approve",
	})
}

export function updateGrantorArchiveStateWorkflow(payload = {}) {
	return postWorkflow("/workflows/admin/grantors/archive-state", payload, {
		operation: payload.archived === false ? "record.restore" : "record.archive",
	})
}

export function inviteArchivedGrantorScholarsWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/scholars/invite-back", payload, { operation: "invitation.send" })
}

export function rejectScholarshipInvitationWorkflow(payload = {}) {
	return postWorkflow("/workflows/scholarship/invitation/reject", payload, { operation: "record.reject" })
}

export function materialRequestWorkflow(payload = {}) {
	return postWorkflow("/workflows/materials/update", payload, { operation: "materials.request" })
}

export function validateStudentSignupWorkflow(payload = {}) {
	return postWorkflow("/workflows/student/signup/validate", payload, { operation: "generic.background" })
}

export function recommendScholarshipsWorkflow(payload = {}) {
	return postWorkflow("/scholarships/recommend", payload, { operation: "generic.background" })
}

export function finalizeStudentSignupWorkflow(payload = {}) {
	return postWorkflow("/workflows/student/signup/finalize", payload, { operation: "auth.signup" })
}

export function promoteEmailConfirmedStudentWorkflow(payload = {}) {
	return postWorkflow("/workflows/student/email-confirmed", payload, { operation: "auth.confirm" })
}

export function resolveRosterScholarshipWorkflow(payload = {}) {
	return postWorkflow("/workflows/student/roster-scholarship-decision", payload, { operation: "record.save" })
}

export function confirmGrantorAdminDecisionWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/applications/confirm-admin-decision", payload, { operation: "workflow.complete" })
}

export function createGrantorScholarsWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/scholars/create", payload, { operation: "record.save" })
}

export function updateGrantorScholarWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/scholars/update", payload, { operation: "record.save" })
}

export function updateGrantorScholarsWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/scholars/update-many", payload, { operation: "record.save" })
}

export function createGrantorAnnouncementWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/announcements/create", payload, { timeoutMs: 45000, operation: "announcement.publish" })
}

export function republishGrantorAnnouncementWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/announcements/republish", payload, { timeoutMs: 45000, operation: "announcement.publish" })
}

export function updateGrantorAnnouncementWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/announcements/update", payload, { operation: "record.save" })
}

export function configureGrantorAnnouncementSlotsWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/announcements/slots", payload, { operation: "record.save" })
}

export function requestGrantorPasswordChangeWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/password/request", payload, { operation: "auth.password-request" })
}

export function updateGrantorProfileWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/profile/update", payload, { operation: "record.save" })
}
