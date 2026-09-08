const normalize = (value) => String(value || "").trim().toLowerCase()

const AUTOMATIC_CLOSURES = new Set([
	"selected_another_scholarship",
	"student_withdrawal",
	"withdrawn",
	"rejected",
	"denied",
	"declined",
])

export function isRejectedGrantorRecord(record = {}) {
	const status = normalize(record.status || record.reviewStatus)
	const closureReason = normalize(record.closureReason)
	return record.rejected === true || Boolean(record.rejectedAt) || /rejected|denied|declined/.test(`${status} ${closureReason}`)
}

export function isManualGrantorArchive(record = {}) {
	const closureReason = normalize(record.closureReason)
	const status = normalize(record.status)
	if (AUTOMATIC_CLOSURES.has(closureReason) || /withdrawn|cancelled|canceled/.test(status) || isRejectedGrantorRecord(record)) return false
	return record.archived === true || record.frozen === true || status.includes("archived") || status.includes("frozen")
}

export function sameGrantorIdentity(left = {}, right = {}) {
	const leftId = normalize(left.blockedGrantorId || left.grantorId || left.providerId)
	const rightId = normalize(right.blockedGrantorId || right.grantorId || right.providerId)
	if (leftId || rightId) return Boolean(leftId && rightId && leftId === rightId)
	const leftType = normalize(left.providerType)
	const rightType = normalize(right.providerType)
	if (leftType && rightType) return leftType === rightType
	const leftName = normalize(left.blockedGrantorName || left.grantorName || left.providerLabel || left.provider)
	const rightName = normalize(right.blockedGrantorName || right.grantorName || right.providerLabel || right.provider)
	return Boolean(leftName && rightName && leftName === rightName)
}

export function isManualArchiveForGrantor(record = {}, target = {}) {
	return isManualGrantorArchive(record) && sameGrantorIdentity(record, target)
}

function sameScholarshipIdentity(invitation = {}, target = {}) {
	const invitationAnnouncementId = normalize(invitation.announcementId)
	const targetAnnouncementId = normalize(target.announcementId || target.id)
	if (invitationAnnouncementId) {
		return Boolean(targetAnnouncementId && invitationAnnouncementId === targetAnnouncementId)
	}
	const invitationName = normalize(invitation.scholarshipName || invitation.announcementTitle || invitation.providerLabel)
	const targetName = normalize(
		target.scholarshipName || target.scholarshipTitle || target.announcementTitle || target.title || target.providerLabel,
	)
	return Boolean(invitationName && targetName && invitationName === targetName)
}

export function findMatchingPendingInvitation(student = {}, target = {}, invitationId = "") {
	const requestedId = normalize(invitationId)
	return (Array.isArray(student.scholarshipInvitations) ? student.scholarshipInvitations : []).find((invitation) => {
		const status = normalize(invitation.status || "pending")
		if (!["pending", "invited"].includes(status)) return false
		if (requestedId && normalize(invitation.id) !== requestedId) return false
		return sameGrantorIdentity(invitation, target) && sameScholarshipIdentity(invitation, target)
	}) || null
}

export function markInvitationAccepted(invitations = [], invitationId = "", acceptedAt = new Date().toISOString()) {
	return invitations.map((invitation) => invitation.id === invitationId
		? { ...invitation, status: "Accepted", acceptedAt, updatedAt: acceptedAt }
		: invitation)
}

export function getGrantorRejectionCooldown(student = {}, target = {}, now = Date.now()) {
	const history = [
		...(Array.isArray(student.scholarships) ? student.scholarships : []),
		...(Array.isArray(student.scholarshipApplicationHistory) ? student.scholarshipApplicationHistory : []),
	]
		.filter((record) => isRejectedGrantorRecord(record) && sameGrantorIdentity(record, target))
		.map((record) => {
			const rejectedAt = Date.parse(record.rejectedAt || record.archivedAt || record.updatedAt || record.applicationDate || record.appliedAt || record.createdAt || "")
			const readyAt = Number.isFinite(rejectedAt) ? rejectedAt + 24 * 60 * 60 * 1000 : 0
			return { record, active: readyAt > now, remainingMs: Math.max(0, readyAt - now), readyAt: readyAt ? new Date(readyAt) : null }
		})
		.filter((item) => item.active)
		.sort((left, right) => right.remainingMs - left.remainingMs)
	return history[0] || null
}
