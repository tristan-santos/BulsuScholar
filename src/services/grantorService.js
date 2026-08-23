import { collection, collectionGroup, doc, getDocs } from "./supabaseDataService"
import { getScholarshipPolicy } from "./scholarshipService"

const PYTHON_BACKEND_API_URL = (
	import.meta.env.VITE_BACKEND_API_URL ||
	import.meta.env.VITE_DOCUMENT_SCAN_API_URL ||
	"https://bulsuscholar.onrender.com"
).replace(/\/$/, "")

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
		barangay: raw.barangay || "",
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
		scholarshipConflictWarning: raw.scholarshipConflictWarning === true,
		duplicateScholarshipWarning: raw.duplicateScholarshipWarning === true,
		duplicateScholarshipDetected: raw.duplicateScholarshipDetected === true,
		duplicateWarningType: raw.duplicateWarningType || "",
		duplicateMatchedGrantorId: raw.duplicateMatchedGrantorId || "",
		duplicateMatchedGrantorName: raw.duplicateMatchedGrantorName || "",
		duplicateMatchedScholarId: raw.duplicateMatchedScholarId || "",
		duplicateMatchedStudentId: raw.duplicateMatchedStudentId || "",
		duplicateMatchedStudentName: raw.duplicateMatchedStudentName || "",
		duplicateSimilarityScore: raw.duplicateSimilarityScore || "",
		duplicateReasons: Array.isArray(raw.duplicateReasons) ? raw.duplicateReasons : [],
		duplicateDetectedAt: raw.duplicateDetectedAt || null,
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
		grantorId: raw.grantorId || raw.grantor_id || "",
		grantorName: raw.grantorName || raw.providerLabel || raw.provider || "",
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
		announcementId: raw.announcementId || "",
		announcementSource: raw.announcementSource || "",
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
		scholarshipTitle: raw.scholarshipTitle || (raw.applicationEnabled === true ? raw.title || "" : ""),
		scholarshipKey: raw.scholarshipKey || "",
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
					fileType: ["png", "both"].includes(String(item?.fileType || "pdf").toLowerCase())
						? String(item?.fileType || "pdf").toLowerCase()
						: "pdf",
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
		grantorAccountArchived: raw.grantorAccountArchived === true,
		hiddenFromStudents: raw.hiddenFromStudents === true,
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

function _normalizeIdentifier(value = "") {
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

function _tokenSortedValue(value = "") {
	return normalizeMatchValue(value).split(/\s+/).filter(Boolean).sort().join(" ")
}

function _scholarFullName(raw = {}) {
	return raw.fullName || [raw.fname, raw.mname, raw.lname].filter(Boolean).join(" ")
}

function _comparableSimilarity(left, right, normalizer = normalizeMatchValue) {
	const normalizedLeft = normalizer(left)
	const normalizedRight = normalizer(right)
	if (!normalizedLeft || !normalizedRight) return null
	return levenshteinSimilarity(normalizedLeft, normalizedRight)
}

async function postGrantorAlgorithm(path, payload) {
	const response = await fetch(`${PYTHON_BACKEND_API_URL}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	})
	const data = await response.json().catch(() => ({}))
	if (!response.ok) {
		throw new Error(data?.detail || data?.error || `Grantor algorithm request failed: ${response.status}`)
	}
	return data
}

export async function evaluateScholarDuplicate(candidate = {}, existing = {}) {
	return postGrantorAlgorithm("/grantor/evaluate-scholar-duplicate", {
		candidate,
		existing,
	})
}

export async function findScholarDuplicate(candidate = {}, existingRecords = [], options = {}) {
	const data = await postGrantorAlgorithm("/grantor/find-scholar-duplicate", {
		candidate,
		existingRecords,
		options,
	})
	return data?.duplicate || null
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

function normalizeLookupValue(value = "") {
	return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function matchStudentId(student = {}, scholar = {}) {
	const studentId = normalizeLookupValue(student.studentnumber || student.studentId || student.id)
	const scholarId = normalizeLookupValue(scholar.studentId || scholar.studentnumber || scholar.studentNumber || scholar.id)
	return Boolean(studentId && scholarId && studentId === scholarId)
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
		["barangay", "barangay"],
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
			student?.barangay,
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
			scholar?.barangay,
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
	return matchStudentId(student, scholar) || (matchNameParts(student, scholar) && matchAddress(student, scholar))
}

export async function findMatchingGrantorScholars(db, student = {}) {
	const snapshot = await getDocs(collectionGroup(db, GRANTOR_SUBCOLLECTIONS.scholars))
	const scholars = snapshot.docs.map((row) => {
		const normalized = normalizeGrantorScholar(row.data() || {}, row.id)
		const grantorId = normalized.grantorId || row.ref.parent.parent?.id || ""
		return {
			...normalized,
			grantorId,
		}
	})
	const data = await postGrantorAlgorithm("/grantor/find-matching-scholars", {
		student,
		scholars,
	})
	const seenGrantors = new Set()
	const matches = []

	;(data?.matches || []).forEach((match) => {
		if (match.archived) return
		const policy = getScholarshipPolicy(
			match.scholarshipTitle || match.grantorName || match.providerType || match.grantorId,
		)
		const enrichedMatch = {
			...match,
			grantorName: match.grantorName || match.scholarshipTitle || match.grantorId || "Grantor",
			providerType: match.providerType || policy.providerType,
			scholarshipName: match.scholarshipTitle || match.grantorName || match.grantorId || "Scholarship",
			requiresFullDocs: policy.requiresFullDocs,
		}

		const dedupeKey = `${enrichedMatch.grantorId || "grantor"}__${enrichedMatch.providerType || "other"}`
		if (seenGrantors.has(dedupeKey)) return
		seenGrantors.add(dedupeKey)
		matches.push(enrichedMatch)
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
