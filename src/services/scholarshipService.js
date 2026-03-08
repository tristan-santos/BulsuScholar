const SCHOLARSHIP_TYPE = {
	KUYA_WIN: "kuya_win",
	TINA_PANCHO: "tina_pancho",
	MORISSON: "morisson",
	OTHER: "other",
}

const SCHOLARSHIP_CATALOG = [
	{
		name: "Cong. Tina Pancho",
		providerType: SCHOLARSHIP_TYPE.TINA_PANCHO,
		minGwa: 2,
		requiresFullDocs: false,
		isFastTrack: true,
	},
	{
		name: "Morisson",
		providerType: SCHOLARSHIP_TYPE.MORISSON,
		minGwa: 2.25,
		requiresFullDocs: false,
		isFastTrack: true,
	},
	{
		name: "Kuya Win Scholarship Program",
		providerType: SCHOLARSHIP_TYPE.KUYA_WIN,
		minGwa: 1.75,
		requiresFullDocs: true,
		isFastTrack: false,
	},
	{
		name: "Other",
		providerType: SCHOLARSHIP_TYPE.OTHER,
		minGwa: 2.25,
		requiresFullDocs: true,
		isFastTrack: false,
	},
]

export const MAX_SCHOLARSHIP_SAVES = 3

export function getScholarshipCatalog() {
	return SCHOLARSHIP_CATALOG
}

export function toScholarshipProviderType(provider = "") {
	const normalized = provider.toLowerCase().trim()
	if (normalized.includes("kuya win")) return SCHOLARSHIP_TYPE.KUYA_WIN
	if (normalized.includes("tina pancho")) return SCHOLARSHIP_TYPE.TINA_PANCHO
	if (normalized.includes("morisson") || normalized.includes("morrison")) {
		return SCHOLARSHIP_TYPE.MORISSON
	}
	return SCHOLARSHIP_TYPE.OTHER
}

export function getScholarshipPolicy(provider = "") {
	const providerType = toScholarshipProviderType(provider)
	return (
		SCHOLARSHIP_CATALOG.find((item) => item.providerType === providerType) ||
		SCHOLARSHIP_CATALOG[SCHOLARSHIP_CATALOG.length - 1]
	)
}

export function getCurrentAcademicYear(date = new Date()) {
	const year = date.getFullYear()
	const month = date.getMonth() + 1
	if (month >= 7) {
		return `${year}-${year + 1}`
	}
	return `${year - 1}-${year}`
}

export function getCurrentSemesterTag(date = new Date()) {
	const month = date.getMonth() + 1
	const semester = month >= 7 ? "1ST" : "2ND"
	return `${getCurrentAcademicYear(date)}-${semester}`
}

export function buildScholarshipRecord({
	name,
	provider,
	type = "Scholarship",
	mode = "saved",
	documentUrls = {},
	semesterTag = getCurrentSemesterTag(),
}) {
	const displayName = (name || provider || "Scholarship").trim()
	const providerName = (provider || name || "Other").trim()
	const policy = getScholarshipPolicy(providerName)
	const isApply = mode === "applied"
	const nowIso = new Date().toISOString()

	return {
		id: `sch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
		name: displayName,
		provider: providerName,
		type,
		providerType: policy.providerType,
		status:
			policy.providerType === SCHOLARSHIP_TYPE.KUYA_WIN
				? "Application Submitted"
				: isApply
					? "Applied"
					: "Saved",
		isLocked: false,
		isFastTrack: policy.isFastTrack,
		minGwa: policy.minGwa,
		requiresFullDocs: policy.requiresFullDocs,
		academicYear: getCurrentAcademicYear(),
		semesterTag,
		appliedAt: nowIso,
		documentUrls,
	}
}

export function normalizeScholarshipRecord(raw = {}, index = 0) {
	const provider = (raw.provider || raw.name || "Other").trim()
	const policy = getScholarshipPolicy(provider)
	return {
		id: raw.id || `legacy_sch_${index}_${provider.replace(/\s+/g, "_").toLowerCase()}`,
		name: raw.name || provider || "Scholarship",
		provider,
		type: raw.type || "Scholarship",
		providerType: raw.providerType || policy.providerType,
		status:
			raw.status ||
			(policy.providerType === SCHOLARSHIP_TYPE.KUYA_WIN
				? "Application Submitted"
				: "Saved"),
		isLocked: raw.isLocked === true,
		isFastTrack: typeof raw.isFastTrack === "boolean" ? raw.isFastTrack : policy.isFastTrack,
		minGwa:
			typeof raw.minGwa === "number" ? raw.minGwa : policy.minGwa,
		requiresFullDocs:
			typeof raw.requiresFullDocs === "boolean"
				? raw.requiresFullDocs
				: policy.requiresFullDocs,
		academicYear: raw.academicYear || getCurrentAcademicYear(),
		semesterTag: raw.semesterTag || getCurrentSemesterTag(),
		appliedAt: raw.appliedAt || raw.date || new Date().toISOString(),
		documentUrls: raw.documentUrls || {},
	}
}

export function normalizeScholarshipList(list = []) {
	if (!Array.isArray(list)) return []
	return list.map((entry, index) => normalizeScholarshipRecord(entry, index))
}

function getFirstValidDocument(student = {}, keys = []) {
	for (const key of keys) {
		const value = student?.[key]
		if (value?.url) return value
	}
	return null
}

export function getDocumentUrlsForStudent(student = {}) {
	const cor = getFirstValidDocument(student, ["corFile", "corDocument", "cor"])
	const cog = getFirstValidDocument(student, ["cogFile", "cogDocument", "cog"])
	const schoolId = getFirstValidDocument(student, [
		"schoolIdFile",
		"studentIdFile",
		"validIdFile",
		"idFile",
	])

	return {
		cor: cor?.url || "",
		cog: cog?.url || "",
		schoolId: schoolId?.url || "",
	}
}

export function validateScholarshipDocuments(student = {}, provider = "") {
	const policy = getScholarshipPolicy(provider)
	const semesterTag = getCurrentSemesterTag()
	const missing = []
	const expired = []

	const cor = getFirstValidDocument(student, ["corFile", "corDocument", "cor"])
	const cog = getFirstValidDocument(student, ["cogFile", "cogDocument", "cog"])
	const schoolId = getFirstValidDocument(student, [
		"schoolIdFile",
		"studentIdFile",
		"validIdFile",
		"idFile",
	])

	if (!cor?.url) {
		missing.push("COR")
	} else if (cor.semesterTag && cor.semesterTag !== semesterTag) {
		expired.push("COR")
	}

	if (policy.requiresFullDocs) {
		if (!cog?.url) {
			missing.push("COG")
		} else if (cog.semesterTag && cog.semesterTag !== semesterTag) {
			expired.push("COG")
		}

		if (!schoolId?.url) {
			missing.push("School ID/Valid ID")
		}
	}

	return {
		ok: missing.length === 0 && expired.length === 0,
		missing,
		expired,
		semesterTag,
	}
}

export function isGwaEligible(gwaValue, provider = "") {
	const minGwa = getScholarshipPolicy(provider).minGwa
	const gwa = Number.parseFloat(gwaValue)
	if (Number.isNaN(gwa)) {
		return { eligible: false, minGwa }
	}
	return { eligible: gwa <= minGwa, minGwa }
}

export function shouldRequireSecondScholarshipGwaCheck(scholarships = []) {
	return Array.isArray(scholarships) && scholarships.length >= 1
}

export function shouldWarnMultipleScholarships(scholarships = []) {
	if (!Array.isArray(scholarships)) return false
	if (scholarships.length < 2) return false
	return !scholarships.some((item) => item.isLocked === true)
}

export function shouldWarnZeroScholarships(scholarships = []) {
	return !Array.isArray(scholarships) || scholarships.length === 0
}

export function getSoeStatusForScholarship(scholarship = {}) {
	const providerType = scholarship.providerType || toScholarshipProviderType(scholarship.provider)
	if (providerType === SCHOLARSHIP_TYPE.KUYA_WIN) {
		return "Pending"
	}
	if (
		providerType === SCHOLARSHIP_TYPE.TINA_PANCHO ||
		providerType === SCHOLARSHIP_TYPE.MORISSON
	) {
		return "Issued"
	}
	return "Pending"
}

export function withCurrentSemesterTag(filePayload = null) {
	if (!filePayload) return null
	return {
		...filePayload,
		semesterTag: filePayload.semesterTag || getCurrentSemesterTag(),
	}
}

export { SCHOLARSHIP_TYPE }
