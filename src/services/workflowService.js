import { buildPortalRequestHeaders, postPortalJson } from "./portalApi"
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

export function requestScholarshipMaterialsWorkflow(payload = {}) {
	return postWorkflow("/workflows/scholarship/materials/request", payload, { operation: "materials.request" })
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

export function confirmGrantorAdminDecisionWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/applications/confirm-admin-decision", payload, { operation: "workflow.complete" })
}

export function createGrantorScholarsWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/scholars/create", payload, { operation: "record.save" })
}

export function previewRosterImportWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/scholars/import/preview", payload, { operation: "generic.background" })
}

export function commitRosterImportWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/scholars/import/commit", payload, { operation: "record.save" })
}

export function listRosterConflictsWorkflow(payload = {}) {
	return postWorkflow("/workflows/admin/roster-conflicts", payload, { operation: "generic.background" })
}

export function resolveRosterConflictWorkflow(payload = {}) {
	return postWorkflow("/workflows/admin/roster-conflicts/resolve", payload, { operation: "record.save" })
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

export function getGrantorScopeWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor-scope/get", payload, { operation: "generic.background" })
}

export function saveGrantorScopeWorkflow(payload = {}) {
	return postWorkflow("/workflows/admin/grantor-scope/save", payload, { operation: "record.save" })
}

export function listFilteredApplicantsWorkflow(payload = {}) {
	return postWorkflow("/workflows/applicants/list", payload, { operation: "generic.background" })
}

export async function downloadFilteredApplicantsWorkflow(payload = {}) {
	const response = await fetch(`${requireBackendApiUrl("Applicant report backend")}/workflows/applicants/export`, {
		method: "POST",
		headers: await buildPortalRequestHeaders({ actorId: payload.actorId, actorType: payload.actorType }),
		body: JSON.stringify(payload),
	})
	if (!response.ok) throw new Error("The applicant report could not be generated.")
	const blob = await response.blob()
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = payload.format === "pdf" ? "grantor-applicants.pdf" : "grantor-applicants.csv"
	anchor.click()
	URL.revokeObjectURL(url)
}

export function correctStudentNumberWorkflow(payload = {}) {
	return postWorkflow("/workflows/admin/student-number/correct", payload, { operation: "record.save" })
}

export function previewAnnouncementAudienceWorkflow(payload = {}) {
	return postWorkflow("/workflows/announcements/audience/preview", payload, { operation: "generic.background" })
}

export function publishTargetedAnnouncementWorkflow(payload = {}) {
	return postWorkflow("/workflows/announcements/publish", payload, { timeoutMs: 45000, operation: "announcement.publish" })
}

export function loadWaitlistWorkflow(payload = {}) {
	return postWorkflow("/workflows/waitlist/status", payload, { operation: "generic.background" })
}

export function resolveWaitlistOfferWorkflow(payload = {}) {
	return postWorkflow("/workflows/waitlist/offer", payload, { operation: "application.submit" })
}

export function updateGrantorProfileWorkflow(payload = {}) {
	return postWorkflow("/workflows/grantor/profile/update", payload, { operation: "record.save" })
}
