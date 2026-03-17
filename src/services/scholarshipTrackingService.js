import {
	getMaterialEntry,
	isMaterialApproved,
	isMaterialPending,
	isMaterialRejected,
	normalizeMaterialRequest,
	toMaterialLabel,
} from "./materialRequestService"

function normalizeProviderType(value = "") {
	const normalized = String(value || "").toLowerCase().trim()
	if (normalized.includes("kuya")) return "kuya_win"
	if (normalized.includes("tina")) return "tina_pancho"
	if (normalized.includes("morisson") || normalized.includes("morrison")) return "morisson"
	return "other"
}

function statusIncludesAny(value = "", keywords = []) {
	const normalized = String(value || "").toLowerCase()
	return keywords.some((keyword) => normalized.includes(String(keyword || "").toLowerCase()))
}

function buildKwspSteps() {
	return [
		{ id: "account", label: "Creation of Account", owner: "system" },
		{ id: "kwsp_apply", label: "Application for KWSP", owner: "student" },
		{ id: "document_uploading", label: "Uploading of Document", owner: "admin" },
		{ id: "admin_review", label: "Admin Review", owner: "admin" },
		{ id: "interview", label: "Interview", owner: "admin" },
		{ id: "application_review", label: "Application Review", owner: "admin" },
		{ id: "final_screening", label: "Final Screening", owner: "admin" },
		{ id: "request_materials", label: "Requesting of Materials", owner: "student" },
		{ id: "download_materials", label: "Downloading of Materials", owner: "student" },
		{ id: "signing_materials", label: "Signing of Materials", owner: "system" },
	]
}

function buildStandardSteps(scholarshipName = "Scholarship") {
	return [
		{ id: "account", label: "Creation of Account", owner: "system" },
		{ id: "scholarship_apply", label: `Application for ${scholarshipName}`, owner: "student" },
		{ id: "document_uploading", label: "Uploading of Document", owner: "admin" },
		{ id: "request_materials", label: "Requesting of Materials", owner: "student" },
		{ id: "download_materials", label: "Downloading of Materials", owner: "student" },
		{ id: "signing_materials", label: "Signing of Materials", owner: "system" },
	]
}

function getApplyStepId(providerType = "") {
	return normalizeProviderType(providerType) === "kuya_win" ? "kwsp_apply" : "scholarship_apply"
}

function toOwnerLabel(owner = "") {
	if (owner === "admin") return "Admin"
	if (owner === "student") return "Student"
	if (owner === "system") return "System"
	return "Office"
}

function buildTrackingDetail(stepId, context) {
	const {
		isValidated,
		scholarshipName,
		semesterTag,
		documentCheck,
		requestedMaterials,
		downloadedMaterials,
		hasApprovedMaterials,
		hasPendingMaterialApproval,
		hasDownloadedMaterials,
		signingComplete,
		signingAttention,
		payoutComplete,
		state,
		isKwspFlow,
	} = context

	const missingCopy = [
		...(Array.isArray(documentCheck?.missing) ? documentCheck.missing : []),
		...(Array.isArray(documentCheck?.expired)
			? documentCheck.expired.map((item) => `${item} (update needed)`)
			: []),
	].join(", ")

	switch (stepId) {
		case "account":
			return isValidated
				? "Student account is active and validated in BulsuScholar."
				: "Student account already exists in BulsuScholar."
		case "kwsp_apply":
		case "scholarship_apply":
			return `Application recorded for ${scholarshipName} under ${semesterTag || "the current semester"}.`
		case "document_uploading":
			if (state === "complete") {
				return "Required documents are complete. The application can now move to the next stage."
			}
			if (documentCheck?.ok) return "Required documents are uploaded and ready for admin confirmation."
			return missingCopy
				? `Student still needs to comply with: ${missingCopy}.`
				: "Student still needs to upload the required scholarship documents."
		case "admin_review":
			return state === "complete"
				? "Admin review was completed for this application."
				: "Office review is still required before the application can move forward."
		case "interview":
			return state === "complete"
				? "Interview stage has already been completed."
				: "Interview handling is still pending scholarship office action."
		case "application_review":
			return state === "complete"
				? "Application review has been completed."
				: "Application review follows after the interview stage."
		case "final_screening":
			return state === "complete"
				? "Final screening has been completed."
				: "Final screening must be completed before materials can be requested."
	case "request_materials":
		if (requestedMaterials.length > 0) {
			return `Requested materials: ${requestedMaterials.map((item) => toMaterialLabel(item)).join(", ")}.`
		}
		return isKwspFlow
			? "Student can request SOE after the KWSP review stages are completed."
			: `Student can request SOE for ${scholarshipName}.`
	case "download_materials":
		if (downloadedMaterials.length > 0) {
			return `Downloaded materials: ${downloadedMaterials.map((item) => toMaterialLabel(item)).join(", ")}.`
			}
			if (hasApprovedMaterials) return "Approved materials are ready for student download."
			if (hasPendingMaterialApproval) return "Requested materials are still pending admin approval."
			return "Materials will become available for download after approval."
		case "signing_materials":
			if (signingAttention) return "Downloaded SOE was marked non-compliant and needs follow-up."
			if (signingComplete) return "Downloaded SOE already completed the checking and signing stage."
			if (hasDownloadedMaterials) return "Downloaded SOE is waiting for scholarship office checking and signing."
			return "Signing starts after the student downloads the approved SOE."
		default:
			return ""
	}
}

export function getScholarshipTrackingSteps(providerType = "", scholarshipName = "Scholarship") {
	return normalizeProviderType(providerType) === "kuya_win"
		? buildKwspSteps()
		: buildStandardSteps(scholarshipName)
}

export function createScholarshipTrackingState({ providerType = "", scholarshipName = "Scholarship" } = {}) {
	const steps = getScholarshipTrackingSteps(providerType, scholarshipName)
	const applyStepId = getApplyStepId(providerType)
	const accountStep = steps.find((step) => step.id === "account")
	const applyStep = steps.find((step) => step.id === applyStepId)
	const completedAt = new Date().toISOString()

	return {
		flowType: normalizeProviderType(providerType) === "kuya_win" ? "kwsp" : "standard",
		completedStepIds: ["account", applyStepId],
		lastCompletedStepId: applyStepId,
		updatedAt: completedAt,
		history: [
			accountStep
				? {
						stepId: accountStep.id,
						label: accountStep.label,
						completedBy: "system",
						completedAt,
					}
				: null,
			applyStep
				? {
						stepId: applyStep.id,
						label: applyStep.label,
						completedBy: "student",
						completedAt,
					}
				: null,
		].filter(Boolean),
	}
}

export function normalizeScholarshipTrackingState(
	rawTracking = null,
	{ providerType = "", scholarshipName = "Scholarship" } = {},
) {
	const steps = getScholarshipTrackingSteps(providerType, scholarshipName)
	const allowedStepIds = new Set(steps.map((step) => step.id))
	const baseTracking = createScholarshipTrackingState({ providerType, scholarshipName })
	const mergedCompletedIds = Array.from(
		new Set([
			...baseTracking.completedStepIds,
			...(Array.isArray(rawTracking?.completedStepIds) ? rawTracking.completedStepIds : []),
		]),
	).filter((stepId) => allowedStepIds.has(stepId))

	return {
		...(rawTracking || {}),
		flowType: baseTracking.flowType,
		completedStepIds: mergedCompletedIds,
		lastCompletedStepId:
			allowedStepIds.has(rawTracking?.lastCompletedStepId)
				? rawTracking.lastCompletedStepId
				: mergedCompletedIds[mergedCompletedIds.length - 1] || baseTracking.lastCompletedStepId,
		updatedAt: rawTracking?.updatedAt || baseTracking.updatedAt,
		history: Array.isArray(rawTracking?.history)
			? rawTracking.history.filter((item) => allowedStepIds.has(item?.stepId))
			: baseTracking.history,
	}
}

export function completeScholarshipTrackingStep(
	rawTracking = null,
	{ providerType = "", scholarshipName = "Scholarship", stepId = "", completedBy = "admin" } = {},
) {
	const tracking = normalizeScholarshipTrackingState(rawTracking, { providerType, scholarshipName })
	const steps = getScholarshipTrackingSteps(providerType, scholarshipName)
	const step = steps.find((item) => item.id === stepId)
	if (!step) return tracking
	if (tracking.completedStepIds.includes(stepId)) return tracking

	const completedAt = new Date().toISOString()

	return {
		...tracking,
		completedStepIds: [...tracking.completedStepIds, stepId],
		lastCompletedStepId: stepId,
		updatedAt: completedAt,
		history: [
			...(Array.isArray(tracking.history) ? tracking.history : []),
			{
				stepId,
				label: step.label,
				completedBy,
				completedAt,
			},
		],
	}
}

export function formatScholarshipTrackingStateLabel(state = "") {
	if (state === "complete") return "Completed"
	if (state === "current") return "On-going"
	if (state === "attention") return "Action Needed"
	return "Pending"
}

export function getScholarshipTrackingStepBadgeLabel(step = null, steps = []) {
	if (!step) return ""
	if (step.state === "complete") return "Completed"
	if (step.state === "current") return "On-going"
	if (step.state === "attention") return "Action Needed"
	if (step.state !== "upcoming") return ""

	const currentIndex = Array.isArray(steps)
		? steps.findIndex((item) => item?.state === "attention" || item?.state === "current")
		: -1
	const stepIndex = Array.isArray(steps)
		? steps.findIndex((item) => item?.id === step.id)
		: -1

	if (currentIndex >= 0 && stepIndex === currentIndex + 1) return "Pending"
	return ""
}

export function getScholarshipTrackingProgress({
	scholarship = null,
	isValidated = false,
	documentCheck = null,
	latestMaterialRequest = null,
	latestSoeDownload = null,
} = {}) {
	if (!scholarship) {
		return {
			isKwspFlow: false,
			scholarshipName: "Scholarship",
			tracking: createScholarshipTrackingState({}),
			steps: [],
			currentStep: null,
			highlightedStepId: "",
			currentStepLabel: "Not Started",
			currentStepOwnerLabel: "Office",
			hasRequestedMaterials: false,
			hasApprovedMaterials: false,
			hasPendingMaterialApproval: false,
			hasDownloadedMaterials: false,
			signingComplete: false,
			signingAttention: false,
			payoutComplete: false,
			canAdminCompleteCurrentStep: false,
			adminCompletionReason: "No scholarship application selected.",
			canRequestMaterials: false,
		}
	}

	const providerType = normalizeProviderType(scholarship.providerType || scholarship.provider || scholarship.name)
	const scholarshipName = scholarship.name || scholarship.provider || "Scholarship"
	const isKwspFlow = providerType === "kuya_win"
	const stepsDefinition = getScholarshipTrackingSteps(providerType, scholarshipName)
	const baseTracking = normalizeScholarshipTrackingState(scholarship.tracking, {
		providerType,
		scholarshipName,
	})
	const tracking =
		documentCheck?.ok === true
			? completeScholarshipTrackingStep(baseTracking, {
					providerType,
					scholarshipName,
					stepId: "document_uploading",
					completedBy: "student",
				})
			: baseTracking
	const completedStepIds = new Set(tracking.completedStepIds)
	const applyStepId = getApplyStepId(providerType)

	const normalizedRequest = latestMaterialRequest ? normalizeMaterialRequest(latestMaterialRequest) : null
	const requestedMaterials = ["soe"].filter((materialKey) => {
		if (!normalizedRequest) return false
		const materialEntry = getMaterialEntry(normalizedRequest, materialKey)
		return (
			materialEntry.requested === true ||
			Boolean(materialEntry.requestedAt) ||
			isMaterialPending(normalizedRequest, materialKey) ||
			isMaterialApproved(normalizedRequest, materialKey) ||
			isMaterialRejected(normalizedRequest, materialKey)
		)
	})
	const approvedMaterials = requestedMaterials.filter((materialKey) =>
		isMaterialApproved(normalizedRequest, materialKey),
	)
	const pendingMaterials = requestedMaterials.filter((materialKey) =>
		isMaterialPending(normalizedRequest, materialKey),
	)
	const downloadedMaterials = requestedMaterials.filter((materialKey) =>
		Boolean(getMaterialEntry(normalizedRequest, materialKey).downloadedAt),
	)
	const hasRequestedMaterials = requestedMaterials.length > 0
	const hasApprovedMaterials = approvedMaterials.length > 0
	const hasPendingMaterialApproval = pendingMaterials.length > 0
	const hasDownloadedMaterials =
		downloadedMaterials.length > 0 || Boolean(latestSoeDownload?.downloadedAt)

	const signingState = String(
		latestSoeDownload?.reviewState || latestSoeDownload?.status || "",
	).toLowerCase()
	const signingComplete = statusIncludesAny(signingState, ["signed"])
	const signingAttention = statusIncludesAny(signingState, ["non-compliant", "non compliant"])
	const scholarshipStatus = String(scholarship.status || "").toLowerCase()
	const payoutComplete =
		completedStepIds.has("payout") ||
		statusIncludesAny(scholarshipStatus, ["payout completed", "paid out", "paid", "released"])

	const completionByStepId = {
		account: true,
		[applyStepId]: true,
		document_uploading: completedStepIds.has("document_uploading"),
		admin_review: completedStepIds.has("admin_review"),
		interview: completedStepIds.has("interview"),
		application_review: completedStepIds.has("application_review"),
		final_screening: completedStepIds.has("final_screening"),
		request_materials: hasRequestedMaterials,
		download_materials: hasDownloadedMaterials,
		signing_materials: signingComplete,
		payout: payoutComplete,
	}

	let foundCurrentStep = false
	const steps = stepsDefinition.map((step) => {
		const isComplete = completionByStepId[step.id] === true
		let state = "upcoming"

		if (isComplete) {
			state = "complete"
		} else if (!foundCurrentStep) {
			state = step.id === "signing_materials" && signingAttention ? "attention" : "current"
			foundCurrentStep = true
		}

		return {
			...step,
			state,
			detail: buildTrackingDetail(step.id, {
				isValidated,
				scholarshipName,
				semesterTag: scholarship.semesterTag,
				documentCheck,
				requestedMaterials,
				downloadedMaterials,
				hasApprovedMaterials,
				hasPendingMaterialApproval,
				hasDownloadedMaterials,
				signingComplete,
				signingAttention,
				payoutComplete,
				state,
				isKwspFlow,
			}),
		}
	})

	const currentStep =
		steps.find((step) => step.state === "attention") ||
		steps.find((step) => step.state === "current") ||
		steps[steps.length - 1] ||
		null

	let canAdminCompleteCurrentStep = false
	let adminCompletionReason = ""

	if (!currentStep) {
		adminCompletionReason = "No tracking step is available for this scholarship."
	} else if (currentStep.owner !== "admin") {
		adminCompletionReason =
			currentStep.owner === "student"
				? "This step must be completed by the student."
				: currentStep.id === "signing_materials" && signingAttention
					? "Resolve the non-compliant SOE first in Materials Checking."
					: "This step depends on student downloads or materials checking."
	} else if (currentStep.id === "document_uploading" && documentCheck?.ok !== true) {
		adminCompletionReason = "Student must complete the required document uploads first."
	} else {
		canAdminCompleteCurrentStep = true
	}

	return {
		isKwspFlow,
		scholarshipName,
		tracking,
		steps,
		currentStep,
		highlightedStepId: currentStep?.id || "",
		currentStepLabel: currentStep?.label || "Tracking",
		currentStepOwnerLabel: currentStep ? toOwnerLabel(currentStep.owner) : "Office",
		hasRequestedMaterials,
		hasApprovedMaterials,
		hasPendingMaterialApproval,
		hasDownloadedMaterials,
		signingComplete,
		signingAttention,
		payoutComplete,
		requestedMaterials,
		approvedMaterials,
		pendingMaterials,
		downloadedMaterials,
		canAdminCompleteCurrentStep,
		adminCompletionReason,
		canRequestMaterials:
			steps.find((step) => step.id === "request_materials")?.state !== "upcoming",
	}
}

export function getScholarshipTrackingStatusLabel(progress = null) {
	if (!progress) return "Applied"
	if (progress.signingAttention) return "Non-Compliant"
	if (progress.signingComplete) return "Signed"
	if (progress.hasDownloadedMaterials) return "For Signing"
	if (progress.hasApprovedMaterials) return "Approved"
	if (progress.hasPendingMaterialApproval) return "Pending Material Approval"
	if (progress.hasRequestedMaterials) return "Materials Requested"
	if (progress.currentStep?.id === "document_uploading") return "Uploading of Document"
	if (progress.currentStep?.id === "admin_review") return "Admin Review"
	if (progress.currentStep?.id === "interview") return "Interview"
	if (progress.currentStep?.id === "application_review") return "Application Review"
	if (progress.currentStep?.id === "final_screening") return "Final Screening"
	if (progress.currentStep?.id === "request_materials") return "Approved"
	return "Applied"
}
