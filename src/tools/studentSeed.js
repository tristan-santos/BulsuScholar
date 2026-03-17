import { initializeApp } from "firebase/app"
import { getAuth, onAuthStateChanged } from "firebase/auth"
import { collection, doc, getDocs, getFirestore, writeBatch, query, where, serverTimestamp } from "firebase/firestore"
import {
	getCurrentAcademicYear,
	getCurrentSemesterTag,
} from "../services/scholarshipService"
import { encryptPasswordAES256 } from "../services/authService"

const SEED_SOURCE = "student-seed-html"
const LAST_BATCH_STORAGE_KEY = "bulsuscholar_student_seed_last_batch"
const DEFAULT_STUDENT_PASSWORD = "Student@123"
const STUDENT_SEED_COUNT = 100

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

const FIRST_NAMES = [
	"Juan",
	"Maria",
	"Jose",
	"Ana",
	"Pedro",
	"Elena",
	"Manuel",
	"Rosa",
	"Antonio",
	"Carmen",
	"Liza",
	"Carlo",
	"Bianca",
	"Paolo",
	"Angela",
	"Mika",
	"Jerome",
	"Patricia",
	"Nathan",
	"Camille",
]

const MIDDLE_INITIALS = ["A.", "B.", "C.", "D.", "E.", "F.", "G.", "H.", "I.", "J."]

const LAST_NAMES = [
	"Dela Cruz",
	"Santos",
	"Reyes",
	"Pascual",
	"Bautista",
	"Garcia",
	"Mendoza",
	"Torres",
	"Tomas",
	"Villanueva",
	"Navarro",
	"Flores",
	"Castro",
	"Mercado",
	"Ramos",
	"Valdez",
	"Lopez",
	"Fernandez",
	"Aquino",
	"Rivera",
]

const BULACAN_CITIES = [
	"Malolos",
	"Guiguinto",
	"Plaridel",
	"Bustos",
	"Baliuag",
	"San Rafael",
	"Pulilan",
	"Hagonoy",
	"Calumpit",
	"Bulakan",
	"Paombong",
	"Balagtas",
]

const COURSES = [
	{ course: "Bachelor of Science in Information Technology", sections: ["A", "B", "C"] },
	{ course: "Bachelor of Science in Computer Science", sections: ["A", "B"] },
	{ course: "Bachelor of Science in Computer Engineering", sections: ["A", "B"] },
	{ course: "Bachelor of Science in Industrial Engineering", sections: ["A", "B"] },
	{ course: "Bachelor of Science in Business Administration", sections: ["A", "B", "C"] },
	{ course: "Bachelor of Secondary Education", sections: ["A", "B", "C"] },
	{ course: "Bachelor of Science in Accountancy", sections: ["A", "B"] },
	{ course: "Bachelor of Science in Civil Engineering", sections: ["A", "B"] },
]

const SCHOLARSHIP_BLUEPRINTS = [
	{
		providerType: "tina_pancho",
		name: "Cong. Tina Pancho",
		provider: "Cong. Tina Pancho",
		status: "Active",
		matchSource: "grantor_roster",
	},
	{
		providerType: "morisson",
		name: "Morisson",
		provider: "Morisson",
		status: "Active",
		matchSource: "grantor_roster",
	},
	{
		providerType: "kuya_win",
		name: "Kuya Win Scholarship Program",
		provider: "Kuya Win Scholarship Program",
		status: "Application Submitted",
		matchSource: "grantor_roster",
	},
]

function createScholarshipEntries(studentNumber, academicYear, semesterTag, index) {
	const primaryBlueprint = SCHOLARSHIP_BLUEPRINTS[index % SCHOLARSHIP_BLUEPRINTS.length]
	const primaryEntry = {
		id: `seed_sch_${primaryBlueprint.providerType}_${studentNumber}`,
		name: primaryBlueprint.name,
		provider: primaryBlueprint.provider,
		providerType: primaryBlueprint.providerType,
		status: primaryBlueprint.status,
		academicYear,
		semesterTag,
		matchSource: primaryBlueprint.matchSource,
		applicationNumber: `${studentNumber}-${primaryBlueprint.providerType}`,
		requestNumber: `${studentNumber}-${primaryBlueprint.providerType}`,
	}

	if (index % 12 !== 0) {
		return {
			scholarships: [primaryEntry],
			hasConflict: false,
		}
	}

	const secondaryBlueprint = SCHOLARSHIP_BLUEPRINTS[(index + 1) % SCHOLARSHIP_BLUEPRINTS.length]
	return {
		scholarships: [
			primaryEntry,
			{
				id: `seed_sch_${secondaryBlueprint.providerType}_${studentNumber}`,
				name: secondaryBlueprint.name,
				provider: secondaryBlueprint.provider,
				providerType: secondaryBlueprint.providerType,
				status: secondaryBlueprint.status,
				academicYear,
				semesterTag,
				matchSource: secondaryBlueprint.matchSource,
				applicationNumber: `${studentNumber}-${secondaryBlueprint.providerType}`,
				requestNumber: `${studentNumber}-${secondaryBlueprint.providerType}`,
			},
		],
		hasConflict: true,
	}
}

function buildDeterministicStudents() {
	return Array.from({ length: STUDENT_SEED_COUNT }, (_, index) => {
		const studentNumber = `20243${String(index).padStart(3, "0")}`
		const fname = FIRST_NAMES[index % FIRST_NAMES.length]
		const lname = LAST_NAMES[(index * 3) % LAST_NAMES.length]
		const mname = MIDDLE_INITIALS[index % MIDDLE_INITIALS.length]
		const city = BULACAN_CITIES[index % BULACAN_CITIES.length]
		const courseEntry = COURSES[index % COURSES.length]
		const year = String((index % 4) + 1)
		const section = courseEntry.sections[index % courseEntry.sections.length]
		const emailLocal = `${fname}.${lname}`.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/\.+/g, ".")
		return {
			studentNumber,
			fname,
			mname,
			lname,
			email: `${emailLocal}.${studentNumber}@bulsu.seed`,
			cpNumber: `0917${String(3200000 + index).padStart(7, "0")}`,
			course: courseEntry.course,
			year,
			section,
			city,
			province: "Bulacan",
			postalCode: "3000",
			street: `${(index % 25) + 1} Scholarship Avenue`,
			houseNumber: String(100 + index),
			gwa: Number((1.25 + (index % 8) * 0.15).toFixed(2)),
		}
	})
}

const DETERMINISTIC_STUDENTS = buildDeterministicStudents()

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
		const exists = state.existingStudents.some(e => e.studentnumber === s.studentNumber)
		return `
			<tr style="${exists ? 'opacity: 0.5; background: #fef2f2;' : ''}">
				<td><strong>${s.fname} ${s.lname}</strong> ${exists ? '<span style="color: #b91c1c; font-size: 10px;">(EXISTING)</span>' : ''}</td>
				<td><code>${s.studentNumber}</code></td>
				<td>${s.email}</td>
				<td><code>${DEFAULT_STUDENT_PASSWORD}</code></td>
				<td>${s.course}</td>
				<td>Yr ${s.year}-${s.section}</td>
			</tr>
		`
	}).join("")
	appendLog("Rendered student preview.")
}

async function seedStudents() {
	if (state.isBusy) return
	setBusy(true)
	setStatus("Seeding students...", "ok")

	const batchId = `student-batch-${Date.now()}`
	let seededCount = 0
	let skippedCount = 0

	try {
		const encryptedPassword = await encryptPasswordAES256(DEFAULT_STUDENT_PASSWORD)
		const batch = writeBatch(state.db)
		const semesterTag = getCurrentSemesterTag()
		const academicYear = getCurrentAcademicYear()
		
		for (const s of DETERMINISTIC_STUDENTS) {
			const exists = state.existingStudents.some(e => e.studentnumber === s.studentNumber)
			if (exists) {
				skippedCount++
				continue
			}

			const { scholarships, hasConflict } = createScholarshipEntries(
				s.studentNumber,
				academicYear,
				semesterTag,
				seededCount + skippedCount,
			)

			const studentData = {
				studentnumber: s.studentNumber,
				fname: s.fname,
				mname: s.mname,
				lname: s.lname,
				fullName: `${s.fname} ${s.mname} ${s.lname}`,
				email: s.email,
				password: encryptedPassword,
				cpNumber: s.cpNumber,
				houseNumber: s.houseNumber,
				street: s.street,
				city: s.city,
				province: s.province,
				postalCode: s.postalCode,
				course: s.course,
				major: "",
				year: s.year,
				yearLevel: s.year,
				section: s.section,
				gwa: s.gwa,
				gender: seededCount % 2 === 0 ? "Female" : "Male",
				campus: "Main Campus",
				userType: "student",
				isValidated: true,
				isPending: false,
				archived: false,
				accountStatus: "active",
				corFile: {
					name: "seed-cor.jpg",
					type: "image/jpeg",
					size: 102400,
					url: "https://res.cloudinary.com/demo/image/upload/v1/sample.jpg",
					semesterTag,
				},
				cogFile: {
					name: "seed-cog.jpg",
					type: "image/jpeg",
					size: 104320,
					url: "https://res.cloudinary.com/demo/image/upload/v1/sample.jpg",
					semesterTag,
				},
				schoolIdFile: {
					name: "seed-school-id.jpg",
					type: "image/jpeg",
					size: 98304,
					url: "https://res.cloudinary.com/demo/image/upload/v1/sample.jpg",
					semesterTag,
				},
				scholarships,
				scholarshipConflictWarning: hasConflict,
				scholarshipConflictMessage: hasConflict
					? "Multiple grantor matches were found based on your academic profile. Choose one matched grantor first before requesting scholarship materials."
					: "",
				scholarshipRestrictionReason: hasConflict ? "multiple_scholarships" : null,
				restrictions: {
					accountAccess: false,
					scholarshipEligibility: hasConflict,
					complianceHold: false,
				},
				seedSource: SEED_SOURCE,
				seedBatchId: batchId,
				createdAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
				validatedAt: serverTimestamp(),
			}

			const ref = doc(state.db, "students", s.studentNumber)
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
			appendLog(`All ${STUDENT_SEED_COUNT} students already exist. No new records created.`)
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
