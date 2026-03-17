function hasScholarshipAdminBlock(student = {}) {
	// Manual admin block is disabled as per request, but we keep the structure
	return false
}

export function getStudentAccessState(student = {}) {
	const isArchived = student?.archived === true
	
	// Keep multiple scholarship blocking logic
	const multipleScholarshipConflict =
		student?.scholarshipConflictWarning === true ||
		student?.scholarshipRestrictionReason === "multiple_scholarships"

	// Account access block and compliance block are removed/disabled from admin side logic
	// but we keep scholarshipEligibilityBlocked true IF there is a multiple scholarship conflict
	const scholarshipEligibilityBlocked = multipleScholarshipConflict

	return {
		isArchived,
		accountAccessBlocked: false,
		scholarshipEligibilityBlocked,
		soeComplianceBlocked: false,
		multipleScholarshipConflict,
		hasScholarshipAdminBlock: false,
		isPortalAccessBlocked: isArchived,
		isScholarshipActionBlocked:
			isArchived ||
			scholarshipEligibilityBlocked,
	}
}

export function getPortalAccessBlockMessage(student = {}) {
	const access = getStudentAccessState(student)
	if (access.isArchived) {
		return "This student account is archived and can no longer be used to log in."
	}
	return ""
}

export function getScholarshipActionBlockMessage(student = {}) {
	const access = getStudentAccessState(student)
	if (access.isArchived) {
		return "This student account is archived. Scholarship actions are unavailable."
	}
	if (access.multipleScholarshipConflict) {
		return (
			student?.scholarshipConflictMessage ||
			"Choose one scholarship only to comply with the one scholarship per student policy."
		)
	}
	return ""
}

export function getStudentBlockedBannerMessage(student = {}) {
	const access = getStudentAccessState(student)
	if (access.multipleScholarshipConflict) {
		return (
			student?.scholarshipConflictMessage ||
			"You have been blocked from scholarship actions. Choose one scholarship only to comply with the one scholarship per student policy."
		)
	}
	return ""
}
