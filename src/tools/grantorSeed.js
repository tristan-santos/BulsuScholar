import { getApp, getApps, initializeApp } from "firebase/app"
import { getAuth, onAuthStateChanged } from "firebase/auth"
import {
	Timestamp,
	collection,
	doc,
	getDoc,
	getDocs,
	getFirestore,
	query,
	writeBatch,
	where,
	setDoc,
	deleteDoc,
} from "firebase/firestore"
import { encryptPasswordAES256 } from "../services/authService"
import {
	GRANTOR_SUBCOLLECTIONS,
	getGrantorAnnouncementsCollection,
	getGrantorPortalDoc,
	getGrantorScholarsCollection,
	getGrantorSubcollection,
} from "../services/grantorService"
import {
	getCurrentAcademicYear,
	getCurrentSemesterTag,
} from "../services/scholarshipService"

const SEED_SOURCE = "grantor-seed-html"
const LAST_BATCH_STORAGE_KEY = "bulsuscholar_grantor_seed_last_batch"
const DEFAULT_PASSWORD = "Grantor@123"
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
	authState: document.querySelector("#grantorAuthState"),
	projectState: document.querySelector("#grantorProjectState"),
	profileCount: document.querySelector("#grantorProfileCount"),
	scholarCount: document.querySelector("#grantorScholarCount"),
	applicationCount: document.querySelector("#grantorApplicationCount"),
	announcementCount: document.querySelector("#grantorAnnouncementCount"),
	refreshBtn: document.querySelector("#grantorRefreshBtn"),
	previewBtn: document.querySelector("#grantorPreviewBtn"),
	seedBtn: document.querySelector("#grantorSeedBtn"),
	deleteLastBtn: document.querySelector("#grantorDeleteLastBtn"),
	deleteAllBtn: document.querySelector("#grantorDeleteAllBtn"),
	statusBanner: document.querySelector("#grantorStatusBanner"),
	activityLog: document.querySelector("#grantorActivityLog"),
	previewTableBody: document.querySelector("#grantorPreviewTableBody"),
}

const state = {
	app: null,
	auth: null,
	db: null,
	currentUser: null,
	profiles: [],
	portals: [],
	students: [],
	existingScholars: new Set(), // To track global duplicates
	lastBatchId: localStorage.getItem(LAST_BATCH_STORAGE_KEY) || "",
	isBusy: false,
}

function daysAgo(days = 0) {
	const date = new Date()
	date.setDate(date.getDate() - days)
	return Timestamp.fromDate(date)
}

function buildFullName(raw = {}) {
	return [raw.fname, raw.mname, raw.lname].filter(Boolean).join(" ").trim() || "Scholar"
}

const CITIES = ["Malolos", "Guiguinto", "Bulakan", "Paombong", "Plaridel", "Hagonoy"]

const GRANTOR_BLUEPRINTS = [
	{
		id: "grantor_tina",
		providerName: "Cong. Tina Pancho",
		providerType: "tina_pancho",
		scholarshipName: "Cong. Tina Pancho",
		email: "grantor.tina@seed.bulsuscholar.local",
		organization: "Cong. Tina Pancho Scholarship Desk",
		announcement: {
			id: "opening_tina",
			title: "Cong. Tina scholarship applications are now open",
			subtitle: "Fast-track intake for BulSU scholars",
			description: "Cong. Tina Pancho is opening a new scholarship application cycle for currently enrolled BulSU students who need tuition and academic support for the incoming term.",
			applicationWindow: "March 18, 2026 to April 12, 2026",
			createdDaysAgo: 4,
		},
	},
	{
		id: "grantor_kuya_win",
		providerName: "Kuya Win Scholarship Program",
		providerType: "kuya_win",
		scholarshipName: "Kuya Win Scholarship Program",
		email: "grantor.kuya.win@seed.bulsuscholar.local",
		organization: "Kuya Win Scholarship Office",
		announcement: {
			id: "opening_kuya_win",
			title: "Kuya Win scholarship screening schedule is open",
			subtitle: "Complete documents and prepare for review stages",
			description: "The Kuya Win Scholarship Program is opening a new intake for BulSU students who can complete the required academic and identity documents for the current term.",
			applicationWindow: "March 22, 2026 to April 26, 2026",
			createdDaysAgo: 3,
		},
	},
	{
		id: "grantor_morisson",
		providerName: "Morisson",
		providerType: "morisson",
		scholarshipName: "Morisson",
		email: "grantor.morisson@seed.bulsuscholar.local",
		organization: "Morisson Foundation",
		announcement: {
			id: "opening_morisson",
			title: "Morisson Educational Grant - Summer Term",
			subtitle: "Financial assistance for academic excellence",
			description: "The Morisson Foundation is accepting new applicants for the summer term. Priority is given to high-performing students in technical courses.",
			applicationWindow: "April 1, 2026 to April 30, 2026",
			createdDaysAgo: 2,
		},
	},
]

function generateFallbackStudent(index) {
	const firstNames = ["James", "Maria", "John", "Elizabeth", "Robert", "Patricia", "Michael", "Jennifer"]
	const lastNames = ["Dela Cruz", "Santos", "Reyes", "Pascual", "Bautista", "Garcia"]
	const fname = firstNames[index % firstNames.length]
	const lname = lastNames[(index + 3) % lastNames.length]
	const studentNumber = `2024${2000 + index}`
	return {
		id: `fallback_${index}`,
		studentNumber,
		fname,
		mname: "M.",
		lname,
		fullName: `${fname} M. ${lname}`,
		email: `${fname.toLowerCase()}.${lname.toLowerCase()}@fallback.seed`,
		cpNumber: `0917${1000000 + index}`,
		course: "BSIT",
		yearLevel: String((index % 4) + 1),
		city: CITIES[index % CITIES.length],
		province: "Bulacan",
	}
}

function stableHash(value = "") {
	let hash = 0
	const source = String(value || "")
	for (let index = 0; index < source.length; index += 1) {
		hash = (hash * 31 + source.charCodeAt(index)) >>> 0
	}
	return hash
}

function selectStudentsForGrantor(grantorId = "", count = 10) {
	const sourceStudents =
		state.students.length > 0
			? state.students
			: Array.from({ length: Math.max(count * 3, 30) }, (_, index) =>
					generateFallbackStudent(index),
				)
	const grantor = GRANTOR_BLUEPRINTS.find((entry) => entry.id === grantorId)
	const eligibleStudents = sourceStudents.filter((student) => {
		if (!grantor) return true
		const scholarships = Array.isArray(student.scholarships) ? student.scholarships : []
		return scholarships.some((entry) => entry?.providerType === grantor.providerType)
	})
	const pool = eligibleStudents.length > 0 ? eligibleStudents : sourceStudents

	return pool
		.slice()
		.sort((left, right) => {
			const leftKey = stableHash(
				`${grantorId}::${left.studentnumber || left.studentNumber || left.id || left.cpNumber || ""}`,
			)
			const rightKey = stableHash(
				`${grantorId}::${right.studentnumber || right.studentNumber || right.id || right.cpNumber || ""}`,
			)
			if (leftKey !== rightKey) return leftKey - rightKey
			return String(left.studentnumber || left.studentNumber || left.id || "").localeCompare(
				String(right.studentnumber || right.studentNumber || right.id || ""),
			)
		})
		.slice(0, count)
}

function mapStudentToScholar(student, grantor, index, batchId) {
	const cpNumber = student.cpNumber || student.contactNumber || `0917${1000000 + index}`
	const createdAt = daysAgo(120 + index)
	const archived = index % 10 === 0
	const archivedAt = archived ? daysAgo(5) : null

	return {
		studentId: student.studentNumber || student.studentId || "N/A",
		fname: student.fname || "",
		mname: student.mname || "",
		lname: student.lname || "",
		fullName: student.fullName || buildFullName(student),
		email: student.email || `${cpNumber}@bulsu.seed`,
		cpNumber,
		houseNumber: student.houseNumber || "",
		street: student.street || "Main Street",
		city: student.city || CITIES[index % CITIES.length],
		province: student.province || "Bulacan",
		postalCode: student.postalCode || "3000",
		course: student.course || "BSIT",
		yearLevel: String(student.year || student.yearLevel || (index % 4) + 1),
		scholarshipTitle: grantor.scholarshipName,
		status: archived ? "Archived" : "Active",
		notes: "Aligned with system student record.",
		archived,
		archivedAt,
		restoredAt: null,
		grantorId: grantor.id,
		grantorName: grantor.providerName,
		sourceFile: null,
		seedSource: SEED_SOURCE,
		seedBatchId: batchId,
		createdAt,
		updatedAt: archivedAt || createdAt,
	}
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
	dom.refreshBtn.disabled = nextBusy
	dom.previewBtn.disabled = nextBusy
	dom.seedBtn.disabled = nextBusy
	dom.deleteLastBtn.disabled = nextBusy || !state.lastBatchId
	dom.deleteAllBtn.disabled = nextBusy
}

async function loadLiveData() {
	setBusy(true)
	setStatus("Refreshing system data...", "ok")
	try {
		const [providersSnapshot, portalsSnapshot, studentsSnapshot] = await Promise.all([
			getDocs(query(collection(state.db, "providers"), where("seedSource", "==", SEED_SOURCE))),
			getDocs(collection(state.db, "grantorPortals")),
			getDocs(collection(state.db, "students"))
		])

		state.profiles = providersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }))
		state.portals = portalsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }))
		state.students = studentsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }))

		state.existingScholars = new Set()
		let scholarTotal = 0
		let appTotal = 0
		let announcementTotal = 0

		for (const portal of state.portals) {
			const [sSnap, aSnap, nSnap] = await Promise.all([
				getDocs(collection(doc(state.db, "grantorPortals", portal.id), "scholars")),
				getDocs(collection(doc(state.db, "grantorPortals", portal.id), "applications")),
				getDocs(collection(doc(state.db, "grantorPortals", portal.id), "announcements"))
			])
			scholarTotal += sSnap.size
			appTotal += aSnap.size
			announcementTotal += nSnap.size

			sSnap.docs.forEach(d => {
				const data = d.data()
				if (data.cpNumber) state.existingScholars.add(`${portal.id}_${data.cpNumber}`)
			})
		}

		dom.profileCount.textContent = state.profiles.length
		dom.scholarCount.textContent = scholarTotal
		dom.applicationCount.textContent = appTotal
		dom.announcementCount.textContent = announcementTotal

		appendLog(`Found ${state.students.length} students, ${state.profiles.length} profiles.`)
		setStatus("Grantor seed state refreshed.", "ok")
		renderPreview()
	} catch (error) {
		console.error(error)
		appendLog(`Load failed: ${error.message}`)
		setStatus(`Load failed: ${error.message}`, "danger")
	} finally {
		setBusy(false)
	}
}

function renderPreview() {
	const previewScholars = []
	GRANTOR_BLUEPRINTS.forEach(bp => {
		const students = selectStudentsForGrantor(bp.id, 3)
		students.forEach((s, i) => {
			const payload = mapStudentToScholar(s, bp, i, "preview")
			previewScholars.push({ ...payload, grantorName: bp.providerName })
		})
	})

	dom.previewTableBody.innerHTML = previewScholars.map(s => {
		const exists = state.existingScholars.has(`${s.grantorId}_${s.cpNumber}`)
		return `
			<tr style="${exists ? 'opacity: 0.5; background: #fef2f2;' : ''}">
				<td><code>${s.cpNumber}</code></td>
				<td><strong>${s.fullName}</strong> ${exists ? '<span style="color: #b91c1c; font-size: 10px;">(EXISTS)</span>' : ''}</td>
				<td><span class="seed-pill seed-pill--request">${s.status}</span></td>
				<td>${new Date(s.updatedAt.toMillis()).toLocaleDateString()}</td>
				<td>${s.grantorName}</td>
			</tr>
		`
	}).join("")
}

async function seedGrantorData() {
	setBusy(true)
	setStatus("Seeding grantor data (ignoring duplicates)...", "ok")
	const batchId = `grantor-seed-${Date.now()}`
	let seeded = 0
	let skipped = 0
	
	try {
		for (const bp of GRANTOR_BLUEPRINTS) {
			const batch = writeBatch(state.db)
			
			// Provider/Portal roots (updates if exists)
			const encryptedPassword = await encryptPasswordAES256(DEFAULT_PASSWORD)
			batch.set(doc(state.db, "providers", bp.id), {
				providerId: bp.id,
				providerName: bp.providerName,
				providerType: bp.providerType,
				organization: bp.organization,
				email: bp.email,
				password: encryptedPassword,
				role: "provider",
				status: "Active",
				createdAt: daysAgo(365),
				updatedAt: Timestamp.now(),
				seedSource: SEED_SOURCE,
				seedBatchId: batchId,
			})
			
			batch.set(doc(state.db, "grantorPortals", bp.id), {
				grantorId: bp.id,
				providerName: bp.providerName,
				organization: bp.organization,
				updatedAt: Timestamp.now(),
				seedSource: SEED_SOURCE,
				seedBatchId: batchId
			})

			// Scholars
			const scholarStudents = selectStudentsForGrantor(bp.id, 10)
			scholarStudents.forEach((student, i) => {
				const payload = mapStudentToScholar(student, bp, i, batchId)
				if (state.existingScholars.has(`${bp.id}_${payload.cpNumber}`)) {
					skipped++
					return
				}
				const ref = doc(collection(doc(state.db, "grantorPortals", bp.id), "scholars"), `scholar_${bp.id}_${payload.cpNumber}`)
				batch.set(ref, payload)
				seeded++
			})

			// Announcement
			const annRef = doc(collection(doc(state.db, "grantorPortals", bp.id), "announcements"), bp.announcement.id)
			batch.set(annRef, { ...bp.announcement, status: "Open", createdAt: daysAgo(1), updatedAt: Timestamp.now(), seedSource: SEED_SOURCE, seedBatchId: batchId })

			await batch.commit()
		}

		state.lastBatchId = batchId
		localStorage.setItem(LAST_BATCH_STORAGE_KEY, batchId)
		setStatus(`Seeded ${seeded}, Skipped ${skipped} duplicates.`, "ok")
		await loadLiveData()
	} catch (error) {
		console.error(error)
		appendLog(`Seed failed: ${error.message}`)
		setStatus(`Seed failed: ${error.message}`, "danger")
	} finally {
		setBusy(false)
	}
}

async function deleteGrantorData(mode = "last") {
	setBusy(true)
	setStatus(mode === "last" ? "Deleting latest grantor batch..." : "Deleting all seeded grantor data...", "warning")
	
	try {
		const providerIds = GRANTOR_BLUEPRINTS.map(bp => bp.id)
		for (const pid of providerIds) {
			const batch = writeBatch(state.db)
			const subs = ["scholars", "applications", "announcements"]
			for (const sub of subs) {
				const q = mode === "last" 
					? query(collection(doc(state.db, "grantorPortals", pid), sub), where("seedBatchId", "==", state.lastBatchId))
					: query(collection(doc(state.db, "grantorPortals", pid), sub), where("seedSource", "==", SEED_SOURCE))
				const snap = await getDocs(q)
				snap.forEach(d => batch.delete(d.ref))
			}
			if (mode === "all") {
				batch.delete(doc(state.db, "providers", pid))
				batch.delete(doc(state.db, "grantorPortals", pid))
			}
			await batch.commit()
		}
		if (mode === "last") {
			state.lastBatchId = ""
			localStorage.removeItem(LAST_BATCH_STORAGE_KEY)
		}
		appendLog(`Deleted ${mode} grantor seed data.`)
		await loadLiveData()
	} catch (error) {
		console.error(error)
		appendLog(`Delete failed: ${error.message}`)
		setStatus(`Delete failed: ${error.message}`, "danger")
	} finally {
		setBusy(false)
	}
}

async function initializeSeeder() {
	state.app = initializeApp(firebaseConfig)
	state.db = getFirestore(state.app)
	state.auth = getAuth(state.app)

	dom.projectState.textContent = `Project: ${firebaseConfig.projectId}`
	onAuthStateChanged(state.auth, (user) => {
		state.currentUser = user
		dom.authState.textContent = user?.email ? `Signed in: ${user.email}` : "No active auth session"
	})

	dom.refreshBtn.addEventListener("click", () => loadLiveData())
	dom.previewBtn.addEventListener("click", () => renderPreview())
	dom.seedBtn.addEventListener("click", () => seedGrantorData())
	dom.deleteLastBtn.addEventListener("click", () => deleteGrantorData("last"))
	dom.deleteAllBtn.addEventListener("click", () => deleteGrantorData("all"))

	await loadLiveData()
}

initializeSeeder()
