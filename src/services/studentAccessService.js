export function getStudentAccessState(student = {}) {
	const isArchived = student?.archived === true
	
	const multipleScholarshipConflict =
		student?.scholarshipConflictWarning === true ||
		student?.scholarshipRestrictionReason === "multiple_scholarships"

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
