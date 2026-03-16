import { initializeApp } from "firebase/app"
import { getAuth, onAuthStateChanged } from "firebase/auth"
import {
	Timestamp,
	collection,
	doc,
	getDocs,
	getFirestore,
	writeBatch,
	query,
	where,
} from "firebase/firestore"
import {
	getCurrentAcademicYear,
	getCurrentSemesterTag,
} from "../services/scholarshipService"

const SEED_SOURCE = "student-seed-html"
const LAST_BATCH_STORAGE_KEY = "bulsuscholar_student_seed_last_batch"
const DEFAULT_STUDENT_PASSWORD = "Student@123"
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
	authState: document.querySelector("#studentAuthState"),
	projectState: document.querySelector("#studentProjectState"),
	refreshBtn: document.querySelector("#studentRefreshBtn"),
	previewBtn: document.querySelector("#studentPreviewBtn"),
	seedBtn: document.querySelector("#studentSeedBtn"),
	deleteLastBtn: document.querySelector("#studentDeleteLastBtn"),
	deleteAllBtn: document.querySelector("#studentDeleteAllBtn"),
	statusBanner: document.querySelector("#studentStatusBanner"),
	activityLog: document.querySelector("#studentActivityLog"),
	previewTableBody: document.querySelector("#studentPreviewTableBody"),
}

const state = {
	app: null,
	auth: null,
	db: null,
	currentUser: null,
	existingStudents: [],
	lastBatchId: localStorage.getItem(LAST_BATCH_STORAGE_KEY) || "",
	isBusy: false,
}

const DETERMINISTIC_STUDENTS = [
	{ studentNumber: "20241000", fname: "Juan", lname: "Dela Cruz", email: "juan.delacruz@bulsu.seed", course: "BS Information Technology", year: "1" },
	{ studentNumber: "20241001", fname: "Maria", lname: "Santos", email: "maria.santos@bulsu.seed", course: "BS Computer Science", year: "2" },
	{ studentNumber: "20241002", fname: "Jose", lname: "Reyes", email: "jose.reyes@bulsu.seed", course: "BS Information Technology", year: "3" },
	{ studentNumber: "20241003", fname: "Ana", lname: "Pascual", email: "ana.pascual@bulsu.seed", course: "BS Education", year: "4" },
	{ studentNumber: "20241004", fname: "Pedro", lname: "Bautista", email: "pedro.bautista@bulsu.seed", course: "BS Civil Engineering", year: "1" },
	{ studentNumber: "20241005", fname: "Elena", lname: "Garcia", email: "elena.garcia@bulsu.seed", course: "BS Business Administration", year: "2" },
	{ studentNumber: "20241006", fname: "Manuel", lname: "Mendoza", email: "manuel.mendoza@bulsu.seed", course: "AB Communication", year: "3" },
	{ studentNumber: "20241007", fname: "Rosa", lname: "Torres", email: "rosa.torres@bulsu.seed", course: "BS Information Technology", year: "4" },
	{ studentNumber: "20241008", fname: "Antonio", lname: "Tomas", email: "antonio.tomas@bulsu.seed", course: "BS Computer Science", year: "1" },
	{ studentNumber: "20241009", fname: "Carmen", lname: "Villanueva", email: "carmen.villanueva@bulsu.seed", course: "BS Education", year: "2" },
]

function appendLog(message) {
	const timestamp = new Date().toLocaleString("en-PH")
	const nextLine = `[${timestamp}] ${message}`
	dom.activityLog.textContent = `${nextLine}\n${dom.activityLog.textContent}`.trim()
}

function setStatus(message, tone = "ok") {
	dom.statusBanner.textContent = message
	dom.statusBanner.dataset.tone = tone
}

async function refreshStudents() {
	setBusy(true)
	setStatus("Refreshing existing students...", "ok")
	try {
		const snapshot = await getDocs(collection(state.db, "students"))
		state.existingStudents = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
		appendLog(`Loaded ${state.existingStudents.length} students from database.`)
		setStatus(`Loaded ${state.existingStudents.length} students.`, "ok")
	} catch (error) {
		console.error(error)
		appendLog(`Refresh failed: ${error.message}`)
		setStatus("Refresh failed.", "danger")
	} finally {
		setBusy(false)
	}
}

function setBusy(nextBusy) {
	state.isBusy = nextBusy
	dom.refreshBtn.disabled = nextBusy
	dom.previewBtn.disabled = nextBusy
	dom.seedBtn.disabled = nextBusy
	dom.deleteLastBtn.disabled = nextBusy || !state.lastBatchId
	dom.deleteAllBtn.disabled = nextBusy
}

function buildPreview() {
	dom.previewTableBody.innerHTML = DETERMINISTIC_STUDENTS.map(s => {
		const exists = state.existingStudents.some(e => e.studentNumber === s.studentNumber)
		return `
			<tr style="${exists ? 'opacity: 0.5; background: #fef2f2;' : ''}">
				<td><strong>${s.fname} ${s.lname}</strong> ${exists ? '<span style="color: #b91c1c; font-size: 10px;">(EXISTING)</span>' : ''}</td>
				<td><code>${s.studentNumber}</code></td>
				<td>${s.email}</td>
				<td><code>${DEFAULT_STUDENT_PASSWORD}</code></td>
				<td>${s.course}</td>
				<td>Year ${s.year}</td>
			</tr>
		`
	}).join("")
	appendLog("Rendered student preview.")
}

async function seedStudents() {
	if (state.isBusy) return
	setBusy(true)
	setStatus("Seeding students (ignoring duplicates)...", "ok")

	const batchId = `student-batch-${Date.now()}`
	let seededCount = 0
	let skippedCount = 0

	try {
		const batch = writeBatch(state.db)
		
		for (const s of DETERMINISTIC_STUDENTS) {
			const exists = state.existingStudents.some(e => e.studentNumber === s.studentNumber)
			if (exists) {
				skippedCount++
				continue
			}

			const scholarships = [
				{
					id: `seed_sch_tina_${s.studentNumber}`,
					name: "Cong. Tina Pancho",
					provider: "Cong. Tina Pancho",
					providerType: "tina_pancho",
					status: "Active",
					academicYear: getCurrentAcademicYear(),
					semesterTag: getCurrentSemesterTag(),
				},
				{
					id: `seed_sch_morisson_${s.studentNumber}`,
					name: "Morisson",
					provider: "Morisson",
					providerType: "morisson",
					status: "Active",
					academicYear: getCurrentAcademicYear(),
					semesterTag: getCurrentSemesterTag(),
				}
			]

			const studentData = {
				...s,
				mname: "M.",
				fullName: `${s.fname} M. ${s.lname}`,
				yearLevel: s.year,
				scholarships,
				seedSource: SEED_SOURCE,
				seedBatchId: batchId,
				createdAt: Timestamp.now(),
				updatedAt: Timestamp.now(),
			}

			const ref = doc(collection(state.db, "students"))
			batch.set(ref, studentData)
			seededCount++
		}

		if (seededCount > 0) {
			await batch.commit()
			state.lastBatchId = batchId
			localStorage.setItem(LAST_BATCH_STORAGE_KEY, batchId)
			appendLog(`Seeded ${seededCount} students. Skipped ${skippedCount} existing.`)
			setStatus(`Seeded ${seededCount}, Skipped ${skippedCount}.`, "ok")
		} else {
			appendLog(`All 10 students already exist. No new records created.`)
			setStatus("All students already exist.", "warning")
		}

		await refreshStudents()
		buildPreview()
	} catch (error) {
		console.error(error)
		appendLog(`Error seeding students: ${error.message}`)
		setStatus("Seeding failed.", "danger")
	} finally {
		setBusy(false)
	}
}

async function deleteSeededStudents(mode = "last") {
	if (state.isBusy) return
	if (mode === "last" && !state.lastBatchId) return
	
	setBusy(true)
	setStatus(mode === "last" ? "Deleting last batch..." : "Deleting all seeded students...", "warning")

	try {
		const q = mode === "last" 
			? query(collection(state.db, "students"), where("seedBatchId", "==", state.lastBatchId))
			: query(collection(state.db, "students"), where("seedSource", "==", SEED_SOURCE))
		
		const snapshot = await getDocs(q)
		const batch = writeBatch(state.db)
		snapshot.docs.forEach(d => batch.delete(d.ref))
		await batch.commit()
		
		appendLog(`Deleted ${snapshot.size} seeded students (mode: ${mode}).`)
		if (mode === "all" || mode === "last") {
			state.lastBatchId = ""
			localStorage.removeItem(LAST_BATCH_STORAGE_KEY)
		}
		setStatus(`Deleted ${snapshot.size} rows.`, "ok")
		await refreshStudents()
		buildPreview()
	} catch (error) {
		console.error(error)
		appendLog(`Delete failed: ${error.message}`)
		setStatus("Delete failed.", "danger")
	} finally {
		setBusy(false)
	}
}

async function initialize() {
	state.app = initializeApp(firebaseConfig)
	state.db = getFirestore(state.app)
	state.auth = getAuth(state.app)

	dom.projectState.textContent = `Project: ${firebaseConfig.projectId}`
	onAuthStateChanged(state.auth, (user) => {
		state.currentUser = user
		dom.authState.textContent = user?.email ? `Signed in: ${user.email}` : "No auth session"
	})

	dom.refreshBtn.addEventListener("click", refreshStudents)
	dom.previewBtn.addEventListener("click", buildPreview)
	dom.seedBtn.addEventListener("click", seedStudents)
	dom.deleteLastBtn.addEventListener("click", () => deleteSeededStudents("last"))
	dom.deleteAllBtn.addEventListener("click", () => deleteSeededStudents("all"))
	
	await refreshStudents()
	buildPreview()
}

initialize()
