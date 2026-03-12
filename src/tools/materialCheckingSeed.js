import { initializeApp } from "firebase/app"
import { getAuth, onAuthStateChanged } from "firebase/auth"
import {
	Timestamp,
	collection,
	doc,
	getDocs,
	getFirestore,
	writeBatch,
} from "firebase/firestore"
import { normalizeMaterialRequest } from "../services/materialRequestService"
import {
	generateFallbackSoeRequestNumber,
	resolveSoeRequestNumber,
} from "../services/soeRequestNumberService"
import {
	getCurrentAcademicYear,
	getCurrentSemesterTag,
	toScholarshipProviderType,
} from "../services/scholarshipService"

const SEED_SOURCE = "material-checking-seed-html"
const LAST_BATCH_STORAGE_KEY = "bulsuscholar_material_checking_seed_last_batch"
const MAX_PREVIEW_ROWS = 12
const REQUIRED_FIREBASE_FIELDS = ["apiKey", "authDomain", "projectId", "messagingSenderId", "appId"]

const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
	measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const dom = {
	authState: document.querySelector("#authState"),
	projectState: document.querySelector("#projectState"),
	studentsCount: document.querySelector("#studentsCount"),
	candidateCount: document.querySelector("#candidateCount"),
	requestBackedCount: document.querySelector("#requestBackedCount"),
	downloadCount: document.querySelector("#downloadCount"),
	seedCount: document.querySelector("#seedCount"),
	refreshBtn: document.querySelector("#refreshBtn"),
	previewBtn: document.querySelector("#previewBtn"),
	seedBtn: document.querySelector("#seedBtn"),
	deleteLastBtn: document.querySelector("#deleteLastBtn"),
	deleteAllBtn: document.querySelector("#deleteAllBtn"),
	statusBanner: document.querySelector("#statusBanner"),
	activityLog: document.querySelector("#activityLog"),
	previewTableBody: document.querySelector("#previewTableBody"),
}

const state = {
	app: null,
	auth: null,
	db: null,
	currentUser: null,
	students: [],
	requests: [],
	downloads: [],
	candidates: [],
	previewRows: [],
	lastBatchId: localStorage.getItem(LAST_BATCH_STORAGE_KEY) || "",
	isBusy: false,
}

function appendLog(message) {
	const timestamp = new Date().toLocaleString("en-PH")
	const nextLine = `[${timestamp}] ${message}`
	dom.activityLog.textContent = `${nextLine}\n${dom.activityLog.textContent}`.trim()
}

function setStatus(message, tone = "ok") {
	dom.statusBanner.textContent = message
	dom.statusBanner.dataset.tone = tone
}

function setBusy(nextBusy) {
	state.isBusy = nextBusy
	const disabled = nextBusy
	dom.refreshBtn.disabled = disabled
	dom.previewBtn.disabled = disabled
	dom.seedBtn.disabled = disabled
	dom.deleteLastBtn.disabled = disabled || !state.lastBatchId
	dom.deleteAllBtn.disabled = disabled
}

function formatDisplayDate(value) {
	if (!value) return "-"
	const date = value instanceof Date ? value : value?.toDate ? value.toDate() : new Date(value)
	if (Number.isNaN(date.getTime())) return "-"
	return date.toLocaleString("en-PH", {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	})
}

function escapeHtml(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;")
}

function getStudentNumber(student = {}) {
	return String(student.studentNumber || student.studentId || student.id || "").trim() || "UNKNOWN"
}

function getStudentFullName(student = {}) {
	const composed = [student.fname, student.mname, student.lname].filter(Boolean).join(" ").trim()
	return composed || student.fullName || student.name || "Student"
}

function getStudentRestrictionState(student = {}) {
	const scholarships = Array.isArray(student.scholarships) ? student.scholarships : []
	const accountAccess =
		student?.restrictions?.accountAccess === true ||
		student?.isBlocked === true ||
		String(student?.accountStatus || "").toLowerCase() === "blocked"
	const scholarshipEligibility =
		student?.restrictions?.scholarshipEligibility === true ||
		student?.soeComplianceBlocked === true ||
		scholarships.every((entry) => entry?.adminBlocked === true)
	return { accountAccess, scholarshipEligibility }
}

function normalizeScholarshipEntry(entry = {}, index = 0) {
	const name = String(entry.name || entry.provider || "Scholarship").trim() || "Scholarship"
	const providerName = String(entry.provider || entry.name || name).trim() || name
	const requestNumber = String(entry.requestNumber || entry.id || "").trim()
	const scholarshipId = requestNumber || `seed-scholarship-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
	return {
		id: scholarshipId,
		requestNumber,
		name,
		provider: providerName,
		providerType: entry.providerType || toScholarshipProviderType(providerName),
		academicYear: entry.academicYear || getCurrentAcademicYear(),
		semesterTag: entry.semesterTag || getCurrentSemesterTag(),
		adminBlocked: entry.adminBlocked === true,
		raw: entry,
	}
}

function normalizeStudent(student = {}) {
	const scholarships = (Array.isArray(student.scholarships) ? student.scholarships : [])
		.map((entry, index) => normalizeScholarshipEntry(entry, index))
		.filter((entry) => entry.adminBlocked !== true)
	return {
		...student,
		id: student.id,
		fullName: getStudentFullName(student),
		studentNumber: getStudentNumber(student),
		scholarships,
	}
}

function isEligibleStudent(student = {}) {
	if (!student?.id) return false
	if (student.archived === true) return false
	const restrictionState = getStudentRestrictionState(student)
	if (restrictionState.accountAccess || restrictionState.scholarshipEligibility) {
		return false
	}
	return student.scholarships.length > 0
}

function getRequestScholarshipKey(request = {}) {
	return String(request.scholarshipId || request.requestNumber || request.scholarshipName || "").trim()
}

function composeLinkKey(studentId = "", reference = "") {
	const normalizedStudentId = String(studentId || "").trim()
	const normalizedReference = String(reference || "").trim()
	if (!normalizedStudentId || !normalizedReference) return ""
	return `${normalizedStudentId}__${normalizedReference}`
}

function toEpochMs(value) {
	if (!value) return 0
	if (value instanceof Date) return value.getTime()
	if (typeof value?.toDate === "function") return value.toDate().getTime()
	const nextDate = new Date(value)
	return Number.isNaN(nextDate.getTime()) ? 0 : nextDate.getTime()
}

function buildDownloadLinkCountMap(downloads = []) {
	const counts = new Map()
	downloads.forEach((download) => {
		[
			composeLinkKey(download.studentId, download.requestRecordId),
			composeLinkKey(download.studentId, download.requestNumber),
			composeLinkKey(download.studentId, download.scholarshipId),
		]
			.filter(Boolean)
			.forEach((key) => counts.set(key, (counts.get(key) || 0) + 1))
	})
	return counts
}

function buildApprovedRequestMap(requests = [], studentMap = new Map()) {
	const approvedRequestMap = new Map()
	requests.forEach((rawRequest) => {
		if (!rawRequest?.studentId) return
		const student = studentMap.get(rawRequest.studentId)
		if (!student) return
		const normalizedRequest = normalizeMaterialRequest(rawRequest)
		const soeMaterial = normalizedRequest.materials?.soe
		const isApproved =
			soeMaterial?.requested === true &&
			(soeMaterial.status === "approved" || normalizedRequest.reviewState === "signed")
		if (!isApproved) return
		const scholarshipKey = getRequestScholarshipKey(normalizedRequest)
		if (!scholarshipKey) return
		const existing = approvedRequestMap.get(composeLinkKey(student.id, scholarshipKey))
		const requestDate = toEpochMs(normalizedRequest.timestamp || normalizedRequest.createdAt)
		const existingDate = toEpochMs(existing?.timestamp || existing?.createdAt)
		if (!existing || requestDate >= existingDate) {
			approvedRequestMap.set(composeLinkKey(student.id, scholarshipKey), normalizedRequest)
		}
	})
	return approvedRequestMap
}

function buildExpenseItems(student = {}, absoluteIndex = 0) {
	if (Array.isArray(student.soeExpenseItems) && student.soeExpenseItems.length > 0) {
		return student.soeExpenseItems.slice(0, 8)
	}
	return [
		{ label: "Tuition", amount: 4500 + (absoluteIndex % 6) * 180 },
		{ label: "Miscellaneous", amount: 1200 + (absoluteIndex % 5) * 90 },
		{ label: "Laboratory", amount: 780 + (absoluteIndex % 4) * 70 },
	]
}

function buildCandidates(students = [], requests = [], downloads = []) {
	const normalizedStudents = students.map((student) => normalizeStudent(student))
	const eligibleStudents = normalizedStudents.filter((student) => isEligibleStudent(student))
	const studentMap = new Map(eligibleStudents.map((student) => [student.id, student]))
	const approvedRequestMap = buildApprovedRequestMap(requests, studentMap)
	const downloadLinkCounts = buildDownloadLinkCountMap(downloads)
	const candidates = []

	eligibleStudents.forEach((student) => {
		student.scholarships.forEach((scholarship) => {
			const scholarshipKeys = [scholarship.id, scholarship.requestNumber, scholarship.name]
				.map((value) => String(value || "").trim())
				.filter(Boolean)
			const matchingRequest =
				scholarshipKeys
					.map((key) => approvedRequestMap.get(composeLinkKey(student.id, key)))
					.find(Boolean) || null
			const linkKeys = [
				composeLinkKey(student.id, matchingRequest?.id),
				composeLinkKey(student.id, matchingRequest?.requestNumber),
				composeLinkKey(student.id, scholarship.id),
				composeLinkKey(student.id, scholarship.requestNumber),
			].filter(Boolean)
			const existingDownloads = linkKeys.reduce(
				(max, key) => Math.max(max, downloadLinkCounts.get(key) || 0),
				0,
			)
			candidates.push({
				student,
				scholarship,
				request: matchingRequest,
				existingDownloads,
				sourceType: matchingRequest ? "request_backed" : "student_fallback",
			})
		})
	})

	candidates.sort((left, right) => {
		const leftScore = left.request ? 0 : 1
		const rightScore = right.request ? 0 : 1
		if (leftScore !== rightScore) return leftScore - rightScore
		if (left.existingDownloads !== right.existingDownloads) {
			return left.existingDownloads - right.existingDownloads
		}
		return left.student.fullName.localeCompare(right.student.fullName)
	})

	return {
		candidates,
		stats: {
			studentsLoaded: normalizedStudents.length,
			eligiblePairs: candidates.length,
			requestBackedPairs: candidates.filter((candidate) => candidate.request).length,
			downloadsLoaded: downloads.length,
		},
	}
}

function buildSeedRecord(candidate, cycleIndex, absoluteIndex, batchId) {
	const student = candidate.student
	const scholarship = candidate.scholarship
	const requestNumber =
		cycleIndex === 0
			? resolveSoeRequestNumber(
					candidate.request?.requestNumber || scholarship.requestNumber || scholarship.id || "",
					student.studentNumber,
				)
			: generateFallbackSoeRequestNumber(student.studentNumber)
	const downloadedAtDate = new Date()
	downloadedAtDate.setDate(downloadedAtDate.getDate() - (absoluteIndex % 30))
	downloadedAtDate.setHours(8 + (absoluteIndex % 9), 10 + ((absoluteIndex * 7) % 40), 0, 0)
	const createdAtDate = new Date(downloadedAtDate.getTime() - 1000 * 60 * (12 + (absoluteIndex % 40)))
	const studentSnapshot = {
		studentId: student.id,
		studentNumber: student.studentNumber,
		fullName: student.fullName,
		fname: student.fname || "",
		mname: student.mname || "",
		lname: student.lname || "",
		email: student.email || "",
		course: student.course || "",
		year: student.year || student.yearLevel || "",
		section: student.section || "",
	}

	return {
		requestRecordId: cycleIndex === 0 ? candidate.request?.id || "" : "",
		requestNumber,
		studentId: student.id,
		studentNumber: student.studentNumber,
		studentName: student.fullName,
		scholarshipId: scholarship.id || candidate.request?.scholarshipId || "",
		scholarshipName: scholarship.name,
		providerType: scholarship.providerType || toScholarshipProviderType(scholarship.provider),
		status: "Pending",
		reviewState: "incoming",
		downloadedAt: Timestamp.fromDate(downloadedAtDate),
		createdAt: Timestamp.fromDate(createdAtDate),
		updatedAt: Timestamp.fromDate(downloadedAtDate),
		studentSnapshot,
		soeSnapshot: {
			requestNumber,
			semesterTag:
				scholarship.semesterTag ||
				candidate.request?.semesterTag ||
				getCurrentSemesterTag(downloadedAtDate),
			academicYear:
				scholarship.academicYear ||
				candidate.request?.academicYear ||
				getCurrentAcademicYear(downloadedAtDate),
			expenseItems: buildExpenseItems(student, absoluteIndex),
		},
		seedSource: SEED_SOURCE,
		seedBatchId: batchId,
		seedVersion: 1,
		seedCycle: cycleIndex + 1,
		seedCandidateType: candidate.sourceType,
	}
}

function buildSeedPlan(candidates = [], count = 50, batchId = "preview") {
	if (candidates.length === 0) return []
	const rows = []
	let cycleIndex = 0
	while (rows.length < count) {
		for (let candidateIndex = 0; candidateIndex < candidates.length && rows.length < count; candidateIndex += 1) {
			rows.push(buildSeedRecord(candidates[candidateIndex], cycleIndex, rows.length, batchId))
		}
		cycleIndex += 1
	}
	return rows
}

function clampSeedCount(rawValue) {
	const parsed = Number(rawValue)
	if (!Number.isFinite(parsed)) return 50
	return Math.min(200, Math.max(1, Math.floor(parsed)))
}

function renderStats(stats) {
	dom.studentsCount.textContent = String(stats.studentsLoaded)
	dom.candidateCount.textContent = String(stats.eligiblePairs)
	dom.requestBackedCount.textContent = String(stats.requestBackedPairs)
	dom.downloadCount.textContent = String(stats.downloadsLoaded)
}

function renderPreview(rows = []) {
	if (rows.length === 0) {
		dom.previewTableBody.innerHTML = '<tr><td colspan="7">No preview rows yet.</td></tr>'
		return
	}

	dom.previewTableBody.innerHTML = rows
		.slice(0, MAX_PREVIEW_ROWS)
		.map((row) => {
			const providerLabel = String(row.providerType || "")
				.replaceAll("_", " ")
				.replace(/\b\w/g, (char) => char.toUpperCase())
			const sourceClass =
				row.seedCandidateType === "request_backed" ? "seed-pill seed-pill--request" : "seed-pill seed-pill--fallback"
			const sourceLabel =
				row.seedCandidateType === "request_backed" ? "Request-backed" : "Student fallback"
			return `
				<tr>
					<td>${escapeHtml(row.requestNumber)}</td>
					<td>${escapeHtml(row.studentNumber)}</td>
					<td>${escapeHtml(row.studentName)}</td>
					<td>${escapeHtml(row.scholarshipName)}</td>
					<td>${escapeHtml(providerLabel)}</td>
					<td><span class="${sourceClass}">${escapeHtml(sourceLabel)}</span></td>
					<td>${escapeHtml(formatDisplayDate(row.downloadedAt))}</td>
				</tr>
			`
		})
		.join("")
}

function refreshDeleteButtons() {
	dom.deleteLastBtn.disabled = state.isBusy || !state.lastBatchId
}

async function loadLiveData() {
	setBusy(true)
	setStatus("Loading students, material requests, and current checking rows...", "ok")
	try {
		const [studentsSnapshot, requestsSnapshot, downloadsSnapshot] = await Promise.all([
			getDocs(collection(state.db, "students")),
			getDocs(collection(state.db, "soeRequests")),
			getDocs(collection(state.db, "soeDownloads")),
		])

		state.students = studentsSnapshot.docs.map((snapshot) => ({
			id: snapshot.id,
			...(snapshot.data() || {}),
		}))
		state.requests = requestsSnapshot.docs.map((snapshot) => ({
			id: snapshot.id,
			...(snapshot.data() || {}),
		}))
		state.downloads = downloadsSnapshot.docs.map((snapshot) => ({
			id: snapshot.id,
			...(snapshot.data() || {}),
		}))

		const { candidates, stats } = buildCandidates(state.students, state.requests, state.downloads)
		state.candidates = candidates
		renderStats(stats)
		appendLog(
			`Loaded ${stats.studentsLoaded} students, ${state.requests.length} material requests, ${stats.downloadsLoaded} current checking rows, and ${stats.eligiblePairs} eligible student-scholarship candidates.`,
		)
		setStatus(
			stats.eligiblePairs > 0
				? `Loaded ${stats.eligiblePairs} eligible candidates. Build a preview or seed a batch into Materials Checking.`
				: "No eligible student-scholarship candidates were found. Check the students collection first.",
			stats.eligiblePairs > 0 ? "ok" : "warning",
		)
		buildPreview()
	} catch (error) {
		console.error(error)
		appendLog(`Failed to load live data: ${error.message}`)
		setStatus(`Failed to load live data: ${error.message}`, "danger")
	} finally {
		setBusy(false)
		refreshDeleteButtons()
	}
}

function buildPreview() {
	const seedCount = clampSeedCount(dom.seedCount.value)
	dom.seedCount.value = String(seedCount)
	state.previewRows = buildSeedPlan(state.candidates, seedCount, "preview")
	renderPreview(state.previewRows)
	if (state.previewRows.length === 0) {
		appendLog("Preview build skipped because there are no eligible candidates.")
		return
	}

	const requestBackedRows = state.previewRows.filter((row) => row.seedCandidateType === "request_backed").length
	const fallbackRows = state.previewRows.length - requestBackedRows
	appendLog(
		`Prepared preview for ${state.previewRows.length} rows: ${requestBackedRows} request-backed and ${fallbackRows} student-fallback rows.`,
	)
	setStatus(
		`Preview ready for ${state.previewRows.length} seed rows. ${requestBackedRows} reuse real approved SOE requests.`,
		"ok",
	)
}

async function seedRows() {
	if (state.candidates.length === 0) {
		setStatus("Cannot seed because there are no eligible live candidates.", "warning")
		appendLog("Seed aborted: no eligible candidates available.")
		return
	}

	const seedCount = clampSeedCount(dom.seedCount.value)
	const batchId = `material-seed-${Date.now()}`
	const rows = buildSeedPlan(state.candidates, seedCount, batchId)
	if (rows.length === 0) {
		setStatus("No rows were generated for the current seed request.", "warning")
		appendLog("Seed aborted: generated row set was empty.")
		return
	}

	setBusy(true)
	setStatus(`Writing ${rows.length} rows into soeDownloads...`, "ok")
	try {
		const batch = writeBatch(state.db)
		rows.forEach((row) => {
			const rowRef = doc(collection(state.db, "soeDownloads"))
			batch.set(rowRef, row)
		})
		await batch.commit()
		state.lastBatchId = batchId
		localStorage.setItem(LAST_BATCH_STORAGE_KEY, batchId)
		appendLog(`Seeded ${rows.length} Materials Checking rows into soeDownloads under batch ${batchId}.`)
		setStatus(`Successfully seeded ${rows.length} Materials Checking rows.`, "ok")
		await loadLiveData()
	} catch (error) {
		console.error(error)
		appendLog(`Seed failed: ${error.message}`)
		setStatus(`Seed failed: ${error.message}`, "danger")
		setBusy(false)
		refreshDeleteButtons()
	}
}

async function deleteSeededRows(mode = "last") {
	const matchingRows =
		mode === "last"
			? state.downloads.filter(
					(download) =>
						download.seedSource === SEED_SOURCE && download.seedBatchId === state.lastBatchId,
				)
			: state.downloads.filter((download) => download.seedSource === SEED_SOURCE)

	if (matchingRows.length === 0) {
		setStatus(
			mode === "last"
				? "No rows were found for the latest seed batch."
				: "No rows created by this seeder were found.",
			"warning",
		)
		appendLog(`Delete skipped: no ${mode === "last" ? "latest-batch" : "seeded"} rows found.`)
		return
	}

	setBusy(true)
	setStatus(
		mode === "last"
			? `Deleting ${matchingRows.length} rows from the latest seed batch...`
			: `Deleting ${matchingRows.length} rows created by the seeder...`,
		"warning",
	)
	try {
		for (let index = 0; index < matchingRows.length; index += 400) {
			const chunk = matchingRows.slice(index, index + 400)
			const batch = writeBatch(state.db)
			chunk.forEach((row) => {
				batch.delete(doc(state.db, "soeDownloads", row.id))
			})
			await batch.commit()
		}

		if (mode === "last") {
			appendLog(`Deleted ${matchingRows.length} rows from latest batch ${state.lastBatchId}.`)
			state.lastBatchId = ""
			localStorage.removeItem(LAST_BATCH_STORAGE_KEY)
		} else {
			appendLog(`Deleted ${matchingRows.length} rows created by ${SEED_SOURCE}.`)
			state.lastBatchId = ""
			localStorage.removeItem(LAST_BATCH_STORAGE_KEY)
		}

		setStatus(
			mode === "last"
				? `Deleted ${matchingRows.length} rows from the latest seed batch.`
				: `Deleted ${matchingRows.length} seeded rows.`,
			"ok",
		)
		await loadLiveData()
	} catch (error) {
		console.error(error)
		appendLog(`Delete failed: ${error.message}`)
		setStatus(`Delete failed: ${error.message}`, "danger")
		setBusy(false)
		refreshDeleteButtons()
	}
}

async function initializeSeeder() {
	const missingFields = REQUIRED_FIREBASE_FIELDS.filter((field) => {
		const value = firebaseConfig[field]
		return value == null || value === ""
	})
	if (missingFields.length > 0) {
		setStatus("Firebase configuration is incomplete. Check the required VITE_FIREBASE_* environment variables.", "danger")
		appendLog(`Initialization failed because required Firebase fields are missing: ${missingFields.join(", ")}.`)
		dom.projectState.textContent = "Firebase config missing"
		dom.authState.textContent = "Unavailable"
		dom.refreshBtn.disabled = true
		dom.previewBtn.disabled = true
		dom.seedBtn.disabled = true
		dom.deleteLastBtn.disabled = true
		dom.deleteAllBtn.disabled = true
		return
	}

	state.app = initializeApp(firebaseConfig)
	state.db = getFirestore(state.app)
	state.auth = getAuth(state.app)

	dom.projectState.textContent = `Project: ${firebaseConfig.projectId}`
	onAuthStateChanged(state.auth, (user) => {
		state.currentUser = user
		dom.authState.textContent = user?.email ? `Signed in: ${user.email}` : "No active auth session"
		appendLog(user?.email ? `Auth session detected for ${user.email}.` : "No shared auth session detected. Firestore rules may still allow access.")
	})

	dom.refreshBtn.addEventListener("click", () => {
		loadLiveData()
	})
	dom.previewBtn.addEventListener("click", () => {
		buildPreview()
	})
	dom.seedBtn.addEventListener("click", () => {
		seedRows()
	})
	dom.deleteLastBtn.addEventListener("click", () => {
		deleteSeededRows("last")
	})
	dom.deleteAllBtn.addEventListener("click", () => {
		deleteSeededRows("all")
	})

	refreshDeleteButtons()
	await loadLiveData()
}

initializeSeeder()
