import { collection, collectionGroup, doc, getDocs } from "./supabaseDataService"
import { getScholarshipPolicy } from "./scholarshipService"

export const GRANTOR_PORTAL_COLLECTION = "grantorPortals"
export const GRANTOR_SUBCOLLECTIONS = {
	scholars: "scholars",
	applications: "applications",
	announcements: "announcements",
}

export const GRANTOR_ACCEPTED_UPLOAD_EXTENSIONS = [
	".csv",
	".xls",
	".xlsx",
	".xlsb",
	".xlsc",
	".xlsm",
]

export const GRANTOR_ACCEPT_ATTR = GRANTOR_ACCEPTED_UPLOAD_EXTENSIONS.join(",")

const YEAR_LEVEL_COLORS = {
	1: "#15803d",
	2: "#0f766e",
	3: "#16a34a",
	4: "#65a30d",
}

export function toJsDate(value) {
	if (!value) return null
	if (value?.toDate) return value.toDate()
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

function toEndOfDay(date) {
	if (!date) return null
	const nextDate = new Date(date)
	nextDate.setHours(23, 59, 59, 999)
	return nextDate
}

function parseApplicationWindowEnd(applicationWindow = "") {
	const parts = String(applicationWindow || "")
		.split(/\s+-\s+/)
		.map((part) => part.trim())
		.filter(Boolean)
	if (parts.length < 2) return null
	const endDate = toJsDate(parts[parts.length - 1])
	return toEndOfDay(endDate)
}

export function getAnnouncementEndDate(item = {}) {
	const explicitEndDate = toJsDate(item.endDate || item.scheduleEnd)
	if (explicitEndDate) return explicitEndDate
	return parseApplicationWindowEnd(item.applicationWindow)
}

export function isAnnouncementExpired(item = {}, now = new Date()) {
	const endDate = getAnnouncementEndDate(item)
	return Boolean(endDate && endDate.getTime() < now.getTime())
}

export function isAnnouncementArchived(item = {}, now = new Date()) {
	const normalizedStatus = String(item.status || "").toLowerCase()
	return (
		item.archived === true ||
		["archived", "closed", "expired", "ended"].some((keyword) => normalizedStatus.includes(keyword)) ||
		isAnnouncementExpired(item, now)
	)
}

export function getGrantorPortalDoc(db, grantorId = "") {
	return doc(db, GRANTOR_PORTAL_COLLECTION, String(grantorId || "").trim())
}

export function getGrantorSubcollection(db, grantorId = "", key = "") {
	return collection(getGrantorPortalDoc(db, grantorId), key)
}

export function getGrantorScholarsCollection(db, grantorId = "") {
	return getGrantorSubcollection(db, grantorId, GRANTOR_SUBCOLLECTIONS.scholars)
}

export function getGrantorAnnouncementsCollection(db, grantorId = "") {
	return getGrantorSubcollection(db, grantorId, GRANTOR_SUBCOLLECTIONS.announcements)
}

export function getGrantorApplicationsCollection(db, grantorId = "") {
	return getGrantorSubcollection(db, grantorId, GRANTOR_SUBCOLLECTIONS.applications)
}

export function toGrantorDisplayName(profile = {}, grantorId = "") {
	return (
		profile?.providerName ||
		profile?.grantorName ||
		profile?.scholarshipName ||
		profile?.displayName ||
		profile?.name ||
		profile?.organization ||
		profile?.email ||
		grantorId ||
		"Grantor"
	)
}

function normalizeYearLevel(value = "") {
	const digits = String(value || "").replace(/\D/g, "")
	const year = digits ? digits[0] : "1"
	return ["1", "2", "3", "4"].includes(year) ? year : "1"
}

function buildFullName(raw = {}) {
	return (
		raw.fullName ||
		[raw.fname, raw.mname, raw.lname].filter(Boolean).join(" ").trim() ||
		"Scholar"
	)
}

export function normalizeGrantorScholar(raw = {}, id = "") {
	return {
		id: raw.id || id,
		studentId: raw.studentId || raw.studentnumber || raw.studentNumber || "",
		fname: raw.fname || "",
		mname: raw.mname || "",
		lname: raw.lname || "",
		fullName: buildFullName(raw),
		email: raw.email || "",
		cpNumber: raw.cpNumber || raw.contactNumber || raw.phoneNumber || "",
		street: raw.street || raw.address || "",
		city: raw.city || "",
		province: raw.province || "",
		postalCode: raw.postalCode || "",
		course: raw.course || "",
		yearLevel: normalizeYearLevel(raw.yearLevel || raw.year || raw.yearLevelLabel),
		scholarshipTitle: raw.scholarshipTitle || raw.scholarshipName || raw.programName || "",
		status: raw.archived === true ? "Archived" : raw.status || "Active",
		notes: raw.notes || "",
		customColumns:
			raw.customColumns && typeof raw.customColumns === "object" && !Array.isArray(raw.customColumns)
				? raw.customColumns
				: {},
		archived: raw.archived === true,
		grantorId: raw.grantorId || "",
		grantorName: raw.grantorName || raw.providerName || raw.organization || "",
		providerType: raw.providerType || "",
		createdAt: raw.createdAt || null,
		updatedAt: raw.updatedAt || null,
		archivedAt: raw.archivedAt || null,
		restoredAt: raw.restoredAt || null,
		sourceFile: raw.sourceFile || null,
	}
}

export function normalizeGrantorApplication(raw = {}, id = "") {
	return {
		id: raw.id || id,
		studentId: raw.studentId || raw.studentnumber || "",
		scholarshipId: raw.scholarshipId || "",
		applicationNumber: raw.applicationNumber || raw.requestNumber || raw.id || id,
		requestNumber: raw.requestNumber || raw.applicationNumber || raw.id || id,
		fname: raw.fname || "",
		mname: raw.mname || "",
		lname: raw.lname || "",
		fullName:
			raw.fullName ||
			[raw.fname, raw.mname, raw.lname].filter(Boolean).join(" ").trim() ||
			raw.studentName ||
			"Applicant",
		email: raw.email || "",
		cpNumber: raw.cpNumber || raw.contactNumber || raw.phoneNumber || "",
		scholarshipName: raw.scholarshipName || raw.scholarship || raw.programName || "",
		providerType: raw.providerType || "",
		providerLabel: raw.providerLabel || raw.provider || raw.providerType || "",
		status: raw.status || "Applied",
		appliedAt: raw.appliedAt || raw.applicationDate || raw.createdAt || null,
		documentUrls: raw.documentUrls || {},
		tracking: raw.tracking || null,
		createdAt: raw.createdAt || null,
		updatedAt: raw.updatedAt || null,
	}
}

export function normalizeGrantorAnnouncement(raw = {}, id = "") {
	const policy = getScholarshipPolicy(
		raw.providerType || raw.grantorName || raw.providerLabel || raw.title || id,
	)
	const archived = isAnnouncementArchived(raw)
	return {
		id: raw.id || id,
		title: raw.title || "Announcement",
		subtitle: raw.subtitle || "",
		description: raw.description || "",
		content: raw.content || raw.description || "",
		previewText: raw.previewText || raw.description || "",
		applicationWindow: raw.applicationWindow || "",
		applicationEnabled: raw.applicationEnabled === true,
		requiredDocuments: {
			cog: raw.requiredDocuments?.cog === true,
			cor: raw.requiredDocuments?.cor === true,
			applicationForm: raw.requiredDocuments?.applicationForm === true,
		},
		otherRequirements: Array.isArray(raw.otherRequirements)
			? raw.otherRequirements.map((item) => ({
					name: String(item?.name || "").trim(),
					fileType: String(item?.fileType || "pdf").toLowerCase() === "png" ? "png" : "pdf",
					uploadCount: Math.max(1, Number.parseInt(item?.uploadCount, 10) || 1),
				})).filter((item) => item.name)
			: [],
		minimumGrade:
			raw.minimumGrade !== undefined && raw.minimumGrade !== null && raw.minimumGrade !== ""
				? Number(raw.minimumGrade)
				: raw.minGwa !== undefined && raw.minGwa !== null && raw.minGwa !== ""
					? Number(raw.minGwa)
					: null,
		minGwa:
			raw.minGwa !== undefined && raw.minGwa !== null && raw.minGwa !== ""
				? Number(raw.minGwa)
				: raw.minimumGrade !== undefined && raw.minimumGrade !== null && raw.minimumGrade !== ""
					? Number(raw.minimumGrade)
					: null,
		grantorId: raw.grantorId || "",
		grantorName: raw.grantorName || raw.providerLabel || "",
		providerType: raw.providerType || policy.providerType,
		providerLabel: raw.providerLabel || raw.grantorName || "",
		profileImageUrl: raw.profileImageUrl || raw.authorImageUrl || "",
		authorImageUrl: raw.authorImageUrl || raw.profileImageUrl || "",
		imageUrl: raw.imageUrl || "",
		imageUrls: Array.isArray(raw.imageUrls) ? raw.imageUrls : raw.imageUrl ? [raw.imageUrl] : [],
		images: Array.isArray(raw.images) ? raw.images : [],
		archived,
		startDate: raw.startDate || raw.scheduleStart || null,
		endDate: raw.endDate || raw.scheduleEnd || null,
		scheduleEnd: raw.scheduleEnd || raw.endDate || null,
		status: archived ? "Archived" : raw.status || "Open",
		createdAt: raw.createdAt || null,
		updatedAt: raw.updatedAt || null,
	}
}

export function normalizeGrantorPortalSettings(raw = {}, grantorId = "") {
	const policy = getScholarshipPolicy(
		raw.providerType || raw.grantorName || raw.providerLabel || grantorId,
	)

	return {
		id: raw.id || grantorId,
		grantorId: raw.grantorId || grantorId,
		grantorName:
			raw.grantorName ||
			raw.providerLabel ||
			raw.providerName ||
			raw.scholarshipName ||
			grantorId ||
			"Grantor",
		providerType: raw.providerType || policy.providerType,
		applicationsBlocked: raw.applicationsBlocked === true,
		minimumGwa:
			raw.minimumGwa !== undefined && raw.minimumGwa !== null && raw.minimumGwa !== ""
				? Number(raw.minimumGwa)
				: raw.minGwa !== undefined && raw.minGwa !== null && raw.minGwa !== ""
					? Number(raw.minGwa)
					: null,
		minGwa:
			raw.minGwa !== undefined && raw.minGwa !== null && raw.minGwa !== ""
				? Number(raw.minGwa)
				: raw.minimumGwa !== undefined && raw.minimumGwa !== null && raw.minimumGwa !== ""
					? Number(raw.minimumGwa)
					: null,
		updatedAt: raw.updatedAt || null,
	}
}

function collectProfileKeywords(profile = {}) {
	return [
		profile?.providerName,
		profile?.grantorName,
		profile?.scholarshipName,
		profile?.providerType,
		profile?.displayName,
		profile?.name,
		profile?.organization,
		profile?.id,
	]
		.map((value) => String(value || "").trim().toLowerCase())
		.filter(Boolean)
}

export function matchesGrantorProfile(application = {}, profile = {}) {
	const keywords = collectProfileKeywords(profile)
	if (keywords.length === 0) return false
	const haystack = [
		application?.providerType,
		application?.providerLabel,
		application?.scholarshipName,
	]
		.map((value) => String(value || "").trim().toLowerCase())
		.filter(Boolean)
		.join(" ")

	return keywords.some((keyword) => haystack.includes(keyword))
}

function normalizeMatchValue(value = "") {
	return String(value || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

function normalizeIdentifier(value = "") {
	return normalizeMatchValue(value).replace(/\s+/g, "")
}

export function levenshteinSimilarity(leftValue = "", rightValue = "") {
	const left = normalizeMatchValue(leftValue)
	const right = normalizeMatchValue(rightValue)
	if (!left && !right) return 1
	if (!left || !right) return 0
	if (left === right) return 1

	const distances = Array.from({ length: right.length + 1 }, (_, index) => index)
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
		let diagonal = distances[0]
		distances[0] = leftIndex
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
			const above = distances[rightIndex]
			const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
			distances[rightIndex] = Math.min(
				distances[rightIndex] + 1,
				distances[rightIndex - 1] + 1,
				diagonal + substitutionCost,
			)
			diagonal = above
		}
	}

	return 1 - distances[right.length] / Math.max(left.length, right.length)
}

function tokenSortedValue(value = "") {
	return normalizeMatchValue(value).split(/\s+/).filter(Boolean).sort().join(" ")
}

function scholarFullName(raw = {}) {
	return raw.fullName || [raw.fname, raw.mname, raw.lname].filter(Boolean).join(" ")
}

function comparableSimilarity(left, right, normalizer = normalizeMatchValue) {
	const normalizedLeft = normalizer(left)
	const normalizedRight = normalizer(right)
	if (!normalizedLeft || !normalizedRight) return null
	return levenshteinSimilarity(normalizedLeft, normalizedRight)
}

export function evaluateScholarDuplicate(candidate = {}, existing = {}) {
	const candidateName = scholarFullName(candidate)
	const existingName = scholarFullName(existing)
	const directNameSimilarity = comparableSimilarity(candidateName, existingName) ?? 0
	const sortedNameSimilarity = comparableSimilarity(
		tokenSortedValue(candidateName),
		tokenSortedValue(existingName),
	) ?? 0
	const nameSimilarity = Math.max(directNameSimilarity, sortedNameSimilarity)
	const candidateStudentId = normalizeIdentifier(
		candidate.studentId || candidate.studentnumber || candidate.studentNumber,
	)
	const existingStudentId = normalizeIdentifier(
		existing.studentId || existing.studentnumber || existing.studentNumber,
	)
	const candidateEmail = normalizeIdentifier(candidate.email)
	const existingEmail = normalizeIdentifier(existing.email)
	const candidatePhone = String(candidate.cpNumber || candidate.contactNumber || "").replace(/\D/g, "")
	const existingPhone = String(existing.cpNumber || existing.contactNumber || "").replace(/\D/g, "")
	const exactStudentId = Boolean(candidateStudentId && candidateStudentId === existingStudentId)
	const exactEmail = Boolean(candidateEmail && candidateEmail === existingEmail)
	const exactPhone = Boolean(candidatePhone && candidatePhone === existingPhone)
	const fields = [
		{ label: "student ID", weight: 0.32, value: comparableSimilarity(candidateStudentId, existingStudentId, normalizeIdentifier) },
		{ label: "name", weight: 0.3, value: nameSimilarity || null },
		{ label: "email", weight: 0.1, value: comparableSimilarity(candidateEmail, existingEmail, normalizeIdentifier) },
		{ label: "contact number", weight: 0.08, value: comparableSimilarity(candidatePhone, existingPhone, normalizeIdentifier) },
		{ label: "course", weight: 0.08, value: comparableSimilarity(candidate.course, existing.course) },
		{ label: "year level", weight: 0.04, value: comparableSimilarity(candidate.yearLevel || candidate.year, existing.yearLevel || existing.year) },
		{ label: "city", weight: 0.04, value: comparableSimilarity(candidate.city, existing.city) },
		{ label: "province", weight: 0.04, value: comparableSimilarity(candidate.province, existing.province) },
	].filter((field) => field.value != null)
	const comparedWeight = fields.reduce((sum, field) => sum + field.weight, 0)
	const weightedScore = comparedWeight > 0
		? fields.reduce((sum, field) => sum + field.value * field.weight, 0) / comparedWeight
		: 0
	const strongIdentifierMatch = exactStudentId || ((exactEmail || exactPhone) && nameSimilarity >= 0.72)
	const isDuplicate = strongIdentifierMatch || (nameSimilarity >= 0.82 && weightedScore >= 0.84)
	const reasons = fields.filter((field) => field.value >= 0.9).map((field) => field.label)

	return {
		isDuplicate,
		score: weightedScore,
		nameSimilarity,
		reasons,
		exactStudentId,
		exactEmail,
		exactPhone,
	}
}

export function findScholarDuplicate(candidate = {}, existingRecords = [], options = {}) {
	const excludeId = String(options.excludeId || "")
	const excludeGrantorId = String(options.excludeGrantorId || "")
	let bestMatch = null
	for (const existing of existingRecords) {
		if (
			excludeId &&
			String(existing.id || "") === excludeId &&
			(!excludeGrantorId || String(existing.grantorId || "") === excludeGrantorId)
		) continue
		const evaluation = evaluateScholarDuplicate(candidate, existing)
		if (!evaluation.isDuplicate) continue
		if (!bestMatch || evaluation.score > bestMatch.score) {
			bestMatch = { ...evaluation, record: existing }
		}
	}
	return bestMatch
}

export async function getAllGrantorScholars(db) {
	const snapshot = await getDocs(collectionGroup(db, GRANTOR_SUBCOLLECTIONS.scholars))
	return snapshot.docs.map((row) => {
		const normalized = normalizeGrantorScholar(row.data() || {}, row.id)
		return {
			...normalized,
			grantorId: normalized.grantorId || row.ref.parent.parent?.id || "",
		}
	})
}

function normalizeMiddleInitial(value = "") {
	const normalized = normalizeMatchValue(value)
	return normalized ? normalized[0] : ""
}

function buildNormalizedFullName(raw = {}) {
	return normalizeMatchValue(
		raw.fullName || [raw.fname, raw.mname, raw.lname].filter(Boolean).join(" "),
	)
}

function matchNameParts(student = {}, scholar = {}) {
	const studentFirst = normalizeMatchValue(student.fname)
	const studentLast = normalizeMatchValue(student.lname)
	const scholarFirst = normalizeMatchValue(scholar.fname)
	const scholarLast = normalizeMatchValue(scholar.lname)
	const studentMiddle = normalizeMiddleInitial(student.mname)
	const scholarMiddle = normalizeMiddleInitial(scholar.mname)
	const studentFullName = buildNormalizedFullName(student)
	const scholarFullName = buildNormalizedFullName(scholar)

	if (studentFullName && scholarFullName && studentFullName === scholarFullName) {
		return true
	}

	if (!studentFirst || !studentLast || !scholarFirst || !scholarLast) {
		return false
	}

	if (studentFirst !== scholarFirst || studentLast !== scholarLast) {
		return false
	}

	if (!studentMiddle || !scholarMiddle) {
		return true
	}

	return studentMiddle === scholarMiddle
}

function matchAddress(student = {}, scholar = {}) {
	const comparableFieldPairs = [
		["street", "street"],
		["city", "city"],
		["province", "province"],
		["postalCode", "postalCode"],
	]

	let sharedFieldCount = 0

	for (const [studentKey, scholarKey] of comparableFieldPairs) {
		const studentValue = normalizeMatchValue(student?.[studentKey])
		const scholarValue = normalizeMatchValue(scholar?.[scholarKey])
		if (!studentValue || !scholarValue) continue
		sharedFieldCount += 1
		if (studentValue !== scholarValue) {
			return false
		}
	}

	if (sharedFieldCount > 0) {
		return true
	}

	const studentAddress = normalizeMatchValue(
		[
			student?.street,
			student?.city,
			student?.province,
			student?.postalCode,
		]
			.filter(Boolean)
			.join(" "),
	)
	const scholarAddress = normalizeMatchValue(
		[
			scholar?.street,
			scholar?.city,
			scholar?.province,
			scholar?.postalCode,
		]
			.filter(Boolean)
			.join(" "),
	)

	return Boolean(studentAddress && scholarAddress && studentAddress === scholarAddress)
}

export function matchesGrantorScholarToStudent(student = {}, scholar = {}) {
	return matchNameParts(student, scholar) && matchAddress(student, scholar)
}

export async function findMatchingGrantorScholars(db, student = {}) {
	const snapshot = await getDocs(collectionGroup(db, GRANTOR_SUBCOLLECTIONS.scholars))
	const matches = []
	const seenGrantors = new Set()

	snapshot.docs.forEach((row) => {
		const normalized = normalizeGrantorScholar(row.data() || {}, row.id)
		const grantorId = normalized.grantorId || row.ref.parent.parent?.id || ""
		const policy = getScholarshipPolicy(
			normalized.scholarshipTitle || normalized.grantorName || normalized.providerType || grantorId,
		)
		const match = {
			...normalized,
			grantorId,
			grantorName:
				normalized.grantorName || normalized.scholarshipTitle || grantorId || "Grantor",
			providerType: normalized.providerType || policy.providerType,
			scholarshipName:
				normalized.scholarshipTitle || normalized.grantorName || grantorId || "Scholarship",
			requiresFullDocs: policy.requiresFullDocs,
		}

		if (match.archived) return
		if (!matchesGrantorScholarToStudent(student, match)) return

		const dedupeKey = `${match.grantorId || "grantor"}__${match.providerType || "other"}`
		if (seenGrantors.has(dedupeKey)) return
		seenGrantors.add(dedupeKey)
		matches.push(match)
	})

	return matches.sort((left, right) =>
		String(left.grantorName || left.scholarshipName || "").localeCompare(
			String(right.grantorName || right.scholarshipName || ""),
		),
	)
}

export function buildGrantorYearDistribution(rows = []) {
	return ["1", "2", "3", "4"].map((yearLevel) => ({
		id: yearLevel,
		label: `Year ${yearLevel}`,
		value: rows.filter(
			(row) => normalizeYearLevel(row?.yearLevel || row?.year) === yearLevel,
		).length,
		color: YEAR_LEVEL_COLORS[yearLevel],
	}))
}

function startOfDay(date) {
	const next = new Date(date)
	next.setHours(0, 0, 0, 0)
	return next
}

function startOfWeek(date) {
	const next = startOfDay(date)
	const diff = (next.getDay() + 6) % 7
	next.setDate(next.getDate() - diff)
	return next
}

function startOfMonth(date) {
	return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfYear(date) {
	return new Date(date.getFullYear(), 0, 1)
}

function addDays(date, amount) {
	const next = new Date(date)
	next.setDate(next.getDate() + amount)
	return next
}

function addMonths(date, amount) {
	const next = new Date(date)
	next.setMonth(next.getMonth() + amount)
	return next
}

function addYears(date, amount) {
	const next = new Date(date)
	next.setFullYear(next.getFullYear() + amount)
	return next
}

function getTrendBuckets(range = "monthly", now = new Date()) {
	if (range === "daily") {
		const end = startOfDay(now)
		return Array.from({ length: 7 }).map((_, index) => {
			const start = addDays(end, index - 6)
			return {
				key: start.toISOString(),
				start,
				end: addDays(start, 1),
				label: start.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
			}
		})
	}

	if (range === "weekly") {
		const end = startOfWeek(now)
		return Array.from({ length: 8 }).map((_, index) => {
			const start = addDays(end, (index - 7) * 7)
			return {
				key: start.toISOString(),
				start,
				end: addDays(start, 7),
				label: start.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
			}
		})
	}

	if (range === "yearly") {
		const end = startOfYear(now)
		return Array.from({ length: 5 }).map((_, index) => {
			const start = addYears(end, index - 4)
			return {
				key: start.toISOString(),
				start,
				end: addYears(start, 1),
				label: String(start.getFullYear()),
			}
		})
	}

	const end = startOfMonth(now)
	return Array.from({ length: 6 }).map((_, index) => {
		const start = addMonths(end, index - 5)
		return {
			key: start.toISOString(),
			start,
			end: addMonths(start, 1),
			label: start.toLocaleDateString("en-PH", { month: "short" }),
		}
	})
}

function getScholarEvents(rows = []) {
	return rows
		.flatMap((row) => {
			const createdAt = toJsDate(row.createdAt || row.updatedAt)
			const archivedAt = toJsDate(row.archivedAt)
			const restoredAt = toJsDate(row.restoredAt)
			const events = []
			if (createdAt) events.push({ date: createdAt, delta: 1 })
			if (archivedAt) events.push({ date: archivedAt, delta: -1 })
			if (restoredAt) events.push({ date: restoredAt, delta: 1 })
			return events
		})
		.sort((a, b) => a.date.getTime() - b.date.getTime())
}

export function buildGrantorScholarTrend(rows = [], range = "monthly", now = new Date()) {
	const buckets = getTrendBuckets(range, now)
	if (buckets.length === 0) {
		return { labels: [], values: [] }
	}

	const events = getScholarEvents(rows)
	const firstBucketStart = buckets[0].start.getTime()
	let runningTotal = events
		.filter((event) => event.date.getTime() < firstBucketStart)
		.reduce((sum, event) => sum + event.delta, 0)

	const values = buckets.map((bucket) => {
		events.forEach((event) => {
			const eventTime = event.date.getTime()
			if (eventTime >= bucket.start.getTime() && eventTime < bucket.end.getTime()) {
				runningTotal += event.delta
			}
		})
		return Math.max(0, runningTotal)
	})

	return {
		labels: buckets.map((bucket) => bucket.label),
		values,
	}
}
