
import { useEffect, useMemo, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
	addDoc,
	collection,
	doc,
	getDocs,
	onSnapshot,
	query,
	serverTimestamp,
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
	BarElement,
	ArcElement,
	Tooltip,
	Legend,
} from "chart.js"
import { Line, Doughnut, Bar } from "react-chartjs-2"
import {
	HiOutlineAcademicCap,
	HiOutlineBell,
	HiOutlineClock,
	HiOutlineDocumentText,
	HiOutlineLogout,
	HiOutlineMoon,
	HiOutlineSun,
	HiOutlineUserGroup,
	HiOutlineUsers,
	HiOutlineShieldCheck,
	HiOutlineTrash,
	HiChevronDown,
	HiChevronUp,
	HiX,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { db } from "../../firebase"
import useThemeMode from "../hooks/useThemeMode"
import { uploadToCloudinary } from "../services/cloudinaryService"
import {
	exportScholarshipsReportPdf,
	exportSoeRequestsReportPdf,
	exportStudentsReportPdf,
	filterScholarshipRows,
	filterStudentRows,
	formatDate,
	mapScholarshipRows,
	mapStudents,
} from "../services/adminService"
import logo2 from "../assets/logo2.png"
import "../css/AdminDashboard.css"
import "../css/StudentDashboard.css"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend)

const ADMIN_SECTIONS = [
	{ id: "dashboard", label: "Dashboard", icon: HiOutlineAcademicCap, path: "/admin/dashboard" },
	{ id: "students", label: "Student Management", icon: HiOutlineUsers, path: "/admin/students" },
	{ id: "scholarships", label: "Scholarship Programs", icon: HiOutlineDocumentText, path: "/admin/scholarships" },
	{ id: "soe", label: "SOE Requests", icon: HiOutlineClock, path: "/admin/soe-requests" },
	{ id: "announcements", label: "Announcements", icon: HiOutlineBell, path: "/admin/announcements" },
]

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6

function toSectionFromPath(pathname) {
	const match = ADMIN_SECTIONS.find((item) => pathname.startsWith(item.path))
	return match?.id || "dashboard"
}

function toProviderType(value = "") {
	const normalized = String(value).toLowerCase()
	if (normalized.includes("kuya")) return "kuya_win"
	if (normalized.includes("tina")) return "tina_pancho"
	if (normalized.includes("morisson") || normalized.includes("morrison")) return "morisson"
	if (normalized.includes("none")) return "none"
	return "other"
}

function toJsDate(value) {
	if (!value) return null
	if (value?.toDate) return value.toDate()
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

function isScholarshipTrackable(status = "") {
	const value = String(status).toLowerCase()
	return !["rejected", "withdrawn", "expired", "cancelled", "resolved", "denied"].some((s) => value.includes(s))
}

function toDateString(value) {
	if (!value) return ""
	const date = toJsDate(value)
	if (!date) return ""
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

function toStatusClass(status = "") {
	const normalized = String(status).toLowerCase()
	if (normalized.includes("pending")) return "admin-status-badge admin-status-badge--pending"
	if (normalized.includes("issued") || normalized.includes("approved") || normalized.includes("validated")) return "admin-status-badge admin-status-badge--ok"
	if (normalized.includes("rejected") || normalized.includes("blocked")) return "admin-status-badge admin-status-badge--danger"
	return "admin-status-badge admin-status-badge--neutral"
}

export default function AdminDashboard() {
	const navigate = useNavigate()
	const location = useLocation()
	const { theme, setTheme } = useThemeMode()
	const activeSection = toSectionFromPath(location.pathname)

	const [studentsRaw, setStudentsRaw] = useState([])
	const [applicationsRaw, setApplicationsRaw] = useState([])
	const [soeRequests, setSoeRequests] = useState([])
	const [announcements, setAnnouncements] = useState([])

	const [studentSearch, setStudentSearch] = useState("")
	const [studentCourse, setStudentCourse] = useState("All")
	const [studentYear, setStudentYear] = useState("All")
	const [studentValidation, setStudentValidation] = useState("All")
	const [scholarshipProvider, setScholarshipProvider] = useState("All")
	const [scholarshipStatus, setScholarshipStatus] = useState("All")
	const [applicationTrendRange, setApplicationTrendRange] = useState("monthly")
	const [soeTrendRange, setSoeTrendRange] = useState("monthly")
	const [soeSearch, setSoeSearch] = useState("")
	const [soeStatus, setSoeStatus] = useState("All")
	const [selectedStudentId, setSelectedStudentId] = useState("")
	const [isBusy, setIsBusy] = useState(false)

	const [announcementTitle, setAnnouncementTitle] = useState("")
	const [announcementDescription, setAnnouncementDescription] = useState("")
	const [announcementType, setAnnouncementType] = useState("Update")
	const [announcementImageFiles, setAnnouncementImageFiles] = useState([])
	const [announcementStartDate, setAnnouncementStartDate] = useState("")
	const [announcementEndDate, setAnnouncementEndDate] = useState("")
	const [showAnnouncementSchedule, setShowAnnouncementSchedule] = useState(false)
	const [announcementCalendarMonth, setAnnouncementCalendarMonth] = useState(() => {
		const now = new Date()
		return new Date(now.getFullYear(), now.getMonth(), 1)
	})
	const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false)

	const [warningSearch, setWarningSearch] = useState("")
	const [providerSearch, setProviderSearch] = useState({ kuya_win: "", tina_pancho: "", morisson: "", other: "", none: "" })
	const [providerStatus, setProviderStatus] = useState({ kuya_win: "All", tina_pancho: "All", morisson: "All", other: "All", none: "All" })
	const [collapsedTables, setCollapsedTables] = useState({ warning: false, kuya_win: true, tina_pancho: true, morisson: true, other: true, none: true })
	const [soeResetByStudent, setSoeResetByStudent] = useState({})

	useEffect(() => {
		const storedType = sessionStorage.getItem("bulsuscholar_userType")
		if (storedType !== "admin") navigate("/", { replace: true })
	}, [navigate])

	useEffect(() => {
		if (location.pathname === "/admin" || location.pathname === "/admin/") {
			navigate("/admin/dashboard", { replace: true })
		}
	}, [location.pathname, navigate])

	useEffect(() => {
		const unsubs = [
			onSnapshot(collection(db, "students"), (snap) => setStudentsRaw(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })))),
			onSnapshot(collection(db, "scholarshipApplications"), (snap) => setApplicationsRaw(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })))),
			onSnapshot(collection(db, "soeRequests"), (snap) => setSoeRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })))),
			onSnapshot(collection(db, "announcements"), (snap) => {
				setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })).sort((a, b) => (toJsDate(b.createdAt)?.getTime() || 0) - (toJsDate(a.createdAt)?.getTime() || 0)))
			}),
		]
		return () => unsubs.forEach((u) => u())
	}, [])
	const studentRows = useMemo(() => mapStudents(studentsRaw), [studentsRaw])
	const scholarshipRows = useMemo(() => mapScholarshipRows(studentsRaw, applicationsRaw), [studentsRaw, applicationsRaw])
	const filteredStudents = useMemo(() => filterStudentRows(studentRows, { search: studentSearch, course: studentCourse, year: studentYear, validation: studentValidation }), [studentRows, studentSearch, studentCourse, studentYear, studentValidation])
	const filteredScholarships = useMemo(() => filterScholarshipRows(scholarshipRows, { provider: scholarshipProvider, status: scholarshipStatus }), [scholarshipRows, scholarshipProvider, scholarshipStatus])
	const studentsByCourse = useMemo(() => [...new Set(studentRows.map((item) => item.course).filter(Boolean))].sort(), [studentRows])
	const studentsByYear = useMemo(() => [...new Set(studentRows.map((item) => item.yearLevel).filter(Boolean))].sort(), [studentRows])

	const providerCounts = useMemo(() => {
		const counts = { kuya_win: 0, tina_pancho: 0, morisson: 0, other: 0 }
		studentsRaw.forEach((student) => {
			const scholarships = Array.isArray(student.scholarships) ? student.scholarships : []
			scholarships.forEach((sch) => {
				if (!isScholarshipTrackable(sch.status)) return
				const type = toProviderType(sch.providerType || sch.provider || sch.name)
				if (type !== "none") counts[type] += 1
			})
		})
		return counts
	}, [studentsRaw])
	const providerTotal = useMemo(() => Object.values(providerCounts).reduce((sum, value) => sum + value, 0), [providerCounts])
	const providerLabels = ["Kuya Win", "Tina Pancho", "Morisson", "Other"]
	const providerValues = [providerCounts.kuya_win, providerCounts.tina_pancho, providerCounts.morisson, providerCounts.other]
	const providerPercentages = useMemo(() => providerValues.map((value) => (providerTotal > 0 ? Number(((value / providerTotal) * 100).toFixed(1)) : 0)), [providerValues, providerTotal])

	const studentProfiles = useMemo(() => studentsRaw.map((student) => ({ ...student, fullName: [student.fname, student.mname, student.lname].filter(Boolean).join(" ") || "Student", scholarships: Array.isArray(student.scholarships) ? student.scholarships : [] })), [studentsRaw])
	const selectedStudent = useMemo(() => studentProfiles.find((s) => s.id === selectedStudentId) || null, [selectedStudentId, studentProfiles])
	const selectedStudentLastSoe = useMemo(() => {
		if (!selectedStudent?.id) return "No SOE request yet"
		const latest = soeRequests
			.filter((row) => row.studentId === selectedStudent.id)
			.sort((a, b) => (toJsDate(b.timestamp)?.getTime() || 0) - (toJsDate(a.timestamp)?.getTime() || 0))[0]
		return latest ? formatDate(latest.timestamp) : "No SOE request yet"
	}, [selectedStudent, soeRequests])

	const providerRows = useMemo(() => {
		const rows = { kuya_win: [], tina_pancho: [], morisson: [], other: [], none: [] }
		studentProfiles.forEach((student) => {
			if (student.scholarships.length === 0) {
				rows.none.push({ studentId: student.id, fullName: student.fullName, scholarship: "-", status: "No Scholarship" })
				return
			}
			student.scholarships.forEach((sch) => {
				const type = toProviderType(sch.providerType || sch.provider || sch.name)
				const key = rows[type] ? type : "other"
				rows[key].push({ studentId: student.id, fullName: student.fullName, scholarship: sch.name || sch.provider || "Scholarship", status: sch.status || "Saved", scholarshipId: sch.id, adminBlocked: sch.adminBlocked === true })
			})
		})
		return rows
	}, [studentProfiles])

	const warningRows = useMemo(() => {
		const keyword = warningSearch.trim().toLowerCase()
		return studentProfiles
			.filter((student) => student.scholarships.filter((sch) => isScholarshipTrackable(sch.status)).length > 1)
			.map((student) => ({ studentId: student.id, fullName: student.fullName, details: student.scholarships.map((sch) => sch.name || sch.provider || "Scholarship").join(", ") }))
			.filter((row) => !keyword || row.studentId.toLowerCase().includes(keyword) || row.fullName.toLowerCase().includes(keyword) || row.details.toLowerCase().includes(keyword))
	}, [studentProfiles, warningSearch])

	const soeFiltered = useMemo(() => {
		const keyword = soeSearch.trim().toLowerCase()
		return soeRequests.filter((row) => {
			const matchesSearch = !keyword || String(row.studentId || "").toLowerCase().includes(keyword) || String(row.scholarshipName || "").toLowerCase().includes(keyword)
			const matchesStatus = soeStatus === "All" || String(row.status || "") === soeStatus
			return matchesSearch && matchesStatus
		})
	}, [soeRequests, soeSearch, soeStatus])

	const soeCooldownWarnings = useMemo(() => {
		const grouped = new Map()
		soeRequests.forEach((row) => {
			if (!row.studentId) return
			if (!grouped.has(row.studentId)) grouped.set(row.studentId, [])
			grouped.get(row.studentId).push(row)
		})
		const list = []
		grouped.forEach((rows, studentId) => {
			const sorted = rows.slice().sort((a, b) => (toJsDate(a.timestamp)?.getTime() || 0) - (toJsDate(b.timestamp)?.getTime() || 0))
			for (let i = 1; i < sorted.length; i += 1) {
				const prev = toJsDate(sorted[i - 1].timestamp)
				const curr = toJsDate(sorted[i].timestamp)
				if (!prev || !curr) continue
				if (curr.getTime() - prev.getTime() < SIX_MONTHS_MS) {
					list.push({ id: `${studentId}_${sorted[i].id}`, studentId, scholarship: sorted[i].scholarshipName || "-", previousDate: prev, requestDate: curr })
				}
			}
		})
		return list.sort((a, b) => b.requestDate.getTime() - a.requestDate.getTime())
	}, [soeRequests])

	const metrics = useMemo(() => ({ totalStudents: studentsRaw.length, activePrograms: providerTotal, issuedSoe: soeRequests.filter((row) => String(row.status || "").toLowerCase().includes("issued")).length, pendingSoe: soeRequests.filter((row) => String(row.status || "").toLowerCase().includes("pending")).length, conflicts: warningRows.length }), [studentsRaw.length, providerTotal, soeRequests, warningRows.length])

	const applicationTrendData = useMemo(() => {
		const now = new Date()
		const buckets = []
		const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
		if (applicationTrendRange === "daily") {
			for (let i = 13; i >= 0; i -= 1) {
				const d = new Date(now)
				d.setDate(now.getDate() - i)
				const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
				buckets.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}` })
			}
		} else if (applicationTrendRange === "weekly") {
			const end = new Date(now)
			end.setDate(now.getDate() - now.getDay())
			for (let i = 11; i >= 0; i -= 1) {
				const weekStart = new Date(end)
				weekStart.setDate(end.getDate() - i * 7)
				const key = `${weekStart.getFullYear()}-W${String(Math.ceil(((weekStart - new Date(weekStart.getFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, "0")}`
				buckets.push({ key, label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}` })
			}
		} else if (applicationTrendRange === "yearly") {
			for (let i = 5; i >= 0; i -= 1) {
				const year = now.getFullYear() - i
				buckets.push({ key: String(year), label: String(year) })
			}
		} else {
			for (let i = 0; i < 12; i += 1) {
				const key = `${now.getFullYear()}-${String(i + 1).padStart(2, "0")}`
				buckets.push({ key, label: monthNames[i] })
			}
		}

		const totals = Object.fromEntries(buckets.map((b) => [b.key, 0]))
		const approved = Object.fromEntries(buckets.map((b) => [b.key, 0]))

		applicationsRaw.forEach((row) => {
			const date = toJsDate(row.appliedAt || row.createdAt || row.timestamp)
			if (!date) return
			let key = ""
			if (applicationTrendRange === "daily") {
				key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
			} else if (applicationTrendRange === "weekly") {
				const d = new Date(date)
				d.setDate(d.getDate() - d.getDay())
				key = `${d.getFullYear()}-W${String(Math.ceil(((d - new Date(d.getFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, "0")}`
			} else if (applicationTrendRange === "yearly") {
				key = String(date.getFullYear())
			} else {
				key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
			}
			if (!(key in totals)) return
			totals[key] += 1
			const statusText = String(row.status || row.applicationStatus || row.scholarshipStatus || row.decision || "").toLowerCase()
			const approvedFlag = row.isApproved === true || statusText.includes("approved") || statusText.includes("issued")
			if (approvedFlag) approved[key] += 1
		})

		return {
			labels: buckets.map((b) => b.label),
			datasets: [
				{
					label: "Approved",
					data: buckets.map((b) => approved[b.key]),
					borderColor: theme === "dark" ? "#16a34a" : "#15803d",
					backgroundColor: theme === "dark" ? "rgba(22,163,74,0.22)" : "rgba(22,163,74,0.20)",
					fill: true,
					tension: 0.35,
					pointRadius: 3,
					pointHoverRadius: 5,
					borderWidth: 3,
				},
				{
					label: "Total Applications",
					data: buckets.map((b) => totals[b.key]),
					borderColor: theme === "dark" ? "#22c55e" : "#22c55e",
					backgroundColor: theme === "dark" ? "rgba(34,197,94,0.28)" : "rgba(34,197,94,0.22)",
					fill: true,
					tension: 0.35,
					pointRadius: 3,
					pointHoverRadius: 5,
					borderWidth: 3,
				},
			],
		}
	}, [applicationsRaw, theme, applicationTrendRange])

	const soeTrendData = useMemo(() => {
		const now = new Date()
		const buckets = []
		const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
		if (soeTrendRange === "daily") {
			for (let i = 13; i >= 0; i -= 1) {
				const d = new Date(now)
				d.setDate(now.getDate() - i)
				const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
				buckets.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}` })
			}
		} else if (soeTrendRange === "weekly") {
			const end = new Date(now)
			end.setDate(now.getDate() - now.getDay())
			for (let i = 11; i >= 0; i -= 1) {
				const weekStart = new Date(end)
				weekStart.setDate(end.getDate() - i * 7)
				const key = `${weekStart.getFullYear()}-W${String(Math.ceil(((weekStart - new Date(weekStart.getFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, "0")}`
				buckets.push({ key, label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}` })
			}
		} else if (soeTrendRange === "yearly") {
			for (let i = 5; i >= 0; i -= 1) {
				const year = now.getFullYear() - i
				buckets.push({ key: String(year), label: String(year) })
			}
		} else {
			for (let i = 0; i < 12; i += 1) {
				const key = `${now.getFullYear()}-${String(i + 1).padStart(2, "0")}`
				buckets.push({ key, label: monthNames[i] })
			}
		}

		const counts = Object.fromEntries(buckets.map((b) => [b.key, 0]))
		soeRequests.forEach((row) => {
			const date = toJsDate(row.timestamp)
			if (!date) return
			let key = ""
			if (soeTrendRange === "daily") {
				key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
			} else if (soeTrendRange === "weekly") {
				const d = new Date(date)
				d.setDate(d.getDate() - d.getDay())
				key = `${d.getFullYear()}-W${String(Math.ceil(((d - new Date(d.getFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, "0")}`
			} else if (soeTrendRange === "yearly") {
				key = String(date.getFullYear())
			} else {
				key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
			}
			if (key in counts) counts[key] += 1
		})

		return {
			labels: buckets.map((b) => b.label),
			datasets: [{ label: "SOE Requests", data: buckets.map((b) => counts[b.key]), backgroundColor: theme === "dark" ? "#0ea5e9" : "#1e3a8a", borderRadius: 8 }],
		}
	}, [soeRequests, theme, soeTrendRange])

	const chartOptions = useMemo(() => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: theme === "dark" ? "#d1d5db" : "#1e293b", font: { size: 14, weight: 600 } } } }, scales: { x: { ticks: { color: theme === "dark" ? "#cbd5e1" : "#334155", font: { size: 13, weight: 600 } }, grid: { color: theme === "dark" ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.25)" } }, y: { beginAtZero: true, ticks: { color: theme === "dark" ? "#cbd5e1" : "#334155", font: { size: 13, weight: 600 } }, grid: { color: theme === "dark" ? "rgba(148, 163, 184, 0.2)" : "rgba(148, 163, 184, 0.25)" } } } }), [theme])
	const applicationTrendOptions = useMemo(() => ({
		...chartOptions,
		plugins: {
			...chartOptions.plugins,
			legend: {
				position: "bottom",
				labels: {
					color: theme === "dark" ? "#d1d5db" : "#334155",
					boxWidth: 38,
					font: { size: 14, weight: 700 },
				},
			},
		},
	}), [chartOptions, theme])
	const dashboardDoughnutOptions = useMemo(() => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { color: theme === "dark" ? "#e2e8f0" : "#1e293b", font: { size: 14, weight: 700 } } }, tooltip: { callbacks: { label: (context) => `${context.label}: ${providerPercentages[context.dataIndex] || 0}%` } } } }), [providerPercentages, theme])

	const currentAnnouncements = useMemo(() => {
		const now = Date.now()
		return announcements.filter((item) => {
			if (item.archived === true) return false
			const endDate = toJsDate(item.endDate || item.scheduleEnd)
			if (!endDate) return true
			return endDate.getTime() >= now
		})
	}, [announcements])
	const previousAnnouncements = useMemo(() => {
		const now = Date.now()
		return announcements.filter((item) => {
			if (item.archived === true) return true
			const endDate = toJsDate(item.endDate || item.scheduleEnd)
			return endDate ? endDate.getTime() < now : false
		})
	}, [announcements])

	const todayStart = useMemo(() => {
		const d = new Date()
		d.setHours(0, 0, 0, 0)
		return d
	}, [])

	const currentMonthStart = useMemo(() => new Date(todayStart.getFullYear(), todayStart.getMonth(), 1), [todayStart])

	const announcementCalendarDays = useMemo(() => {
		const year = announcementCalendarMonth.getFullYear()
		const month = announcementCalendarMonth.getMonth()
		const firstDayIndex = new Date(year, month, 1).getDay()
		const daysInMonth = new Date(year, month + 1, 0).getDate()
		const cells = []
		for (let i = 0; i < firstDayIndex; i += 1) {
			cells.push({ key: `empty_${i}`, empty: true })
		}
		for (let day = 1; day <= daysInMonth; day += 1) {
			const dateObj = new Date(year, month, day)
			dateObj.setHours(0, 0, 0, 0)
			const iso = toDateString(dateObj)
			const disabled = dateObj < todayStart
			const isStart = announcementStartDate === iso
			const isEnd = announcementEndDate === iso
			const inRange = Boolean(announcementStartDate && announcementEndDate && iso > announcementStartDate && iso < announcementEndDate)
			cells.push({ key: iso, empty: false, day, iso, disabled, isStart, isEnd, inRange })
		}
		return cells
	}, [announcementCalendarMonth, todayStart, announcementStartDate, announcementEndDate])

	const handleAnnouncementDatePick = (iso, disabled) => {
		if (disabled) return
		if (!announcementStartDate || (announcementStartDate && announcementEndDate)) {
			setAnnouncementStartDate(iso)
			setAnnouncementEndDate("")
			return
		}
		if (iso < announcementStartDate) {
			setAnnouncementStartDate(iso)
			return
		}
		setAnnouncementEndDate(iso)
	}

	const runAction = async (fn, success) => {
		if (isBusy) return
		setIsBusy(true)
		try {
			await fn()
			toast.success(success)
		} catch (error) {
			console.error(error)
			toast.error("Action failed.")
		} finally {
			setIsBusy(false)
		}
	}

	const resetSoeTimer = async (studentId) => {
		if (!studentId) return
		await runAction(async () => {
			await updateDoc(doc(db, "students", studentId), { soeLastExportAt: null, soeCooldownOverrideAt: serverTimestamp(), updatedAt: serverTimestamp() })
			setSoeResetByStudent((prev) => ({ ...prev, [studentId]: Date.now() }))
		}, "SOE cooldown reset.")
	}

	const isSoeResetDisabled = (studentId, requestTimestamp) => {
		if (!studentId) return true
		const resetAt = soeResetByStudent[studentId]
		if (!resetAt) return false
		const requestTime = toJsDate(requestTimestamp)?.getTime() || 0
		return requestTime <= resetAt
	}

	const setAccountBlocked = async (studentId, blocked) => runAction(async () => {
		await updateDoc(doc(db, "students", studentId), { isBlocked: blocked, accountStatus: blocked ? "blocked" : "active", updatedAt: serverTimestamp() })
	}, blocked ? "Student blocked." : "Student unblocked.")

	const setScholarshipBlocked = async (studentId, scholarshipId, blocked) => {
		const target = studentProfiles.find((s) => s.id === studentId)
		if (!target || !scholarshipId) return
		const next = target.scholarships.map((sch) => sch.id === scholarshipId ? { ...sch, adminBlocked: blocked, adminBlockedAt: blocked ? new Date().toISOString() : null } : sch)
		await runAction(async () => {
			await updateDoc(doc(db, "students", studentId), { scholarships: next, updatedAt: serverTimestamp() })
		}, blocked ? "Scholarship blocked." : "Scholarship unblocked.")
	}

	const removeStudent = async (studentId) => {
		if (!window.confirm("Remove student and related records?")) return
		await runAction(async () => {
			const batch = writeBatch(db)
			batch.delete(doc(db, "students", studentId))
			const [apps, soes, warnings] = await Promise.all([
				getDocs(query(collection(db, "scholarshipApplications"), where("studentId", "==", studentId))),
				getDocs(query(collection(db, "soeRequests"), where("studentId", "==", studentId))),
				getDocs(query(collection(db, "studentWarning"), where("studentId", "==", studentId))),
			])
			apps.docs.forEach((d) => batch.delete(d.ref))
			soes.docs.forEach((d) => batch.delete(d.ref))
			warnings.docs.forEach((d) => batch.delete(d.ref))
			await batch.commit()
			setSelectedStudentId("")
		}, "Student removed.")
	}
	const postAnnouncement = async (e) => {
		e.preventDefault()
		if (!announcementTitle.trim() || !announcementDescription.trim()) {
			toast.error("Title and description are required.")
			return
		}
		if (announcementStartDate && announcementEndDate && announcementStartDate > announcementEndDate) {
			toast.error("End date must be on or after start date.")
			return
		}
		if (isPostingAnnouncement) return
		setIsPostingAnnouncement(true)
		try {
			const uploads = await Promise.all(announcementImageFiles.map((file) => uploadToCloudinary(file)))
			const imageUrls = uploads.map((uploaded) => uploaded.url).filter(Boolean)
			await addDoc(collection(db, "announcements"), {
				title: announcementTitle.trim(),
				description: announcementDescription.trim(),
				content: announcementDescription.trim(),
				previewText: announcementDescription.trim().slice(0, 150),
				type: announcementType,
				imageUrl: imageUrls[0] || "",
				imageUrls,
				startDate: announcementStartDate ? new Date(`${announcementStartDate}T00:00:00`).toISOString() : null,
				endDate: announcementEndDate ? new Date(`${announcementEndDate}T23:59:59`).toISOString() : null,
				archived: false,
				createdAt: serverTimestamp(),
			})
			setAnnouncementTitle("")
			setAnnouncementDescription("")
			setAnnouncementType("Update")
			setAnnouncementImageFiles([])
			setAnnouncementStartDate("")
			setAnnouncementEndDate("")
			setShowAnnouncementSchedule(false)
			toast.success("Announcement posted.")
		} catch (error) {
			console.error(error)
			toast.error("Failed to post announcement.")
		} finally {
			setIsPostingAnnouncement(false)
		}
	}

	const archiveAnnouncement = async (announcementId) => {
		await runAction(async () => {
			await updateDoc(doc(db, "announcements", announcementId), { archived: true, archivedAt: serverTimestamp(), updatedAt: serverTimestamp() })
		}, "Announcement moved to previous.")
	}

	const handleLogout = () => {
		sessionStorage.removeItem("bulsuscholar_userId")
		sessionStorage.removeItem("bulsuscholar_userType")
		navigate("/", { replace: true })
	}

	const toggleTable = (key) => setCollapsedTables((prev) => ({ ...prev, [key]: !prev[key] }))

	const filterProviderRows = (rows, key) => {
		const keyword = (providerSearch[key] || "").trim().toLowerCase()
		const status = providerStatus[key] || "All"
		return rows.filter((row) => {
			const matchesSearch = !keyword || row.studentId.toLowerCase().includes(keyword) || row.fullName.toLowerCase().includes(keyword) || row.scholarship.toLowerCase().includes(keyword)
			const matchesStatus = status === "All" || row.status === status
			return matchesSearch && matchesStatus
		})
	}

	const renderCollapsibleBox = (key, title, count, controls, content) => {
		const collapsed = collapsedTables[key]
		return (
			<article className="admin-subpanel admin-subpanel--spaced" key={key}>
				<button type="button" className="admin-collapse-head" onClick={() => toggleTable(key)} aria-expanded={!collapsed}>
					<div><h3>{title}</h3><span>{count} records</span></div>
					{collapsed ? <HiChevronDown /> : <HiChevronUp />}
				</button>
				{collapsed ? null : <>{controls}{content}</>}
			</article>
		)
	}

	const renderProviderTable = (key, title, rows) => {
		const filtered = filterProviderRows(rows, key)
		const statuses = [...new Set(rows.map((r) => r.status).filter(Boolean))]
		return renderCollapsibleBox(
			key,
			title,
			filtered.length,
			<div className="admin-filter-bar admin-filter-bar--compact">
				<input type="text" placeholder="Search" value={providerSearch[key] || ""} onChange={(e) => setProviderSearch((prev) => ({ ...prev, [key]: e.target.value }))} />
				<select value={providerStatus[key] || "All"} onChange={(e) => setProviderStatus((prev) => ({ ...prev, [key]: e.target.value }))}><option value="All">All Status</option>{statuses.map((status) => <option key={`${key}_${status}`} value={status}>{status}</option>)}</select>
			</div>,
			<div className="admin-table-wrap"><table className="admin-management-table"><thead><tr><th>Student ID</th><th>Full Name</th><th>Scholarship</th><th>Status</th><th>Action</th></tr></thead><tbody>{filtered.map((row) => <tr key={`${key}_${row.studentId}_${row.scholarshipId || row.scholarship}`}><td>{row.studentId}</td><td>{row.fullName}</td><td>{row.scholarship}</td><td><span className={toStatusClass(row.status)}>{row.status}</span>{row.adminBlocked ? <span className="admin-inline-chip">Blocked</span> : null}</td><td><button type="button" className="admin-table-btn" onClick={() => setSelectedStudentId(row.studentId)}>View Information</button></td></tr>)}</tbody></table></div>,
		)
	}

	const renderDashboardHome = () => (
		<section className="admin-management-panel">
			<div className="admin-panel-head"><h2>Management Dashboard</h2></div>
			<section className="admin-kpi-grid">
				<article className="admin-kpi-card"><p>Total Students</p><strong>{metrics.totalStudents}</strong></article>
				<article className="admin-kpi-card"><p>Active Programs</p><strong>{metrics.activePrograms}</strong></article>
				<article className="admin-kpi-card"><p>Issued SOEs</p><strong>{metrics.issuedSoe}</strong></article>
				<article className="admin-kpi-card"><p>Pending SOE</p><strong>{metrics.pendingSoe}</strong></article>
			</section>
			<section className="admin-analytics-grid admin-analytics-grid--primary">
				<article className="admin-analytics-card admin-analytics-card--wide admin-trend-card">
					<div className="admin-trend-head">
						<div>
							<h3>College Applications Overview</h3>
							<p>Application trends for college students</p>
						</div>
						<div className="admin-trend-controls">
							<button type="button" className={applicationTrendRange === "daily" ? "active" : ""} onClick={() => setApplicationTrendRange("daily")}>Daily</button>
							<button type="button" className={applicationTrendRange === "weekly" ? "active" : ""} onClick={() => setApplicationTrendRange("weekly")}>Weekly</button>
							<button type="button" className={applicationTrendRange === "monthly" ? "active" : ""} onClick={() => setApplicationTrendRange("monthly")}>Monthly</button>
							<button type="button" className={applicationTrendRange === "yearly" ? "active" : ""} onClick={() => setApplicationTrendRange("yearly")}>Yearly</button>
						</div>
					</div>
					<div className="admin-chart-wrap admin-chart-wrap--lg"><Line data={applicationTrendData} options={applicationTrendOptions} /></div>
				</article>
				<article className="admin-analytics-card">
					<h3>Scholarship Distribution (%)</h3>
					<div className="admin-chart-wrap"><Doughnut data={{ labels: providerLabels, datasets: [{ data: providerValues, backgroundColor: ["#0b572b", "#1e3a8a", "#b45309", "#14532d"], borderColor: theme === "dark" ? "#1f2937" : "#ffffff", borderWidth: 3 }] }} options={dashboardDoughnutOptions} /></div>
					<div className="admin-distribution-legend">{providerLabels.map((label, index) => <p key={label}><span className="admin-distribution-name">{label}</span><span className="admin-distribution-bar" role="presentation"><span className="admin-distribution-fill" style={{ width: `${providerPercentages[index]}%` }} /></span><strong>{providerPercentages[index]}%</strong></p>)}</div>
				</article>
				<article className="admin-analytics-card">
					<div className="admin-trend-head admin-trend-head--compact">
						<div>
							<h3>SOE Volume</h3>
						</div>
						<div className="admin-trend-controls admin-trend-controls--compact">
							<button type="button" className={soeTrendRange === "daily" ? "active" : ""} onClick={() => setSoeTrendRange("daily")}>Daily</button>
							<button type="button" className={soeTrendRange === "weekly" ? "active" : ""} onClick={() => setSoeTrendRange("weekly")}>Weekly</button>
							<button type="button" className={soeTrendRange === "monthly" ? "active" : ""} onClick={() => setSoeTrendRange("monthly")}>Monthly</button>
							<button type="button" className={soeTrendRange === "yearly" ? "active" : ""} onClick={() => setSoeTrendRange("yearly")}>Yearly</button>
						</div>
					</div>
					<div className="admin-chart-wrap"><Bar data={soeTrendData} options={chartOptions} /></div>
				</article>
			</section>
		</section>
	)

	const renderSection = () => {
		if (activeSection === "students") {
			return (
				<section className="admin-management-panel">
					<div className="admin-panel-head"><h2>Student Management</h2><button type="button" className="admin-export-btn" onClick={() => exportStudentsReportPdf(filteredStudents, `Course: ${studentCourse}, Year: ${studentYear}, Validation: ${studentValidation}, Search: ${studentSearch || "-"}`, logo2)}>Generate Report (PDF)</button></div>
					<div className="admin-filter-bar"><input type="text" placeholder="Search Student ID or Name" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} /><select value={studentCourse} onChange={(e) => setStudentCourse(e.target.value)}><option value="All">All Courses</option>{studentsByCourse.map((course) => <option key={course} value={course}>{course}</option>)}</select><select value={studentYear} onChange={(e) => setStudentYear(e.target.value)}><option value="All">All Year Levels</option>{studentsByYear.map((year) => <option key={year} value={year}>{year}</option>)}</select><select value={studentValidation} onChange={(e) => setStudentValidation(e.target.value)}><option value="All">All Validation</option><option value="Validated">Validated</option><option value="Pending">Pending</option></select></div>
					<div className="admin-table-wrap"><table className="admin-management-table admin-management-table--roomy"><thead><tr><th>Student ID</th><th>Full Name</th><th>Course</th><th>Year Level</th><th>Validation Status</th><th>Applied Scholarship</th><th>Action</th></tr></thead><tbody>{filteredStudents.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.fullName}</td><td>{row.course}</td><td>{row.yearLevel}</td><td><span className={toStatusClass(row.validationStatus)}>{row.validationStatus}</span></td><td>{row.appliedScholarship}</td><td><button type="button" className="admin-table-btn" onClick={() => setSelectedStudentId(row.id)}>View Information</button></td></tr>)}</tbody></table></div>
				</section>
			)
		}
		if (activeSection === "scholarships") {
			return (
				<section className="admin-management-panel">
					<div className="admin-panel-head"><h2>Scholarship Programs</h2><button type="button" className="admin-export-btn" onClick={() => exportScholarshipsReportPdf(filteredScholarships, `Provider: ${scholarshipProvider}, Status: ${scholarshipStatus}`, logo2)}>Generate Report (PDF)</button></div>
					<section className="admin-analytics-grid admin-analytics-grid--tight"><article className="admin-analytics-card"><h3>Scholarship Distribution by Provider (%)</h3><div className="admin-chart-wrap"><Doughnut data={{ labels: providerLabels, datasets: [{ data: providerValues, backgroundColor: ["#0b572b", "#1e3a8a", "#b45309", "#14532d"], borderColor: theme === "dark" ? "#1f2937" : "#ffffff", borderWidth: 3 }] }} options={dashboardDoughnutOptions} /></div></article><article className="admin-analytics-card"><h3>Grantor Volume</h3><div className="admin-chart-wrap"><Bar data={{ labels: providerLabels, datasets: [{ label: "Students", data: providerValues, backgroundColor: theme === "dark" ? "#34d399" : "#0b572b" }] }} options={chartOptions} /></div></article></section>
					{renderCollapsibleBox("warning", "Warning Table: Multiple Scholarships", warningRows.length, <div className="admin-filter-bar admin-filter-bar--compact"><input type="text" placeholder="Search warning records" value={warningSearch} onChange={(e) => setWarningSearch(e.target.value)} /></div>, <div className="admin-table-wrap"><table className="admin-management-table admin-management-table--roomy"><thead><tr><th>Student ID</th><th>Full Name</th><th>Conflict Details</th><th>Action</th></tr></thead><tbody>{warningRows.map((row) => <tr key={`${row.studentId}_warn`}><td>{row.studentId}</td><td>{row.fullName}</td><td>{row.details}</td><td><button type="button" className="admin-table-btn" onClick={() => setSelectedStudentId(row.studentId)}>View Information</button></td></tr>)}</tbody></table></div>)}
					<div className="admin-subpanel-grid">{renderProviderTable("kuya_win", "Kuya Win Table", providerRows.kuya_win)}{renderProviderTable("tina_pancho", "Tina Pancho Table", providerRows.tina_pancho)}{renderProviderTable("morisson", "Morisson Table", providerRows.morisson)}{renderProviderTable("other", "Other Table", providerRows.other)}{renderProviderTable("none", "None Table", providerRows.none)}</div>
				</section>
			)
		}

		if (activeSection === "soe") {
			return (
				<section className="admin-management-panel">
					<div className="admin-panel-head"><h2>SOE Requests</h2><button type="button" className="admin-export-btn" onClick={() => exportSoeRequestsReportPdf(soeFiltered, `Status: ${soeStatus}, Search: ${soeSearch || "-"}`, logo2)}>Generate Report (PDF)</button></div>
					<div className="admin-filter-bar"><input type="text" placeholder="Search by student or scholarship" value={soeSearch} onChange={(e) => setSoeSearch(e.target.value)} /><select value={soeStatus} onChange={(e) => setSoeStatus(e.target.value)}><option value="All">All Status</option><option value="Pending">Pending</option><option value="Issued">Issued</option><option value="Rejected">Rejected</option></select></div>
					<div className="admin-table-wrap"><table className="admin-management-table admin-management-table--roomy"><thead><tr><th>Student ID</th><th>Scholarship</th><th>Status</th><th>Date Requested</th><th>Intervention</th></tr></thead><tbody>{soeFiltered.map((row) => { const disabled = isSoeResetDisabled(row.studentId, row.timestamp); return <tr key={row.id}><td>{row.studentId || "-"}</td><td>{row.scholarshipName || "-"}</td><td><span className={toStatusClass(row.status)}>{row.status || "-"}</span></td><td>{formatDate(row.timestamp)}</td><td><button type="button" className="admin-table-btn" disabled={disabled} onClick={() => resetSoeTimer(row.studentId)}>{disabled ? "Timer Reset" : "Reset Timer"}</button></td></tr> })}</tbody></table></div>
					<article className="admin-subpanel admin-subpanel--spaced"><div className="admin-subpanel-head"><h3>Warning Table: Requests Within 6 Months</h3><span>{soeCooldownWarnings.length} warnings</span></div><div className="admin-table-wrap"><table className="admin-management-table admin-management-table--roomy"><thead><tr><th>Student ID</th><th>Scholarship</th><th>Previous Request</th><th>Current Request</th><th>Action</th></tr></thead><tbody>{soeCooldownWarnings.map((row) => { const disabled = isSoeResetDisabled(row.studentId, row.requestDate); return <tr key={row.id}><td>{row.studentId}</td><td>{row.scholarship}</td><td>{formatDate(row.previousDate)}</td><td>{formatDate(row.requestDate)}</td><td><button type="button" className="admin-table-btn" disabled={disabled} onClick={() => resetSoeTimer(row.studentId)}>{disabled ? "Timer Reset" : "Intervene / Reset Timer"}</button></td></tr> })}</tbody></table></div></article>
				</section>
			)
		}

		if (activeSection === "announcements") {
			return (
				<section className="admin-management-panel">
					<div className="admin-panel-head"><h2>Announcements</h2></div>
					<form className="admin-announcement-builder" onSubmit={postAnnouncement}>
						<section className="admin-announcement-card"><h3>Content</h3><label htmlFor="announcement-title">Title</label><input id="announcement-title" type="text" value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} /><label htmlFor="announcement-description">Description</label><textarea id="announcement-description" value={announcementDescription} onChange={(e) => setAnnouncementDescription(e.target.value)} /><label htmlFor="announcement-type">Type</label><select id="announcement-type" value={announcementType} onChange={(e) => setAnnouncementType(e.target.value)}><option value="Deadline">Deadline</option><option value="Event">Event</option><option value="Update">Update</option></select></section>
						<section className="admin-announcement-card"><h3>Media and Schedule</h3><label htmlFor="announcement-images">Upload Images</label><input id="announcement-images" className="admin-file-input-hidden" type="file" accept="image/*" multiple onChange={(e) => setAnnouncementImageFiles(Array.from(e.target.files || []))} /><label htmlFor="announcement-images" className="admin-upload-btn">{announcementImageFiles.length > 0 ? "Change Selected Images" : "Choose Images"}</label><p className="admin-announcement-help">{announcementImageFiles.length > 0 ? `${announcementImageFiles.length} image(s) selected` : "No images selected yet."}</p><button type="button" className="admin-calendar-btn" onClick={() => setShowAnnouncementSchedule((prev) => !prev)}>{announcementStartDate && announcementEndDate ? `${announcementStartDate} to ${announcementEndDate}` : "Set Date Range"}</button>{showAnnouncementSchedule ? <div className="admin-calendar-popover"><div className="admin-calendar-head"><button type="button" disabled={announcementCalendarMonth <= currentMonthStart} onClick={() => setAnnouncementCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>Prev</button><strong>{announcementCalendarMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}</strong><button type="button" onClick={() => setAnnouncementCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>Next</button></div><div className="admin-calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div><div className="admin-calendar-grid">{announcementCalendarDays.map((cell) => cell.empty ? <span key={cell.key} className="admin-calendar-cell admin-calendar-cell--empty" /> : <button key={cell.key} type="button" className={`admin-calendar-cell ${cell.disabled ? "admin-calendar-cell--disabled" : ""} ${cell.isStart || cell.isEnd ? "admin-calendar-cell--selected" : ""} ${cell.inRange ? "admin-calendar-cell--inrange" : ""}`} disabled={cell.disabled} onClick={() => handleAnnouncementDatePick(cell.iso, cell.disabled)}>{cell.day}</button>)}</div><p className="admin-announcement-help">{announcementStartDate ? `Start: ${announcementStartDate}` : "Select start date"} {announcementEndDate ? `| End: ${announcementEndDate}` : "| Select end date"}</p></div> : null}<button type="submit" className="admin-export-btn" disabled={isPostingAnnouncement}>{isPostingAnnouncement ? "Posting..." : "Post Announcement"}</button></section>
					</form>
					<section className="admin-announcement-section"><h3>Current Announcements</h3><div className="admin-announcement-list">{currentAnnouncements.map((item) => <article key={item.id} className="admin-announcement-item"><h4>{item.title || "Announcement"}</h4><p>{item.content || item.description || "-"}</p><div className="admin-announcement-images">{(item.imageUrls || []).map((url) => <img key={`${item.id}_${url}`} src={url} alt={item.title || "Announcement"} className="admin-announcement-image" />)}{!Array.isArray(item.imageUrls) && item.imageUrl ? <img src={item.imageUrl} alt={item.title || "Announcement"} className="admin-announcement-image" /> : null}</div><span>{item.type || "Update"} | {formatDate(item.createdAt || item.date)}{item.startDate || item.endDate ? ` | ${toDateString(item.startDate)} to ${toDateString(item.endDate)}` : ""}</span><button type="button" className="admin-table-btn" onClick={() => archiveAnnouncement(item.id)}>Delete / Archive</button></article>)}</div></section>
					<section className="admin-announcement-section"><h3>Previous Announcements</h3><div className="admin-announcement-list">{previousAnnouncements.map((item) => <article key={item.id} className="admin-announcement-item admin-announcement-item--previous"><h4>{item.title || "Announcement"}</h4><p>{item.content || item.description || "-"}</p><span>{item.type || "Update"} | {formatDate(item.createdAt || item.date)}</span></article>)}</div></section>
				</section>
			)
		}
		return renderDashboardHome()
	}

	const themeReturnIndicator = theme === "dark"
	return (
		<div className={`admin-portal ${theme === "dark" ? "admin-portal--dark" : ""}`}>
			<aside className="admin-sidebar">
				<div className="admin-sidebar-brand"><img src={logo2} alt="BulsuScholar" /><div><h1>BulsuScholar</h1><p>Admin Portal</p></div></div>
				<nav className="admin-sidebar-nav">{ADMIN_SECTIONS.map((item) => { const Icon = item.icon; const isActive = activeSection === item.id; return <Link key={item.id} to={item.path} className={`admin-sidebar-link ${isActive ? "active" : ""}`}><Icon /><span>{item.label}</span></Link> })}</nav>
				<div className="admin-sidebar-bottom">
					<div className="admin-theme-switch admin-theme-switch--sidebar"><button type="button" className={`${theme === "light" ? "active" : ""} ${themeReturnIndicator ? "admin-theme-return" : ""}`} onClick={() => setTheme("light")}><HiOutlineSun /> Light</button><button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}><HiOutlineMoon /> Dark</button></div>
					<div className="admin-sidebar-profile"><HiOutlineUserGroup /><div><strong>Administrator</strong><p>System Manager</p></div></div>
					<button type="button" className="admin-sidebar-logout" onClick={handleLogout}><HiOutlineLogout /> Logout</button>
				</div>
			</aside>
			<main className="admin-workspace">{renderSection()}</main>
			{selectedStudent ? <div className="admin-detail-backdrop" role="presentation"><div className="admin-detail-modal" role="dialog" aria-modal="true" aria-label="Student details"><button type="button" className="admin-detail-close" onClick={() => setSelectedStudentId("")}><HiX /></button><div className="admin-detail-header"><img src={selectedStudent.profileImageUrl || selectedStudent.imageUrl || logo2} alt={selectedStudent.fullName} className="admin-detail-avatar" /><div><h3>{selectedStudent.fullName}</h3><p className="admin-detail-meta">Student ID: {selectedStudent.id}</p></div></div><div className="admin-detail-grid"><p className="admin-detail-meta">Course: {selectedStudent.course || "-"}</p><p className="admin-detail-meta">Year & Section: {[selectedStudent.year || "-", selectedStudent.section || selectedStudent.yearSection || "-"].join(" / ")}</p><p className="admin-detail-meta">Last SOE Request: {selectedStudentLastSoe}</p><p className="admin-detail-meta">Account: {selectedStudent.accountStatus || "active"}</p></div><div className="admin-detail-docs"><strong>Documents</strong><a href={selectedStudent.corFile?.url || "#"} target="_blank" rel="noreferrer">View COR</a><a href={selectedStudent.cogFile?.url || "#"} target="_blank" rel="noreferrer">View COG</a><a href={selectedStudent.schoolIdFile?.url || selectedStudent.studentIdFile?.url || "#"} target="_blank" rel="noreferrer">View School ID</a></div><div className="admin-detail-scholarships"><strong>Scholarships (Saved/Applied)</strong>{selectedStudent.scholarships.length === 0 ? <p className="dashboard-placeholder">No scholarship entries.</p> : selectedStudent.scholarships.map((sch) => <div key={sch.id || `${sch.name}_${sch.provider}`} className="admin-detail-scholarship-row"><div><p>{sch.name || sch.provider || "Scholarship"}</p><span>{sch.status || "Saved"}</span></div><button type="button" className="admin-table-btn admin-table-btn--muted" onClick={() => setScholarshipBlocked(selectedStudent.id, sch.id, !(sch.adminBlocked === true))}>{sch.adminBlocked === true ? "Unblock Scholarship" : "Block Scholarship"}</button></div>)}</div><div className="admin-detail-actions"><button type="button" className="admin-danger-btn" disabled={isBusy} onClick={() => setAccountBlocked(selectedStudent.id, true)}><HiOutlineShieldCheck /> Block Account</button><button type="button" className="admin-safe-btn" disabled={isBusy} onClick={() => setAccountBlocked(selectedStudent.id, false)}>Unblock Account</button><button type="button" className="admin-danger-btn admin-danger-btn--hard" disabled={isBusy} onClick={() => removeStudent(selectedStudent.id)}><HiOutlineTrash /> Remove Entirely</button></div></div></div> : null}
		</div>
	)
}
