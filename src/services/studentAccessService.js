function hasScholarshipAdminBlock(student = {}) {
	const scholarships = Array.isArray(student?.scholarships) ? student.scholarships : []
	return scholarships.some((entry) => entry?.adminBlocked === true)
}

export function getStudentAccessState(student = {}) {
	const isArchived = student?.archived === true
	const accountAccessBlocked =
		student?.restrictions?.accountAccess === true ||
		student?.isBlocked === true ||
		String(student?.accountStatus || "").toLowerCase() === "blocked"
	const scholarshipEligibilityBlocked =
		student?.restrictions?.scholarshipEligibility === true ||
		student?.scholarshipConflictWarning === true ||
		student?.scholarshipRestrictionReason === "multiple_scholarships" ||
		hasScholarshipAdminBlock(student)
	const soeComplianceBlocked = student?.soeComplianceBlocked === true
	const multipleScholarshipConflict =
		student?.scholarshipConflictWarning === true ||
		student?.scholarshipRestrictionReason === "multiple_scholarships"

	return {
		isArchived,
		accountAccessBlocked,
		scholarshipEligibilityBlocked,
		soeComplianceBlocked,
		multipleScholarshipConflict,
		hasScholarshipAdminBlock: hasScholarshipAdminBlock(student),
		isPortalAccessBlocked: isArchived || accountAccessBlocked,
		isScholarshipActionBlocked:
			isArchived ||
			accountAccessBlocked ||
			scholarshipEligibilityBlocked ||
			soeComplianceBlocked,
	}
}

export function getPortalAccessBlockMessage(student = {}) {
	const access = getStudentAccessState(student)
	if (access.isArchived) {
		return "This student account is archived and can no longer be used to log in."
	}
	if (access.accountAccessBlocked) {
		return "Account access is blocked. Please contact the scholarship office."
	}
	return ""
}

export function getScholarshipActionBlockMessage(student = {}) {
	const access = getStudentAccessState(student)
	if (access.isArchived) {
		return "This student account is archived. Scholarship actions are unavailable."
	}
	if (access.accountAccessBlocked) {
		return "Account access is blocked. Please contact the scholarship office."
	}
	if (access.soeComplianceBlocked) {
		return "Compliance restriction active. You cannot send or modify SOE data right now."
	}
	if (access.multipleScholarshipConflict) {
		return (
			student?.scholarshipConflictMessage ||
			"Choose one scholarship only to comply with the one scholarship per student policy."
		)
	}
	if (access.scholarshipEligibilityBlocked) {
		return "Scholarship eligibility is blocked. Please coordinate with the scholarship office."
	}
	return ""
}

export function getStudentBlockedBannerMessage(student = {}) {
	const access = getStudentAccessState(student)
	if (!access.scholarshipEligibilityBlocked && !access.soeComplianceBlocked) {
		return ""
	}
	if (access.multipleScholarshipConflict) {
		return (
			student?.scholarshipConflictMessage ||
			"You have been blocked from scholarship actions. Choose one scholarship only to comply with the one scholarship per student policy."
		)
	}
	if (access.soeComplianceBlocked) {
		return "You have been blocked from scholarship actions because of a compliance hold. Please coordinate with the scholarship office to restore access."
	}
	return "You have been blocked from scholarship actions. Please coordinate with the scholarship office to restore access."
}
