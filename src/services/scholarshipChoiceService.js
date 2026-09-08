export const SCHOLARSHIP_CHOICE_ENABLED = import.meta.env?.VITE_ENABLE_SCHOLARSHIP_CHOICE !== "false"

const normalize = (value) => String(value || "").trim().toLowerCase()

export function isClosedApplication(entry = {}) {
	return entry.archived === true || entry.frozen === true || entry.rejected === true ||
		/rejected|denied|declined|cancelled|canceled|withdrawn|archived|resolved/.test(normalize(entry.status))
}

export function hasScholarshipCommitment(student = {}) {
	if (student.scholarshipCommitment?.applicationId || student.commitmentRequiresResolution) return true
	return (student.scholarships || []).some((entry) => !isClosedApplication(entry) && (
		entry.isLocked === true || entry.committedAt || entry.requestedSoeAt ||
		["awarded", "accepted", "finalized"].includes(normalize(entry.status))
	))
}

export function sameApplicationGrantor(left = {}, right = {}) {
	const leftId = normalize(left.grantorId || left.providerId || left.matchedGrantorId)
	const rightId = normalize(right.grantorId || right.providerId || right.matchedGrantorId)
	if (leftId || rightId) return Boolean(leftId && rightId && leftId === rightId)
	const leftName = normalize(left.grantorName || left.provider)
	const rightName = normalize(right.grantorName || right.provider)
	return Boolean(leftName && rightName && leftName === rightName)
}

export function matchesScholarshipApplication(application = {}, entry = {}) {
	const owner = normalize(application.grantorId || application.providerId)
	const entryOwner = normalize(entry.grantorId || entry.providerId)
	if (owner && entryOwner && owner !== entryOwner) return false
	if (application.id && entry.applicationId) return application.id === entry.applicationId
	if (application.applicationNumber && entry.applicationNumber) {
		return normalize(application.applicationNumber) === normalize(entry.applicationNumber)
	}
	if (application.lifecycleVersion === 2 || entry.lifecycleVersion === 2) return false
	return Boolean(
		(application.scholarshipId && application.scholarshipId === entry.id) ||
		(application.requestNumber && application.requestNumber === entry.requestNumber),
	)
}

export function getGrantorApplicationBlock(student = {}, offering = {}, now = Date.now()) {
	if (hasScholarshipCommitment(student)) return "You have already selected a scholarship."
	const active = (student.scholarships || []).find((entry) =>
		!isClosedApplication(entry) && sameApplicationGrantor(entry, offering))
	if (active) return "You already have an active application with this grantor."
	const history = [...(student.scholarships || []), ...(student.scholarshipApplicationHistory || [])]
	const coolingDown = history.some((entry) => {
		if (!sameApplicationGrantor(entry, offering)) return false
		if (entry.closureReason === "selected_another_scholarship") return false
		if (Date.parse(entry.cooldownUntil || "") > now) return true
		return /rejected|denied|declined/.test(normalize(entry.status)) &&
			Date.parse(entry.rejectedAt || entry.updatedAt || "") + 86400000 > now
	})
	return coolingDown ? "Please wait 24 hours before applying to this grantor again." : ""
}

export function sharedDocumentVersions(student = {}) {
	const keys = ["corFile", "corDocument", "cor", "rogFile", "cogFile", "rogDocument",
		"cogDocument", "rog", "cog", "schoolIdFile", "studentIdFile", "validIdFile", "idFile"]
	return Object.fromEntries(keys.filter((key) => Object.hasOwn(student, key)).map((key) => [key, student[key]]))
}
