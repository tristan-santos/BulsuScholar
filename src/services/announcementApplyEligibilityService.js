import { isPreviousStudentAnnouncement } from "./announcementService"
import {
	getDocumentUrlsForStudent,
	normalizeScholarshipList,
	toScholarshipProviderType,
} from "./scholarshipService"
import { getScholarshipActionBlockMessage } from "./studentAccessService"
import {
	formatCooldownDuration,
} from "./rejectionCooldownService"
import { getScholarshipSlotState } from "./scholarshipSlotService"
import { SCHOLARSHIP_CHOICE_ENABLED, getGrantorApplicationBlock, sameApplicationGrantor } from "./scholarshipChoiceService"
import { findMatchingPendingInvitation, getGrantorRejectionCooldown, isManualArchiveForGrantor } from "./grantorReapplicationService"

export function isScholarshipActiveOrPending(status = "") {
	const normalized = String(status).toLowerCase()
	if (!normalized) return true
	return ![
		"finalized",
		"rejected",
		"denied",
		"cancelled",
		"canceled",
		"withdrawn",
		"resolved",
		"completed",
		"expired",
		"archived",
	].some((keyword) => normalized.includes(keyword))
}

export function toNumericGrade(value) {
	const grade = Number(value)
	return Number.isFinite(grade) ? grade : null
}

export function getMissingAnnouncementDocuments(student = {}, announcement = {}) {
	const required = announcement?.requiredDocuments || {}
	const urls = getDocumentUrlsForStudent(student)
	return [
		required.cog === true && !urls.cog ? "ROG" : "",
		required.cor === true && !urls.cor ? "COR" : "",
		required.applicationForm === true && !urls.applicationForm ? "Student Application Profile" : "",
	].filter(Boolean)
}

export function getAnnouncementProviderType(announcement = {}) {
	return (
		announcement?.providerType ||
		toScholarshipProviderType(
			[
				announcement?.providerLabel,
				announcement?.sourceLabel,
				announcement?.grantorName,
				announcement?.title,
			]
				.filter(Boolean)
				.join(" "),
		)
	)
}

export function getAnnouncementMinimumGrade(announcement = {}) {
	return toNumericGrade(
		announcement?.minimumGrade ??
			announcement?.minGwa ??
			announcement?.minimumGwa ??
			announcement?.gwaRequirement,
	)
}

function matchesGrantorArchiveBlock(entry = {}, announcement = {}, providerType = "") {
	return isManualArchiveForGrantor(entry, { ...announcement, providerType: providerType || announcement.providerType })
}

export function getArchivedGrantorApplyBlock(user = {}, announcement = {}) {
	const providerType = getAnnouncementProviderType(announcement)
	const entries = [
		...(Array.isArray(user?.scholarships) ? user.scholarships : []),
		...(Array.isArray(user?.previousScholars) ? user.previousScholars : []),
	]
	return entries.find((entry) => matchesGrantorArchiveBlock(entry, announcement, providerType)) || null
}

export function getAnnouncementApplyAvailability({
	announcement = null,
	user = null,
	studentAccessState = {},
	posterProfile = {},
	isPreviousAnnouncement = null,
	grantorDisplayName = "",
} = {}) {
	if (!announcement || !user) return { canApply: false, reason: "" }

	const previous =
		typeof isPreviousAnnouncement === "boolean"
			? isPreviousAnnouncement
			: isPreviousStudentAnnouncement(announcement)
	if (previous) {
		return { canApply: false, reason: "This announcement is already archived or past its application window." }
	}
	if (announcement.applicationEnabled !== true) {
		return { canApply: false, reason: "This announcement is for information only and is not open for applications." }
	}
	const slotState = getScholarshipSlotState(announcement)
	if (slotState.managed && !slotState.configured) {
		return { canApply: false, reason: "This scholarship is not accepting applications until the grantor configures its slots." }
	}
	if (slotState.full) {
		return { canApply: false, reason: "This scholarship has no remaining slots." }
	}

	const providerType = getAnnouncementProviderType(announcement)
	const scholarships = normalizeScholarshipList(user?.scholarships || [])
	const hasLockedScholarship = scholarships.some((item) => item.isLocked)
	const hasSameActiveApplication = scholarships.some(
		(item) => (SCHOLARSHIP_CHOICE_ENABLED ? sameApplicationGrantor(item, announcement) : item.providerType === providerType) && isScholarshipActiveOrPending(item.status),
	)
	const hasActiveOrPendingScholarship = scholarships.some(
		(item) => !item.isLocked && isScholarshipActiveOrPending(item.status),
	)
	const latestRejectedCooldown = getGrantorRejectionCooldown(user, announcement)
	const archivedGrantorBlock = getArchivedGrantorApplyBlock(user, announcement)
	const matchingInvitation = findMatchingPendingInvitation(user, announcement)

	if (studentAccessState.isScholarshipActionBlocked) {
		return { canApply: false, reason: getScholarshipActionBlockMessage(user || {}) }
	}
	if (latestRejectedCooldown?.active) {
		return {
			canApply: false,
			reason: `You can apply again after ${formatCooldownDuration(latestRejectedCooldown.remainingMs)}. Your previous application was rejected and is still under the 24-hour cooldown.`,
		}
	}
	if (archivedGrantorBlock && !matchingInvitation) {
		return {
			canApply: false,
			reason: `You were archived by ${archivedGrantorBlock.archivedByName || archivedGrantorBlock.blockedGrantorName || announcement.sourceLabel || grantorDisplayName || "this grantor"}. You cannot apply to this grantor again unless they invite you back.`,
		}
	}
	if (posterProfile?.applicationsBlocked === true) {
		return { canApply: false, reason: `Applications for ${announcement.sourceLabel || grantorDisplayName || "this grantor"} are currently closed.` }
	}
	if (hasLockedScholarship) {
		return { canApply: false, reason: "Your scholarship selection is already locked for this semester." }
	}
	if (hasSameActiveApplication) {
		return { canApply: false, reason: "You already have an active application for this scholarship." }
	}
	if (!SCHOLARSHIP_CHOICE_ENABLED && hasActiveOrPendingScholarship) {
		return { canApply: false, reason: "You already have an existing scholarship application. You cannot apply for another until the current one is resolved." }
	}
	if (SCHOLARSHIP_CHOICE_ENABLED) {
		const reason = getGrantorApplicationBlock(user, announcement)
		if (reason) return { canApply: false, reason }
	}

	const minimumGrade = getAnnouncementMinimumGrade(announcement)
	if (minimumGrade !== null) {
		const studentGrade = toNumericGrade(user?.gwa || user?.currentGwa || user?.generalWeightedAverage)
		if (studentGrade === null) {
			return { canApply: false, reason: "Your current GWA is not available. Update your profile before applying." }
		}
		if (studentGrade > minimumGrade) {
			return { canApply: false, reason: `Your current GWA (${studentGrade}) does not meet the required minimum GWA of ${minimumGrade}.` }
		}
	}

	const missingRequiredDocuments = getMissingAnnouncementDocuments(user, announcement)
	if (missingRequiredDocuments.length > 0) {
		return {
			canApply: false,
			reason: `Upload the required document${missingRequiredDocuments.length === 1 ? "" : "s"} first: ${missingRequiredDocuments.join(", ")}.`,
		}
	}

	return { canApply: true, reason: "" }
}
