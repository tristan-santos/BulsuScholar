import { collection, collectionGroup, doc, getDocs } from "firebase/firestore"
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
	2: "#0ea5e9",
	3: "#b45309",
	4: "#7c3aed",
}

export function toJsDate(value) {
	if (!value) return null
	if (value?.toDate) return value.toDate()
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
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
		houseNumber: raw.houseNumber || "",
		street: raw.street || raw.address || "",
		city: raw.city || "",
		province: raw.province || "",
		postalCode: raw.postalCode || "",
		course: raw.course || "",
		yearLevel: normalizeYearLevel(raw.yearLevel || raw.year || raw.yearLevelLabel),
		scholarshipTitle: raw.scholarshipTitle || raw.scholarshipName || raw.programName || "",
		status: raw.archived === true ? "Archived" : raw.status || "Active",
		notes: raw.notes || "",
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
	return {
		id: raw.id || id,
		title: raw.title || "Announcement",
		subtitle: raw.subtitle || "",
		description: raw.description || "",
		content: raw.content || raw.description || "",
		previewText: raw.previewText || raw.description || "",
		applicationWindow: raw.applicationWindow || "",
		grantorId: raw.grantorId || "",
		grantorName: raw.grantorName || raw.providerLabel || "",
		providerType: raw.providerType || policy.providerType,
		providerLabel: raw.providerLabel || raw.grantorName || "",
		status: raw.status || "Open",
		archived: raw.archived === true,
		endDate: raw.endDate || raw.scheduleEnd || null,
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
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
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
		["houseNumber", "houseNumber"],
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
			student?.houseNumber,
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
			scholar?.houseNumber,
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
