export const APPLICATION_DECISION_CONFIRMATION_MS = 3 * 24 * 60 * 60 * 1000

export const REVIEW_CONFIRMATION_STEP_IDS = new Set([
	"document_review",
	"admin_review",
	"interview",
	"application_review",
	"final_screening",
])

export function canUseGrantorConfirmationForStep(stepId = "") {
	return REVIEW_CONFIRMATION_STEP_IDS.has(String(stepId || "").trim())
}

export function buildApplicationDecisionConfirmation({
	decision = "approve",
	stepId = "",
	stepLabel = "",
	studentId = "",
	studentName = "",
	scholarshipName = "",
	applicationNumber = "",
	reason = "",
	notes = "",
	requestedBy = "admin",
	requestedByName = "BulsuScholar Admin",
} = {}) {
	const requestedAt = new Date()
	const deadlineAt = new Date(requestedAt.getTime() + APPLICATION_DECISION_CONFIRMATION_MS)
	return {
		status: "pending",
		decision,
		stepId,
		stepLabel,
		studentId,
		studentName,
		scholarshipName,
		applicationNumber,
		reason,
		notes,
		requestedBy,
		requestedByName,
		requestedAt: requestedAt.toISOString(),
		deadlineAt: deadlineAt.toISOString(),
	}
}

export function getPendingApplicationDecisionConfirmation(application = {}) {
	const confirmation = application?.decisionConfirmation || null
	if (!confirmation || confirmation.status !== "pending") return null
	const decision = String(confirmation.decision || "").toLowerCase()
	if (!["approve", "reject"].includes(decision)) return null
	return confirmation
}

export function isApplicationDecisionConfirmationExpired(confirmation = {}) {
	const deadline = new Date(confirmation?.deadlineAt || "")
	if (Number.isNaN(deadline.getTime())) return false
	return Date.now() >= deadline.getTime()
}

export function formatApplicationDecisionLabel(decision = "") {
	return String(decision || "").toLowerCase() === "reject" ? "Rejection" : "Approval"
}

export function formatApplicationDecisionVerb(decision = "") {
	return String(decision || "").toLowerCase() === "reject" ? "reject" : "approve"
}

export function formatConfirmationDeadline(confirmation = {}) {
	const deadline = new Date(confirmation?.deadlineAt || "")
	if (Number.isNaN(deadline.getTime())) return "within 3 days"
	return deadline.toLocaleString("en-PH", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	})
}
