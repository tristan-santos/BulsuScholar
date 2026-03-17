import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
	addDoc,
	collection,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	serverTimestamp,
	setDoc,
	updateDoc,
	where,
	writeBatch,
} from "firebase/firestore"
import {
	Chart as ChartJS,
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	ArcElement,
	Filler,
	Tooltip,
	Legend,
} from "chart.js"
import { Doughnut, Line } from "react-chartjs-2"
import {
	HiOutlineBell,
	HiOutlineChartBar,
	HiOutlineCloudUpload,
	HiOutlineDocumentText,
	HiOutlineEye,
	HiOutlineLogout,
	HiOutlineMoon,
	HiOutlineRefresh,
	HiOutlineSun,
	HiOutlineTrash,
	HiOutlineUserGroup,
	HiOutlineUsers,
	HiX,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { read, utils } from "xlsx"
import { db } from "../../firebase"
import logo2 from "../assets/logo2.png"
import "../css/AdminDashboard.css"
import "../css/ProviderDashboard.css"
import TablePagination, { TABLE_PAGE_SIZE, paginateRows } from "../components/TablePagination"
import useThemeMode from "../hooks/useThemeMode"
import {
	GRANTOR_ACCEPT_ATTR,
	GRANTOR_ACCEPTED_UPLOAD_EXTENSIONS,
	buildGrantorScholarTrend,
	buildGrantorYearDistribution,
	getGrantorAnnouncementsCollection,
	getGrantorPortalDoc,
	getGrantorScholarsCollection,
	matchesGrantorProfile,
	normalizeGrantorAnnouncement,
	normalizeGrantorApplication,
	normalizeGrantorPortalSettings,
	normalizeGrantorScholar,
	toGrantorDisplayName,
	toJsDate,
} from "../services/grantorService"
import {
	getDocumentUrlsForStudent,
	getScholarshipPolicy,
	normalizeScholarshipList,
	toScholarshipProviderType,
	validateScholarshipDocuments,
} from "../services/scholarshipService"
import {
	completeScholarshipTrackingStep,
	getScholarshipTrackingProgress,
	getScholarshipTrackingStepBadgeLabel,
	getScholarshipTrackingStatusLabel,
} from "../services/scholarshipTrackingService"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend)

const SECTIONS = [
	{ id: "dashboard", label: "Dashboard", icon: HiOutlineChartBar, path: "/provider-dashboard/dashboard" },
	{ id: "scholars", label: "Scholars", icon: HiOutlineUsers, path: "/provider-dashboard/scholars" },
	{ id: "applications", label: "Applications", icon: HiOutlineDocumentText, path: "/provider-dashboard/applications" },
	{ id: "announcements", label: "Announcement", icon: HiOutlineBell, path: "/provider-dashboard/announcements" },
]

const RANGES = ["daily", "weekly", "monthly", "yearly"]
const YEAR_LEVELS = ["1", "2", "3", "4"]
const SCHOLAR_TABS = ["active", "archived"]
const GRANTOR_COMPLETABLE_STEP_LABELS = {
	interview: "Interview",
	application_review: "Application Review",
	final_screening: "Final Screening",
}
const SCHOLAR_FORM = {
	studentId: "",
	fname: "",
	mname: "",
	lname: "",
	email: "",
	cpNumber: "",
	houseNumber: "",
	street: "",
	city: "",
	province: "",
	postalCode: "",
	course: "",
	yearLevel: "1",
	scholarshipTitle: "",
	status: "Active",
	notes: "",
}
const ANNOUNCEMENT_FORM = { title: "", subtitle: "", description: "", applicationWindow: "" }

const MAPPABLE_FIELDS = [
	{ id: "studentId", label: "Student ID" },
	{ id: "fname", label: "First Name" },
	{ id: "mname", label: "Middle Name" },
	{ id: "lname", label: "Last Name" },
	{ id: "email", label: "Email Address" },
	{ id: "course", label: "Course" },
	{ id: "yearLevel", label: "Year Level" },
	{ id: "scholarshipTitle", label: "Scholarship Title" },
	{ id: "status", label: "Status" },
	{ id: "cpNumber", label: "Contact Number" },
	{ id: "houseNumber", label: "House No." },
	{ id: "street", label: "Street" },
	{ id: "city", label: "City" },
	{ id: "province", label: "Province" },
	{ id: "postalCode", label: "Postal Code" },
	{ id: "notes", label: "Notes" },
]

function sectionFromPath(pathname = "") {
	return SECTIONS.find((section) => pathname.startsWith(section.path))?.id || "dashboard"
}

function statusClass(value = "") {
	const text = String(value || "").toLowerCase()
	if (text.includes("active") || text.includes("open") || text.includes("approved")) return "admin-status-badge admin-status-badge--ok"
	if (text.includes("pending") || text.includes("applied") || text.includes("review")) return "admin-status-badge admin-status-badge--pending"
	if (text.includes("archived") || text.includes("rejected") || text.includes("closed")) return "admin-status-badge admin-status-badge--danger"
	return "admin-status-badge admin-status-badge--neutral"
}

function formatDateTime(value) {
	const date = toJsDate(value)
	if (!date) return "-"
	return date.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function withAlpha(hexColor, alphaHex = "33") {
	const value = String(hexColor || "").replace("#", "")
	if (value.length !== 6) return hexColor
	return `#${value}${alphaHex}`
}

function checkValidated(userData) {
	if (!userData) return false
	return Boolean(
		userData.isValidated === true ||
			userData.isValidated === "true" ||
			userData.validated === true ||
			userData.validated === "true" ||
			(userData.validatedAt != null && userData.validatedAt !== ""),
	)
}

function findMatchingScholarshipEntry(studentRecord = {}, application = {}) {
	const scholarships = normalizeScholarshipList(studentRecord?.scholarships || [])
	return (
		scholarships.find((item) => {
			return (
				item.id === application.scholarshipId ||
				item.id === application.applicationNumber ||
				item.applicationNumber === application.applicationNumber ||
				item.requestNumber === application.requestNumber ||
				item.providerType === application.providerType
			)
		}) || null
	)
}

function pickLatestGrantorRow(rows = [], application = {}) {
	return [...rows]
		.filter((row) => {
			return (
				row.scholarshipId === application.scholarshipId ||
				row.applicationNumber === application.applicationNumber ||
				row.requestNumber === application.requestNumber ||
				row.providerType === application.providerType
			)
		})
		.sort((left, right) => {
			const leftDate =
				toJsDate(left.updatedAt || left.timestamp || left.createdAt || left.downloadedAt)?.getTime() || 0
			const rightDate =
				toJsDate(right.updatedAt || right.timestamp || right.createdAt || right.downloadedAt)?.getTime() || 0
			return rightDate - leftDate
		})[0] || null
}

function scholarPayload(form, grantorId, grantorName, providerType, file = null) {
	return {
		studentId: form.studentId.trim(),
		fname: form.fname.trim(),
		mname: form.mname.trim(),
		lname: form.lname.trim(),
		fullName: [form.fname, form.mname, form.lname].filter(Boolean).join(" ").trim(),
		email: form.email.trim(),
		cpNumber: form.cpNumber.trim(),
		houseNumber: form.houseNumber.trim(),
		street: form.street.trim(),
		city: form.city.trim(),
		province: form.province.trim(),
		postalCode: form.postalCode.trim(),
		course: form.course.trim(),
		yearLevel: String(form.yearLevel || "1"),
		scholarshipTitle: form.scholarshipTitle.trim(),
		status: form.status.trim() || "Active",
		notes: form.notes.trim(),
		archived: false,
		grantorId,
		grantorName,
		providerType,
		sourceFile: file ? { name: file.name, type: file.type, size: file.size } : null,
	}
}

function validScholar(form) {
	return Boolean(form.studentId.trim() && form.fname.trim() && form.lname.trim() && form.course.trim() && form.scholarshipTitle.trim())
}

function getGrantorCompletableStepLabel(stepId = "") {
	return GRANTOR_COMPLETABLE_STEP_LABELS[stepId] || ""
}

function EmptyRow({ colSpan, message }) {
	return (
		<tr className="admin-empty-row">
			<td colSpan={colSpan}>
				<strong>{message}</strong>
			</td>
		</tr>
	)
}

function ScholarTabs({ value, onChange }) {
	return (
		<div className="admin-section-tabs" role="tablist">
			{SCHOLAR_TABS.map((tab) => (
				<button key={tab} type="button" className={`admin-section-tab ${value === tab ? "active" : ""}`} onClick={() => onChange(tab)}>
					<span className="admin-section-tab-main">
						<span className="admin-section-tab-label">{tab === "active" ? "Scholars" : "Archived"}</span>
					</span>
				</button>
			))}
		</div>
	)
}

export default function ProviderDashboard() {
	const navigate = useNavigate()
	const location = useLocation()
	const fileInputRef = useRef(null)
	const { theme, setTheme } = useThemeMode()
	const [session] = useState(() => {
		const storedUserId = sessionStorage.getItem("bulsuscholar_userId")
		const storedType = sessionStorage.getItem("bulsuscholar_userType")
		return { storedUserId, isProvider: Boolean(storedUserId) && storedType === "provider" }
	})
	const [profile, setProfile] = useState(null)
	const [portalSettings, setPortalSettings] = useState(null)
	const [loaded, setLoaded] = useState(() => !session.isProvider)
	const [scholars, setScholars] = useState([])
	const [applications, setApplications] = useState([])
	const [announcements, setAnnouncements] = useState([])
	const [range, setRange] = useState("monthly")
	const [tab, setTab] = useState("active")
	const [scholarSearch, setScholarSearch] = useState("")
	const [yearFilter, setYearFilter] = useState("All")
	const [applicationSearch, setApplicationSearch] = useState("")
	const [selectedScholarId, setSelectedScholarId] = useState("")
	const [selectedScholarIds, setSelectedScholarIds] = useState([])
	const [hoveredYear, setHoveredYear] = useState("")
	const [showCreateModal, setShowCreateModal] = useState(false)
	const [showEditModal, setShowEditModal] = useState(false)
	const [createForm, setCreateForm] = useState(SCHOLAR_FORM)
	const [editForm, setEditForm] = useState(SCHOLAR_FORM)
	const [announcementForm, setAnnouncementForm] = useState(ANNOUNCEMENT_FORM)
	const [uploadFile, setUploadFile] = useState(null)
	const [uploadActive, setUploadActive] = useState(false)
	const [importData, setImportData] = useState(null)
	const [columnMapping, setColumnMapping] = useState([])
	const [applicationModalState, setApplicationModalState] = useState({
		open: false,
		loading: false,
		application: null,
		student: null,
		scholarship: null,
		documentUrls: {},
		documentCheck: null,
		trackingProgress: null,
		latestMaterialRequest: null,
		latestSoeDownload: null,
	})
	const [busy, setBusy] = useState("")
	const [tablePages, setTablePages] = useState({})
	const grantorId = session.storedUserId || ""
	const grantorName = useMemo(() => toGrantorDisplayName(profile, grantorId), [grantorId, profile])
	const grantorProviderType = useMemo(
		() => toScholarshipProviderType(profile?.providerType || grantorName || grantorId),
		[grantorId, grantorName, profile?.providerType],
	)
	const activeSection = useMemo(() => sectionFromPath(location.pathname), [location.pathname])
	const activeScholars = useMemo(() => scholars.filter((row) => row.archived !== true), [scholars])
	const archivedScholars = useMemo(() => scholars.filter((row) => row.archived === true), [scholars])
	const selectedScholar = useMemo(() => scholars.find((row) => row.id === selectedScholarId) || null, [scholars, selectedScholarId])
	const applicationsBlocked = portalSettings?.applicationsBlocked === true
	const setTablePage = useCallback((tableKey, page) => {
		setTablePages((prev) => ({ ...prev, [tableKey]: page }))
	}, [])
	const yearRows = useMemo(() => buildGrantorYearDistribution(activeScholars), [activeScholars])
	const trendSeries = useMemo(() => buildGrantorScholarTrend(scholars, range), [range, scholars])
	const hoveredYearRow = useMemo(() => yearRows.find((row) => row.id === hoveredYear) || null, [hoveredYear, yearRows])

	useEffect(() => {
		if (!session.isProvider) navigate("/", { replace: true })
	}, [navigate, session.isProvider])

	useEffect(() => {
		if (location.pathname === "/provider-dashboard" || location.pathname === "/provider-dashboard/") {
			navigate("/provider-dashboard/dashboard", { replace: true })
		}
	}, [location.pathname, navigate])

	useEffect(() => {
		if (!grantorId || !session.isProvider) return
		return onSnapshot(doc(db, "providers", grantorId), (snap) => {
			setProfile(snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null)
			setLoaded(true)
		}, () => setLoaded(true))
	}, [grantorId, session.isProvider])

	useEffect(() => {
		if (!grantorId) return
		return onSnapshot(
			getGrantorPortalDoc(db, grantorId),
			(snap) => {
				setPortalSettings(
					snap.exists()
						? normalizeGrantorPortalSettings(snap.data() || {}, snap.id)
						: normalizeGrantorPortalSettings({}, grantorId),
				)
			},
			() => setPortalSettings(normalizeGrantorPortalSettings({}, grantorId)),
		)
	}, [grantorId])

	useEffect(() => {
		if (!loaded || profile) return
		navigate("/", { replace: true })
	}, [loaded, navigate, profile])

	useEffect(() => {
		if (!grantorId) return
		setDoc(
			getGrantorPortalDoc(db, grantorId),
			{
				grantorId,
				grantorName,
				providerType: grantorProviderType,
				updatedAt: serverTimestamp(),
			},
			{ merge: true },
		).catch(() => {})
	}, [grantorId, grantorName, grantorProviderType])

	useEffect(() => {
		if (!grantorId) return
		return onSnapshot(getGrantorScholarsCollection(db, grantorId), (snap) => {
			setScholars(snap.docs.map((row) => normalizeGrantorScholar(row.data() || {}, row.id)).sort((a, b) => (toJsDate(b.updatedAt || b.createdAt)?.getTime() || 0) - (toJsDate(a.updatedAt || a.createdAt)?.getTime() || 0)))
		}, () => setScholars([]))
	}, [grantorId])

	useEffect(() => {
		if (!grantorId) return
		return onSnapshot(getGrantorAnnouncementsCollection(db, grantorId), (snap) => {
			setAnnouncements(snap.docs.map((row) => normalizeGrantorAnnouncement(row.data() || {}, row.id)).sort((a, b) => (toJsDate(b.createdAt)?.getTime() || 0) - (toJsDate(a.createdAt)?.getTime() || 0)))
		}, () => setAnnouncements([]))
	}, [grantorId])

	useEffect(() => {
		if (!grantorId) return
		return onSnapshot(collection(db, "scholarshipApplications"), (snap) => {
			setApplications(snap.docs.map((row) => normalizeGrantorApplication(row.data() || {}, row.id)).filter((row) => matchesGrantorProfile(row, profile || { id: grantorId })).sort((a, b) => (toJsDate(b.appliedAt || b.createdAt)?.getTime() || 0) - (toJsDate(a.appliedAt || a.createdAt)?.getTime() || 0)))
		}, () => setApplications([]))
	}, [grantorId, profile])

	useEffect(() => {
		setSelectedScholarId("")
		setSelectedScholarIds([])
	}, [tab])

	useEffect(() => {
		if (!selectedScholar || !showEditModal) return
		setEditForm({
			studentId: selectedScholar.studentId || "",
			fname: selectedScholar.fname || "",
			mname: selectedScholar.mname || "",
			lname: selectedScholar.lname || "",
			email: selectedScholar.email || "",
			cpNumber: selectedScholar.cpNumber || "",
			houseNumber: selectedScholar.houseNumber || "",
			street: selectedScholar.street || "",
			city: selectedScholar.city || "",
			province: selectedScholar.province || "",
			postalCode: selectedScholar.postalCode || "",
			course: selectedScholar.course || "",
			yearLevel: String(selectedScholar.yearLevel || "1"),
			scholarshipTitle: selectedScholar.scholarshipTitle || "",
			status: selectedScholar.status || "Active",
			notes: selectedScholar.notes || "",
		})
	}, [selectedScholar, showEditModal])

	const visibleScholarPool = tab === "archived" ? archivedScholars : activeScholars
	const visibleScholars = useMemo(() => {
		const keyword = scholarSearch.trim().toLowerCase()
		return visibleScholarPool.filter((row) => {
			const matchesSearch = !keyword || [row.studentId, row.fullName, row.course, row.scholarshipTitle].some((value) => String(value || "").toLowerCase().includes(keyword))
			const matchesYear = yearFilter === "All" || String(row.yearLevel || "") === yearFilter
			return matchesSearch && matchesYear
		})
	}, [scholarSearch, visibleScholarPool, yearFilter])

	const enrichedApplications = useMemo(() => {
		const scholarLookup = new Map(
			scholars.map((row) => [row.studentId, row]),
		)

		return applications.map((row) => {
			const matchedScholar = scholarLookup.get(row.studentId) || null
			const policy = getScholarshipPolicy(
				row.providerType || row.scholarshipName || matchedScholar?.scholarshipTitle || grantorName,
			)
			return {
				...row,
				fullName: row.fullName || matchedScholar?.fullName || "Applicant",
				email: row.email || matchedScholar?.email || "",
				cpNumber: row.cpNumber || matchedScholar?.cpNumber || "",
				scholarshipName:
					row.scholarshipName || matchedScholar?.scholarshipTitle || grantorName,
				providerType: row.providerType || matchedScholar?.providerType || policy.providerType,
				providerLabel: row.providerLabel || matchedScholar?.grantorName || grantorName,
			}
		})
	}, [applications, grantorName, scholars])

	const visibleApplications = useMemo(() => {
		const keyword = applicationSearch.trim().toLowerCase()
		return enrichedApplications.filter((row) => !keyword || [row.studentId, row.fullName, row.scholarshipName, row.providerLabel, row.status, row.applicationNumber].some((value) => String(value || "").toLowerCase().includes(keyword)))
	}, [applicationSearch, enrichedApplications])

	const visibleScholarsPage = useMemo(
		() => paginateRows(visibleScholars, tablePages[`grantor_scholars_${tab}`] || 1, TABLE_PAGE_SIZE),
		[tab, tablePages, visibleScholars],
	)

	const visibleApplicationsPage = useMemo(
		() => paginateRows(visibleApplications, tablePages.grantor_applications || 1, TABLE_PAGE_SIZE),
		[tablePages, visibleApplications],
	)

	const grantorActionStepLabel = useMemo(
		() => getGrantorCompletableStepLabel(applicationModalState.trackingProgress?.currentStep?.id),
		[applicationModalState.trackingProgress?.currentStep?.id],
	)

	const importPreviewPage = useMemo(
		() => paginateRows(importData || [], tablePages.grantor_import_preview || 1, TABLE_PAGE_SIZE),
		[importData, tablePages],
	)

	const allVisibleSelected = visibleScholars.length > 0 && visibleScholars.every((row) => selectedScholarIds.includes(row.id))

	const lineData = useMemo(() => ({
		labels: trendSeries.labels,
		datasets: [{
			label: "Scholar Count",
			data: trendSeries.values,
			borderColor: theme === "dark" ? "#5eead4" : "#0f766e",
			backgroundColor: theme === "dark" ? "rgba(45, 212, 191, 0.18)" : "rgba(15, 118, 110, 0.12)",
			fill: true,
			tension: 0.35,
		}],
	}), [theme, trendSeries.labels, trendSeries.values])

	const lineOptions = useMemo(() => ({
		responsive: true,
		maintainAspectRatio: false,
		plugins: { legend: { display: false } },
		scales: {
			x: { ticks: { color: theme === "dark" ? "#cbd5e1" : "#475569" } },
			y: { beginAtZero: true, ticks: { precision: 0, color: theme === "dark" ? "#cbd5e1" : "#475569" } },
		},
	}), [theme])

	const pieData = useMemo(() => ({
		labels: yearRows.map((row) => row.label),
		datasets: [{
			data: yearRows.map((row) => row.value),
			backgroundColor: yearRows.map((row) => !hoveredYear || row.id === hoveredYear ? row.color : withAlpha(row.color, "30")),
			borderColor: theme === "dark" ? "#0f172a" : "#ffffff",
			borderWidth: yearRows.map((row) => row.id === hoveredYear ? 4 : 2),
			offset: yearRows.map((row) => row.id === hoveredYear ? 10 : 0),
			hoverOffset: 12,
		}],
	}), [hoveredYear, theme, yearRows])

	const pieOptions = useMemo(() => ({
		responsive: true,
		maintainAspectRatio: false,
		cutout: "68%",
		plugins: { legend: { display: false } },
		onHover: (_, elements) => setHoveredYear(elements.length > 0 ? yearRows[elements[0].index]?.id || "" : ""),
	}), [yearRows])

	const closeCreateModal = () => {
		setShowCreateModal(false)
		setCreateForm(SCHOLAR_FORM)
		setUploadFile(null)
		setUploadActive(false)
		setImportData(null)
		setColumnMapping([])
	}

	const closeEditModal = () => {
		setShowEditModal(false)
		setEditForm(SCHOLAR_FORM)
	}

	const closeApplicationModal = () => {
		setApplicationModalState({
			open: false,
			loading: false,
			application: null,
			student: null,
			scholarship: null,
			documentUrls: {},
			documentCheck: null,
			trackingProgress: null,
			latestMaterialRequest: null,
			latestSoeDownload: null,
		})
	}

	const handleUpload = (file) => {
		if (!file) return
		const fileName = String(file.name || "").toLowerCase()
		if (!GRANTOR_ACCEPTED_UPLOAD_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
			toast.error(`Unsupported file format. Use ${GRANTOR_ACCEPTED_UPLOAD_EXTENSIONS.join(", ")}.`)
			return
		}
		setUploadFile(file)

		const reader = new FileReader()
		reader.onload = (e) => {
			try {
				const workbook = read(e.target.result, { type: "array" })
				const firstSheetName = workbook.SheetNames[0]
				const sheet = workbook.Sheets[firstSheetName]
				const rows = utils
					.sheet_to_json(sheet, { header: 1, defval: "" })
					.map((row) =>
						Array.isArray(row)
							? row.map((cell) => String(cell ?? "").trim())
							: [],
					)
					.filter((row) => row.some((cell) => cell !== ""))

				if (rows.length > 0) {
					setImportData(rows)
					setColumnMapping(new Array(rows[0].length).fill(""))
					setTablePage("grantor_import_preview", 1)
					toast.success("File parsed. Please map columns to proceed.")
				} else {
					toast.error("The file appears to be empty.")
				}
			} catch (error) {
				console.error(error)
				toast.error("Unable to parse the selected file.")
			}
		}
		reader.readAsArrayBuffer(file)
	}

	const toggleApplicationsBlocked = async () => {
		if (!grantorId || busy) return
		const nextBlockedState = !applicationsBlocked
		setBusy("portal_toggle")
		try {
			await setDoc(
				getGrantorPortalDoc(db, grantorId),
				{
					grantorId,
					grantorName,
					providerType: grantorProviderType,
					applicationsBlocked: nextBlockedState,
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)
			toast.success(
				nextBlockedState
					? "Apply button is now blocked on the student side."
					: "Apply button is now available on the student side.",
			)
		} catch (error) {
			console.error(error)
			toast.error("Unable to update the student apply state right now.")
		} finally {
			setBusy("")
		}
	}

	const openApplicationModal = async (application) => {
		if (!application?.studentId) {
			toast.info("This application record does not have a linked student ID yet.")
			return
		}

		setApplicationModalState({
			open: true,
			loading: true,
			application,
			student: null,
			scholarship: null,
			documentUrls: {},
			documentCheck: null,
			trackingProgress: null,
			latestMaterialRequest: null,
			latestSoeDownload: null,
		})

		try {
			const studentSnap = await getDoc(doc(db, "students", application.studentId))
			const student = studentSnap.exists()
				? { id: studentSnap.id, ...(studentSnap.data() || {}) }
				: null
			const scholarship = student ? findMatchingScholarshipEntry(student, application) : null
			const documentUrls = student
				? {
						...getDocumentUrlsForStudent(student),
						...(application.documentUrls || {}),
					}
				: application.documentUrls || {}
			const documentCheck = scholarship
				? validateScholarshipDocuments(student || {}, scholarship.name)
				: null

			const [requestSnapshot, downloadSnapshot] = await Promise.all([
				getDocs(query(collection(db, "soeRequests"), where("studentId", "==", application.studentId))),
				getDocs(query(collection(db, "soeDownloads"), where("studentId", "==", application.studentId))),
			])

			const latestMaterialRequest = pickLatestGrantorRow(
				requestSnapshot.docs.map((row) => ({ id: row.id, ...(row.data() || {}) })),
				application,
			)
			const latestSoeDownload = pickLatestGrantorRow(
				downloadSnapshot.docs.map((row) => ({ id: row.id, ...(row.data() || {}) })),
				application,
			)
			const trackingProgress = scholarship
				? getScholarshipTrackingProgress({
						scholarship,
						isValidated: checkValidated(student),
						documentCheck,
						latestMaterialRequest,
						latestSoeDownload,
					})
				: null

			setApplicationModalState({
				open: true,
				loading: false,
				application,
				student,
				scholarship,
				documentUrls,
				documentCheck,
				trackingProgress,
				latestMaterialRequest,
				latestSoeDownload,
			})
		} catch (error) {
			console.error(error)
			toast.error("Unable to load the applicant information right now.")
			closeApplicationModal()
		}
	}

	const handleCompleteGrantorStage = async () => {
		if (!applicationModalState.application || !applicationModalState.student || !applicationModalState.scholarship) {
			return
		}

		const currentStep = applicationModalState.trackingProgress?.currentStep
		const currentStepLabel = getGrantorCompletableStepLabel(currentStep?.id)
		if (!currentStepLabel) {
			toast.info("Grantor actions are limited to interview, application review, and final screening.")
			return
		}

		if (!applicationModalState.trackingProgress?.canAdminCompleteCurrentStep) {
			toast.info(
				applicationModalState.trackingProgress?.adminCompletionReason ||
					"This stage cannot be completed yet.",
			)
			return
		}

		setBusy("grantor_tracking")
		try {
			const nextTracking = completeScholarshipTrackingStep(
				applicationModalState.scholarship.tracking,
				{
					providerType: applicationModalState.scholarship.providerType,
					scholarshipName: applicationModalState.scholarship.name,
					stepId: currentStep.id,
					completedBy: "grantor",
				},
			)
			const nextScholarship = {
				...applicationModalState.scholarship,
				tracking: nextTracking,
			}
			const nextTrackingProgress = getScholarshipTrackingProgress({
				scholarship: nextScholarship,
				isValidated: checkValidated(applicationModalState.student),
				documentCheck: applicationModalState.documentCheck,
				latestMaterialRequest: applicationModalState.latestMaterialRequest,
				latestSoeDownload: applicationModalState.latestSoeDownload,
			})
			const nextStatus = getScholarshipTrackingStatusLabel(nextTrackingProgress)
			const nextScholarships = normalizeScholarshipList(
				applicationModalState.student.scholarships || [],
			).map((item) =>
				item.id === applicationModalState.scholarship.id
					? { ...nextScholarship, status: nextStatus }
					: item,
			)

			await setDoc(
				doc(db, "students", applicationModalState.student.id),
				{
					scholarships: nextScholarships,
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)

			await setDoc(
				doc(db, "scholarshipApplications", applicationModalState.application.id),
				{
					status: nextStatus,
					tracking: nextTracking,
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)

			setApplicationModalState((prev) => ({
				...prev,
				scholarship: nextScholarship,
				student: prev.student
					? {
							...prev.student,
							scholarships: nextScholarships,
						}
					: prev.student,
				trackingProgress: nextTrackingProgress,
			}))
			toast.success(`${currentStepLabel} stage completed.`)
		} catch (error) {
			console.error(error)
			toast.error(`Unable to complete the ${currentStepLabel.toLowerCase()} stage right now.`)
		} finally {
			setBusy("")
		}
	}

	const handleCreateScholar = async () => {
		if (!grantorId || busy) return

		// Import Logic
		if (importData && importData.length > 0) {
			if (!columnMapping.some(field => field !== "")) {
				toast.error("Map at least one column before importing.")
				return
			}
			setBusy("create")
			try {
				const batch = writeBatch(db)
				const collectionRef = getGrantorScholarsCollection(db, grantorId)
				
				importData.forEach((row) => {
					const scholarObj = {
						grantorId,
						grantorName,
						providerType: grantorProviderType,
						status: "Active",
						archived: false,
						createdAt: serverTimestamp(),
						updatedAt: serverTimestamp(),
					}
					
					columnMapping.forEach((fieldId, colIndex) => {
						if (fieldId) {
							scholarObj[fieldId] = row[colIndex] || ""
						}
					})
					
					if (!scholarObj.fullName) {
						scholarObj.fullName = [scholarObj.fname, scholarObj.mname, scholarObj.lname].filter(Boolean).join(" ").trim() || "Scholar"
					}
					
					const newDocRef = doc(collectionRef)
					batch.set(newDocRef, scholarObj)
				})
				
				await batch.commit()
				toast.success(`Successfully imported ${importData.length} scholars.`)
				closeCreateModal()
			} catch (err) {
				console.error(err)
				toast.error("Failed to import scholars.")
			} finally {
				setBusy("")
			}
			return
		}

		// Manual Entry Logic
		if (!validScholar(createForm)) {
			toast.error("Complete the scholar form before saving.")
			return
		}
		setBusy("create")
		try {
			await addDoc(getGrantorScholarsCollection(db, grantorId), {
				...scholarPayload(createForm, grantorId, grantorName, grantorProviderType, uploadFile),
				createdAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			})
			closeCreateModal()
			toast.success("Scholar added to the grantor roster.")
		} catch (error) {
			console.error(error)
			toast.error("Unable to add scholar right now.")
		} finally {
			setBusy("")
		}
	}

	const handleSaveScholar = async () => {
		if (!grantorId || !selectedScholar || !validScholar(editForm) || busy) {
			if (!validScholar(editForm)) toast.error("Complete the scholar form before saving.")
			return
		}
		setBusy("edit")
		try {
			await updateDoc(doc(getGrantorScholarsCollection(db, grantorId), selectedScholar.id), {
				...scholarPayload(editForm, grantorId, grantorName, grantorProviderType),
				updatedAt: serverTimestamp(),
			})
			closeEditModal()
			toast.success("Scholar details updated.")
		} catch (error) {
			console.error(error)
			toast.error("Unable to update scholar right now.")
		} finally {
			setBusy("")
		}
	}

	const handleArchive = async () => {
		if (!grantorId || selectedScholarIds.length === 0 || busy) {
			if (selectedScholarIds.length === 0) toast.info("Select one or more scholars to archive.")
			return
		}
		if (!window.confirm("Archive the selected scholars from the active roster?")) return
		setBusy("archive")
		try {
			const batch = writeBatch(db)
			selectedScholarIds.forEach((id) => {
				batch.update(doc(getGrantorScholarsCollection(db, grantorId), id), {
					archived: true,
					status: "Archived",
					archivedAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				})
			})
			await batch.commit()
			setSelectedScholarIds([])
			setSelectedScholarId("")
			toast.success("Selected scholars archived.")
		} catch (error) {
			console.error(error)
			toast.error("Unable to archive scholars right now.")
		} finally {
			setBusy("")
		}
	}

	const handleUnarchive = async () => {
		if (!grantorId || selectedScholarIds.length === 0 || busy) {
			if (selectedScholarIds.length === 0) toast.info("Select one or more scholars to unarchive.")
			return
		}
		if (!window.confirm("Return the selected scholars to the active roster?")) return
		setBusy("unarchive")
		try {
			const batch = writeBatch(db)
			selectedScholarIds.forEach((id) => {
				batch.update(doc(getGrantorScholarsCollection(db, grantorId), id), {
					archived: false,
					status: "Active",
					archivedAt: null,
					updatedAt: serverTimestamp(),
				})
			})
			await batch.commit()
			setSelectedScholarIds([])
			setSelectedScholarId("")
			toast.success("Selected scholars unarchived.")
		} catch (error) {
			console.error(error)
			toast.error("Unable to unarchive scholars right now.")
		} finally {
			setBusy("")
		}
	}

	const handlePostAnnouncement = async (event) => {
		event.preventDefault()
		if (!grantorId || busy) return
		if (!announcementForm.title.trim() || !announcementForm.description.trim() || !announcementForm.applicationWindow.trim()) {
			toast.error("Complete the announcement fields before posting.")
			return
		}
		setBusy("announcement")
		try {
			await addDoc(getGrantorAnnouncementsCollection(db, grantorId), {
				...announcementForm,
				title: announcementForm.title.trim(),
				subtitle: announcementForm.subtitle.trim(),
				description: announcementForm.description.trim(),
				content: announcementForm.description.trim(),
				previewText: announcementForm.description.trim().slice(0, 150),
				applicationWindow: announcementForm.applicationWindow.trim(),
				grantorId,
				grantorName,
				providerType: grantorProviderType,
				providerLabel: grantorName,
				status: "Open",
				createdAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			})
			setAnnouncementForm(ANNOUNCEMENT_FORM)
			toast.success("Announcement posted for the grantor portal.")
		} catch (error) {
			console.error(error)
			toast.error("Unable to post announcement right now.")
		} finally {
			setBusy("")
		}
	}

	if (!session.isProvider) return null

	return (
		<div className={`grantor-portal ${theme === "dark" ? "grantor-portal--dark" : ""}`}>
			<aside className="grantor-sidebar">
				<div className="grantor-sidebar-brand">
					<img src={logo2} alt="BulsuScholar" />
					<div>
						<h1>BulsuScholar</h1>
						<p>Grantor Portal</p>
					</div>
				</div>
				<nav className="grantor-sidebar-nav">
					{SECTIONS.map((section) => {
						const Icon = section.icon
						return (
							<Link key={section.id} to={section.path} className={`grantor-sidebar-link ${activeSection === section.id ? "active" : ""}`}>
								<Icon />
								<span>{section.label}</span>
							</Link>
						)
					})}
				</nav>
				<div className="grantor-sidebar-bottom">
					<div className="grantor-theme-switch">
						<button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}><HiOutlineSun /> Light</button>
						<button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}><HiOutlineMoon /> Dark</button>
					</div>
					<div className="grantor-sidebar-profile">
						<HiOutlineUserGroup />
						<div className="grantor-sidebar-profile-info">
							<strong>{grantorName}</strong>
							<p>{profile?.email || "Grantor workspace"}</p>
						</div>
					</div>
					<button type="button" className="grantor-sidebar-logout" onClick={() => { sessionStorage.removeItem("bulsuscholar_userId"); sessionStorage.removeItem("bulsuscholar_userType"); navigate("/", { replace: true }) }}><HiOutlineLogout /> Logout</button>
				</div>
			</aside>

			<main className="grantor-workspace">
				{activeSection === "dashboard" ? (
					<section className="admin-management-panel">
						<div className="admin-panel-head">
							<div>
								<h2>Grantor Dashboard</h2>
								<p className="admin-panel-copy">Analytics-first view of scholars, year levels, and system-linked applications.</p>
							</div>
						</div>
						<section className="admin-kpi-grid">
							{[
								{ id: "students", label: "Active Scholars", value: activeScholars.length, description: "Scholars currently active in your roster.", icon: HiOutlineUsers },
								{ id: "soe", label: "Applications", value: applications.length, description: "Current system applications matched to this grantor.", icon: HiOutlineDocumentText },
								{ id: "scholars", label: "Archived Records", value: archivedScholars.length, description: "Archived scholars retained for history and reporting.", icon: HiOutlineChartBar },
							].map((card) => {
								const Icon = card.icon
								return (
									<article key={card.label} className={`admin-kpi-card admin-kpi-card--${card.id}`}>
										<div className="admin-kpi-card__icon"><Icon /></div>
										<div className="admin-kpi-card__body">
											<span className="admin-kpi-card__eyebrow">{card.label}</span>
											<strong>{card.value}</strong>
											<p>{card.description}</p>
										</div>
									</article>
								)
							})}
						</section>
						<section className="admin-analytics-grid admin-analytics-grid--primary">
							<article className="admin-analytics-card admin-analytics-card--wide admin-trend-card">
								<div className="admin-trend-head">
									<div>
										<h3>Scholar Movement</h3>
										<p>Counts move up as scholars are added and down as they are archived.</p>
									</div>
									<div className="admin-trend-controls">
										{RANGES.map((item) => (
											<button key={item} type="button" className={range === item ? "active" : ""} onClick={() => setRange(item)}>
												{item[0].toUpperCase() + item.slice(1)}
											</button>
										))}
									</div>
								</div>
								<div className="admin-chart-wrap admin-chart-wrap--lg">
									<Line data={lineData} options={lineOptions} />
								</div>
							</article>
						</section>
						<section className="grantor-dashboard-split">
							<article className="admin-analytics-card grantor-pie-card">
								<div className="admin-trend-head admin-trend-head--compact">
									<div>
										<h3>Year Level Mix</h3>
										<p>Hover to inspect the current year distribution.</p>
									</div>
								</div>
								<div className="admin-distribution-shell admin-distribution-shell--split">
									<div className="admin-chart-wrap admin-chart-wrap--distribution">
										<Doughnut data={pieData} options={pieOptions} />
										<div className="admin-distribution-hover-note">
											{hoveredYearRow ? (
												<>
													<strong>{hoveredYearRow.value}</strong>
													<span>{hoveredYearRow.label}</span>
												</>
											) : (
												<>
													<strong>{activeScholars.length}</strong>
													<span>Total Scholars</span>
												</>
											)}
										</div>
									</div>
									<div className="grantor-year-legend">
										{yearRows.map((row) => (
											<p key={row.id}>
												<span className="grantor-year-legend__dot" style={{ backgroundColor: row.color }} />
												<span>{row.label}</span>
												<strong>{row.value}</strong>
											</p>
										))}
									</div>
								</div>
							</article>
							<article className="admin-analytics-card grantor-note-card">
								<div className="admin-trend-head admin-trend-head--compact">
									<div>
										<h3>Grantor Notes</h3>
										<p>Reserved for more detailed grantor guidance later.</p>
									</div>
								</div>
								<div className="grantor-note-card__body">
									<strong>{grantorName}</strong>
									<p>This panel can later hold reminders, scholarship cycle notes, compliance instructions, or grantor-facing summaries.</p>
									<p>For now it keeps the bottom-right dashboard slot active and aligned with the admin visual language.</p>
								</div>
							</article>
						</section>
					</section>
				) : null}

				{activeSection === "scholars" ? (
					<section className="admin-management-panel">
						<div className="admin-panel-head">
							<div>
								<h2>Scholars</h2>
								<p className="admin-panel-copy">Manage active and archived scholars inside the grantor-only Firestore namespace.</p>
							</div>
							<div className="grantor-toolbar-actions">
								<button
									type="button"
									className={tab === "archived" ? "admin-safe-btn" : "admin-danger-btn"}
									onClick={tab === "archived" ? handleUnarchive : handleArchive}
									disabled={
										selectedScholarIds.length === 0 ||
										busy === "archive" ||
										busy === "unarchive"
									}
								>
									{tab === "archived" ? (
										<>
											<HiOutlineRefresh /> {busy === "unarchive" ? "Unarchiving..." : "Unarchive"}
										</>
									) : (
										<>
											<HiOutlineTrash /> {busy === "archive" ? "Archiving..." : "Archive"}
										</>
									)}
								</button>
								<button type="button" className="admin-table-btn" onClick={() => selectedScholar ? setShowEditModal(true) : toast.info("Select a scholar row first before editing.")}><HiOutlineRefresh /> Edit</button>
								<button type="button" className="admin-export-btn" onClick={() => setShowCreateModal(true)}><HiOutlineCloudUpload /> Add</button>
							</div>
						</div>
						<ScholarTabs value={tab} onChange={setTab} />
						<div className="admin-filter-bar">
							<input type="text" placeholder="Search scholar ID, name, or course" value={scholarSearch} onChange={(event) => setScholarSearch(event.target.value)} />
							<select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
								<option value="All">All Year Levels</option>
								{YEAR_LEVELS.map((level) => <option key={level} value={level}>Year {level}</option>)}
							</select>
						</div>
						<div className="admin-table-wrap">
							<table className="admin-management-table admin-management-table--roomy">
								<thead>
									<tr>
										<th className="grantor-checkbox-col"><input type="checkbox" checked={allVisibleSelected} onChange={() => {
											const ids = visibleScholars.map((row) => row.id)
											setSelectedScholarIds(allVisibleSelected ? selectedScholarIds.filter((id) => !ids.includes(id)) : Array.from(new Set([...selectedScholarIds, ...ids])))
										}} /></th>
										<th>Student ID</th><th>Scholar Name</th><th>Course</th><th>Year</th><th>Status</th><th>Updated</th>
									</tr>
								</thead>
								<tbody>
									{visibleScholars.length === 0 ? <EmptyRow colSpan={7} message="No results found matching your criteria." /> : visibleScholarsPage.rows.map((scholar) => (
										<tr key={scholar.id} className={selectedScholarId === scholar.id ? "grantor-row-selected" : ""} onClick={() => setSelectedScholarId(scholar.id)}>
											<td className="grantor-checkbox-col" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedScholarIds.includes(scholar.id)} onChange={() => setSelectedScholarIds((prev) => prev.includes(scholar.id) ? prev.filter((id) => id !== scholar.id) : [...prev, scholar.id])} /></td>
											<td>{scholar.studentId || "-"}</td><td>{scholar.fullName}</td><td>{scholar.course || "-"}</td><td>{scholar.yearLevel || "-"}</td><td><span className={statusClass(scholar.status)}>{scholar.status}</span></td><td>{formatDateTime(scholar.updatedAt || scholar.createdAt)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<TablePagination
							currentPage={visibleScholarsPage.currentPage}
							totalItems={visibleScholars.length}
							onPageChange={(page) => setTablePage(`grantor_scholars_${tab}`, page)}
						/>
					</section>
				) : null}

				{activeSection === "applications" ? (
					<section className="admin-management-panel">
						<div className="admin-panel-head">
							<div>
								<h2>Applications</h2>
								<p className="admin-panel-copy">System application records filtered to the logged-in grantor scholarship context.</p>
							</div>
							<div className="grantor-toolbar-actions">
								<span className={statusClass(applicationsBlocked ? "Closed" : "Open")}>
									{applicationsBlocked ? "Apply Closed" : "Apply Open"}
								</span>
								<button
									type="button"
									className={applicationsBlocked ? "admin-safe-btn" : "admin-danger-btn"}
									onClick={toggleApplicationsBlocked}
									disabled={busy === "portal_toggle"}
								>
									{busy === "portal_toggle"
										? "Updating..."
										: applicationsBlocked
											? "Unblock Apply"
											: "Block Apply"}
								</button>
							</div>
						</div>
						<div className="admin-filter-bar">
							<input type="text" placeholder="Search applicant, scholarship, provider, or status" value={applicationSearch} onChange={(event) => setApplicationSearch(event.target.value)} />
						</div>
						<div className="admin-table-wrap">
							<table className="admin-management-table admin-management-table--roomy">
								<thead><tr><th>Student ID</th><th>Applicant</th><th>Application No.</th><th>Scholarship</th><th>Provider</th><th>Status</th><th>Applied On</th><th>Action</th></tr></thead>
								<tbody>
									{visibleApplications.length === 0 ? <EmptyRow colSpan={8} message="No applications matched this grantor profile yet." /> : visibleApplicationsPage.rows.map((row) => (
										<tr key={row.id}>
											<td>{row.studentId || "-"}</td>
											<td>{row.fullName || "Applicant"}</td>
											<td>{row.applicationNumber || row.requestNumber || row.id}</td>
											<td>{row.scholarshipName || "-"}</td>
											<td>{row.providerLabel || "-"}</td>
											<td><span className={statusClass(row.status)}>{row.status}</span></td>
											<td>{formatDateTime(row.appliedAt || row.createdAt)}</td>
											<td>
												<button
													type="button"
													className="admin-table-btn admin-table-btn--view"
													onClick={() => openApplicationModal(row)}
												>
													<HiOutlineEye /> View Information
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<TablePagination
							currentPage={visibleApplicationsPage.currentPage}
							totalItems={visibleApplications.length}
							onPageChange={(page) => setTablePage("grantor_applications", page)}
						/>
					</section>
				) : null}

				{activeSection === "announcements" ? (
					<section className="admin-management-panel">
						<div className="admin-panel-head">
							<div>
								<h2>Announcement</h2>
								<p className="admin-panel-copy">Publish scholarship opening notices directly from the grantor side.</p>
							</div>
						</div>
						<form className="grantor-announcement-form" onSubmit={handlePostAnnouncement}>
							<div className="grantor-announcement-form__grid">
								<input type="text" placeholder="Announcement title" value={announcementForm.title} onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, title: event.target.value }))} />
								<input type="text" placeholder="Short subtitle" value={announcementForm.subtitle} onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, subtitle: event.target.value }))} />
								<input type="text" placeholder="Application window" value={announcementForm.applicationWindow} onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, applicationWindow: event.target.value }))} />
							</div>
							<textarea placeholder="Describe the scholarship opening, deadlines, and next steps." value={announcementForm.description} onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, description: event.target.value }))} />
							<div className="grantor-announcement-form__actions"><button type="submit" className="admin-export-btn" disabled={busy === "announcement"}>{busy === "announcement" ? "Posting..." : "Post Announcement"}</button></div>
						</form>
						<div className="grantor-announcement-list">
							{announcements.length === 0 ? <div className="admin-empty-state-card"><strong>No grantor announcements yet.</strong></div> : announcements.map((item) => (
								<article key={item.id} className="grantor-announcement-card">
									<div className="grantor-announcement-card__head"><div><h3>{item.title}</h3><p>{item.subtitle || "Scholarship application notice"}</p></div><span className={statusClass(item.status || "Open")}>{item.status || "Open"}</span></div>
									<p className="grantor-announcement-card__copy">{item.description}</p>
									<div className="grantor-announcement-card__meta"><span>Window: {item.applicationWindow || "-"}</span><span>Posted: {formatDateTime(item.createdAt)}</span></div>
								</article>
							))}
						</div>
					</section>
				) : null}
			</main>
			{applicationModalState.open ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={closeApplicationModal}>
					<div className="admin-detail-shell admin-detail-shell--student" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={closeApplicationModal}><HiX /></button>
						<div className="admin-detail-modal admin-detail-modal--student grantor-modal" role="dialog" aria-modal="true" aria-label="Applicant information">
							<div className="admin-detail-info">
								<div className="admin-detail-header">
									<img src={logo2} alt="Applicant" className="admin-detail-avatar" />
									<div>
										<h3>{applicationModalState.application?.fullName || "Applicant Information"}</h3>
										<p className="admin-detail-meta">
											{applicationModalState.application?.scholarshipName || "-"} | Application No. {applicationModalState.application?.applicationNumber || applicationModalState.application?.requestNumber || "-"}
										</p>
									</div>
								</div>

								{applicationModalState.loading ? (
									<div className="admin-empty-state-card"><strong>Loading applicant information...</strong></div>
								) : (
									<>
										<div className="grantor-application-summary">
											<div className="grantor-application-summary-card">
												<span>Current Step</span>
												<strong>{applicationModalState.trackingProgress?.currentStepLabel || "Applied"}</strong>
											</div>
										</div>

										<div className="grantor-application-grid">
											<section className="grantor-application-card grantor-application-card--student">
												<h4>Student Information</h4>
												<div className="grantor-application-info-list">
													<p><span>Student ID</span><strong>{applicationModalState.application?.studentId || "-"}</strong></p>
													<p><span>Full Name</span><strong>{applicationModalState.application?.fullName || "-"}</strong></p>
													<p><span>Email</span><strong>{applicationModalState.student?.email || applicationModalState.application?.email || "-"}</strong></p>
													<p><span>CP Number</span><strong>{applicationModalState.student?.cpNumber || applicationModalState.application?.cpNumber || "-"}</strong></p>
													<p><span>Course</span><strong>{applicationModalState.student?.course || "-"}</strong></p>
													<p><span>Year Level</span><strong>{applicationModalState.student?.year || applicationModalState.student?.yearLevel || "-"}</strong></p>
													<p><span>Address</span><strong>{[
														applicationModalState.student?.houseNumber,
														applicationModalState.student?.street,
														applicationModalState.student?.city,
														applicationModalState.student?.province,
														applicationModalState.student?.postalCode,
													].filter(Boolean).join(", ") || "-"}</strong></p>
													<p><span>Applied On</span><strong>{formatDateTime(applicationModalState.application?.appliedAt || applicationModalState.application?.createdAt)}</strong></p>
												</div>
											</section>

											<section className="grantor-application-card">
												<h4>Documents</h4>
												<div className="grantor-document-links">
													{[
														{ id: "cor", label: "COR" },
														{ id: "cog", label: "COG" },
														{ id: "schoolId", label: "School ID" },
													].map((document) => (
														<a
															key={document.id}
															href={applicationModalState.documentUrls?.[document.id] || "#"}
															target="_blank"
															rel="noreferrer"
															className={`grantor-document-link ${applicationModalState.documentUrls?.[document.id] ? "" : "is-disabled"}`.trim()}
															onClick={(event) => {
																if (!applicationModalState.documentUrls?.[document.id]) {
																	event.preventDefault()
																}
															}}
														>
															<span>{document.label}</span>
															<strong>
																{applicationModalState.documentUrls?.[document.id]
																	? "View Document"
																	: "Not Uploaded"}
															</strong>
														</a>
													))}
												</div>
											</section>
										</div>

										<section className="grantor-application-card">
											<h4>Tracking</h4>
											{applicationModalState.trackingProgress?.steps?.length ? (
												<div className="grantor-tracking-list">
													{applicationModalState.trackingProgress.steps.map((step) => {
														const stepBadgeLabel = getScholarshipTrackingStepBadgeLabel(
															step,
															applicationModalState.trackingProgress.steps,
														)

														return (
															<div
																key={step.id}
																className={`grantor-tracking-step grantor-tracking-step--${step.state}`.trim()}
															>
																<div>
																	<strong>{step.label}</strong>
																	<p>{step.detail || "Tracking detail unavailable."}</p>
																</div>
																{stepBadgeLabel ? (
																	<span className={statusClass(stepBadgeLabel === "Completed" ? "Approved" : stepBadgeLabel === "Pending" ? "Pending" : "")}>
																		{stepBadgeLabel}
																	</span>
																) : null}
															</div>
														)
													})}
												</div>
											) : (
												<div className="admin-empty-state-card"><strong>No tracking data available yet.</strong></div>
											)}
										</section>

										<div className="grantor-application-actions">
											<button
												type="button"
												className="admin-export-btn"
												onClick={handleCompleteGrantorStage}
												disabled={
													busy === "grantor_tracking" ||
													!grantorActionStepLabel ||
													!applicationModalState.trackingProgress?.canAdminCompleteCurrentStep
												}
											>
												{busy === "grantor_tracking"
													? "Completing..."
													: grantorActionStepLabel
														? `Complete ${grantorActionStepLabel}`
														: "Complete Stage"}
											</button>
										</div>
									</>
								)}
							</div>
						</div>
					</div>
				</div>
			) : null}
			{showCreateModal ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={closeCreateModal}>
					<div className="admin-detail-shell admin-detail-shell--student" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={closeCreateModal}><HiX /></button>
						<div className="admin-detail-modal admin-detail-modal--student grantor-modal" role="dialog" aria-modal="true" aria-label="Add scholar">
							<div className="admin-detail-info">
								<div className="admin-detail-header">
									<img src={logo2} alt="Grantor" className="admin-detail-avatar" />
									<div>
										<h3>Add Scholar</h3>
										<p className="admin-detail-meta">Upload-ready modal for spreadsheet intake plus manual scholar entry.</p>
									</div>
								</div>
								{importData ? (
									<div className="grantor-import-preview">
										<div className="grantor-import-info">
											<div>
												<strong>{importData.length}</strong> rows detected from <em>{uploadFile?.name}</em>
												<p className="grantor-import-sub">Select the corresponding system field for each column below.</p>
											</div>
											<button type="button" className="admin-table-btn admin-table-btn--mini" onClick={() => { setImportData(null); setUploadFile(null); }}>Clear & Restart</button>
										</div>
										<div className="grantor-import-table-wrap">
											<table className="grantor-import-table">
												<thead>
													<tr>
														{importData[0].map((_, colIndex) => (
															<th key={colIndex}>
																<select 
																	className="grantor-import-select"
																	value={columnMapping[colIndex] || ""}
																	onChange={(e) => {
																		const newMapping = [...columnMapping]
																		newMapping[colIndex] = e.target.value
																		setColumnMapping(newMapping)
																	}}
																>
																	<option value="">Ignore Column</option>
																	{MAPPABLE_FIELDS.map(field => (
																		<option key={field.id} value={field.id}>{field.label}</option>
																	))}
																</select>
															</th>
														))}
													</tr>
												</thead>
												<tbody>
													{importPreviewPage.rows.map((row, rowIndex) => (
														<tr key={rowIndex}>
															{row.map((cell, cellIndex) => (
																<td key={cellIndex}>{cell}</td>
															))}
														</tr>
													))}
													{importData.length > TABLE_PAGE_SIZE && (
														<tr>
															<td colSpan={importData[0].length} className="grantor-import-more">
																Showing {importPreviewPage.startIndex}-{importPreviewPage.endIndex} of {importData.length} rows.
															</td>
														</tr>
													)}
												</tbody>
											</table>
										</div>
										<TablePagination
											currentPage={importPreviewPage.currentPage}
											totalItems={importData.length}
											onPageChange={(page) => setTablePage("grantor_import_preview", page)}
										/>
									</div>
								) : (
									<>
										<div className={`grantor-upload-zone ${uploadActive ? "is-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setUploadActive(true) }} onDragLeave={(event) => { event.preventDefault(); setUploadActive(false) }} onDrop={(event) => { event.preventDefault(); setUploadActive(false); handleUpload(event.dataTransfer.files?.[0] || null) }}>
											<div className="grantor-upload-zone__icon"><HiOutlineCloudUpload /></div>
											<strong>Drag and drop a scholar file here</strong>
											<p>Supported formats: {GRANTOR_ACCEPTED_UPLOAD_EXTENSIONS.join(", ")}</p>
											<input ref={fileInputRef} type="file" accept={GRANTOR_ACCEPT_ATTR} onChange={(event) => handleUpload(event.target.files?.[0] || null)} hidden />
											<button type="button" className="admin-table-btn" onClick={() => fileInputRef.current?.click()}>Choose File</button>
											{uploadFile ? <div className="grantor-upload-zone__file"><strong>{uploadFile.name}</strong><span>{Math.max(1, Math.round(uploadFile.size / 1024))} KB</span></div> : null}
										</div>
										<div className="grantor-form-grid">
											<input type="text" placeholder="Student ID" value={createForm.studentId} onChange={(event) => setCreateForm((prev) => ({ ...prev, studentId: event.target.value }))} />
											<input type="text" placeholder="Email" value={createForm.email} onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))} />
											<input type="text" placeholder="Contact Number" value={createForm.cpNumber} onChange={(event) => setCreateForm((prev) => ({ ...prev, cpNumber: event.target.value }))} />
											<input type="text" placeholder="First name" value={createForm.fname} onChange={(event) => setCreateForm((prev) => ({ ...prev, fname: event.target.value }))} />
											<input type="text" placeholder="Middle name" value={createForm.mname} onChange={(event) => setCreateForm((prev) => ({ ...prev, mname: event.target.value }))} />
											<input type="text" placeholder="Last name" value={createForm.lname} onChange={(event) => setCreateForm((prev) => ({ ...prev, lname: event.target.value }))} />
											<input type="text" placeholder="House No." value={createForm.houseNumber} onChange={(event) => setCreateForm((prev) => ({ ...prev, houseNumber: event.target.value }))} />
											<input type="text" placeholder="Street" value={createForm.street} onChange={(event) => setCreateForm((prev) => ({ ...prev, street: event.target.value }))} />
											<input type="text" placeholder="City" value={createForm.city} onChange={(event) => setCreateForm((prev) => ({ ...prev, city: event.target.value }))} />
											<input type="text" placeholder="Province" value={createForm.province} onChange={(event) => setCreateForm((prev) => ({ ...prev, province: event.target.value }))} />
											<input type="text" placeholder="Postal Code" value={createForm.postalCode} onChange={(event) => setCreateForm((prev) => ({ ...prev, postalCode: event.target.value }))} />
											<input type="text" placeholder="Course" value={createForm.course} onChange={(event) => setCreateForm((prev) => ({ ...prev, course: event.target.value }))} />
											<select value={createForm.yearLevel} onChange={(event) => setCreateForm((prev) => ({ ...prev, yearLevel: event.target.value }))}>{YEAR_LEVELS.map((level) => <option key={level} value={level}>Year {level}</option>)}</select>
											<input type="text" placeholder="Scholarship title" value={createForm.scholarshipTitle} onChange={(event) => setCreateForm((prev) => ({ ...prev, scholarshipTitle: event.target.value }))} />
											<input type="text" placeholder="Status" value={createForm.status} onChange={(event) => setCreateForm((prev) => ({ ...prev, status: event.target.value }))} />
											<textarea placeholder="Notes" value={createForm.notes} onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))} />
										</div>
									</>
								)}
								<div className="grantor-modal-actions grantor-modal-actions--split">
									<button type="button" className="admin-table-btn" onClick={closeCreateModal}>Cancel</button>
									<button type="button" className="admin-export-btn" onClick={handleCreateScholar} disabled={busy === "create"}>
										{busy === "create" ? "Processing..." : importData ? `Import ${importData.length} Scholars` : "Save Scholar"}
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			) : null}
			{showEditModal && selectedScholar ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={closeEditModal}>
					<div className="admin-detail-shell admin-detail-shell--student" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={closeEditModal}><HiX /></button>
						<div className="admin-detail-modal admin-detail-modal--student grantor-modal" role="dialog" aria-modal="true" aria-label="Edit scholar">
							<div className="admin-detail-info">
								<div className="admin-detail-header">
									<img src={logo2} alt="Scholar" className="admin-detail-avatar" />
									<div>
										<h3>Edit Scholar</h3>
										<p className="admin-detail-meta">Update the current scholar record for this grantor roster.</p>
									</div>
								</div>
								<div className="grantor-form-grid">
									<input type="text" placeholder="Student ID" value={editForm.studentId} onChange={(event) => setEditForm((prev) => ({ ...prev, studentId: event.target.value }))} />
									<input type="text" placeholder="Email" value={editForm.email} onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))} />
									<input type="text" placeholder="Contact Number" value={editForm.cpNumber} onChange={(event) => setEditForm((prev) => ({ ...prev, cpNumber: event.target.value }))} />
									<input type="text" placeholder="First name" value={editForm.fname} onChange={(event) => setEditForm((prev) => ({ ...prev, fname: event.target.value }))} />
									<input type="text" placeholder="Middle name" value={editForm.mname} onChange={(event) => setEditForm((prev) => ({ ...prev, mname: event.target.value }))} />
									<input type="text" placeholder="Last name" value={editForm.lname} onChange={(event) => setEditForm((prev) => ({ ...prev, lname: event.target.value }))} />
									<input type="text" placeholder="House No." value={editForm.houseNumber} onChange={(event) => setEditForm((prev) => ({ ...prev, houseNumber: event.target.value }))} />
									<input type="text" placeholder="Street" value={editForm.street} onChange={(event) => setEditForm((prev) => ({ ...prev, street: event.target.value }))} />
									<input type="text" placeholder="City" value={editForm.city} onChange={(event) => setEditForm((prev) => ({ ...prev, city: event.target.value }))} />
									<input type="text" placeholder="Province" value={editForm.province} onChange={(event) => setEditForm((prev) => ({ ...prev, province: event.target.value }))} />
									<input type="text" placeholder="Postal Code" value={editForm.postalCode} onChange={(event) => setEditForm((prev) => ({ ...prev, postalCode: event.target.value }))} />
									<input type="text" placeholder="Course" value={editForm.course} onChange={(event) => setEditForm((prev) => ({ ...prev, course: event.target.value }))} />
									<select value={editForm.yearLevel} onChange={(event) => setEditForm((prev) => ({ ...prev, yearLevel: event.target.value }))}>{YEAR_LEVELS.map((level) => <option key={level} value={level}>Year {level}</option>)}</select>
									<input type="text" placeholder="Scholarship title" value={editForm.scholarshipTitle} onChange={(event) => setEditForm((prev) => ({ ...prev, scholarshipTitle: event.target.value }))} />
									<input type="text" placeholder="Status" value={editForm.status} onChange={(event) => setEditForm((prev) => ({ ...prev, status: event.target.value }))} />
									<textarea placeholder="Notes" value={editForm.notes} onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))} />
								</div>
								<div className="grantor-modal-actions grantor-modal-actions--split">
									<button type="button" className="admin-table-btn" onClick={closeEditModal}>Cancel</button>
									<button type="button" className="admin-export-btn" onClick={handleSaveScholar} disabled={busy === "edit"}>{busy === "edit" ? "Saving..." : "Save"}</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			) : null}
		</div>
	)
}
