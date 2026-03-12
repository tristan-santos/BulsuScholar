export const MATERIAL_REQUEST_TYPES = {
	soe: {
		key: "soe",
		label: "SOE",
		requestLabel: "Request SOE",
		requestAgainLabel: "Request SOE Again",
		requestedLabel: "SOE Requested",
		approvedLabel: "SOE Approved",
		downloadLabel: "Download SOE",
		downloadedLabel: "SOE Downloaded",
	},
	application_form: {
		key: "application_form",
		label: "Application Form",
		requestLabel: "Request Application Form",
		requestAgainLabel: "Request Application Form Again",
		requestedLabel: "Application Form Requested",
		approvedLabel: "Application Form Approved",
		downloadLabel: "Download Application Form",
		downloadedLabel: "Application Form Downloaded",
	},
}

const MATERIAL_REQUEST_KEYS = Object.keys(MATERIAL_REQUEST_TYPES)

function normalizeMaterialStatus(status = "", fallbackReviewState = "") {
	const normalizedStatus = String(status || "").toLowerCase()
	const normalizedReview = String(fallbackReviewState || "").toLowerCase()

	if (
		normalizedStatus === "approved" ||
		normalizedStatus === "signed" ||
		normalizedReview === "signed"
	) {
		return "approved"
	}

	if (
		normalizedStatus === "rejected" ||
		normalizedStatus === "non_compliant" ||
		normalizedStatus === "non-compliant" ||
		normalizedReview === "non_compliant"
	) {
		return "rejected"
	}

	if (
		normalizedStatus === "pending" ||
		normalizedStatus === "incoming" ||
		normalizedStatus === "requested" ||
		normalizedReview === "incoming" ||
		normalizedReview === "requested"
	) {
		return "pending"
	}

	return "none"
}

function normalizeMaterialEntry(entry = null, legacy = {}) {
	if (!entry && !legacy.requested) {
		return {
			requested: false,
			status: "none",
			requestedAt: null,
			approvedAt: null,
			rejectedAt: null,
			downloadedAt: null,
		}
	}

	const source = entry || {}
	const status = normalizeMaterialStatus(source.status, legacy.reviewState)
	const requested =
		source.requested === true ||
		status !== "none" ||
		source.requestedAt != null ||
		source.approvedAt != null ||
		source.rejectedAt != null ||
		source.downloadedAt != null ||
		legacy.requested === true

	return {
		requested,
		status: requested ? status || "pending" : "none",
		requestedAt: source.requestedAt || legacy.requestedAt || null,
		approvedAt: source.approvedAt || null,
		rejectedAt: source.rejectedAt || null,
		downloadedAt: source.downloadedAt || legacy.downloadedAt || null,
	}
}

function buildLegacySoeMaterial(request = {}) {
	const hasLegacyRequest =
		Boolean(request.requestNumber) ||
		Boolean(request.scholarshipId) ||
		Boolean(request.scholarshipName) ||
		Boolean(request.timestamp) ||
		Boolean(request.createdAt)

	if (!hasLegacyRequest) {
		return null
	}

	return normalizeMaterialEntry(null, {
		requested: true,
		reviewState: request.reviewState || request.status,
		requestedAt: request.timestamp || request.createdAt || request.dateRequested || null,
		downloadedAt: request.downloadedAt || request.downloadedOn || null,
	})
}

export function toMaterialLabel(materialKey = "") {
	return MATERIAL_REQUEST_TYPES[materialKey]?.label || materialKey || "Material"
}

export function getMaterialRequestType(materialKey = "") {
	return MATERIAL_REQUEST_TYPES[materialKey] || {
		key: materialKey,
		label: materialKey || "Material",
		requestLabel: "Request Material",
		requestAgainLabel: "Request Material Again",
		requestedLabel: "Material Requested",
		approvedLabel: "Material Approved",
		downloadLabel: "Download Material",
		downloadedLabel: "Material Downloaded",
	}
}

export function normalizeMaterialRequest(request = {}) {
	const rawMaterials =
		request?.materials && typeof request.materials === "object" ? request.materials : {}
	const legacySoeMaterial = buildLegacySoeMaterial(request)
	const materials = {}

	MATERIAL_REQUEST_KEYS.forEach((materialKey) => {
		if (rawMaterials[materialKey]) {
			materials[materialKey] = normalizeMaterialEntry(rawMaterials[materialKey])
			return
		}

		if (materialKey === "soe" && legacySoeMaterial) {
			materials[materialKey] = legacySoeMaterial
			return
		}

		materials[materialKey] = normalizeMaterialEntry()
	})

	const requestedMaterialKeys = MATERIAL_REQUEST_KEYS.filter(
		(materialKey) => materials[materialKey].requested,
	)
	const pendingMaterialKeys = requestedMaterialKeys.filter(
		(materialKey) => materials[materialKey].status === "pending",
	)
	const approvedMaterialKeys = requestedMaterialKeys.filter(
		(materialKey) => materials[materialKey].status === "approved",
	)
	const rejectedMaterialKeys = requestedMaterialKeys.filter(
		(materialKey) => materials[materialKey].status === "rejected",
	)

	const requestedMaterialLabels = requestedMaterialKeys.map((materialKey) =>
		toMaterialLabel(materialKey),
	)
	const pendingMaterialLabels = pendingMaterialKeys.map((materialKey) =>
		toMaterialLabel(materialKey),
	)
	const approvedMaterialLabels = approvedMaterialKeys.map((materialKey) =>
		toMaterialLabel(materialKey),
	)
	const rejectedMaterialLabels = rejectedMaterialKeys.map((materialKey) =>
		toMaterialLabel(materialKey),
	)

	let reviewState = String(request.reviewState || "").toLowerCase()
	if (pendingMaterialKeys.length > 0) {
		reviewState = "incoming"
	} else if (approvedMaterialKeys.length > 0) {
		reviewState = "signed"
	} else if (rejectedMaterialKeys.length > 0) {
		reviewState = "non_compliant"
	} else if (!reviewState || reviewState === "requested") {
		reviewState = "incoming"
	}

	const status =
		request.status ||
		(pendingMaterialKeys.length > 0
			? "Pending"
			: approvedMaterialKeys.length > 0
				? "Approved"
				: rejectedMaterialKeys.length > 0
					? "Non-Compliant"
					: "Pending")

	return {
		...request,
		materials,
		requestedMaterialKeys,
		requestedMaterialLabels,
		requestedMaterialsSummary: requestedMaterialLabels.join(", ") || "-",
		pendingMaterialKeys,
		pendingMaterialLabels,
		approvedMaterialKeys,
		approvedMaterialLabels,
		rejectedMaterialKeys,
		rejectedMaterialLabels,
		reviewState,
		status,
		hasPendingMaterials: pendingMaterialKeys.length > 0,
		hasApprovedMaterials: approvedMaterialKeys.length > 0,
		hasRejectedMaterials: rejectedMaterialKeys.length > 0,
	}
}

export function getMaterialEntry(request = {}, materialKey = "") {
	return normalizeMaterialRequest(request).materials[materialKey] || normalizeMaterialEntry()
}

export function getMaterialRequestState(request = {}, materialKey = "") {
	return getMaterialEntry(request, materialKey).status
}

export function isMaterialApproved(request = {}, materialKey = "") {
	return getMaterialRequestState(request, materialKey) === "approved"
}

export function isMaterialPending(request = {}, materialKey = "") {
	return getMaterialRequestState(request, materialKey) === "pending"
}

export function isMaterialRejected(request = {}, materialKey = "") {
	return getMaterialRequestState(request, materialKey) === "rejected"
}

export function getMaterialRequestDocumentId(studentId = "", scholarshipId = "") {
	return `${String(studentId || "").trim()}__${String(scholarshipId || "").trim()}`
}
