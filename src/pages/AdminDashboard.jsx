import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { addDoc, collection, collectionGroup, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore"
import {
	Chart as ChartJS,
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	BarElement,
	ArcElement,
	Filler,
	Tooltip,
	Legend,
} from "chart.js"
import { Bar, Doughnut, Line } from "react-chartjs-2"
import {
	HiOutlineAcademicCap,
	HiOutlineBell,
	HiOutlineChartBar,
	HiOutlineChartPie,
	HiOutlineClock,
	HiOutlineCloudUpload,
	HiOutlineDocumentText,
	HiOutlineExclamation,
	HiOutlineEye,
	HiOutlineLogout,
	HiOutlineMoon,
	HiOutlineRefresh,
	HiOutlineShieldCheck,
	HiOutlineSparkles,
	HiOutlineSun,
	HiOutlineTrash,
	HiOutlineUserGroup,
	HiOutlineUsers,
	HiX,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { db } from "../../firebase"
import logo2 from "../assets/logo2.png"
import "../css/AdminDashboard.css"
import "../css/StudentDashboard.css"
import TablePagination, { TABLE_PAGE_SIZE, paginateRows } from "../components/TablePagination"
import useThemeMode from "../hooks/useThemeMode"
import { uploadToCloudinary } from "../services/cloudinaryService"
import {
	GRANTOR_SUBCOLLECTIONS,
	matchesGrantorScholarToStudent,
	normalizeGrantorScholar,
} from "../services/grantorService"
import {
	downloadCsvReport,
	exportComplianceReportPdf,
	exportScholarshipsReportPdf,
	exportSoeRequestsReportPdf,
	exportStudentsReportPdf,
	filterStudentRows,
	formatDate,
	mapScholarshipRows,
	mapStudents,
} from "../services/adminService"
import {
	getMaterialEntry,
	normalizeMaterialRequest,
	toMaterialLabel,
} from "../services/materialRequestService"
import {
	normalizeScholarshipList,
	validateScholarshipDocuments,
} from "../services/scholarshipService"
import {
	completeScholarshipTrackingStep,
	getScholarshipTrackingProgress,
	getScholarshipTrackingStatusLabel,
} from "../services/scholarshipTrackingService"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend)

const ADMIN_SECTIONS = [
	{ id: "dashboard", label: "Dashboard", icon: HiOutlineAcademicCap, path: "/admin/dashboard" },
	{ id: "students", label: "Student Management", icon: HiOutlineUsers, path: "/admin/students" },
	{ id: "scholarships", label: "Scholarship Programs", icon: HiOutlineDocumentText, path: "/admin/scholarships" },
	{ id: "soe", label: "Materials Request", icon: HiOutlineClock, path: "/admin/soe-requests" },
	{ id: "soe-checking", label: "Materials Checking", icon: HiOutlineShieldCheck, path: "/admin/soe-checking" },
	{ id: "reports", label: "Report Generation", icon: HiOutlineChartBar, path: "/admin/reports" },
	{ id: "announcements", label: "Announcements", icon: HiOutlineBell, path: "/admin/announcements" },
]

const TREND_RANGES = ["daily", "weekly", "monthly", "yearly"]
const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6
const COMPLIANCE_BLOCK_THRESHOLD = 2
const EMPTY_STATE_TEXT = "No results found matching your criteria."

const GRANTOR_COLORS = {
	kuya_win: "#0f766e",
	tina_pancho: "#1d4ed8",
	morisson: "#dc2626",
	other: "#7c3aed",
	none: "#f59e0b",
}

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

function toProviderLabel(value = "") {
	if (value === "kuya_win") return "Kuya Win"
	if (value === "tina_pancho") return "Tina Pancho"
	if (value === "morisson") return "Morisson"
	if (value === "none") return "No Program"
	return "Other"
}

function toScholarshipTabLabel(value = "") {
	if (value === "overview") return "Overview"
	if (value === "scholars") return "Scholars"
	if (value === "tracking") return "Tracking"
	if (value === "warning") return "Warning"
	if (value === "archived") return "Archived"
	if (value === "none") return "No Program"
	return toProviderLabel(value)
}

function normalizeGrantorScholarLookupValue(value = "") {
	return String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

function buildGrantorScholarFullName(scholar = {}) {
	return (
		scholar.fullName ||
		[scholar.fname, scholar.mname, scholar.lname].filter(Boolean).join(" ").trim() ||
		"Scholar"
	)
}

function buildGrantorScholarAddress(scholar = {}) {
	return [scholar.houseNumber, scholar.street, scholar.city, scholar.province, scholar.postalCode]
		.filter(Boolean)
		.join(" ")
		.trim()
}

function toJsDate(value) {
	if (!value) return null
	if (value?.toDate) return value.toDate()
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

function toDateString(value) {
	const date = toJsDate(value)
	if (!date) return ""
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

function startOfDay(value) {
	const date = new Date(value)
	date.setHours(0, 0, 0, 0)
	return date
}

function startOfYear(value) {
	const date = toJsDate(value) || new Date()
	return new Date(date.getFullYear(), 0, 1)
}

function endOfDay(value) {
	const date = new Date(value)
	date.setHours(23, 59, 59, 999)
	return date
}

function addMonths(date, months) {
	const next = new Date(date)
	next.setMonth(next.getMonth() + months)
	return next
}

function formatCountdown(targetDate) {
	if (!targetDate) return "-"
	const diff = targetDate.getTime() - Date.now()
	if (diff <= 0) return "Eligible now"
	const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
	return `${days} day${days === 1 ? "" : "s"} remaining`
}

function toStatusClass(status = "") {
	const normalized = String(status).toLowerCase()
	if (normalized.includes("pending") || normalized.includes("review") || normalized.includes("warning") || normalized.includes("awaiting")) {
		return "admin-status-badge admin-status-badge--pending"
	}
	if (
		normalized.includes("issued") ||
		normalized.includes("approved") ||
		normalized.includes("downloaded") ||
		normalized.includes("validated") ||
		normalized.includes("signed") ||
		normalized.includes("active")
	) {
		return "admin-status-badge admin-status-badge--ok"
	}
	if (
		normalized.includes("rejected") ||
		normalized.includes("blocked") ||
		normalized.includes("non-compliant") ||
		normalized.includes("archived")
	) {
		return "admin-status-badge admin-status-badge--danger"
	}
	return "admin-status-badge admin-status-badge--neutral"
}

function studentFullName(student) {
	return [student?.fname, student?.mname, student?.lname].filter(Boolean).join(" ").trim() || "Student"
}

function getStudentScholarshipNames(student) {
	const scholarships = Array.isArray(student?.scholarships) ? student.scholarships : []
	return scholarships
		.map((entry) => entry?.name || entry?.provider || "Scholarship")
		.filter(Boolean)
}

function getMultipleScholarshipComplianceMessage(student) {
	const scholarshipNames = getStudentScholarshipNames(student)
	if (scholarshipNames.length > 0) {
		return `Multiple scholarships detected: ${scholarshipNames.join(", ")}. Choose one scholarship only to comply with the one scholarship per student policy.`
	}
	return "Multiple scholarships detected. Choose one scholarship only to comply with the one scholarship per student policy."
}

function getStudentRestrictionState(student) {
	const scholarships = Array.isArray(student?.scholarships) ? student.scholarships : []
	const accountAccess =
		student?.restrictions?.accountAccess === true ||
		student?.isBlocked === true ||
		String(student?.accountStatus || "").toLowerCase() === "blocked"
	const scholarshipEligibility =
		student?.restrictions?.scholarshipEligibility === true ||
		student?.soeComplianceBlocked === true ||
		student?.scholarshipConflictWarning === true ||
		student?.scholarshipRestrictionReason === "multiple_scholarships" ||
		scholarships.some((entry) => entry?.adminBlocked === true)
	return { accountAccess, scholarshipEligibility }
}

function toStudentLifecycle(student) {
	if (student?.archived === true) return "archived"
	const restrictionState = getStudentRestrictionState(student)
	if (restrictionState.accountAccess || restrictionState.scholarshipEligibility) return "blocked"
	return "students"
}

function toReviewStateLabel(value = "") {
	const normalized = String(value).toLowerCase()
	if (normalized === "signed") return "Approved"
	if (normalized === "non_compliant") return "Non-Compliant"
	if (normalized === "incoming") return "Pending Approval"
	return value || "Pending Approval"
}

function toMaterialStateLabel(status = "") {
	const normalized = String(status).toLowerCase()
	if (normalized === "approved") return "Approved"
	if (normalized === "rejected") return "Non-Compliant"
	if (normalized === "pending") return "Pending Approval"
	return "Not Requested"
}

function toMaterialRequestDate(request = {}) {
	const normalized = normalizeMaterialRequest(request)
	return (
		toJsDate(normalized.timestamp || normalized.createdAt || normalized.dateRequested) ||
		toJsDate(getMaterialEntry(normalized, "application_form").requestedAt) ||
		toJsDate(getMaterialEntry(normalized, "soe").requestedAt) ||
		null
	)
}

function toMaterialRequestActivityDate(request = {}) {
	const normalized = normalizeMaterialRequest(request)
	return toJsDate(normalized.updatedAt) || toMaterialRequestDate(normalized)
}

function toOverallMaterialStatus(request = {}) {
	const normalized = normalizeMaterialRequest(request)
	if (normalized.pendingMaterialKeys.length > 0) return "Pending"
	if (normalized.approvedMaterialKeys.length > 0 && normalized.rejectedMaterialKeys.length > 0) {
		return "Partially Approved"
	}
	if (normalized.approvedMaterialKeys.length > 0) return "Approved"
	if (normalized.rejectedMaterialKeys.length > 0) return "Non-Compliant"
	return "Pending"
}

function toMaterialStatusSummary(request = {}) {
	const normalized = normalizeMaterialRequest(request)
	if (normalized.requestedMaterialKeys.length === 0) return "No material requested"
	return normalized.requestedMaterialKeys
		.map((materialKey) => `${toMaterialLabel(materialKey)}: ${toMaterialStateLabel(getMaterialEntry(normalized, materialKey).status)}`)
		.join(" | ")
}

function buildAnnouncementImageList(item) {
	if (Array.isArray(item?.imageUrls) && item.imageUrls.length > 0) return item.imageUrls
	if (item?.imageUrl) return [item.imageUrl]
	return []
}

function getEarliestDate(values = []) {
	return values.reduce((earliest, current) => {
		const date = toJsDate(current)
		if (!date) return earliest
		if (!earliest) return date
		return date.getTime() < earliest.getTime() ? date : earliest
	}, null)
}

function getApplicationDate(application) {
	return toJsDate(
		application?.createdAt ||
			application?.submittedAt ||
			application?.timestamp ||
			application?.dateApplied ||
			application?.appliedAt ||
			application?.updatedAt,
	)
}

function formatPercent(value, total) {
	if (!total) return "0%"
	const percent = (value / total) * 100
	return `${percent >= 10 ? Math.round(percent) : percent.toFixed(1)}%`
}

function withColorAlpha(color, alpha) {
	const normalized = String(color || "").trim()
	if (!normalized.startsWith("#")) return normalized

	let hex = normalized.slice(1)
	if (hex.length === 3) {
		hex = hex
			.split("")
			.map((character) => `${character}${character}`)
			.join("")
	}

	if (hex.length !== 6) return normalized

	const red = Number.parseInt(hex.slice(0, 2), 16)
	const green = Number.parseInt(hex.slice(2, 4), 16)
	const blue = Number.parseInt(hex.slice(4, 6), 16)
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function createVerticalGradient(context, topColor, bottomColor) {
	const { chart } = context
	const { ctx, chartArea } = chart
	if (!chartArea) return topColor
	const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
	gradient.addColorStop(0, topColor)
	gradient.addColorStop(1, bottomColor)
	return gradient
}

function buildTimelineBuckets(anchorDate, endDate, range) {
	const buckets = []
	if (!anchorDate || !endDate) return buckets

	if (range === "daily") {
		let cursor = startOfDay(anchorDate)
		while (cursor <= endDate) {
			buckets.push({
				key: toDateString(cursor),
				label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
			})
			cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
		}
		return buckets
	}

	if (range === "weekly") {
		let cursor = startOfDay(anchorDate)
		while (cursor <= endDate) {
			buckets.push({
				key: toDateString(cursor),
				label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
			})
			cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7)
		}
		return buckets
	}

	if (range === "monthly") {
		let cursor = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
		while (cursor <= endDate) {
			buckets.push({
				key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
				label: cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
			})
			cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
		}
		return buckets
	}

	let cursor = new Date(anchorDate.getFullYear(), 0, 1)
	while (cursor <= endDate) {
		buckets.push({
			key: String(cursor.getFullYear()),
			label: String(cursor.getFullYear()),
		})
		cursor = new Date(cursor.getFullYear() + 1, 0, 1)
	}
	return buckets
}

function getBucketKey(date, anchorDate, range) {
	const current = startOfDay(date)
	if (range === "daily") return toDateString(current)
	if (range === "weekly") {
		const diffMs = current.getTime() - startOfDay(anchorDate).getTime()
		const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
		const bucketStart = new Date(anchorDate)
		bucketStart.setDate(anchorDate.getDate() + Math.floor(diffDays / 7) * 7)
		return toDateString(bucketStart)
	}
	if (range === "monthly") return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`
	return String(current.getFullYear())
}

function buildTimelineSeries(dates, anchorDate, range) {
	const timelineEnd = new Date()
	timelineEnd.setHours(23, 59, 59, 999)
	const buckets = buildTimelineBuckets(anchorDate, timelineEnd, range)
	const counts = Object.fromEntries(buckets.map((bucket) => [bucket.key, 0]))

	dates.forEach((value) => {
		const date = toJsDate(value)
		if (!date || date.getTime() < anchorDate.getTime()) return
		const bucketKey = getBucketKey(date, anchorDate, range)
		if (Object.hasOwn(counts, bucketKey)) counts[bucketKey] += 1
	})

	return {
		labels: buckets.map((bucket) => bucket.label),
		values: buckets.map((bucket) => counts[bucket.key]),
	}
}

function buildSoeVolumeSeries(dates, range) {
	const now = new Date()
	const todayEnd = endOfDay(now)
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
	const yearStart = new Date(now.getFullYear(), 0, 1)
	const yearlyStart = new Date(2024, 0, 1)

	if (range === "daily") {
		const buckets = []
		let cursor = new Date(monthStart)
		while (cursor <= todayEnd) {
			buckets.push({
				key: toDateString(cursor),
				label: String(cursor.getDate()),
			})
			cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
		}

		const counts = Object.fromEntries(buckets.map((bucket) => [bucket.key, 0]))
		dates.forEach((value) => {
			const date = toJsDate(value)
			if (!date || date < monthStart || date > todayEnd) return
			const key = toDateString(date)
			if (Object.hasOwn(counts, key)) counts[key] += 1
		})

		return {
			labels: buckets.map((bucket) => bucket.label),
			values: buckets.map((bucket) => counts[bucket.key]),
		}
	}

	if (range === "weekly") {
		const buckets = []
		let cursor = new Date(monthStart)
		let weekNumber = 1
		while (cursor <= todayEnd) {
			buckets.push({
				key: toDateString(cursor),
				label: `Week ${weekNumber}`,
			})
			cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7)
			weekNumber += 1
		}

		const counts = Object.fromEntries(buckets.map((bucket) => [bucket.key, 0]))
		dates.forEach((value) => {
			const date = toJsDate(value)
			if (!date || date < monthStart || date > todayEnd) return
			const diffDays = Math.floor((startOfDay(date).getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24))
			const bucketStart = new Date(monthStart)
			bucketStart.setDate(monthStart.getDate() + Math.floor(diffDays / 7) * 7)
			const key = toDateString(bucketStart)
			if (Object.hasOwn(counts, key)) counts[key] += 1
		})

		return {
			labels: buckets.map((bucket) => bucket.label),
			values: buckets.map((bucket) => counts[bucket.key]),
		}
	}

	if (range === "monthly") {
		const buckets = []
		for (let month = 0; month <= now.getMonth(); month += 1) {
			const current = new Date(now.getFullYear(), month, 1)
			buckets.push({
				key: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`,
				label: current.toLocaleDateString("en-US", { month: "short" }),
			})
		}

		const counts = Object.fromEntries(buckets.map((bucket) => [bucket.key, 0]))
		dates.forEach((value) => {
			const date = toJsDate(value)
			if (!date || date < yearStart || date > todayEnd) return
			const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
			if (Object.hasOwn(counts, key)) counts[key] += 1
		})

		return {
			labels: buckets.map((bucket) => bucket.label),
			values: buckets.map((bucket) => counts[bucket.key]),
		}
	}

	const buckets = []
	for (let year = yearlyStart.getFullYear(); year <= now.getFullYear(); year += 1) {
		buckets.push({
			key: String(year),
			label: String(year),
		})
	}

	const counts = Object.fromEntries(buckets.map((bucket) => [bucket.key, 0]))
	dates.forEach((value) => {
		const date = toJsDate(value)
		if (!date || date < yearlyStart || date > todayEnd) return
		const key = String(date.getFullYear())
		if (Object.hasOwn(counts, key)) counts[key] += 1
	})

	return {
		labels: buckets.map((bucket) => bucket.label),
		values: buckets.map((bucket) => counts[bucket.key]),
	}
}

function toStudentReportRow(student, validationStatus = "-") {
	const restrictionState = student.restrictionState || getStudentRestrictionState(student)
	return {
		id: student.id || "-",
		fullName: student.fullName || studentFullName(student),
		course: student.course || "-",
		yearLevel: student.year || student.yearLevel || "-",
		validationStatus,
		recordStatus: student.recordStatus || (student.archived === true ? "Archived" : "Active"),
		restrictionSummary:
			[
				restrictionState.accountAccess ? "Account Access" : "",
				restrictionState.scholarshipEligibility ? "Scholarship Eligibility" : "",
			]
				.filter(Boolean)
				.join(", ") || "-",
	}
}

function toScholarshipReportRow(row) {
	return {
		programName: row.programName,
		providerType: row.providerType,
		totalSlots: row.totalSlots,
		activeRecipients: row.activeRecipients,
		status: row.status,
	}
}

function toScholarshipTableReportRow(row) {
	return {
		studentId: row.studentId || "-",
		fullName: row.fullName || "-",
		scholarshipName: row.scholarship || "-",
		status: row.status || "-",
	}
}

function toScholarshipWarningReportRow(row) {
	return {
		studentId: row.studentId || "-",
		fullName: row.fullName || "-",
		conflictDetails: row.details || "-",
	}
}

function toSoeReportRow(row) {
	return {
		id: row.id,
		studentId: row.studentId || "-",
		fullName: row.fullName || "-",
		scholarshipName: row.scholarshipName || "-",
		providerType: row.providerType || "-",
		requestedMaterialsSummary: row.visibleMaterialsSummary || row.requestedMaterialsSummary || "-",
		status: row.status || "-",
		timestamp: row.timestamp || row.requestDate || row.createdAt || new Date().toISOString(),
		requestDate: row.requestDate || toJsDate(row.timestamp || row.createdAt || row.dateRequested),
		nextEligibleLabel: row.nextEligibleLabel || "-",
		reviewStateLabel: row.reviewStateLabel || toReviewStateLabel(row.reviewState),
		downloadStatusLabel: row.downloadStatusLabel || "-",
	}
}

function toSoeWarningReportRow(row) {
	return {
		id: row.id,
		studentId: row.studentId || "-",
		fullName: row.fullName || "-",
		scholarshipName: row.scholarshipName || "-",
		providerType: "Warning",
		status: "Cooldown Warning",
		timestamp: row.currentDate || new Date().toISOString(),
		requestDate: row.currentDate,
		nextEligibleLabel: formatDate(addMonths(row.previousDate, 6)),
		reviewStateLabel: `Previous: ${formatDate(row.previousDate)}`,
	}
}

function toComplianceReportRow(student) {
	return {
		studentId: student.studentId || student.id || "-",
		fullName: student.fullName || "-",
		complianceStatus: student.complianceStatus || "-",
		violationCount: Number(student.violationCount || 0),
		isBlocked: student.isBlocked === true,
		lastReviewed: student.lastReviewed || "-",
	}
}

function buildCsvPreview(columns, rows) {
	const lines = [
		columns.join(","),
		...rows.slice(0, TABLE_PAGE_SIZE).map((row) => row.map((value) => String(value ?? "")).join(",")),
	]
	return lines.join("\n")
}

function EmptyStateRow({ colSpan }) {
	return (
		<tr>
			<td colSpan={colSpan}>
				<div className="admin-empty-state">{EMPTY_STATE_TEXT}</div>
			</td>
		</tr>
	)
}

function LoadingBars() {
	return (
		<div className="admin-loading-state" role="status" aria-live="polite">
			<div className="admin-loading-bars">
				{[0, 1, 2, 3].map((item) => (
					<span key={item} className="admin-loading-bar" />
				))}
			</div>
			<p>Loading Data</p>
		</div>
	)
}

function SectionTabs({ tabs, value, onChange, className = "" }) {
	return (
		<div className={`admin-section-tabs ${className}`.trim()} role="tablist">
			{tabs.map((tab) => {
				const Icon = tab.icon
				const tabVariantClass = `admin-section-tab--${String(tab.id).replace(/_/g, "-")}`
				return (
					<button
						key={tab.id}
						type="button"
						role="tab"
						aria-selected={value === tab.id}
						className={`admin-section-tab ${tabVariantClass} ${value === tab.id ? "active" : ""}`.trim()}
						onClick={() => onChange(tab.id)}
					>
						<span className="admin-section-tab-main">
							{Icon ? (
								<span className="admin-section-tab-icon" aria-hidden="true">
									<Icon />
								</span>
							) : null}
							<span className="admin-section-tab-label">{tab.label}</span>
						</span>
						{tab.count !== undefined && <small>{tab.count}</small>}
					</button>
				)
			})}
		</div>
	)
}

import {
	sendEmailNotification,
	getMultipleScholarshipComplianceEmailBody,
	getWelcomeEmailBody,
	getSoeApprovalEmailBody,
	getSoeDisapprovalEmailBody,
	getScholarshipApprovalEmailBody,
	getAccountDisapprovalEmailBody,
} from "../services/emailService"

export default function AdminDashboard() {
	const navigate = useNavigate()
	const location = useLocation()
	const { theme, setTheme } = useThemeMode()
	const activeSection = toSectionFromPath(location.pathname)

	const [studentsRaw, setStudentsRaw] = useState([])
	const [pendingStudentsRaw, setPendingStudentsRaw] = useState([])
	const [applicationsRaw, setApplicationsRaw] = useState([])
	const [soeRequests, setSoeRequests] = useState([])
	const [soeDownloads, setSoeDownloads] = useState([])
	const [announcements, setAnnouncements] = useState([])
	const [grantorScholarsRaw, setGrantorScholarsRaw] = useState([])
	const [dataLoadState, setDataLoadState] = useState({
		students: false,
		pendingStudents: false,
		applications: false,
		soe: false,
		soeDownloads: false,
		announcements: false,
		grantorScholars: false,
	})

	const [studentSearch, setStudentSearch] = useState("")
	const [studentCourse, setStudentCourse] = useState("All")
	const [studentYear, setStudentYear] = useState("All")
	const [studentValidation, setStudentValidation] = useState("All")
	const [studentViewTab, setStudentViewTab] = useState("students")
	const [studentArchiveTrendRange, setStudentArchiveTrendRange] = useState("monthly")
	const [selectedStudentId, setSelectedStudentId] = useState("")
	const [selectedScholarshipTrackingKey, setSelectedScholarshipTrackingKey] = useState("")

	const [scholarshipProvider, setScholarshipProvider] = useState("All")
	const [scholarshipSearch, setScholarshipSearch] = useState("")
	const [scholarshipTab, setScholarshipTab] = useState("overview")
	const [scholarshipGrantorHoverId, setScholarshipGrantorHoverId] = useState("")
	const [grantorScholarTrendRange, setGrantorScholarTrendRange] = useState("monthly")
	const [grantorDistributionHoverId, setGrantorDistributionHoverId] = useState("")

	const [applicantTrendRange, setApplicantTrendRange] = useState("monthly")
	const [soeTrendRange, setSoeTrendRange] = useState("monthly")
	const [soeSearch, setSoeSearch] = useState("")
	const [soeTab, setSoeTab] = useState("requesting")
	const [soeProviderFilter, setSoeProviderFilter] = useState("All")
	const [soeMaterialFilter, setSoeMaterialFilter] = useState("All")
	const [soeResetByStudent, setSoeResetByStudent] = useState({})

	const [soeCheckSearch, setSoeCheckSearch] = useState("")
	const [soeCheckingTab, setSoeCheckingTab] = useState("incoming")
	const [selectedSoeReviewId, setSelectedSoeReviewId] = useState("")
	const [adminConfirmDialog, setAdminConfirmDialog] = useState(null)
	const [tablePages, setTablePages] = useState({})

	const [reportPreview, setReportPreview] = useState(null)
	const [reportExportFormat, setReportExportFormat] = useState("pdf")
	const [isReportExporting, setIsReportExporting] = useState(false)

	const [announcementTitle, setAnnouncementTitle] = useState("")
	const [announcementDescription, setAnnouncementDescription] = useState("")
	const [announcementType, setAnnouncementType] = useState("Update")
	const [announcementImageFiles, setAnnouncementImageFiles] = useState([])
	const [announcementDraftPreviews, setAnnouncementDraftPreviews] = useState([])
	const [announcementImagePreview, setAnnouncementImagePreview] = useState("")
	const [announcementStartDate, setAnnouncementStartDate] = useState("")
	const [announcementEndDate, setAnnouncementEndDate] = useState("")
	const [showAnnouncementSchedule, setShowAnnouncementSchedule] = useState(false)
	const [announcementCalendarMonth, setAnnouncementCalendarMonth] = useState(() => {
		const now = new Date()
		return new Date(now.getFullYear(), now.getMonth(), 1)
	})
	const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false)
	const [isBusy, setIsBusy] = useState(false)

	const setTablePage = useCallback((tableKey, page) => {
		setTablePages((prev) => ({ ...prev, [tableKey]: page }))
	}, [])

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
		const markLoaded = (key) => {
			setDataLoadState((prev) => (prev[key] ? prev : { ...prev, [key]: true }))
		}

		const unsubs = [
			onSnapshot(
				collection(db, "students"),
				(snap) => {
					setStudentsRaw(snap.docs.map((row) => ({ id: row.id, ...(row.data() || {}) })))
					markLoaded("students")
				},
				() => markLoaded("students"),
			),
			onSnapshot(
				collection(db, "pendingStudent"),
				(snap) => {
					setPendingStudentsRaw(snap.docs.map((row) => ({ id: row.id, ...(row.data() || {}) })))
					markLoaded("pendingStudents")
				},
				() => markLoaded("pendingStudents"),
			),
			onSnapshot(
				collection(db, "scholarshipApplications"),
				(snap) => {
					setApplicationsRaw(snap.docs.map((row) => ({ id: row.id, ...(row.data() || {}) })))
					markLoaded("applications")
				},
				() => markLoaded("applications"),
			),
			onSnapshot(
				collection(db, "soeRequests"),
				(snap) => {
					setSoeRequests(snap.docs.map((row) => ({ id: row.id, ...(row.data() || {}) })))
					markLoaded("soe")
				},
				() => markLoaded("soe"),
			),
			onSnapshot(
				collection(db, "soeDownloads"),
				(snap) => {
					setSoeDownloads(snap.docs.map((row) => ({ id: row.id, ...(row.data() || {}) })))
					markLoaded("soeDownloads")
				},
				() => markLoaded("soeDownloads"),
			),
			onSnapshot(
				collection(db, "announcements"),
				(snap) => {
					setAnnouncements(
						snap.docs
							.map((row) => ({ id: row.id, ...(row.data() || {}) }))
							.sort((a, b) => (toJsDate(b.createdAt)?.getTime() || 0) - (toJsDate(a.createdAt)?.getTime() || 0)),
					)
					markLoaded("announcements")
				},
				() => markLoaded("announcements"),
			),
			onSnapshot(
				collectionGroup(db, GRANTOR_SUBCOLLECTIONS.scholars),
				(snap) => {
					setGrantorScholarsRaw(
						snap.docs.map((row) => {
							const raw = row.data() || {}
							const grantorId = raw.grantorId || row.ref.parent?.parent?.id || ""
							const providerType =
								raw.providerType ||
								toProviderType(raw.grantorName || raw.providerName || raw.scholarshipTitle || grantorId)
							return normalizeGrantorScholar(
								{
									...raw,
									grantorId,
									providerType,
									grantorName:
										raw.grantorName ||
										raw.providerName ||
										raw.organization ||
										toProviderLabel(providerType),
								},
								row.id,
							)
						}),
					)
					markLoaded("grantorScholars")
				},
				() => markLoaded("grantorScholars"),
			),
		]
		return () => unsubs.forEach((unsub) => unsub())
	}, [])

	useEffect(() => {
		setAnnouncementDraftPreviews((prev) => {
			prev.forEach((item) => URL.revokeObjectURL(item.url))
			return announcementImageFiles.map((file) => ({
				file,
				name: file.name,
				url: URL.createObjectURL(file),
			}))
		})
	}, [announcementImageFiles])

	useEffect(() => {
		return () => {
			announcementDraftPreviews.forEach((item) => URL.revokeObjectURL(item.url))
		}
	}, [announcementDraftPreviews])

	const allStudentsRaw = useMemo(() => {
		const merged = new Map()
		pendingStudentsRaw.forEach((student) => {
			if (!student?.id) return
			merged.set(student.id, { ...student, id: student.id, sourceCollection: "pendingStudent", isPending: true })
		})
		studentsRaw.forEach((student) => {
			if (!student?.id) return
			merged.set(student.id, { ...merged.get(student.id), ...student, id: student.id, sourceCollection: "students" })
		})
		return [...merged.values()]
	}, [pendingStudentsRaw, studentsRaw])

	const baseStudentRows = useMemo(() => mapStudents(allStudentsRaw), [allStudentsRaw])
	const scholarshipRows = useMemo(() => mapScholarshipRows(allStudentsRaw, applicationsRaw), [allStudentsRaw, applicationsRaw])
	const validationLookup = useMemo(
		() => new Map(baseStudentRows.map((row) => [row.id, row.validationStatus])),
		[baseStudentRows],
	)

	const studentsByCourse = useMemo(
		() => [...new Set(baseStudentRows.map((row) => row.course).filter(Boolean).filter((value) => value !== "-"))].sort(),
		[baseStudentRows],
	)
	const studentsByYear = useMemo(
		() => [...new Set(baseStudentRows.map((row) => row.yearLevel).filter(Boolean).filter((value) => value !== "-"))].sort(),
		[baseStudentRows],
	)

	const studentProfiles = useMemo(
		() =>
			allStudentsRaw.map((student) => {
				const restrictionState = getStudentRestrictionState(student)
				const scholarships = normalizeScholarshipList(student.scholarships || [])
				return {
					...student,
					fullName: studentFullName(student),
					scholarships,
					restrictionState,
					sourceCollection: student.sourceCollection || "students",
					validationStatus: validationLookup.get(student.id) || "-",
					recordStatus:
						student.archived === true
							? "Archived"
							: restrictionState.accountAccess || restrictionState.scholarshipEligibility
								? "Blocked"
								: "Active",
				}
			}),
		[allStudentsRaw, validationLookup],
	)

	const selectedStudent = useMemo(
		() => studentProfiles.find((student) => student.id === selectedStudentId) || null,
		[selectedStudentId, studentProfiles],
	)

	const isSelectedStudentPendingOnly = selectedStudent?.sourceCollection === "pendingStudent"

	const selectedStudentLastSoe = useMemo(() => {
		if (!selectedStudent?.id) return "No SOE request yet"
		const latest = soeRequests
			.filter((item) => item.studentId === selectedStudent.id)
			.sort((a, b) => (toJsDate(b.timestamp)?.getTime() || 0) - (toJsDate(a.timestamp)?.getTime() || 0))[0]
		return latest ? formatDate(latest.timestamp || latest.createdAt || latest.dateRequested) : "No SOE request yet"
	}, [selectedStudent, soeRequests])

	const filteredStudentsBase = useMemo(
		() =>
			filterStudentRows(baseStudentRows, {
				search: studentSearch,
				course: studentCourse,
				year: studentYear,
				validation: studentValidation,
			}),
		[baseStudentRows, studentSearch, studentCourse, studentYear, studentValidation],
	)

	const filteredStudents = useMemo(() => {
		const allowedIds = new Set(filteredStudentsBase.map((row) => row.id))
		return studentProfiles.filter((student) => {
			if (!allowedIds.has(student.id)) return false
			return toStudentLifecycle(student) === studentViewTab
		})
	}, [filteredStudentsBase, studentProfiles, studentViewTab])

	const studentTabCounts = useMemo(
		() => ({
			students: studentProfiles.filter((student) => toStudentLifecycle(student) === "students").length,
			blocked: studentProfiles.filter((student) => toStudentLifecycle(student) === "blocked").length,
			archived: studentProfiles.filter((student) => toStudentLifecycle(student) === "archived").length,
		}),
		[studentProfiles],
	)

	const studentValidationCounts = useMemo(
		() => ({
			validated: studentProfiles.filter((student) => student.validationStatus === "Validated").length,
			pending: studentProfiles.filter((student) => student.validationStatus === "Pending").length,
		}),
		[studentProfiles],
	)

	const currentStudentReportRows = useMemo(
		() => filteredStudents.map((student) => toStudentReportRow(student, student.validationStatus)),
		[filteredStudents],
	)

	const allStudentReportRows = useMemo(
		() => studentProfiles.map((student) => toStudentReportRow(student, student.validationStatus)),
		[studentProfiles],
	)

	const visibleStudentReportRows = useMemo(
		() => (studentViewTab === "overview" ? allStudentReportRows : currentStudentReportRows),
		[allStudentReportRows, currentStudentReportRows, studentViewTab],
	)

	const studentReportFilterLabel =
		studentViewTab === "overview"
			? `View: overview | Managed Records: ${studentProfiles.length} | Validated: ${studentValidationCounts.validated} | Archived: ${studentTabCounts.archived}`
			: `View: ${studentViewTab} | Search: ${studentSearch || "-"} | Course: ${studentCourse} | Year: ${studentYear} | Validation: ${studentValidation}`

	const studentArchiveDates = useMemo(
		() =>
			studentProfiles
				.filter((student) => student.archived === true)
				.map((student) => student.archivedAt || student.updatedAt || student.createdAt)
				.filter(Boolean),
		[studentProfiles],
	)

	const studentArchiveSeries = useMemo(
		() => buildSoeVolumeSeries(studentArchiveDates, studentArchiveTrendRange),
		[studentArchiveDates, studentArchiveTrendRange],
	)

	const studentArchiveData = useMemo(
		() => ({
			labels: studentArchiveSeries.labels,
			datasets: [
				{
					label: "Archived Students",
					data: studentArchiveSeries.values,
					borderColor: theme === "dark" ? "#fbbf24" : "#b45309",
					backgroundColor: theme === "dark" ? "rgba(251, 191, 36, 0.18)" : "rgba(180, 83, 9, 0.14)",
					fill: true,
					tension: 0.32,
					pointRadius: 4,
					pointHoverRadius: 5,
					pointBackgroundColor: theme === "dark" ? "#fbbf24" : "#b45309",
					pointBorderColor: theme === "dark" ? "#0f172a" : "#ffffff",
					pointBorderWidth: 2,
				},
			],
		}),
		[studentArchiveSeries, theme],
	)

	const studentLifecycleData = useMemo(
		() => ({
			labels: ["Active", "Blocked", "Archived"],
			datasets: [
				{
					data: [studentTabCounts.students, studentTabCounts.blocked, studentTabCounts.archived],
					backgroundColor: theme === "dark" ? ["#22c55e", "#f97316", "#94a3b8"] : ["#166534", "#ea580c", "#64748b"],
					borderColor: theme === "dark" ? "#0f172a" : "#ffffff",
					borderWidth: 3,
				},
			],
		}),
		[studentTabCounts, theme],
	)

	const studentValidationData = useMemo(
		() => ({
			labels: ["Validated", "Pending"],
			datasets: [
				{
					label: "Students",
					data: [studentValidationCounts.validated, studentValidationCounts.pending],
					backgroundColor: theme === "dark" ? ["#34d399", "#fbbf24"] : ["#15803d", "#d97706"],
					borderRadius: 12,
				},
			],
		}),
		[studentValidationCounts, theme],
	)

	const providerCounts = useMemo(() => {
		const counts = { kuya_win: 0, tina_pancho: 0, morisson: 0, other: 0, none: 0 }
		studentProfiles.forEach((student) => {
			if (student.scholarships.length === 0) {
				counts.none += 1
				return
			}
			student.scholarships.forEach((scholarship) => {
				counts[toProviderType(scholarship.providerType || scholarship.provider || scholarship.name)] += 1
			})
		})
		return counts
	}, [studentProfiles])

	const grantorDistributionRows = useMemo(() => {
		const total = Object.values(providerCounts).reduce((sum, count) => sum + count, 0)
		return Object.entries(providerCounts)
			.map(([providerKey, count]) => ({
				id: providerKey,
				label: toProviderLabel(providerKey),
				value: count,
				color: GRANTOR_COLORS[providerKey] || "#64748b",
				percent: formatPercent(count, total),
			}))
			.filter((row) => row.value > 0 || total === 0)
	}, [providerCounts])

	const activeGrantorScholars = useMemo(
		() =>
			grantorScholarsRaw.filter((row) => row.archived !== true).sort((left, right) => {
				const leftDate = toJsDate(left.updatedAt || left.createdAt)?.getTime() || 0
				const rightDate = toJsDate(right.updatedAt || right.createdAt)?.getTime() || 0
				return rightDate - leftDate
			}),
		[grantorScholarsRaw],
	)

	const archivedGrantorScholars = useMemo(
		() =>
			grantorScholarsRaw.filter((row) => row.archived === true).sort((left, right) => {
				const leftDate = toJsDate(left.archivedAt || left.updatedAt || left.createdAt)?.getTime() || 0
				const rightDate = toJsDate(right.archivedAt || right.updatedAt || right.createdAt)?.getTime() || 0
				return rightDate - leftDate
			}),
		[grantorScholarsRaw],
	)

	const grantorScholarStudentRecordLookup = useMemo(() => {
		const studentIds = new Map(
			studentProfiles.map((student) => [normalizeGrantorScholarLookupValue(student.id), student.id]),
		)
		const lookup = new Map()
		grantorScholarsRaw.forEach((scholar) => {
			const directMatchId = studentIds.get(normalizeGrantorScholarLookupValue(scholar.studentId))
			let matchedStudentId = directMatchId || ""
			if (!matchedStudentId) {
				const matchedStudent = studentProfiles.find((student) =>
					matchesGrantorScholarToStudent(student, scholar),
				)
				matchedStudentId = matchedStudent?.id || ""
			}
			lookup.set(`${scholar.grantorId || scholar.providerType || "grantor"}::${scholar.id}`, matchedStudentId)
		})
		return lookup
	}, [grantorScholarsRaw, studentProfiles])

	const scholarshipOverviewRows = useMemo(() => {
		const rows = new Map()
		activeGrantorScholars.forEach((scholar) => {
			const provider = scholar.providerType || toProviderType(scholar.grantorName || scholar.scholarshipTitle)
			const programName = scholar.scholarshipTitle || scholar.grantorName || "Scholarship"
			const key = `${provider}::${programName.toLowerCase()}`
			if (!rows.has(key)) {
				rows.set(key, {
					programName,
					providerType: provider,
					grantorName: scholar.grantorName || toProviderLabel(provider),
					totalSlots: "-",
					activeRecipients: 0,
					status: "Active",
				})
			}
			rows.get(key).activeRecipients += 1
		})
		return [...rows.values()].sort((left, right) => right.activeRecipients - left.activeRecipients)
	}, [activeGrantorScholars])

	const scholarshipProviderOptions = useMemo(() => {
		const rows = [...activeGrantorScholars, ...archivedGrantorScholars]
		const options = new Map()
		rows.forEach((row) => {
			const provider =
				row.providerType || toProviderType(row.grantorName || row.scholarshipTitle || "")
			if (!provider || options.has(provider)) return
			options.set(provider, row.grantorName || toProviderLabel(provider))
		})
		if (options.size === 0) {
			scholarshipOverviewRows.forEach((row) => {
				if (!row.providerType || options.has(row.providerType)) return
				options.set(row.providerType, row.grantorName || toProviderLabel(row.providerType))
			})
		}
		return [...options.entries()]
			.map(([value, label]) => ({ value, label }))
			.sort((left, right) => left.label.localeCompare(right.label))
	}, [activeGrantorScholars, archivedGrantorScholars, scholarshipOverviewRows])

	const filteredScholarships = useMemo(() => {
		const keyword = scholarshipSearch.trim().toLowerCase()
		return scholarshipOverviewRows.filter((row) => {
			const providerMatch = scholarshipProvider === "All" || row.providerType === scholarshipProvider
			const searchMatch =
				!keyword ||
				String(row.programName || "").toLowerCase().includes(keyword) ||
				String(row.grantorName || "").toLowerCase().includes(keyword) ||
				String(row.status || "").toLowerCase().includes(keyword)
			return providerMatch && searchMatch
		})
	}, [scholarshipOverviewRows, scholarshipProvider, scholarshipSearch])

	const studentGrantorMatches = useMemo(() => {
		return studentProfiles
			.map((student) => {
				const normalizedStudentId = normalizeGrantorScholarLookupValue(student.id)
				const matches = activeGrantorScholars.filter((scholar) => {
					const scholarStudentId = normalizeGrantorScholarLookupValue(scholar.studentId)
					return (
						(normalizedStudentId && scholarStudentId && scholarStudentId === normalizedStudentId) ||
						matchesGrantorScholarToStudent(student, scholar)
					)
				})
				const distinctGrantors = [
					...new Map(
						matches.map((scholar) => [
							scholar.grantorId || scholar.providerType || scholar.grantorName || scholar.id,
							{
								id: scholar.grantorId || scholar.providerType || scholar.grantorName || scholar.id,
								label: scholar.grantorName || toProviderLabel(scholar.providerType),
								provider: scholar.providerType || toProviderType(scholar.grantorName || scholar.scholarshipTitle),
							},
						]),
					).values(),
				]
				const scholarshipTitles = [...new Set(matches.map((scholar) => scholar.scholarshipTitle || scholar.grantorName || "Scholarship"))]
				return { student, matches, distinctGrantors, scholarshipTitles }
			})
			.filter((entry) => entry.matches.length > 0)
	}, [activeGrantorScholars, studentProfiles])

	const warningRows = useMemo(() => {
		const keyword = scholarshipSearch.trim().toLowerCase()
		return studentGrantorMatches
			.filter((entry) => entry.distinctGrantors.length > 1)
			.filter(
				(entry) =>
					scholarshipProvider === "All" ||
					entry.distinctGrantors.some((grantor) => grantor.provider === scholarshipProvider),
			)
			.map((entry) => {
				const grantorLabels = entry.distinctGrantors.map((grantor) => grantor.label)
				return {
					trackingKey: `warning::${entry.student.id}`,
					studentId: entry.student.id,
					fullName: entry.student.fullName,
					details: `Grantors: ${grantorLabels.join(", ")} | Scholarships: ${entry.scholarshipTitles.join(", ")}`,
					grantors: grantorLabels.join(", "),
					studentRecordId: entry.student.id,
				}
			})
			.filter(
				(row) =>
					!keyword ||
					row.studentId.toLowerCase().includes(keyword) ||
					row.fullName.toLowerCase().includes(keyword) ||
					row.details.toLowerCase().includes(keyword) ||
					row.grantors.toLowerCase().includes(keyword),
			)
	}, [scholarshipProvider, scholarshipSearch, studentGrantorMatches])

	const grantorConflictSyncPayloads = useMemo(() => {
		const conflictLookup = new Map(
			studentGrantorMatches
				.filter((entry) => entry.student.sourceCollection === "students" && entry.distinctGrantors.length > 1)
				.map((entry) => [entry.student.id, entry]),
		)

		return studentsRaw
			.map((student) => {
				if (!student?.id) return null
				const conflictEntry = conflictLookup.get(student.id)
				const currentReason = student.scholarshipRestrictionReason || null
				const scholarships = Array.isArray(student.scholarships) ? student.scholarships : []
				const hasConflict = Boolean(conflictEntry) && scholarships.length !== 1
				const hasAdminScholarshipBlock = scholarships.some((entry) => entry?.adminBlocked === true)
				const preservedManualEligibility =
					student?.restrictions?.scholarshipEligibility === true &&
					currentReason !== "multiple_scholarships" &&
					student?.soeComplianceBlocked !== true &&
					!hasAdminScholarshipBlock
				const nextConflictMessage = hasConflict
					? `Multiple grantors detected: ${conflictEntry.distinctGrantors
							.map((grantor) => grantor.label)
							.join(", ")}. Choose one scholarship only to comply with the one scholarship per student policy.`
					: ""
				const nextRestrictions = {
					...(student.restrictions || {}),
					scholarshipEligibility:
						hasConflict ||
						student?.soeComplianceBlocked === true ||
						hasAdminScholarshipBlock ||
						preservedManualEligibility,
					complianceHold: student?.soeComplianceBlocked === true,
				}
				const nextPayload = {
					scholarshipConflictWarning: hasConflict,
					scholarshipConflictMessage:
						hasConflict || currentReason === "multiple_scholarships"
							? nextConflictMessage
							: student?.scholarshipConflictMessage || "",
					scholarshipRestrictionReason:
						hasConflict ? "multiple_scholarships" : currentReason === "multiple_scholarships" ? null : currentReason,
					restrictions: nextRestrictions,
				}
				const didChange =
					student?.scholarshipConflictWarning !== nextPayload.scholarshipConflictWarning ||
					(student?.scholarshipConflictMessage || "") !== nextPayload.scholarshipConflictMessage ||
					(student?.scholarshipRestrictionReason || null) !== nextPayload.scholarshipRestrictionReason ||
					Boolean(student?.restrictions?.scholarshipEligibility) !== Boolean(nextPayload.restrictions.scholarshipEligibility) ||
					Boolean(student?.restrictions?.complianceHold) !== Boolean(nextPayload.restrictions.complianceHold)
				if (!didChange) return null
				return { studentId: student.id, payload: nextPayload }
			})
			.filter(Boolean)
	}, [studentGrantorMatches, studentsRaw])

	useEffect(() => {
		if (!dataLoadState.students || !dataLoadState.grantorScholars || grantorConflictSyncPayloads.length === 0) return
		void Promise.all(
			grantorConflictSyncPayloads.map(({ studentId, payload }) =>
				setDoc(doc(db, "students", studentId), { ...payload, updatedAt: serverTimestamp() }, { merge: true }),
			),
		).catch((error) => {
			console.error("Failed to sync grantor scholarship conflicts.", error)
		})
	}, [dataLoadState.grantorScholars, dataLoadState.students, grantorConflictSyncPayloads])

	const latestScholarshipMaterialRequests = useMemo(() => {
		const latestRequests = new Map()
		soeRequests
			.slice()
			.sort((left, right) => {
				const leftDate =
					toJsDate(left.updatedAt || left.timestamp || left.createdAt || left.dateRequested)?.getTime() || 0
				const rightDate =
					toJsDate(right.updatedAt || right.timestamp || right.createdAt || right.dateRequested)?.getTime() || 0
				return rightDate - leftDate
			})
			.forEach((request) => {
				const normalizedRequest = normalizeMaterialRequest(request)
				const keys = [
					normalizedRequest.studentId && normalizedRequest.scholarshipId
						? `${normalizedRequest.studentId}::${normalizedRequest.scholarshipId}`
						: "",
					normalizedRequest.studentId && normalizedRequest.applicationNumber
						? `${normalizedRequest.studentId}::${normalizedRequest.applicationNumber}`
						: "",
					normalizedRequest.studentId && normalizedRequest.requestNumber
						? `${normalizedRequest.studentId}::${normalizedRequest.requestNumber}`
						: "",
					normalizedRequest.studentId && normalizedRequest.providerType
						? `${normalizedRequest.studentId}::provider::${normalizedRequest.providerType}`
						: "",
				].filter(Boolean)

				keys.forEach((key) => {
					if (!latestRequests.has(key)) {
						latestRequests.set(key, normalizedRequest)
					}
				})
			})
		return latestRequests
	}, [soeRequests])

	const latestScholarshipSoeDownloads = useMemo(() => {
		const latestDownloads = new Map()
		soeDownloads
			.slice()
			.sort((left, right) => {
				const leftDate =
					toJsDate(left.updatedAt || left.downloadedAt || left.createdAt)?.getTime() || 0
				const rightDate =
					toJsDate(right.updatedAt || right.downloadedAt || right.createdAt)?.getTime() || 0
				return rightDate - leftDate
			})
			.forEach((download) => {
				const downloadProvider = toProviderType(
					download.providerType || download.scholarshipName || "",
				)
				const keys = [
					download.studentId && download.scholarshipId
						? `${download.studentId}::${download.scholarshipId}`
						: "",
					download.studentId && download.applicationNumber
						? `${download.studentId}::${download.applicationNumber}`
						: "",
					download.studentId && download.requestNumber
						? `${download.studentId}::${download.requestNumber}`
						: "",
					download.studentId && download.soeSnapshot?.requestNumber
						? `${download.studentId}::${download.soeSnapshot.requestNumber}`
						: "",
					download.studentId && downloadProvider
						? `${download.studentId}::provider::${downloadProvider}`
						: "",
				].filter(Boolean)

				keys.forEach((key) => {
					if (!latestDownloads.has(key)) {
						latestDownloads.set(key, download)
					}
				})
			})
		return latestDownloads
	}, [soeDownloads])

	const allScholarshipTrackingRows = useMemo(() => {
		return studentProfiles.flatMap((student) => {
			if (!Array.isArray(student.scholarships) || student.scholarships.length === 0) return []

			return student.scholarships.map((scholarship) => {
				const provider = toProviderType(
					scholarship.providerType || scholarship.provider || scholarship.name,
				)
				const relatedMaterialRequest =
					latestScholarshipMaterialRequests.get(`${student.id}::${scholarship.id}`) ||
					latestScholarshipMaterialRequests.get(`${student.id}::${scholarship.requestNumber}`) ||
					latestScholarshipMaterialRequests.get(`${student.id}::provider::${provider}`) ||
					null
				const relatedSoeDownload =
					latestScholarshipSoeDownloads.get(`${student.id}::${scholarship.id}`) ||
					latestScholarshipSoeDownloads.get(`${student.id}::${scholarship.requestNumber}`) ||
					latestScholarshipSoeDownloads.get(`${student.id}::provider::${provider}`) ||
					null
				const documentCheck = validateScholarshipDocuments(
					student,
					scholarship.name || scholarship.provider || "Scholarship",
				)
				const trackingProgress = getScholarshipTrackingProgress({
					scholarship,
					isValidated: student.validationStatus === "Validated",
					documentCheck,
					latestMaterialRequest: relatedMaterialRequest,
					latestSoeDownload: relatedSoeDownload,
				})

				return {
					trackingKey: `${student.id}::${scholarship.id}`,
					studentId: student.id,
					fullName: student.fullName,
					scholarship: scholarship.name || scholarship.provider || "Scholarship",
					provider,
					status: scholarship.adminBlocked
						? "Blocked"
						: getScholarshipTrackingStatusLabel(trackingProgress),
					currentStepLabel: trackingProgress.currentStepLabel,
					currentStepOwnerLabel: trackingProgress.currentStepOwnerLabel,
					scholarshipEntry: scholarship,
					studentSnapshot: student,
					documentCheck,
					latestMaterialRequest: relatedMaterialRequest,
					latestSoeDownload: relatedSoeDownload,
					trackingProgress,
				}
			})
		})
	}, [latestScholarshipMaterialRequests, latestScholarshipSoeDownloads, studentProfiles])

	const scholarshipStudentRows = useMemo(
		() =>
			activeGrantorScholars.map((scholar) => {
				const provider = scholar.providerType || toProviderType(scholar.grantorName || scholar.scholarshipTitle)
				const studentRecordId =
					grantorScholarStudentRecordLookup.get(
						`${scholar.grantorId || scholar.providerType || "grantor"}::${scholar.id}`,
					) || ""
				return {
					trackingKey: `grantor_scholar::${scholar.grantorId || provider}::${scholar.id}`,
					studentId: scholar.studentId || "-",
					fullName: buildGrantorScholarFullName(scholar),
					scholarship: scholar.scholarshipTitle || scholar.grantorName || "Scholarship",
					provider,
					grantorName: scholar.grantorName || toProviderLabel(provider),
					yearLevel: scholar.yearLevel || "-",
					contactNumber: scholar.cpNumber || "-",
					street: buildGrantorScholarAddress(scholar) || "-",
					status: scholar.status || "Active",
					updatedAtLabel: formatDate(scholar.updatedAt || scholar.createdAt),
					studentRecordId,
					rawScholar: scholar,
				}
			}),
		[activeGrantorScholars, grantorScholarStudentRecordLookup],
	)

	const scholarshipStudentTableRows = useMemo(() => {
		const keyword = scholarshipSearch.trim().toLowerCase()
		return scholarshipStudentRows.filter((row) => {
			return (
				(!keyword ||
					row.studentId.toLowerCase().includes(keyword) ||
					row.fullName.toLowerCase().includes(keyword) ||
					row.scholarship.toLowerCase().includes(keyword) ||
					row.status.toLowerCase().includes(keyword) ||
					row.grantorName.toLowerCase().includes(keyword) ||
					row.contactNumber.toLowerCase().includes(keyword) ||
					row.street.toLowerCase().includes(keyword)) &&
				(scholarshipProvider === "All" || row.provider === scholarshipProvider)
			)
		})
	}, [scholarshipProvider, scholarshipSearch, scholarshipStudentRows])

	const archivedScholarshipRows = useMemo(
		() =>
			archivedGrantorScholars.map((scholar) => {
				const provider = scholar.providerType || toProviderType(scholar.grantorName || scholar.scholarshipTitle)
				const studentRecordId =
					grantorScholarStudentRecordLookup.get(
						`${scholar.grantorId || scholar.providerType || "grantor"}::${scholar.id}`,
					) || ""
				return {
					trackingKey: `archived_grantor_scholar::${scholar.grantorId || provider}::${scholar.id}`,
					studentId: scholar.studentId || "-",
					fullName: buildGrantorScholarFullName(scholar),
					scholarship: scholar.scholarshipTitle || scholar.grantorName || "Scholarship",
					provider,
					grantorName: scholar.grantorName || toProviderLabel(provider),
					yearLevel: scholar.yearLevel || "-",
					status: scholar.status || "Archived",
					archivedAtLabel: formatDate(scholar.archivedAt || scholar.updatedAt || scholar.createdAt),
					studentRecordId,
					rawScholar: scholar,
				}
			}),
		[archivedGrantorScholars, grantorScholarStudentRecordLookup],
	)

	const archivedScholarshipTableRows = useMemo(() => {
		const keyword = scholarshipSearch.trim().toLowerCase()
		return archivedScholarshipRows.filter((row) => {
			return (
				(!keyword ||
					row.studentId.toLowerCase().includes(keyword) ||
					row.fullName.toLowerCase().includes(keyword) ||
					row.scholarship.toLowerCase().includes(keyword) ||
					row.status.toLowerCase().includes(keyword) ||
					row.grantorName.toLowerCase().includes(keyword)) &&
				(scholarshipProvider === "All" || row.provider === scholarshipProvider)
			)
		})
	}, [archivedScholarshipRows, scholarshipProvider, scholarshipSearch])

	const scholarshipTrackingRows = useMemo(() => {
		const keyword = scholarshipSearch.trim().toLowerCase()
		return allScholarshipTrackingRows.filter((row) => {
			return (
				(!keyword ||
					row.studentId.toLowerCase().includes(keyword) ||
					row.fullName.toLowerCase().includes(keyword) ||
					row.scholarship.toLowerCase().includes(keyword) ||
					row.status.toLowerCase().includes(keyword) ||
					row.currentStepLabel.toLowerCase().includes(keyword) ||
					row.currentStepOwnerLabel.toLowerCase().includes(keyword) ||
					toProviderLabel(row.provider).toLowerCase().includes(keyword)) &&
				(scholarshipProvider === "All" || row.provider === scholarshipProvider)
			)
		})
	}, [allScholarshipTrackingRows, scholarshipProvider, scholarshipSearch])

	const scholarshipTabCounts = useMemo(
		() => ({
			overview: scholarshipOverviewRows.length,
			scholars: scholarshipStudentRows.length,
			tracking: scholarshipTrackingRows.length,
			warning: warningRows.length,
			archived: archivedScholarshipRows.length,
		}),
		[
			archivedScholarshipRows.length,
			scholarshipOverviewRows.length,
			scholarshipStudentRows.length,
			scholarshipTrackingRows.length,
			warningRows.length,
		],
	)

	const visibleScholarshipRows = useMemo(() => {
		if (scholarshipTab === "warning") return warningRows
		if (scholarshipTab === "overview") return filteredScholarships
		if (scholarshipTab === "tracking") return scholarshipTrackingRows
		if (scholarshipTab === "archived") return archivedScholarshipTableRows
		return scholarshipStudentTableRows
	}, [
		archivedScholarshipTableRows,
		filteredScholarships,
		scholarshipStudentTableRows,
		scholarshipTab,
		scholarshipTrackingRows,
		warningRows,
	])

	const selectedScholarshipTrackingRow = useMemo(
		() =>
			allScholarshipTrackingRows.find((row) => row.trackingKey === selectedScholarshipTrackingKey) ||
			null,
		[allScholarshipTrackingRows, selectedScholarshipTrackingKey],
	)

	const scholarshipSectionPreviewConfig = useMemo(() => {
		if (scholarshipTab === "overview") {
			const overviewRows = visibleScholarshipRows.map((row) => toScholarshipReportRow(row))
			return createScholarshipPreviewConfig(
				overviewRows,
				`Table: Overview | Search: ${scholarshipSearch || "-"} | Provider: ${scholarshipProvider}`,
			)
		}

		if (scholarshipTab === "warning") {
			const warningReportRows = visibleScholarshipRows.map((row) => toScholarshipWarningReportRow(row))
			return createScholarshipPreviewConfig(warningReportRows, `Table: ${toScholarshipTabLabel(scholarshipTab)} | Search: ${scholarshipSearch || "-"}`, {
				description: "Preview of the currently selected scholarship warning table before export.",
				stats: [
					{ label: "Rows", value: warningReportRows.length },
					{ label: "Students", value: new Set(warningReportRows.map((row) => row.studentId)).size },
					{ label: "Warnings", value: warningReportRows.length },
					{ label: "Search", value: scholarshipSearch.trim() ? "Filtered" : "All" },
				],
				columns: ["Student ID", "Full Name", "Conflict Details"],
				csvRows: warningReportRows.map((row) => [row.studentId, row.fullName, row.conflictDetails]),
			})
		}

		if (scholarshipTab === "tracking") {
			const trackingReportRows = visibleScholarshipRows.map((row) => ({
				studentId: row.studentId || "-",
				fullName: row.fullName || "-",
				scholarship: row.scholarship || "-",
				grantor: toProviderLabel(row.provider),
				currentStep: row.currentStepLabel || "-",
				owner: row.currentStepOwnerLabel || "-",
				status: row.status || "-",
			}))

			return createScholarshipPreviewConfig(
				trackingReportRows,
				`Table: Tracking | Search: ${scholarshipSearch || "-"} | Grantor: ${scholarshipProvider}`,
				{
					description: "Preview of scholarship application tracking rows before export.",
					stats: [
						{ label: "Rows", value: trackingReportRows.length },
						{ label: "Students", value: new Set(trackingReportRows.map((row) => row.studentId)).size },
						{ label: "Grantors", value: new Set(trackingReportRows.map((row) => row.grantor)).size },
						{
							label: "Current Step",
							value: trackingReportRows.length > 0 ? trackingReportRows[0].currentStep : "-",
						},
					],
					columns: ["Student ID", "Full Name", "Scholarship", "Grantor", "Current Step", "Owned By", "Status"],
					csvRows: trackingReportRows.map((row) => [
						row.studentId,
						row.fullName,
						row.scholarship,
						row.grantor,
						row.currentStep,
						row.owner,
						row.status,
					]),
				},
			)
		}

		const tableReportRows = visibleScholarshipRows.map((row) =>
			scholarshipTab === "archived"
				? {
						studentId: row.studentId || "-",
						fullName: row.fullName || "-",
						scholarship: row.scholarship || "-",
						grantor: row.grantorName || toProviderLabel(row.provider),
						yearLevel: row.yearLevel || "-",
						archivedAt: row.archivedAtLabel || "-",
						status: row.status || "-",
					}
				: {
						studentId: row.studentId || "-",
						fullName: row.fullName || "-",
						scholarship: row.scholarship || "-",
						grantor: row.grantorName || toProviderLabel(row.provider),
						yearLevel: row.yearLevel || "-",
						status: row.status || "-",
						updatedAt: row.updatedAtLabel || "-",
					},
		)

		return createScholarshipPreviewConfig(
			tableReportRows,
			`Table: ${toScholarshipTabLabel(scholarshipTab)} | Search: ${scholarshipSearch || "-"} | Grantor: ${scholarshipProvider}`,
			{
				description:
					scholarshipTab === "archived"
						? "Preview of archived grantor scholar rows before export."
						: "Preview of the combined grantor scholar roster before export.",
				stats: [
					{ label: "Rows", value: tableReportRows.length },
					{ label: "Students", value: new Set(tableReportRows.map((row) => row.studentId)).size },
					{ label: "Scholarships", value: new Set(tableReportRows.map((row) => row.scholarship)).size },
					{ label: "Grantors", value: new Set(tableReportRows.map((row) => row.grantor)).size },
				],
				columns:
					scholarshipTab === "archived"
						? ["Student ID", "Full Name", "Scholarship", "Grantor", "Year Level", "Archived At", "Status"]
						: ["Student ID", "Full Name", "Scholarship", "Grantor", "Year Level", "Updated", "Status"],
				csvRows:
					scholarshipTab === "archived"
						? tableReportRows.map((row) => [
								row.studentId,
								row.fullName,
								row.scholarship,
								row.grantor,
								row.yearLevel,
								row.archivedAt,
								row.status,
							])
						: tableReportRows.map((row) => [
								row.studentId,
								row.fullName,
								row.scholarship,
								row.grantor,
								row.yearLevel,
								row.updatedAt,
								row.status,
							]),
			},
		)
	}, [scholarshipProvider, scholarshipSearch, scholarshipTab, visibleScholarshipRows])

	const scholarshipOverviewProviderRows = useMemo(() => {
		const counts = { kuya_win: 0, tina_pancho: 0, morisson: 0, other: 0, none: 0 }
		filteredScholarships.forEach((row) => {
			counts[toProviderType(row.providerType)] += Number(row.activeRecipients || 0)
		})
		const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
		return Object.entries(counts)
			.map(([provider, count]) => ({
				id: provider,
				label: toProviderLabel(provider),
				value: count,
				color: GRANTOR_COLORS[provider] || "#64748b",
				percent: formatPercent(count, total),
			}))
			.filter((row) => row.value > 0 || filteredScholarships.length === 0)
	}, [filteredScholarships])

	const activeScholarshipGrantorHoverId = useMemo(
		() => (scholarshipOverviewProviderRows.some((row) => row.id === scholarshipGrantorHoverId) ? scholarshipGrantorHoverId : ""),
		[scholarshipGrantorHoverId, scholarshipOverviewProviderRows],
	)

	const activeScholarshipGrantorRow = useMemo(
		() => scholarshipOverviewProviderRows.find((row) => row.id === activeScholarshipGrantorHoverId) || null,
		[activeScholarshipGrantorHoverId, scholarshipOverviewProviderRows],
	)

	const scholarshipOverviewGrantorTrendRows = useMemo(
		() =>
			grantorScholarsRaw.filter(
				(row) =>
					scholarshipProvider === "All" ||
					(row.providerType || toProviderType(row.grantorName || row.scholarshipTitle)) === scholarshipProvider,
			),
		[grantorScholarsRaw, scholarshipProvider],
	)

	const scholarshipOverviewAddedSeries = useMemo(
		() =>
			buildSoeVolumeSeries(
				scholarshipOverviewGrantorTrendRows
					.map((row) => row.createdAt || row.updatedAt)
					.filter(Boolean),
				grantorScholarTrendRange,
			),
		[grantorScholarTrendRange, scholarshipOverviewGrantorTrendRows],
	)

	const scholarshipOverviewArchivedSeries = useMemo(
		() =>
			buildSoeVolumeSeries(
				scholarshipOverviewGrantorTrendRows
					.filter((row) => row.archived === true)
					.map((row) => row.archivedAt || row.updatedAt || row.createdAt)
					.filter(Boolean),
				grantorScholarTrendRange,
			),
		[grantorScholarTrendRange, scholarshipOverviewGrantorTrendRows],
	)

	const scholarshipOverviewRosterTrendData = useMemo(
		() => ({
			labels: scholarshipOverviewAddedSeries.labels,
			datasets: [
				{
					label: "Added Students",
					data: scholarshipOverviewAddedSeries.values,
					fill: true,
					tension: 0.35,
					borderWidth: 3,
					borderColor: theme === "dark" ? "#34d399" : "#15803d",
					backgroundColor: (context) =>
						createVerticalGradient(
							context,
							theme === "dark" ? "rgba(52, 211, 153, 0.32)" : "rgba(21, 128, 61, 0.22)",
							"rgba(15, 23, 42, 0.02)",
						),
					pointRadius: 4,
					pointHoverRadius: 6,
					pointBackgroundColor: theme === "dark" ? "#bbf7d0" : "#166534",
					pointBorderColor: theme === "dark" ? "#052e16" : "#ffffff",
					pointBorderWidth: 2,
				},
				{
					label: "Archived Students",
					data: scholarshipOverviewArchivedSeries.values,
					fill: true,
					tension: 0.35,
					borderWidth: 3,
					borderColor: theme === "dark" ? "#fca5a5" : "#b91c1c",
					backgroundColor: (context) =>
						createVerticalGradient(
							context,
							theme === "dark" ? "rgba(248, 113, 113, 0.26)" : "rgba(185, 28, 28, 0.16)",
							"rgba(15, 23, 42, 0.02)",
						),
					pointRadius: 4,
					pointHoverRadius: 6,
					pointBackgroundColor: theme === "dark" ? "#fecaca" : "#991b1b",
					pointBorderColor: theme === "dark" ? "#450a0a" : "#ffffff",
					pointBorderWidth: 2,
				},
			],
		}),
		[scholarshipOverviewAddedSeries, scholarshipOverviewArchivedSeries, theme],
	)

	const scholarshipOverviewTotalRecipients = useMemo(
		() => filteredScholarships.reduce((sum, row) => sum + Number(row.activeRecipients || 0), 0),
		[filteredScholarships],
	)

	const scholarshipOverviewLeader = useMemo(() => {
		if (filteredScholarships.length === 0) return null
		return filteredScholarships.slice().sort((left, right) => right.activeRecipients - left.activeRecipients)[0]
	}, [filteredScholarships])

	const scholarshipOverviewArchivedCount = useMemo(
		() =>
			archivedGrantorScholars.filter(
				(row) =>
					scholarshipProvider === "All" ||
					(row.providerType || toProviderType(row.grantorName || row.scholarshipTitle)) === scholarshipProvider,
			).length,
		[archivedGrantorScholars, scholarshipProvider],
	)

	const doughnutOptions = useMemo(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
			cutout: "62%",
			plugins: {
				legend: { display: false },
			},
		}),
		[],
	)

	const scholarshipOverviewGrantorData = useMemo(
		() => ({
			labels: scholarshipOverviewProviderRows.map((row) => row.label),
			datasets: [
				{
					data: scholarshipOverviewProviderRows.map((row) => row.value),
					backgroundColor: scholarshipOverviewProviderRows.map((row) =>
						!activeScholarshipGrantorHoverId || row.id === activeScholarshipGrantorHoverId ? row.color : withColorAlpha(row.color, 0.22),
					),
					hoverBackgroundColor: scholarshipOverviewProviderRows.map((row) => row.color),
					borderColor: theme === "dark" ? "#0f172a" : "#ffffff",
					borderWidth: scholarshipOverviewProviderRows.map((row) => (row.id === activeScholarshipGrantorHoverId ? 5 : 3)),
					offset: scholarshipOverviewProviderRows.map((row) => (row.id === activeScholarshipGrantorHoverId ? 12 : 0)),
					hoverOffset: 14,
				},
			],
		}),
		[activeScholarshipGrantorHoverId, scholarshipOverviewProviderRows, theme],
	)

	const scholarshipOverviewGrantorOptions = useMemo(
		() => ({
			...doughnutOptions,
			plugins: {
				...doughnutOptions.plugins,
				tooltip: {
					callbacks: {
						label: (context) => {
							const row = scholarshipOverviewProviderRows[context.dataIndex]
							if (!row) return ""
							return `${row.label}: ${row.percent} (${row.value} active scholars)`
						},
					},
				},
			},
			onHover: (_event, elements, chart) => {
				const nextHoverId = elements.length > 0 ? scholarshipOverviewProviderRows[elements[0].index]?.id || "" : ""
				chart.canvas.style.cursor = elements.length > 0 ? "pointer" : "default"
				setScholarshipGrantorHoverId((current) => (current === nextHoverId ? current : nextHoverId))
			},
		}),
		[doughnutOptions, scholarshipOverviewProviderRows],
	)

	const recordedApplicationReferences = useMemo(() => {
		const ids = new Set()
		const compositeKeys = new Set()
		applicationsRaw.forEach((application) => {
			const scholarshipId =
				application.scholarshipId || application.applicationNumber || application.requestNumber || application.id
			if (scholarshipId) ids.add(String(scholarshipId))
			const studentId = String(application.studentId || "")
			const providerType = toProviderType(application.providerType || application.scholarshipName || "")
			if (studentId && providerType) compositeKeys.add(`${studentId}::${providerType}`)
		})
		return { ids, compositeKeys }
	}, [applicationsRaw])

	const applicationDates = useMemo(
		() => applicationsRaw.map((application) => getApplicationDate(application)).filter(Boolean),
		[applicationsRaw],
	)

	const signupScholarshipDates = useMemo(() => {
		return allStudentsRaw.flatMap((student) => {
			const fallbackDate = toJsDate(student.createdAt || student.validatedAt || student.updatedAt)
			const scholarships = Array.isArray(student.scholarships) ? student.scholarships : []
			return scholarships
				.filter((scholarship) => {
					const scholarshipId = String(
						scholarship.id || scholarship.applicationNumber || scholarship.requestNumber || "",
					)
					const providerType = toProviderType(scholarship.providerType || scholarship.provider || scholarship.name || "")
					const compositeKey = `${String(student.id || student.studentnumber || "")}::${providerType}`
					return !recordedApplicationReferences.ids.has(scholarshipId) && !recordedApplicationReferences.compositeKeys.has(compositeKey)
				})
				.map((scholarship) => toJsDate(scholarship.appliedAt || scholarship.createdAt || fallbackDate))
				.filter(Boolean)
		})
	}, [allStudentsRaw, recordedApplicationReferences])

	const scholarshipTrackingDates = useMemo(
		() => [...applicationDates, ...signupScholarshipDates],
		[applicationDates, signupScholarshipDates],
	)

	const applicantTimelineSeries = useMemo(
		() => buildSoeVolumeSeries(scholarshipTrackingDates, applicantTrendRange),
		[scholarshipTrackingDates, applicantTrendRange],
	)

	const applicantTrackingData = useMemo(
		() => ({
			labels: applicantTimelineSeries.labels,
			datasets: [
				{
					label: "Applicants",
					data: applicantTimelineSeries.values,
					fill: true,
					tension: 0.35,
					borderWidth: 3,
					borderColor: theme === "dark" ? "#34d399" : "#0f766e",
					backgroundColor: (context) =>
						createVerticalGradient(
							context,
							theme === "dark" ? "rgba(52, 211, 153, 0.42)" : "rgba(15, 118, 110, 0.30)",
							"rgba(15, 23, 42, 0.02)",
						),
					pointRadius: 4,
					pointHoverRadius: 6,
					pointBackgroundColor: theme === "dark" ? "#bbf7d0" : "#115e59",
					pointBorderColor: theme === "dark" ? "#052e16" : "#ffffff",
					pointBorderWidth: 2,
				},
			],
		}),
		[applicantTimelineSeries, theme],
	)

	const grantorDistributionOptions = useMemo(
		() => ({
			...doughnutOptions,
			plugins: {
				...doughnutOptions.plugins,
				tooltip: {
					enabled: false,
					callbacks: {
						label: (context) => {
							const row = grantorDistributionRows[context.dataIndex]
							if (!row) return ""
							return `${row.label}: ${row.percent} (${row.value} scholars)`
						},
					},
				},
			},
			onHover: (_event, elements, chart) => {
				const nextHoverId = elements.length > 0 ? grantorDistributionRows[elements[0].index]?.id || "" : ""
				chart.canvas.style.cursor = elements.length > 0 ? "pointer" : "default"
				setGrantorDistributionHoverId((current) => (current === nextHoverId ? current : nextHoverId))
			},
		}),
		[doughnutOptions, grantorDistributionRows],
	)

	const activeGrantorDistributionHoverId = useMemo(
		() => (grantorDistributionRows.some((row) => row.id === grantorDistributionHoverId) ? grantorDistributionHoverId : ""),
		[grantorDistributionHoverId, grantorDistributionRows],
	)

	const activeGrantorDistributionRow = useMemo(
		() => grantorDistributionRows.find((row) => row.id === activeGrantorDistributionHoverId) || null,
		[activeGrantorDistributionHoverId, grantorDistributionRows],
	)

	const grantorDistributionTotalScholars = useMemo(
		() => grantorDistributionRows.reduce((sum, row) => sum + Number(row.value || 0), 0),
		[grantorDistributionRows],
	)

	const grantorDistributionData = useMemo(
		() => ({
			labels: grantorDistributionRows.map((row) => row.label),
			datasets: [
				{
					data: grantorDistributionRows.map((row) => row.value),
					backgroundColor: grantorDistributionRows.map((row) =>
						!activeGrantorDistributionHoverId || row.id === activeGrantorDistributionHoverId ? row.color : withColorAlpha(row.color, 0.22),
					),
					hoverBackgroundColor: grantorDistributionRows.map((row) => row.color),
					borderColor: theme === "dark" ? "#0f172a" : "#ffffff",
					borderWidth: activeGrantorDistributionHoverId ? 5 : 3,
					offset: grantorDistributionRows.map((row) => (row.id === activeGrantorDistributionHoverId ? 12 : 0)),
					hoverOffset: 14,
				},
			],
		}),
		[activeGrantorDistributionHoverId, grantorDistributionRows, theme],
	)

	const soeRows = useMemo(() => {
		const studentMap = new Map(studentProfiles.map((student) => [student.id, student]))
		const latestRequests = new Map()

		soeRequests.forEach((request) => {
			const normalized = normalizeMaterialRequest(request)
			const dedupeKey = `${normalized.studentId || "unknown"}__${normalized.scholarshipId || normalized.requestNumber || normalized.id || "request"}`
			const nextDate = toMaterialRequestActivityDate(normalized)?.getTime() || 0
			const existing = latestRequests.get(dedupeKey)
			const existingDate = existing ? toMaterialRequestActivityDate(existing)?.getTime() || 0 : -1

			if (!existing || nextDate >= existingDate) {
				latestRequests.set(dedupeKey, normalized)
			}
		})

		return Array.from(latestRequests.values())
			.map((request) => {
				const student = studentMap.get(request.studentId)
				const requestDate = toMaterialRequestDate(request)
				const soeEntry = getMaterialEntry(request, "soe")
				const applicationFormEntry = getMaterialEntry(request, "application_form")
				const downloadedDate = toJsDate(soeEntry.downloadedAt || request.downloadedAt || request.downloadedOn)
				const applicationFormDownloadedDate = toJsDate(
					applicationFormEntry.downloadedAt || request.applicationFormDownloadedAt,
				)
				const hasSoeRequest = soeEntry.requested === true
				const nextEligibleDate = hasSoeRequest && downloadedDate ? addMonths(downloadedDate, 6) : null
				let downloadStatusLabel = "No SOE Requested"
				if (hasSoeRequest) {
					if (downloadedDate) {
						downloadStatusLabel = "Downloaded"
					} else if (soeEntry.status === "approved") {
						downloadStatusLabel = "Awaiting SOE Download"
					} else if (soeEntry.status === "pending") {
						downloadStatusLabel = "Pending Approval"
					} else if (soeEntry.status === "rejected") {
						downloadStatusLabel = "SOE Rejected"
					} else {
						downloadStatusLabel = "Not Downloaded"
					}
				}

				return {
					...request,
					fullName: student?.fullName || studentFullName(student),
					requestNumber: request.requestNumber || request.id || "-",
					status: toOverallMaterialStatus(request),
					reviewState: request.reviewState || "incoming",
					reviewStateLabel: toReviewStateLabel(request.reviewState || "incoming"),
					requestDate,
					requestedMaterialsSummary: request.requestedMaterialsSummary || "-",
					materialStatusSummary: toMaterialStatusSummary(request),
					pendingMaterialsSummary: request.pendingMaterialLabels.join(", ") || "-",
					approvedMaterialsSummary: request.approvedMaterialLabels.join(", ") || "-",
					visibleMaterialsSummary:
						request.pendingMaterialLabels.length > 0
							? request.pendingMaterialLabels.join(", ")
							: request.approvedMaterialLabels.join(", ") ||
								request.requestedMaterialsSummary ||
								"-",
					downloadedDate,
					applicationFormDownloadedDate,
					hasSoeRequest,
					downloadStatusLabel,
					nextEligibleDate,
					nextEligibleLabel: hasSoeRequest
						? nextEligibleDate
							? formatDate(nextEligibleDate)
							: "Waiting for SOE download"
						: "Not applicable",
					timerEndLabel: hasSoeRequest
						? nextEligibleDate
							? formatCountdown(nextEligibleDate)
							: "Waiting for SOE download"
						: "Not applicable",
				}
			})
			.sort((a, b) => (b.requestDate?.getTime() || 0) - (a.requestDate?.getTime() || 0))
	}, [soeRequests, studentProfiles])

	const soeVolumeSeries = useMemo(
		() => buildSoeVolumeSeries(soeRows.map((row) => row.requestDate), soeTrendRange),
		[soeRows, soeTrendRange],
	)

	const soeVolumeData = useMemo(
		() => ({
			labels: soeVolumeSeries.labels,
			datasets: [
				{
					label: "Materials Requests",
					data: soeVolumeSeries.values,
					backgroundColor: theme === "dark" ? "#38bdf8" : "#1d4ed8",
					borderRadius: 12,
				},
			],
		}),
		[soeVolumeSeries, theme],
	)

	const soeProviderOptions = useMemo(() => {
		const providerOrder = ["kuya_win", "tina_pancho", "morisson", "other"]
		const availableProviders = Array.from(
			new Set(soeRows.map((row) => toProviderType(row.providerType || row.scholarshipName || ""))),
		).filter((provider) => provider && provider !== "none")

		return availableProviders.sort((left, right) => {
			const leftIndex = providerOrder.indexOf(left)
			const rightIndex = providerOrder.indexOf(right)
			const safeLeftIndex = leftIndex === -1 ? providerOrder.length : leftIndex
			const safeRightIndex = rightIndex === -1 ? providerOrder.length : rightIndex
			return safeLeftIndex - safeRightIndex || left.localeCompare(right)
		})
	}, [soeRows])

	const requestingSoeRows = useMemo(() => {
		const keyword = soeSearch.trim().toLowerCase()
		return soeRows.filter((row) => {
			if (row.reviewState !== "incoming") return false
			const providerType = toProviderType(row.providerType || row.scholarshipName || "")
			const matchesProvider = soeProviderFilter === "All" || providerType === soeProviderFilter
			const matchesMaterial =
				soeMaterialFilter === "All" ||
				(Array.isArray(row.requestedMaterialKeys) && row.requestedMaterialKeys.includes(soeMaterialFilter))
			if (!matchesProvider || !matchesMaterial) return false
			return (
				!keyword ||
				String(row.requestNumber || row.id || "").toLowerCase().includes(keyword) ||
				String(row.studentId || "").toLowerCase().includes(keyword) ||
				String(row.fullName || "").toLowerCase().includes(keyword) ||
				String(row.scholarshipName || "").toLowerCase().includes(keyword) ||
				String(row.providerType || "").toLowerCase().includes(keyword) ||
				String(row.visibleMaterialsSummary || "").toLowerCase().includes(keyword) ||
				String(row.requestedMaterialsSummary || "").toLowerCase().includes(keyword) ||
				String(row.materialStatusSummary || "").toLowerCase().includes(keyword) ||
				String(row.status || "").toLowerCase().includes(keyword) ||
				String(row.reviewStateLabel || "").toLowerCase().includes(keyword)
			)
		})
	}, [soeMaterialFilter, soeProviderFilter, soeRows, soeSearch])

	const requestedSoeRows = useMemo(() => {
		const keyword = soeSearch.trim().toLowerCase()
		return soeRows.filter((row) => {
			if (row.reviewState !== "signed") return false
			const providerType = toProviderType(row.providerType || row.scholarshipName || "")
			const matchesProvider = soeProviderFilter === "All" || providerType === soeProviderFilter
			const matchesMaterial =
				soeMaterialFilter === "All" ||
				(Array.isArray(row.requestedMaterialKeys) && row.requestedMaterialKeys.includes(soeMaterialFilter))
			if (!matchesProvider || !matchesMaterial) return false
			return (
				!keyword ||
				String(row.requestNumber || row.id || "").toLowerCase().includes(keyword) ||
				String(row.studentId || "").toLowerCase().includes(keyword) ||
				String(row.fullName || "").toLowerCase().includes(keyword) ||
				String(row.scholarshipName || "").toLowerCase().includes(keyword) ||
				String(row.providerType || "").toLowerCase().includes(keyword) ||
				String(row.visibleMaterialsSummary || "").toLowerCase().includes(keyword) ||
				String(row.requestedMaterialsSummary || "").toLowerCase().includes(keyword) ||
				String(row.materialStatusSummary || "").toLowerCase().includes(keyword) ||
				String(row.status || "").toLowerCase().includes(keyword) ||
				String(row.reviewStateLabel || "").toLowerCase().includes(keyword) ||
				String(row.downloadStatusLabel || "").toLowerCase().includes(keyword)
			)
		})
	}, [soeMaterialFilter, soeProviderFilter, soeRows, soeSearch])

	const soeRequestTabCounts = useMemo(
		() => ({
			requesting: soeRows.filter((row) => row.reviewState === "incoming").length,
			requested: soeRows.filter((row) => row.reviewState === "signed").length,
		}),
		[soeRows],
	)

	const requestingSoeReportRows = useMemo(() => requestingSoeRows.map((row) => toSoeReportRow(row)), [requestingSoeRows])
	const requestedSoeReportRows = useMemo(() => requestedSoeRows.map((row) => toSoeReportRow(row)), [requestedSoeRows])

	const soeDownloadRows = useMemo(() => {
		const studentMap = new Map(studentProfiles.map((student) => [student.id, student]))
		return soeDownloads
			.map((download) => {
				const student = studentMap.get(download.studentId)
				const snapshot = download.studentSnapshot || {}
				const reviewState = download.reviewState || "incoming"
				const soeRequestNumber =
					download.requestNumber ||
					download.soeSnapshot?.requestNumber ||
					download.registrationNumber ||
					download.soeSnapshot?.registrationNumber ||
					download.id ||
					"-"
				const reviewStateLabel =
					reviewState === "signed"
						? "Signed"
						: reviewState === "non_compliant"
							? "Non-Compliant"
							: "Pending"
				return {
					...download,
					reviewSource: "download",
					fullName:
						student?.fullName ||
						download.studentName ||
						snapshot.fullName ||
						[snapshot.fname, snapshot.mname, snapshot.lname].filter(Boolean).join(" ").trim() ||
						studentFullName(student),
					studentId:
						download.studentId ||
						download.studentNumber ||
						snapshot.studentId ||
						snapshot.studentNumber ||
						"-",
					studentNumber:
						download.studentNumber ||
						download.studentId ||
						snapshot.studentNumber ||
						snapshot.studentId ||
						"-",
					scholarshipName: download.scholarshipName || "-",
					providerType: download.providerType || "Provider not set",
					requestNumber: soeRequestNumber,
					requestDate: toJsDate(download.createdAt || download.downloadedAt),
					downloadedDate: toJsDate(download.downloadedAt || download.createdAt),
					reviewState,
					reviewStateLabel,
					status: download.status || reviewStateLabel,
					requestedMaterialsSummary: "SOE",
					materialStatusSummary: `SOE Download Review: ${reviewStateLabel}`,
					studentCourse: snapshot.course || student?.course || "-",
					studentYear: snapshot.year || student?.year || "-",
					studentSection: snapshot.section || student?.section || "-",
					studentEmail: snapshot.email || student?.email || "-",
				}
			})
			.sort((a, b) => (b.downloadedDate?.getTime() || 0) - (a.downloadedDate?.getTime() || 0))
	}, [soeDownloads, studentProfiles])

	const soeCheckingRows = useMemo(() => {
		const keyword = soeCheckSearch.trim().toLowerCase()
		return soeDownloadRows.filter((row) => {
			if (row.reviewState !== soeCheckingTab) return false
			return (
				!keyword ||
				String(row.requestNumber || "").toLowerCase().includes(keyword) ||
				String(row.studentId || row.studentNumber || "").toLowerCase().includes(keyword) ||
				String(row.fullName || "").toLowerCase().includes(keyword) ||
				String(row.scholarshipName || "").toLowerCase().includes(keyword) ||
				String(row.providerType || "").toLowerCase().includes(keyword) ||
				String(row.requestedMaterialsSummary || "").toLowerCase().includes(keyword) ||
				String(row.materialStatusSummary || "").toLowerCase().includes(keyword) ||
				String(row.status || "").toLowerCase().includes(keyword) ||
				String(row.reviewStateLabel || "").toLowerCase().includes(keyword)
			)
		})
	}, [soeCheckSearch, soeCheckingTab, soeDownloadRows])

	const studentsTablePage = useMemo(
		() => paginateRows(filteredStudents, tablePages[`students_${studentViewTab}`] || 1, TABLE_PAGE_SIZE),
		[filteredStudents, studentViewTab, tablePages],
	)

	const scholarshipTablePage = useMemo(
		() => paginateRows(visibleScholarshipRows, tablePages[`scholarship_${scholarshipTab}`] || 1, TABLE_PAGE_SIZE),
		[scholarshipTab, tablePages, visibleScholarshipRows],
	)

	const requestingSoeTablePage = useMemo(
		() => paginateRows(requestingSoeRows, tablePages.requesting_soe || 1, TABLE_PAGE_SIZE),
		[requestingSoeRows, tablePages],
	)

	const requestedSoeTablePage = useMemo(
		() => paginateRows(requestedSoeRows, tablePages.requested_soe || 1, TABLE_PAGE_SIZE),
		[requestedSoeRows, tablePages],
	)

	const soeCheckingTablePage = useMemo(
		() => paginateRows(soeCheckingRows, tablePages[`soe_checking_${soeCheckingTab}`] || 1, TABLE_PAGE_SIZE),
		[soeCheckingRows, soeCheckingTab, tablePages],
	)

	const reportPreviewTablePage = useMemo(
		() =>
			paginateRows(
				reportPreview?.csvRows || [],
				tablePages[`report_preview_${reportPreview?.key || "default"}`] || 1,
				TABLE_PAGE_SIZE,
			),
		[reportPreview, tablePages],
	)

	const soeCheckingCounts = useMemo(
		() => ({
			incoming: soeDownloadRows.filter((row) => row.reviewState === "incoming").length,
			signed: soeDownloadRows.filter((row) => row.reviewState === "signed").length,
			non_compliant: soeDownloadRows.filter((row) => row.reviewState === "non_compliant").length,
		}),
		[soeDownloadRows],
	)

	const selectedSoeRequestReviewRow = useMemo(
		() => soeRows.find((row) => row.id === selectedSoeReviewId) || null,
		[selectedSoeReviewId, soeRows],
	)
	const selectedSoeCheckingReviewRow = useMemo(
		() => soeDownloadRows.find((row) => row.id === selectedSoeReviewId) || null,
		[selectedSoeReviewId, soeDownloadRows],
	)
	const selectedSoeReviewRow = useMemo(
		() =>
			activeSection === "soe-checking"
				? selectedSoeCheckingReviewRow
				: selectedSoeRequestReviewRow,
		[activeSection, selectedSoeCheckingReviewRow, selectedSoeRequestReviewRow],
	)
	const isSelectedSoeDownloadReview = selectedSoeReviewRow?.reviewSource === "download"

	const complianceRows = useMemo(
		() =>
			studentProfiles
				.filter(
					(student) =>
						student.soeComplianceWarning === true ||
						Number(student.complianceViolationCount || 0) > 0 ||
						student.soeComplianceBlocked === true,
				)
				.map((student) =>
					toComplianceReportRow({
						studentId: student.id,
						fullName: student.fullName,
						complianceStatus: student.soeComplianceWarning ? "Non-Compliant" : "Monitoring",
						violationCount: Number(student.complianceViolationCount || 0),
						isBlocked: student.soeComplianceBlocked === true,
						lastReviewed: formatDate(student.lastComplianceReviewAt),
					}),
				),
		[studentProfiles],
	)

	const currentAnnouncements = useMemo(() => {
		const now = Date.now()
		return announcements.filter((announcement) => {
			if (announcement.archived === true) return false
			const endDate = toJsDate(announcement.endDate || announcement.scheduleEnd)
			return !endDate || endDate.getTime() >= now
		})
	}, [announcements])

	const previousAnnouncements = useMemo(() => {
		const now = Date.now()
		return announcements.filter((announcement) => {
			if (announcement.archived === true) return true
			const endDate = toJsDate(announcement.endDate || announcement.scheduleEnd)
			return Boolean(endDate && endDate.getTime() < now)
		})
	}, [announcements])

	const todayStart = useMemo(() => {
		const today = new Date()
		today.setHours(0, 0, 0, 0)
		return today
	}, [])

	const currentMonthStart = useMemo(
		() => new Date(todayStart.getFullYear(), todayStart.getMonth(), 1),
		[todayStart],
	)

	const announcementCalendarDays = useMemo(() => {
		const year = announcementCalendarMonth.getFullYear()
		const month = announcementCalendarMonth.getMonth()
		const leadingEmpty = new Date(year, month, 1).getDay()
		const totalDays = new Date(year, month + 1, 0).getDate()
		const days = []

		for (let index = 0; index < leadingEmpty; index += 1) {
			days.push({ key: `empty_${index}`, empty: true })
		}

		for (let day = 1; day <= totalDays; day += 1) {
			const date = new Date(year, month, day)
			date.setHours(0, 0, 0, 0)
			const iso = toDateString(date)
			const disabled = date < todayStart
			days.push({
				key: iso,
				day,
				iso,
				disabled,
				empty: false,
				isStart: announcementStartDate === iso,
				isEnd: announcementEndDate === iso,
				inRange: Boolean(announcementStartDate && announcementEndDate && iso > announcementStartDate && iso < announcementEndDate),
			})
		}

		return days
	}, [announcementCalendarMonth, announcementEndDate, announcementStartDate, todayStart])

	const isAnalyticsLoading =
		!dataLoadState.students || !dataLoadState.pendingStudents || !dataLoadState.applications || !dataLoadState.soe
	const isScholarshipLoading =
		!dataLoadState.students ||
		!dataLoadState.pendingStudents ||
		!dataLoadState.applications ||
		!dataLoadState.grantorScholars

	const lineChartOptions = useMemo(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
			interaction: { intersect: false, mode: "index" },
			plugins: {
				legend: {
					position: "bottom",
					labels: {
						color: theme === "dark" ? "#d1d5db" : "#334155",
						font: { size: 12, weight: 700 },
					},
				},
			},
			scales: {
				x: {
					ticks: { color: theme === "dark" ? "#cbd5e1" : "#475569" },
					grid: { color: theme === "dark" ? "rgba(148, 163, 184, 0.12)" : "rgba(148, 163, 184, 0.16)" },
				},
				y: {
					beginAtZero: true,
					ticks: { color: theme === "dark" ? "#cbd5e1" : "#475569", precision: 0 },
					grid: { color: theme === "dark" ? "rgba(148, 163, 184, 0.12)" : "rgba(148, 163, 184, 0.16)" },
				},
			},
		}),
		[theme],
	)

	const barChartOptions = useMemo(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					position: "bottom",
					labels: {
						color: theme === "dark" ? "#d1d5db" : "#334155",
						font: { size: 12, weight: 700 },
					},
				},
			},
			scales: {
				x: {
					ticks: { color: theme === "dark" ? "#cbd5e1" : "#475569" },
					grid: { display: false },
				},
				y: {
					beginAtZero: true,
					ticks: { color: theme === "dark" ? "#cbd5e1" : "#475569", precision: 0 },
					grid: { color: theme === "dark" ? "rgba(148, 163, 184, 0.12)" : "rgba(148, 163, 184, 0.16)" },
				},
			},
		}),
		[theme],
	)

	const metrics = useMemo(
		() => {
			const activeStudents = studentProfiles.filter((student) => student.archived !== true)
			return {
				totalStudents: activeStudents.length,
				totalSoeRequests: soeRows.length,
				totalScholars: activeStudents.reduce((sum, student) => sum + student.scholarships.length, 0),
			}
		},
		[soeRows, studentProfiles],
	)

	const closeStudentModal = () => {
		setSelectedStudentId("")
	}

	const closeScholarshipTrackingModal = () => {
		setSelectedScholarshipTrackingKey("")
	}

	const closeAdminConfirmDialog = () => {
		setAdminConfirmDialog(null)
	}

	const closeReportPreview = () => {
		setReportPreview(null)
		setReportExportFormat("pdf")
	}

	const runAction = async (callback, successText) => {
		if (isBusy) return
		setIsBusy(true)
		try {
			await callback()
			if (successText) toast.success(successText)
		} catch (error) {
			console.error(error)
			toast.error("Action failed.")
		} finally {
			setIsBusy(false)
		}
	}

	const completeScholarshipTrackingCurrentStep = async () => {
		if (!selectedScholarshipTrackingRow?.scholarshipEntry || !selectedScholarshipTrackingRow?.trackingProgress) return
		if (selectedScholarshipTrackingRow.studentSnapshot?.sourceCollection !== "students") {
			toast.info("Tracking can be updated only for validated student records.")
			return
		}

		const currentStep = selectedScholarshipTrackingRow.trackingProgress.currentStep
		if (!currentStep) {
			toast.info("No active tracking step is available for this scholarship.")
			return
		}

		if (!selectedScholarshipTrackingRow.trackingProgress.canAdminCompleteCurrentStep) {
			toast.info(
				selectedScholarshipTrackingRow.trackingProgress.adminCompletionReason ||
					"This step cannot be completed yet.",
			)
			return
		}

		await runAction(async () => {
			const nextTracking = completeScholarshipTrackingStep(
				selectedScholarshipTrackingRow.trackingProgress.tracking,
				{
					providerType: selectedScholarshipTrackingRow.scholarshipEntry.providerType,
					scholarshipName: selectedScholarshipTrackingRow.scholarshipEntry.name,
					stepId: currentStep.id,
					completedBy: "admin",
				},
			)

			const updatedScholarship = {
				...selectedScholarshipTrackingRow.scholarshipEntry,
				tracking: nextTracking,
			}

			const nextTrackingProgress = getScholarshipTrackingProgress({
				scholarship: updatedScholarship,
				isValidated: selectedScholarshipTrackingRow.studentSnapshot.validationStatus === "Validated",
				documentCheck: selectedScholarshipTrackingRow.documentCheck,
				latestMaterialRequest: selectedScholarshipTrackingRow.latestMaterialRequest,
				latestSoeDownload: selectedScholarshipTrackingRow.latestSoeDownload,
			})

			const nextScholarshipStatus = updatedScholarship.adminBlocked
				? "Blocked"
				: getScholarshipTrackingStatusLabel(nextTrackingProgress)
			const nextScholarships = (selectedScholarshipTrackingRow.studentSnapshot.scholarships || []).map(
				(item) =>
					item.id === selectedScholarshipTrackingRow.scholarshipEntry.id
						? {
								...updatedScholarship,
								status: nextScholarshipStatus,
							}
						: item,
				)

			await setDoc(
				doc(db, "students", selectedScholarshipTrackingRow.studentId),
				{
					scholarships: nextScholarships,
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)

			const matchingApplication = applicationsRaw
				.filter((application) => application.studentId === selectedScholarshipTrackingRow.studentId)
				.sort((left, right) => {
					const leftDate =
						toJsDate(
							left.updatedAt || left.applicationDate || left.createdAt || left.timestamp,
						)?.getTime() || 0
					const rightDate =
						toJsDate(
							right.updatedAt || right.applicationDate || right.createdAt || right.timestamp,
						)?.getTime() || 0
					return rightDate - leftDate
				})
				.find((application) => {
					return (
						application.scholarshipId === selectedScholarshipTrackingRow.scholarshipEntry.id ||
						application.applicationNumber ===
							selectedScholarshipTrackingRow.scholarshipEntry.applicationNumber ||
						application.requestNumber === selectedScholarshipTrackingRow.scholarshipEntry.requestNumber ||
						application.providerType ===
							selectedScholarshipTrackingRow.scholarshipEntry.providerType
					)
				})

			if (matchingApplication?.id) {
				await setDoc(
					doc(db, "scholarshipApplications", matchingApplication.id),
					{
						status: nextScholarshipStatus,
						tracking: nextTracking,
						updatedAt: serverTimestamp(),
					},
					{ merge: true },
				)
			}
		}, `${currentStep.label} completed. The student can now move to the next step.`)
	}

	const toggleStudentBlock = async () => {
		if (!selectedStudent || selectedStudent.sourceCollection !== "students" || selectedStudent.archived === true) return

		const accountAccessBlocked = getStudentRestrictionState(selectedStudent).accountAccess
		const nextAccountAccess = !accountAccessBlocked

		await runAction(async () => {
			await updateDoc(doc(db, "students", selectedStudent.id), {
				isBlocked: nextAccountAccess,
				accountStatus: nextAccountAccess ? "blocked" : "active",
				restrictions: {
					...(selectedStudent.restrictions || {}),
					accountAccess: nextAccountAccess,
				},
				updatedAt: serverTimestamp(),
			})
		}, nextAccountAccess ? "Student blocked." : "Student unblocked.")
	}

	const openCancelScholarshipApplicationConfirmation = () => {
		if (!selectedScholarshipTrackingRow?.scholarshipEntry || !selectedScholarshipTrackingRow?.studentSnapshot) return
		if (selectedScholarshipTrackingRow.studentSnapshot?.sourceCollection !== "students") {
			toast.info("Only validated student records can have scholarship applications cancelled.")
			return
		}

		setAdminConfirmDialog({
			type: "cancel_application",
			title: "Cancel Application",
			message: `Cancel the ${selectedScholarshipTrackingRow.scholarship} application for ${selectedScholarshipTrackingRow.fullName}? This will remove the application from the student record and cancel linked request records.`,
			confirmLabel: "Yes, Cancel Application",
			tone: "danger",
		})
	}

	const executeCancelScholarshipApplication = async (trackingRow = null) => {
		if (!trackingRow?.scholarshipEntry || !trackingRow?.studentSnapshot) return
		await runAction(async () => {
			const nextScholarships = (trackingRow.studentSnapshot.scholarships || []).filter(
				(item) => item.id !== trackingRow.scholarshipEntry.id,
			)
			const shouldClearConflictRestriction =
				trackingRow.studentSnapshot?.scholarshipRestrictionReason === "multiple_scholarships" &&
				nextScholarships.length <= 1
			const nextRestrictions = shouldClearConflictRestriction
				? {
						...(trackingRow.studentSnapshot?.restrictions || {}),
						scholarshipEligibility:
							trackingRow.studentSnapshot?.soeComplianceBlocked === true,
						complianceHold: trackingRow.studentSnapshot?.soeComplianceBlocked === true,
					}
				: trackingRow.studentSnapshot?.restrictions || {}

			await setDoc(
				doc(db, "students", trackingRow.studentId),
				{
					scholarships: nextScholarships,
					scholarshipConflictWarning: shouldClearConflictRestriction
						? false
						: trackingRow.studentSnapshot?.scholarshipConflictWarning === true,
					scholarshipConflictMessage: shouldClearConflictRestriction
						? ""
						: trackingRow.studentSnapshot?.scholarshipConflictMessage || "",
					scholarshipRestrictionReason: shouldClearConflictRestriction
						? null
						: trackingRow.studentSnapshot?.scholarshipRestrictionReason || null,
					restrictions: nextRestrictions,
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)

			const matchingApplications = applicationsRaw.filter((application) => {
				return (
					application.studentId === trackingRow.studentId &&
					(application.scholarshipId === trackingRow.scholarshipEntry.id ||
						application.applicationNumber === trackingRow.scholarshipEntry.applicationNumber ||
						application.requestNumber === trackingRow.scholarshipEntry.requestNumber ||
						application.providerType === trackingRow.scholarshipEntry.providerType)
				)
			})

			for (const application of matchingApplications) {
				await setDoc(
					doc(db, "scholarshipApplications", application.id),
					{
						status: "Cancelled",
						cancelledAt: serverTimestamp(),
						updatedAt: serverTimestamp(),
					},
					{ merge: true },
				)
			}

			const matchingRequests = soeRequests.filter((request) => {
				return (
					request.studentId === trackingRow.studentId &&
					(request.scholarshipId === trackingRow.scholarshipEntry.id ||
						request.applicationNumber === trackingRow.scholarshipEntry.applicationNumber ||
						request.requestNumber === trackingRow.scholarshipEntry.requestNumber)
				)
			})

			for (const request of matchingRequests) {
				await setDoc(
					doc(db, "soeRequests", request.id),
					{
						status: "Cancelled",
						reviewState: "cancelled",
						updatedAt: serverTimestamp(),
					},
					{ merge: true },
				)
			}

			const matchingDownloads = soeDownloads.filter((download) => {
				return (
					download.studentId === trackingRow.studentId &&
					(download.scholarshipId === trackingRow.scholarshipEntry.id ||
						download.applicationNumber === trackingRow.scholarshipEntry.applicationNumber ||
						download.requestNumber === trackingRow.scholarshipEntry.requestNumber ||
						download.soeSnapshot?.requestNumber === trackingRow.scholarshipEntry.requestNumber)
				)
			})

			for (const download of matchingDownloads) {
				await setDoc(
					doc(db, "soeDownloads", download.id),
					{
						status: "Cancelled",
						reviewState: "cancelled",
						updatedAt: serverTimestamp(),
					},
					{ merge: true },
				)
			}

			closeScholarshipTrackingModal()
		}, "Scholarship application cancelled.")
	}

	const openArchiveStudentConfirmation = (studentId) => {
		const student = studentProfiles.find((item) => item.id === studentId)
		if (!student || student.sourceCollection !== "students") return
		setAdminConfirmDialog({
			type: "archive_student",
			studentId,
			title: "Archive Student",
			message: `Archive ${student.fullName}? This will remove the student from active handling until the record is unarchived.`,
			confirmLabel: "Yes, Archive Student",
			tone: "danger",
		})
	}

	const executeArchiveStudent = async (studentId) => {
		const student = studentProfiles.find((item) => item.id === studentId)
		if (!student || student.sourceCollection !== "students") return
		const nextScholarships = student.scholarships.map((entry) => ({
			...entry,
			adminBlocked: false,
			adminBlockedAt: null,
		}))

		await runAction(async () => {
			await updateDoc(doc(db, "students", studentId), {
				archived: true,
				archivedAt: serverTimestamp(),
				isBlocked: false,
				accountStatus: "active",
				scholarships: nextScholarships,
				soeComplianceBlocked: false,
				scholarshipConflictWarning: false,
				scholarshipConflictMessage: "",
				scholarshipRestrictionReason: null,
				restrictions: {
					...(student.restrictions || {}),
					accountAccess: false,
					scholarshipEligibility: false,
					complianceHold: false,
				},
				updatedAt: serverTimestamp(),
			})
		}, "Student archived.")
	}

	const confirmAdminDialogAction = async () => {
		if (!adminConfirmDialog || isBusy) return
		const currentDialog = adminConfirmDialog
		setAdminConfirmDialog(null)

		if (currentDialog.type === "archive_student") {
			await executeArchiveStudent(currentDialog.studentId)
			return
		}

		if (currentDialog.type === "cancel_application") {
			await executeCancelScholarshipApplication(selectedScholarshipTrackingRow)
		}
	}

	const approveStudentValidation = async (studentId) => {
		if (!studentId) return
		const student = studentProfiles.find((item) => item.id === studentId)
		const pendingStudent = pendingStudentsRaw.find(
			(item) => String(item.id || item.studentnumber || "") === String(studentId),
		)

		await runAction(async () => {
			if (pendingStudent) {
				const { ...pendingData } = pendingStudent
				// Update scholarships status to Approved if it was Application Submitted
				const scholarships = (pendingData.scholarships || []).map((s) => {
					if (s.status === "Application Submitted") {
						return { ...s, status: "Approved", approvedAt: new Date().toISOString() }
					}
					return s
				})
				const validatedData = {
					...pendingData,
					scholarships,
					isValidated: true,
					isPending: false,
					validatedAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
					createdAt: pendingData.createdAt || serverTimestamp(),
				}
				await setDoc(doc(db, "students", studentId), validatedData, { merge: true })
				// Send Welcome Email
				if (pendingData.email) {
					const fullName = [pendingData.fname, pendingData.mname, pendingData.lname].filter(Boolean).join(" ").trim()
					const studentDisplayName = pendingData.fname || fullName || "Student"
					// Send Welcome Email
					sendEmailNotification(
						pendingData.email,
						fullName || "Student",
						"Welcome to BulsuScholar!",
						getWelcomeEmailBody(studentDisplayName),
					).catch((err) => console.error("Welcome email failed:", err))

					// If they had a Kuya Win application that was approved
					const approvedScholarships = scholarships.filter((s) => s.status === "Approved")
					if (approvedScholarships.length > 0) {
						for (const scholarship of approvedScholarships) {
							sendEmailNotification(
								pendingData.email,
								fullName || "Student",
								"Scholarship Application Approved!",
								getScholarshipApprovalEmailBody(studentDisplayName, scholarship.name),
							).catch((err) => console.error("Scholarship approval email failed:", err))
						}
					}
				}
				await deleteDoc(doc(db, "pendingStudent", studentId))
				return
			}

			if (student) {
				await updateDoc(doc(db, "students", studentId), {
					isValidated: true,
					isPending: false,
					validatedAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				})
			}
		}, "Student validated.")
	}

	const disapproveStudentValidation = async (studentId) => {
		if (!studentId) return
		const pendingStudent = pendingStudentsRaw.find(
			(item) => String(item.id || item.studentnumber || "") === String(studentId),
		)

		if (!window.confirm("Are you sure you want to disapprove this application? This will permanently remove the pending record.")) {
			return
		}

		await runAction(async () => {
			if (pendingStudent && pendingStudent.email) {
				const fullName = [pendingStudent.fname, pendingStudent.mname, pendingStudent.lname].filter(Boolean).join(" ").trim()
				sendEmailNotification(
					pendingStudent.email,
					fullName || "Student",
					"Account Verification Status",
					getAccountDisapprovalEmailBody(pendingStudent.fname || fullName || "Student", "Application does not meet the necessary requirements."),
				).catch((err) => console.error("Disapproval email failed:", err))
			}
			await deleteDoc(doc(db, "pendingStudent", studentId))
			closeStudentModal()
		}, "Application disapproved and record removed.")
	}

	const unarchiveStudent = async (studentId) => {
		await runAction(async () => {
			await updateDoc(doc(db, "students", studentId), {
				archived: false,
				archivedAt: null,
				updatedAt: serverTimestamp(),
			})
		}, "Student unarchived.")
	}

	const resetSoeTimer = async (row) => {
		const studentId = row?.studentId
		if (!studentId) return
		await runAction(async () => {
			await updateDoc(doc(db, "students", studentId), {
				soeLastExportAt: null,
				soeCooldownOverrideAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			})
			if (row?.id) {
				await updateDoc(doc(db, "soeRequests", row.id), {
					"materials.soe.downloadedAt": null,
					downloadStatus: null,
					downloadedAt: null,
					updatedAt: serverTimestamp(),
				})
				setSoeRequests((prev) =>
					prev.map((request) =>
						request.id === row.id
							? normalizeMaterialRequest({
									...request,
									downloadStatus: null,
									downloadedAt: null,
									materials: {
										...(request.materials || normalizeMaterialRequest(request).materials),
										soe: {
											...getMaterialEntry(request, "soe"),
											downloadedAt: null,
										},
									},
								})
							: request,
					),
				)
			}
			setSoeResetByStudent((prev) => ({ ...prev, [studentId]: Date.now() }))
		}, "SOE cooldown reset.")
	}

	const isSoeResetDisabled = (studentId, requestDate) => {
		const localResetAt = soeResetByStudent[studentId] || 0
		const persistedResetAt =
			toJsDate(studentProfiles.find((entry) => entry.id === studentId)?.soeCooldownOverrideAt)?.getTime() || 0
		const resetAt = Math.max(localResetAt, persistedResetAt)
		if (!studentId || !resetAt) return false
		return (toJsDate(requestDate)?.getTime() || 0) <= resetAt
	}

	const markSoeReview = async (row, action) => {
		if (!row?.id) return
		const student = studentProfiles.find((entry) => entry.id === row.studentId)
		const pendingMaterialKeys =
			Array.isArray(row.pendingMaterialKeys) && row.pendingMaterialKeys.length > 0
				? row.pendingMaterialKeys
				: Array.isArray(row.requestedMaterialKeys) && row.requestedMaterialKeys.length > 0
					? row.requestedMaterialKeys
					: ["soe"]
		const hasPendingSoe = pendingMaterialKeys.includes("soe")
		const existingApprovedMaterialKeys = Array.isArray(row.approvedMaterialKeys)
			? row.approvedMaterialKeys
			: []
		const existingRejectedMaterialKeys = Array.isArray(row.rejectedMaterialKeys)
			? row.rejectedMaterialKeys
			: []
		const nextApprovedMaterialKeys =
			action === "signed"
				? Array.from(new Set([...existingApprovedMaterialKeys, ...pendingMaterialKeys]))
				: existingApprovedMaterialKeys
		const nextRejectedMaterialKeys =
			action === "non_compliant"
				? Array.from(new Set([...existingRejectedMaterialKeys, ...pendingMaterialKeys]))
				: existingRejectedMaterialKeys
		const nextReviewState =
			nextApprovedMaterialKeys.length > 0
				? "signed"
				: nextRejectedMaterialKeys.length > 0
					? "non_compliant"
					: "incoming"
		const nextStatus =
			nextApprovedMaterialKeys.length > 0 && nextRejectedMaterialKeys.length > 0
				? "Partially Approved"
				: nextApprovedMaterialKeys.length > 0
					? "Approved"
					: nextRejectedMaterialKeys.length > 0
						? "Non-Compliant"
						: "Pending"
		const primaryMaterialLabel =
			pendingMaterialKeys.length > 1
				? "Material requests"
				: `${toMaterialLabel(pendingMaterialKeys[0])} request`

		await runAction(async () => {
			const requestUpdate = {
				status: nextStatus,
				reviewState: nextReviewState,
				checkedAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			}

			pendingMaterialKeys.forEach((materialKey) => {
				requestUpdate[`materials.${materialKey}.requested`] = true
				requestUpdate[`materials.${materialKey}.status`] = action === "signed" ? "approved" : "rejected"
				requestUpdate[`materials.${materialKey}.approvedAt`] = action === "signed" ? serverTimestamp() : null
				requestUpdate[`materials.${materialKey}.rejectedAt`] = action === "non_compliant" ? serverTimestamp() : null
			})

			await updateDoc(doc(db, "soeRequests", row.id), requestUpdate)

			if (student && hasPendingSoe) {
				const reviewedScholarships = student.scholarships.map((entry) => {
					const matchesRequest =
						entry.id === row.scholarshipId ||
						entry.requestNumber === row.requestNumber ||
						entry.requestNumber === row.scholarshipId
					if (!matchesRequest) return entry
					return {
						...entry,
						finalizedState: action === "signed" ? "Approved" : "Non-Compliant",
					}
				})

				if (action === "signed") {
					await updateDoc(doc(db, "students", student.id), {
						scholarships: reviewedScholarships,
						updatedAt: serverTimestamp(),
					})
					// Send SOE Approval Email
					if (student.email) {
						sendEmailNotification(
							student.email,
							student.fullName,
							"SOE Request Approved",
							getSoeApprovalEmailBody(student.fname || student.fullName, row.scholarshipName),
						).catch((err) => console.error("SOE approval email failed:", err))
					}
				}
			}

			setSelectedSoeReviewId("")
		}, action === "signed" ? `${primaryMaterialLabel} approved.` : `${primaryMaterialLabel} rejected.`)
	}

	const markSoeCheckingReview = async (row, action) => {
		if (!row?.id) return
		const student = studentProfiles.find((entry) => entry.id === row.studentId)

		await runAction(async () => {
			await updateDoc(doc(db, "soeDownloads", row.id), {
				status: action === "signed" ? "Signed" : "Non-Compliant",
				reviewState: action,
				checkedAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			})

			if (row.requestRecordId) {
				await updateDoc(doc(db, "soeRequests", row.requestRecordId), {
					soeCheckingState: action,
					soeCheckedAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				}).catch(() => {})
			}

			if (!student) {
				setSelectedSoeReviewId("")
				return
			}

			const reviewedScholarships = student.scholarships.map((entry) => {
				const matchesRequest =
					entry.id === row.scholarshipId ||
					entry.requestNumber === row.requestNumber ||
					entry.requestNumber === row.scholarshipId
				if (!matchesRequest) return entry
				return {
					...entry,
					finalizedState: action === "signed" ? "Signed" : "Non-Compliant",
				}
			})

			if (action === "signed") {
				await updateDoc(doc(db, "students", student.id), {
					scholarships: reviewedScholarships,
					updatedAt: serverTimestamp(),
				})
			}

			if (action === "non_compliant") {
				const nextViolationCount = Number(student.complianceViolationCount || 0) + 1
				const shouldBlock = nextViolationCount >= COMPLIANCE_BLOCK_THRESHOLD
				const nextScholarships = shouldBlock
					? reviewedScholarships.map((entry) => ({
							...entry,
							adminBlocked: true,
							adminBlockedAt: new Date().toISOString(),
						}))
					: reviewedScholarships

				await updateDoc(doc(db, "students", student.id), {
					scholarships: nextScholarships,
					complianceViolationCount: nextViolationCount,
					soeComplianceWarning: true,
					soeComplianceBlocked: shouldBlock,
					lastComplianceReviewAt: serverTimestamp(),
					restrictions: {
						...(student.restrictions || {}),
						accountAccess: false,
						scholarshipEligibility: shouldBlock,
						complianceHold: shouldBlock,
					},
					updatedAt: serverTimestamp(),
				})

				if (student.email) {
					sendEmailNotification(
						student.email,
						student.fullName,
						"SOE Request Non-Compliant",
						getSoeDisapprovalEmailBody(student.fname || student.fullName, row.scholarshipName, "The downloaded SOE did not match the student record during admin checking."),
					).catch((err) => console.error("SOE checking disapproval email failed:", err))
				}
			}

			setSelectedSoeReviewId("")
		}, action === "signed" ? "SOE marked as signed." : "SOE marked as non-compliant.")
	}

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

	const handleAnnouncementFiles = (event) => {
		setAnnouncementImageFiles(Array.from(event.target.files || []))
	}

	const removeAnnouncementImage = (index) => {
		setAnnouncementImageFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
	}

	const postAnnouncement = async (event) => {
		event.preventDefault()
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
			const imageUrls = uploads.map((item) => item.url).filter(Boolean)
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
				updatedAt: serverTimestamp(),
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
			await updateDoc(doc(db, "announcements", announcementId), {
				archived: true,
				archivedAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			})
		}, "Announcement archived.")
	}

	const handleLogout = () => {
		sessionStorage.removeItem("bulsuscholar_userId")
		sessionStorage.removeItem("bulsuscholar_userType")
		navigate("/", { replace: true })
	}

	const createStudentPreviewConfig = (rows, filterLabel) => ({
		key: "students",
		title: "Student Management Report",
		description: "Live pre-flight preview of the current student export.",
		filterLabel,
		filename: `students-report-${Date.now()}`,
		stats: [
			{ label: "Records", value: rows.length },
			{ label: "Blocked", value: rows.filter((row) => row.recordStatus === "Blocked").length },
			{ label: "Archived", value: rows.filter((row) => row.recordStatus === "Archived").length },
			{ label: "Validated", value: rows.filter((row) => row.validationStatus === "Validated").length },
		],
		columns: ["Student ID", "Full Name", "Course", "Year Level", "Validation", "Record Status", "Restrictions"],
		csvRows: rows.map((row) => [
			row.id,
			row.fullName,
			row.course,
			row.yearLevel,
			row.validationStatus,
			row.recordStatus,
			row.restrictionSummary,
		]),
		pdfRows: rows,
	})

	function createScholarshipPreviewConfig(rows, filterLabel, options = {}) {
		const defaultColumns = ["Program Name", "Provider Type", "Total Slots", "Active Recipients", "Status"]
		const defaultCsvRows = rows.map((row) => [
			row.programName,
			toProviderLabel(row.providerType),
			String(row.totalSlots),
			String(row.activeRecipients),
			row.status,
		])
		return {
			key: "scholarships",
			title: "Scholarship Programs Report",
			description: options.description || "Preview of program distribution and performance data before export.",
			filterLabel,
			filename: `scholarships-report-${Date.now()}`,
			stats: options.stats || [
				{ label: "Programs", value: rows.length },
				{ label: "Recipients", value: rows.reduce((sum, row) => sum + Number(row.activeRecipients || 0), 0) },
				{ label: "Grantors", value: new Set(rows.map((row) => row.providerType)).size },
				{
					label: "Top Program",
					value: rows.length > 0 ? rows.slice().sort((left, right) => right.activeRecipients - left.activeRecipients)[0].activeRecipients : 0,
				},
			],
			columns: options.columns || defaultColumns,
			csvRows: options.csvRows || defaultCsvRows,
			pdfRows: rows,
			pdfColumns: options.columns || defaultColumns,
			pdfBodyRows: options.csvRows || defaultCsvRows,
		}
	}

	const createSoePreviewConfig = (rows, filterLabel) => ({
		key: "soe",
		title: "Materials Request Report",
		description: "Preview material request lifecycle data before exporting PDF or CSV.",
		filterLabel,
		filename: `materials-request-report-${Date.now()}`,
		stats: [
			{ label: "Rows", value: rows.length },
			{ label: "Pending", value: rows.filter((row) => String(row.reviewStateLabel).toLowerCase().includes("pending")).length },
			{ label: "Approved", value: rows.filter((row) => String(row.reviewStateLabel).toLowerCase().includes("approved")).length },
			{ label: "SOE Downloaded", value: rows.filter((row) => row.downloadStatusLabel === "Downloaded").length },
		],
		columns: ["Student ID", "Student Name", "Scholarship", "Materials", "Status", "Request Date", "Next Eligible", "Review State"],
		csvRows: rows.map((row) => [
			row.studentId || "-",
			row.fullName || "-",
			row.scholarshipName || "-",
			row.visibleMaterialsSummary || row.requestedMaterialsSummary || "-",
			row.status || "-",
			formatDate(row.requestDate || row.timestamp || row.createdAt),
			row.nextEligibleLabel || "-",
			row.reviewStateLabel || "-",
		]),
		pdfRows: rows,
	})

	const createCompliancePreviewConfig = (rows, filterLabel) => ({
		key: "compliance",
		title: "Compliance Monitoring Report",
		description: "Preview non-compliance monitoring and scholarship hold records.",
		filterLabel,
		filename: `compliance-report-${Date.now()}`,
		stats: [
			{ label: "Rows", value: rows.length },
			{ label: "Blocked", value: rows.filter((row) => row.isBlocked).length },
			{ label: "High Risk", value: rows.filter((row) => Number(row.violationCount) >= COMPLIANCE_BLOCK_THRESHOLD).length },
			{ label: "Flags", value: rows.filter((row) => row.complianceStatus === "Non-Compliant").length },
		],
		columns: ["Student ID", "Full Name", "Status", "Violations", "Scholarship Block", "Last Reviewed"],
		csvRows: rows.map((row) => [
			row.studentId,
			row.fullName,
			row.complianceStatus,
			String(row.violationCount),
			row.isBlocked ? "Yes" : "No",
			row.lastReviewed,
		]),
		pdfRows: rows,
	})

	const openReportPreview = (config) => {
		setReportPreview(config)
		setReportExportFormat("pdf")
	}

	const exportPreviewReport = async () => {
		if (!reportPreview || isReportExporting) return
		setIsReportExporting(true)
		try {
			if (reportExportFormat === "csv") {
				downloadCsvReport(`${reportPreview.filename}.csv`, reportPreview.columns, reportPreview.csvRows)
			} else if (reportPreview.key === "students") {
				await exportStudentsReportPdf(reportPreview.pdfRows, reportPreview.filterLabel, logo2)
			} else if (reportPreview.key === "scholarships") {
				await exportScholarshipsReportPdf(
					reportPreview.pdfRows,
					reportPreview.filterLabel,
					logo2,
					reportPreview.pdfColumns,
					reportPreview.pdfBodyRows,
					reportPreview.title,
				)
			} else if (reportPreview.key === "soe") {
				await exportSoeRequestsReportPdf(reportPreview.pdfRows, reportPreview.filterLabel, logo2)
			} else if (reportPreview.key === "compliance") {
				await exportComplianceReportPdf(reportPreview.pdfRows, reportPreview.filterLabel, logo2)
			}
			toast.success(`Report exported as ${reportExportFormat.toUpperCase()}.`)
		} catch (error) {
			console.error(error)
			toast.error("Failed to export report.")
		} finally {
			setIsReportExporting(false)
		}
	}

	const renderReportPreview = () => {
		if (!reportPreview) return null
		const previewRows = reportPreviewTablePage.rows
		const csvPreview = buildCsvPreview(reportPreview.columns, reportPreview.csvRows)
		return (
			<div className="admin-detail-backdrop" role="presentation" onClick={closeReportPreview}>
				<div className="admin-detail-shell admin-detail-shell--report" onClick={(event) => event.stopPropagation()}>
					<button type="button" className="admin-detail-close" onClick={closeReportPreview}>
						<HiX />
					</button>
					<div
						className="admin-detail-modal admin-detail-modal--report"
						role="dialog"
						aria-modal="true"
						aria-label={reportPreview.title}
						onClick={(event) => event.stopPropagation()}
					>
						<div className="admin-report-preview-head">
							<div>
								<h3>{reportPreview.title}</h3>
								<p className="admin-detail-meta">{reportPreview.description}</p>
								<p className="admin-detail-meta">{reportPreview.filterLabel}</p>
							</div>
							<div className="admin-report-format-toggle">
								<button type="button" className={reportExportFormat === "pdf" ? "active" : ""} onClick={() => setReportExportFormat("pdf")}>
									PDF
								</button>
								<button type="button" className={reportExportFormat === "csv" ? "active" : ""} onClick={() => setReportExportFormat("csv")}>
									CSV
								</button>
							</div>
						</div>
						<div className="admin-report-preview-stats">
							{reportPreview.stats.map((stat) => (
								<article key={stat.label} className="admin-report-stat">
									<strong>{stat.value}</strong>
									<span>{stat.label}</span>
								</article>
							))}
						</div>
						<div className="admin-report-preview-body">
							<div className="admin-report-preview-shell">
								<div className="admin-report-preview-toolbar">
									<span>Live Preview</span>
									<span>
										Showing {reportPreviewTablePage.startIndex}-{reportPreviewTablePage.endIndex} of {reportPreview.csvRows.length} rows
									</span>
								</div>
								{reportExportFormat === "pdf" ? (
									<>
										<div className="admin-table-wrap">
											<table className="admin-management-table admin-management-table--preview">
												<thead>
													<tr>
														{reportPreview.columns.map((column) => (
															<th key={column}>{column}</th>
														))}
													</tr>
												</thead>
												<tbody>
													{previewRows.length === 0 ? (
														<EmptyStateRow colSpan={reportPreview.columns.length} />
													) : (
														previewRows.map((row, rowIndex) => (
															<tr key={`${reportPreview.key}_${rowIndex}`}>
																{row.map((value, valueIndex) => (
																	<td key={`${reportPreview.key}_${rowIndex}_${valueIndex}`}>{value}</td>
																))}
															</tr>
														))
													)}
												</tbody>
											</table>
										</div>
										<TablePagination
											currentPage={reportPreviewTablePage.currentPage}
											totalItems={reportPreview.csvRows.length}
											onPageChange={(page) => setTablePage(`report_preview_${reportPreview.key || "default"}`, page)}
										/>
									</>
								) : (
									<pre className="admin-report-preview-code">{csvPreview}</pre>
								)}
							</div>
						</div>
						<div className="admin-report-preview-actions">
							<button type="button" className="admin-table-btn" onClick={closeReportPreview}>
								Close Preview
							</button>
							<button type="button" className="admin-export-btn" disabled={isReportExporting} onClick={exportPreviewReport}>
								{isReportExporting ? "Exporting..." : `Export ${reportExportFormat.toUpperCase()}`}
							</button>
						</div>
					</div>
				</div>
			</div>
		)
	}

	const renderSection = () => {
		if (activeSection === "dashboard") {
			return (
				<section className="admin-management-panel">
					<div className="admin-panel-head">
						<div>
							<h2>Management Dashboard</h2>
							<p className="admin-panel-copy">Modernized analytics for applicant flow, grantor share, and materials request traffic.</p>
						</div>
					</div>
					<section className="admin-kpi-grid">
						{[
							{
								id: "students",
								label: "Total Students",
								value: metrics.totalStudents,
								description: "Registered student accounts currently visible in the system.",
								icon: HiOutlineUsers,
							},
							{
								id: "soe",
								label: "Total Material Requests",
								value: metrics.totalSoeRequests,
								description: "All submitted material requests recorded across the platform.",
								icon: HiOutlineDocumentText,
							},
							{
								id: "scholars",
								label: "Total Scholars",
								value: metrics.totalScholars,
								description: "Scholarship records attached to active student accounts.",
								icon: HiOutlineAcademicCap,
							},
						].map((card) => {
							const Icon = card.icon
							return (
								<article key={card.id} className={`admin-kpi-card admin-kpi-card--${card.id}`}>
									<div className="admin-kpi-card__icon">
										<Icon />
									</div>
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
									<h3>Scholarship Applicant Tracking</h3>
								</div>
								<div className="admin-trend-controls">
									{TREND_RANGES.map((range) => (
										<button
											key={`applicant_${range}`}
											type="button"
											className={applicantTrendRange === range ? "active" : ""}
											onClick={() => setApplicantTrendRange(range)}
										>
											{range[0].toUpperCase() + range.slice(1)}
										</button>
									))}
								</div>
							</div>
							<div className="admin-chart-wrap admin-chart-wrap--lg">
								{isAnalyticsLoading ? <LoadingBars note="Loading applicant trend analytics..." /> : <Line data={applicantTrackingData} options={lineChartOptions} />}
							</div>
						</article>
						<article className="admin-analytics-card">
							<div className="admin-trend-head admin-trend-head--compact">
								<div>
									<h3>Grantor Distribution</h3>
									<p>Share of scholarship recipients by grantor.</p>
								</div>
								<span className="admin-inline-chip">Professional Mix</span>
							</div>
							{isAnalyticsLoading ? (
								<LoadingBars note="Loading grantor distribution..." />
							) : (
								<div className="admin-distribution-shell">
									<div className="admin-chart-wrap admin-chart-wrap--distribution">
										<Doughnut data={grantorDistributionData} options={grantorDistributionOptions} />
										{activeGrantorDistributionRow ? (
											<div className="admin-distribution-hover-note">
												<strong>{activeGrantorDistributionRow.value}</strong>
												<span>{activeGrantorDistributionRow.label} Scholars</span>
											</div>
										) : (
											<div className="admin-distribution-hover-note">
												<strong>{grantorDistributionTotalScholars}</strong>
												<span>Total Scholars</span>
											</div>
										)}
									</div>
								</div>
							)}
						</article>
						<article className="admin-analytics-card">
							<div className="admin-trend-head admin-trend-head--compact">
								<div>
									<h3>Materials Request Timeline</h3>
								</div>
								<div className="admin-trend-controls admin-trend-controls--compact">
									{TREND_RANGES.map((range) => (
										<button key={`soe_${range}`} type="button" className={soeTrendRange === range ? "active" : ""} onClick={() => setSoeTrendRange(range)}>
											{range[0].toUpperCase() + range.slice(1)}
										</button>
									))}
								</div>
							</div>
							<div className="admin-chart-wrap">
								{isAnalyticsLoading ? <LoadingBars note={`Loading materials request timeline for ${soeTrendRange} view...`} /> : <Bar data={soeVolumeData} options={barChartOptions} />}
							</div>
						</article>
					</section>
				</section>
			)
		}

		if (activeSection === "students") {
			return (
				<section className="admin-management-panel">
					<div className="admin-panel-head">
						<div>
							<h2>Student Management</h2>
							<p className="admin-panel-copy">Granular access control with archive-safe workflows.</p>
						</div>
						<div className="admin-head-actions">
							<button
								type="button"
								className="admin-export-btn admin-export-btn--mini"
								onClick={() =>
									openReportPreview(
										createStudentPreviewConfig(
											visibleStudentReportRows,
											studentReportFilterLabel,
										),
									)
								}
							>
								<HiOutlineEye /> Generate Preview
							</button>
						</div>
					</div>
					<SectionTabs
						tabs={[
							{ id: "overview", label: "Overview", icon: HiOutlineChartBar },
							{ id: "students", label: "Students", count: studentTabCounts.students, icon: HiOutlineUsers },
							{ id: "blocked", label: "Blocked", count: studentTabCounts.blocked, icon: HiOutlineShieldCheck },
							{ id: "archived", label: "Archived", count: studentTabCounts.archived, icon: HiOutlineTrash },
						]}
						value={studentViewTab}
						onChange={setStudentViewTab}
					/>
					{studentViewTab === "overview" ? (
						<section className="admin-tab-panel">
							<div className="admin-summary-strip">
								<article className="admin-summary-card">
									<h3>Managed Students</h3>
									<strong>{studentProfiles.length}</strong>
									<p>Total student records currently available in Student Management.</p>
								</article>
								<article className="admin-summary-card">
									<h3>Validated Accounts</h3>
									<strong>{studentValidationCounts.validated}</strong>
									<p>Student records already approved and verified by the admin workflow.</p>
								</article>
								<article className="admin-summary-card">
									<h3>Archived Records</h3>
									<strong>{studentTabCounts.archived}</strong>
									<p>Students removed from active handling and retained in archive history.</p>
								</article>
							</div>
							<div className="admin-analytics-grid">
								<article className="admin-analytics-card">
									<div className="admin-trend-head admin-trend-head--compact">
										<div>
											<h3>Student Lifecycle</h3>
											<p className="admin-trend-copy">Current distribution of active, blocked, and archived records.</p>
										</div>
									</div>
									<div className="admin-chart-wrap">
										{isAnalyticsLoading ? <LoadingBars note="Loading student lifecycle analytics..." /> : <Doughnut data={studentLifecycleData} options={doughnutOptions} />}
									</div>
								</article>
								<article className="admin-analytics-card">
									<div className="admin-trend-head admin-trend-head--compact">
										<div>
											<h3>Validation Status</h3>
											<p className="admin-trend-copy">Snapshot of validated versus pending student accounts.</p>
										</div>
									</div>
									<div className="admin-chart-wrap">
										{isAnalyticsLoading ? <LoadingBars note="Loading validation breakdown..." /> : <Bar data={studentValidationData} options={barChartOptions} />}
									</div>
								</article>
								<article className="admin-analytics-card admin-analytics-card--wide">
									<div className="admin-trend-head">
										<div>
											<h3>Archived Students Timeline</h3>
											<p className="admin-trend-copy">Archive activity based on records moved from the student list into archive.</p>
										</div>
										<div className="admin-trend-controls admin-trend-controls--compact">
											{TREND_RANGES.map((range) => (
												<button
													key={`student_archive_${range}`}
													type="button"
													className={studentArchiveTrendRange === range ? "active" : ""}
													onClick={() => setStudentArchiveTrendRange(range)}
												>
													{range[0].toUpperCase() + range.slice(1)}
												</button>
											))}
										</div>
									</div>
									<div className="admin-chart-wrap admin-chart-wrap--lg">
										{isAnalyticsLoading ? <LoadingBars note="Loading archived student analytics..." /> : <Line data={studentArchiveData} options={lineChartOptions} />}
									</div>
								</article>
							</div>
						</section>
					) : (
						<>
							<div className="admin-filter-bar">
								<input type="text" placeholder="Search student ID or name" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} />
								<select value={studentCourse} onChange={(event) => setStudentCourse(event.target.value)}>
									<option value="All">All Courses</option>
									{studentsByCourse.map((course) => (
										<option key={course} value={course}>
											{course}
										</option>
									))}
								</select>
								<select value={studentYear} onChange={(event) => setStudentYear(event.target.value)}>
									<option value="All">All Year Levels</option>
									{studentsByYear.map((year) => (
										<option key={year} value={year}>
											{year}
										</option>
									))}
								</select>
								<select value={studentValidation} onChange={(event) => setStudentValidation(event.target.value)}>
									<option value="All">All Validation</option>
									<option value="Validated">Validated</option>
									<option value="Pending">Pending</option>
								</select>
							</div>
							<div className="admin-table-wrap">
								<table className="admin-management-table admin-management-table--roomy">
									<thead>
										<tr>
											<th>Student ID</th>
											<th>Full Name</th>
											<th>Course</th>
											<th>Year Level</th>
											<th>Validation Status</th>
											<th>Restrictions</th>
											<th>Action</th>
										</tr>
									</thead>
									<tbody>
										{filteredStudents.length === 0 ? (
											<EmptyStateRow colSpan={7} />
										) : (
											studentsTablePage.rows.map((student) => (
												<tr key={student.id}>
													<td>{student.id}</td>
													<td>{student.fullName}</td>
													<td>{student.course || "-"}</td>
													<td>{student.year || "-"}</td>
													<td>
														<span className={toStatusClass(student.validationStatus)}>{student.validationStatus}</span>
													</td>
													<td>
														<div className="admin-chip-stack">
															<span className={toStatusClass(student.recordStatus)}>{student.recordStatus}</span>
															{student.restrictionState.accountAccess ? <span className="admin-inline-chip">Account Access</span> : null}
															{student.restrictionState.scholarshipEligibility ? <span className="admin-inline-chip">Scholarship Eligibility</span> : null}
														</div>
													</td>
													<td>
														<button
															type="button"
															className="admin-table-btn admin-table-btn--mini admin-table-btn--view"
															onClick={() => setSelectedStudentId(student.id)}
														>
															<HiOutlineEye />
															View Information
														</button>
													</td>
												</tr>
											))
										)}
									</tbody>
								</table>
							</div>
							<TablePagination
								currentPage={studentsTablePage.currentPage}
								totalItems={filteredStudents.length}
								onPageChange={(page) => setTablePage(`students_${studentViewTab}`, page)}
							/>
						</>
					)}
				</section>
			)
		}

		if (activeSection === "scholarships") {
			return (
				<section className="admin-management-panel">
					<div className="admin-panel-head">
						<div>
							<h2>Scholarship Programs</h2>
							<p className="admin-panel-copy">Review synced grantor scholar rosters, application tracking, archived records, and scholarship conflicts.</p>
						</div>
						<div className="admin-head-actions">
							<button
								type="button"
								className="admin-export-btn admin-export-btn--mini"
								onClick={() => openReportPreview(scholarshipSectionPreviewConfig)}
							>
								<HiOutlineEye /> Generate Preview
							</button>
						</div>
					</div>
					<SectionTabs
						tabs={[
							{ id: "overview", label: "Overview", count: scholarshipTabCounts.overview, icon: HiOutlineDocumentText },
							{ id: "scholars", label: "Scholars", count: scholarshipTabCounts.scholars, icon: HiOutlineUsers },
							{ id: "tracking", label: "Tracking", count: scholarshipTabCounts.tracking, icon: HiOutlineClock },
							{ id: "warning", label: "Warning", count: scholarshipTabCounts.warning, icon: HiOutlineExclamation },
							{ id: "archived", label: "Archived", count: scholarshipTabCounts.archived, icon: HiOutlineTrash },
						]}
						value={scholarshipTab}
						onChange={setScholarshipTab}
						className="admin-section-tabs--compact admin-section-tabs--scholarships"
					/>
					{scholarshipTab === "overview" ? (
						<section className="admin-tab-panel">
							<div className="admin-filter-bar">
								<input
									type="text"
									placeholder="Search by scholarship name or grantor"
									value={scholarshipSearch}
									onChange={(event) => setScholarshipSearch(event.target.value)}
								/>
								<select value={scholarshipProvider} onChange={(event) => setScholarshipProvider(event.target.value)}>
									<option value="All">All Grantors</option>
									{scholarshipProviderOptions.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</div>
							<div className="admin-summary-strip">
								<article className="admin-summary-card">
									<h3>Programs</h3>
									<strong>{visibleScholarshipRows.length}</strong>
									<p>Grantor scholarship rosters grouped by scholarship title and provider.</p>
								</article>
								<article className="admin-summary-card">
									<h3>Active Scholars</h3>
									<strong>{scholarshipOverviewTotalRecipients}</strong>
									<p>Active scholars synced from the current grantor roster filter.</p>
								</article>
								<article className="admin-summary-card">
									<h3>Warning Students</h3>
									<strong>{warningRows.length}</strong>
									<p>Students matched to multiple grantors and blocked from scholarship eligibility.</p>
								</article>
							</div>
							<div className="admin-analytics-grid">
								<article className="admin-analytics-card admin-analytics-card--wide admin-trend-card">
									<div className="admin-trend-head">
										<div>
											<h3>Grantor Scholar Movement</h3>
											<p className="admin-trend-copy">Added and archived student rows from grantor rosters in one timeline.</p>
										</div>
										<div className="admin-trend-controls">
											{TREND_RANGES.map((range) => (
												<button
													key={`grantor_scholar_${range}`}
													type="button"
													className={grantorScholarTrendRange === range ? "active" : ""}
													onClick={() => setGrantorScholarTrendRange(range)}
												>
													{range[0].toUpperCase() + range.slice(1)}
												</button>
											))}
										</div>
									</div>
									<div className="admin-chart-wrap admin-chart-wrap--lg">
										{isScholarshipLoading ? (
											<LoadingBars note="Loading grantor scholar movement..." />
										) : (
											<Line data={scholarshipOverviewRosterTrendData} options={lineChartOptions} />
										)}
									</div>
								</article>
								<article className="admin-analytics-card">
									<div className="admin-trend-head admin-trend-head--compact">
										<div>
											<h3>Grantor Distribution</h3>
											<p className="admin-trend-copy">Current share of active grantor scholars across all scholarship providers.</p>
										</div>
									</div>
									{isScholarshipLoading ? (
										<LoadingBars note="Loading scholarship distribution..." />
									) : (
										<div className="admin-distribution-shell">
											<div className="admin-chart-wrap admin-chart-wrap--distribution">
												<Doughnut data={scholarshipOverviewGrantorData} options={scholarshipOverviewGrantorOptions} />
												{activeScholarshipGrantorRow ? (
													<div className="admin-distribution-hover-note">
														<strong>{activeScholarshipGrantorRow.value}</strong>
														<span>{activeScholarshipGrantorRow.label} Scholars</span>
													</div>
												) : (
													<div className="admin-distribution-hover-note">
														<strong>{scholarshipOverviewTotalRecipients}</strong>
														<span>Total Scholars</span>
													</div>
												)}
											</div>
										</div>
									)}
								</article>
								<article className="admin-analytics-card">
									<div className="admin-trend-head admin-trend-head--compact">
										<div>
											<h3>Coverage Snapshot</h3>
											<p className="admin-trend-copy">High-level view of the strongest program and filtered grantor mix.</p>
										</div>
									</div>
										<div className="admin-summary-strip">
											<article className="admin-summary-card">
												<h3>Top Program</h3>
												<strong>{scholarshipOverviewLeader?.programName || "-"}</strong>
												<p>{scholarshipOverviewLeader ? `${scholarshipOverviewLeader.activeRecipients} active recipients` : "No active program data yet."}</p>
											</article>
											<article className="admin-summary-card">
												<h3>Archived Scholars</h3>
												<strong>{scholarshipOverviewArchivedCount}</strong>
												<p>Grantor scholar rows already archived within the active overview filter.</p>
											</article>
										</div>
									</article>
									<article className="admin-analytics-card admin-analytics-card--wide">
										<div className="admin-trend-head admin-trend-head--compact">
											<div>
												<h3>Program Table</h3>
												<p className="admin-trend-copy">Scholarship-level summary aligned to the live grantor roster filters and export preview.</p>
											</div>
										</div>
									<div className="admin-table-wrap">
										<table className="admin-management-table admin-management-table--roomy">
											<thead>
												<tr>
													<th>Program Name</th>
													<th>Grantor</th>
													<th>Total Slots</th>
													<th>Active Recipients</th>
													<th>Status</th>
												</tr>
											</thead>
											<tbody>
												{isScholarshipLoading ? (
													<tr>
														<td colSpan={5}>
															<LoadingBars note="Loading scholarship overview rows..." />
														</td>
													</tr>
												) : visibleScholarshipRows.length === 0 ? (
													<EmptyStateRow colSpan={5} />
												) : (
													scholarshipTablePage.rows.map((row) => (
														<tr key={`${row.programName}_${row.providerType}`}>
															<td>{row.programName || "-"}</td>
															<td>{row.grantorName || toProviderLabel(row.providerType)}</td>
															<td>{row.totalSlots || "-"}</td>
															<td>{row.activeRecipients ?? 0}</td>
															<td><span className={toStatusClass(row.status)}>{row.status || "-"}</span></td>
														</tr>
													))
												)}
											</tbody>
										</table>
									</div>
									<TablePagination
										currentPage={scholarshipTablePage.currentPage}
										totalItems={visibleScholarshipRows.length}
										onPageChange={(page) => setTablePage(`scholarship_${scholarshipTab}`, page)}
									/>
								</article>
							</div>
						</section>
					) : (
						<section className="admin-tab-panel">
							<div className="admin-filter-bar">
								<input
									type="text"
									placeholder={
										scholarshipTab === "warning"
											? "Search by student ID, student name, grantor, or conflict"
											: scholarshipTab === "tracking"
												? "Search by student ID, student name, scholarship, current step, or status"
												: scholarshipTab === "archived"
													? "Search by student ID, student name, scholarship, or grantor"
													: "Search by student ID, student name, scholarship, contact number, or grantor"
									}
									value={scholarshipSearch}
									onChange={(event) => setScholarshipSearch(event.target.value)}
								/>
								{scholarshipTab !== "overview" ? (
									<select value={scholarshipProvider} onChange={(event) => setScholarshipProvider(event.target.value)}>
										<option value="All">All Grantors</option>
										{scholarshipProviderOptions.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								) : null}
							</div>
							<div className="admin-table-wrap">
								<table className="admin-management-table admin-management-table--roomy">
									<thead>
										{scholarshipTab === "warning" ? (
											<tr>
												<th>Student ID</th>
												<th>Full Name</th>
												<th>Grantors</th>
												<th>Conflict Details</th>
												<th>Action</th>
											</tr>
										) : scholarshipTab === "tracking" ? (
											<tr>
												<th>Student ID</th>
												<th>Full Name</th>
												<th>Scholarship</th>
												<th>Grantor</th>
												<th>Current Step</th>
												<th>Owned By</th>
												<th>Status</th>
												<th>Action</th>
											</tr>
										) : scholarshipTab === "archived" ? (
											<tr>
												<th>Student ID</th>
												<th>Full Name</th>
												<th>Scholarship</th>
												<th>Grantor</th>
												<th>Year Level</th>
												<th>Archived At</th>
												<th>Status</th>
												<th>Action</th>
											</tr>
										) : (
											<tr>
												<th>Student ID</th>
												<th>Full Name</th>
												<th>Scholarship</th>
												<th>Grantor</th>
												<th>Year Level</th>
												<th>Contact Number</th>
												<th>Street</th>
												<th>Status</th>
												<th>Action</th>
											</tr>
										)}
									</thead>
									<tbody>
										{isScholarshipLoading ? (
											<tr>
												<td
													colSpan={
														scholarshipTab === "warning"
															? 5
															: scholarshipTab === "tracking"
																? 8
																: scholarshipTab === "archived"
																	? 8
																	: 9
													}
												>
													<LoadingBars note="Loading scholarship table..." />
												</td>
											</tr>
										) : visibleScholarshipRows.length === 0 ? (
											<EmptyStateRow
												colSpan={
													scholarshipTab === "warning"
														? 5
														: scholarshipTab === "tracking"
															? 8
															: scholarshipTab === "archived"
																? 8
																: 9
												}
											/>
										) : scholarshipTab === "warning" ? (
											scholarshipTablePage.rows.map((row) => (
												<tr key={row.trackingKey || row.studentId}>
													<td>{row.studentId || "-"}</td>
													<td>{row.fullName || "-"}</td>
													<td>{row.grantors || "-"}</td>
													<td>{row.details || "-"}</td>
													<td>
														<button
															type="button"
															className="admin-table-btn admin-table-btn--mini admin-table-btn--view"
															onClick={() => row.studentRecordId && setSelectedStudentId(row.studentRecordId)}
															disabled={!row.studentRecordId}
														>
															<HiOutlineEye />
															{row.studentRecordId ? "View Information" : "No Student Record"}
														</button>
													</td>
												</tr>
											))
										) : scholarshipTab === "tracking" ? (
											scholarshipTablePage.rows.map((row) => (
												<tr key={row.trackingKey}>
													<td>{row.studentId || "-"}</td>
													<td>{row.fullName || "-"}</td>
													<td>{row.scholarship || "-"}</td>
													<td>{toProviderLabel(row.provider)}</td>
													<td>{row.currentStepLabel || "-"}</td>
													<td>{row.currentStepOwnerLabel || "-"}</td>
													<td><span className={toStatusClass(row.status)}>{row.status || "-"}</span></td>
													<td>
														<div className="admin-table-action-row">
															<button
																type="button"
																className="admin-table-btn admin-table-btn--mini admin-table-btn--view"
																onClick={() => setSelectedScholarshipTrackingKey(row.trackingKey)}
															>
																<HiOutlineClock />
																View Application
															</button>
														</div>
													</td>
												</tr>
											))
										) : scholarshipTab === "archived" ? (
											scholarshipTablePage.rows.map((row) => (
												<tr key={row.trackingKey}>
													<td>{row.studentId || "-"}</td>
													<td>{row.fullName || "-"}</td>
													<td>{row.scholarship || "-"}</td>
													<td>{row.grantorName || toProviderLabel(row.provider)}</td>
													<td>{row.yearLevel || "-"}</td>
													<td>{row.archivedAtLabel || "-"}</td>
													<td><span className={toStatusClass(row.status)}>{row.status || "-"}</span></td>
													<td>
														<div className="admin-table-action-row">
															<button
																type="button"
																className="admin-table-btn admin-table-btn--mini admin-table-btn--view"
																onClick={() => row.studentRecordId && setSelectedStudentId(row.studentRecordId)}
																disabled={!row.studentRecordId}
															>
																<HiOutlineEye />
																{row.studentRecordId ? "View Information" : "No Student Record"}
															</button>
														</div>
													</td>
												</tr>
											))
										) : (
											scholarshipTablePage.rows.map((row) => (
												<tr key={row.trackingKey || `${scholarshipTab}_${row.studentId}_${row.scholarship}`}>
													<td>{row.studentId || "-"}</td>
													<td>{row.fullName || "-"}</td>
													<td>{row.scholarship || "-"}</td>
													<td>{row.grantorName || toProviderLabel(row.provider)}</td>
													<td>{row.yearLevel || "-"}</td>
													<td>{row.contactNumber || "-"}</td>
													<td>{row.street || "-"}</td>
													<td><span className={toStatusClass(row.status)}>{row.status || "-"}</span></td>
													<td>
														<div className="admin-table-action-row">
															<button
																type="button"
																className="admin-table-btn admin-table-btn--mini admin-table-btn--view"
																onClick={() => row.studentRecordId && setSelectedStudentId(row.studentRecordId)}
																disabled={!row.studentRecordId}
															>
																<HiOutlineEye />
																{row.studentRecordId ? "View Information" : "No Student Record"}
															</button>
														</div>
													</td>
												</tr>
											))
										)}
									</tbody>
								</table>
							</div>
							<TablePagination
								currentPage={scholarshipTablePage.currentPage}
								totalItems={visibleScholarshipRows.length}
								onPageChange={(page) => setTablePage(`scholarship_${scholarshipTab}`, page)}
							/>
						</section>
					)}
				</section>
			)
		}

		if (activeSection === "soe") {
			const visibleRows = soeTab === "requesting" ? requestingSoeReportRows : requestedSoeReportRows
			return (
				<section className="admin-management-panel">
					<div className="admin-panel-head">
						<div>
							<h2>Materials Request</h2>
							<p className="admin-panel-copy">Review requested materials, then track approved SOE releases and timer resets after download.</p>
						</div>
						<div className="admin-head-actions">
							<button
								type="button"
								className="admin-export-btn admin-export-btn--mini"
								onClick={() => openReportPreview(createSoePreviewConfig(visibleRows, `Tab: ${soeTab} | Search: ${soeSearch || "-"} | Chart Range: ${soeTrendRange}`))}
							>
								<HiOutlineEye /> Generate Preview
							</button>
						</div>
					</div>
					<SectionTabs
						tabs={[
							{ id: "requesting", label: "Requesting", count: soeRequestTabCounts.requesting, icon: HiOutlineClock },
							{ id: "requested", label: "Requested", count: soeRequestTabCounts.requested, icon: HiOutlineShieldCheck },
						]}
						value={soeTab}
						onChange={setSoeTab}
					/>
					<div className="admin-filter-bar">
						<input
							type="text"
							placeholder={
								soeTab === "requesting"
									? "Search approval requests by application number, student, scholarship, or material"
									: "Search approved requests by application number, student, scholarship, material, or SOE download status"
							}
							value={soeSearch}
							onChange={(event) => setSoeSearch(event.target.value)}
						/>
						<select value={soeProviderFilter} onChange={(event) => setSoeProviderFilter(event.target.value)}>
							<option value="All">All Grantors</option>
							{soeProviderOptions.map((provider) => (
								<option key={provider} value={provider}>
									{toProviderLabel(provider)}
								</option>
							))}
						</select>
						<select value={soeMaterialFilter} onChange={(event) => setSoeMaterialFilter(event.target.value)}>
							<option value="All">All Materials</option>
							<option value="soe">SOE</option>
							<option value="application_form">Application Form</option>
						</select>
					</div>
					{soeTab === "requesting" ? (
						<>
							<div className="admin-table-wrap">
								<table className="admin-management-table admin-management-table--roomy">
									<thead>
										<tr>
											<th>Application No.</th>
											<th>Student ID</th>
											<th>Student Name</th>
											<th>Scholarship</th>
											<th>Requested Materials</th>
											<th>Status</th>
											<th>Date Requested</th>
											<th>Action</th>
										</tr>
									</thead>
									<tbody>
										{requestingSoeRows.length === 0 ? (
											<EmptyStateRow colSpan={8} />
										) : (
											requestingSoeTablePage.rows.map((row) => (
												<tr key={row.id}>
													<td>{row.requestNumber || row.id || "-"}</td>
													<td>{row.studentId || "-"}</td>
													<td>{row.fullName || "-"}</td>
													<td>{row.scholarshipName || "-"}</td>
													<td>{row.visibleMaterialsSummary || "-"}</td>
													<td><span className={toStatusClass(row.status)}>{row.status || "-"}</span></td>
													<td>{formatDate(row.requestDate)}</td>
													<td>
														<div className="admin-head-actions">
															<button
																type="button"
																className="admin-table-btn admin-table-btn--mini admin-table-btn--view"
																onClick={() => setSelectedSoeReviewId(row.id)}
															>
																<HiOutlineEye />
																View
															</button>
														</div>
													</td>
												</tr>
											))
										)}
									</tbody>
								</table>
							</div>
							<TablePagination
								currentPage={requestingSoeTablePage.currentPage}
								totalItems={requestingSoeRows.length}
								onPageChange={(page) => setTablePage("requesting_soe", page)}
							/>
						</>
					) : (
						<>
							<div className="admin-table-wrap">
								<table className="admin-management-table admin-management-table--roomy">
									<thead>
										<tr>
											<th>Application No.</th>
											<th>Student ID</th>
											<th>Student Name</th>
											<th>Scholarship</th>
											<th>Requested Materials</th>
											<th>Approval Status</th>
											<th>Action</th>
										</tr>
									</thead>
									<tbody>
										{requestedSoeRows.length === 0 ? (
											<EmptyStateRow colSpan={7} />
										) : (
											requestedSoeTablePage.rows.map((row) => (
												<tr key={row.id}>
													<td>{row.requestNumber || row.id || "-"}</td>
													<td>{row.studentId || "-"}</td>
													<td>{row.fullName || "-"}</td>
													<td>{row.scholarshipName || "-"}</td>
													<td>{row.visibleMaterialsSummary || "-"}</td>
													<td><span className={toStatusClass(row.reviewStateLabel)}>{row.reviewStateLabel}</span></td>
													<td>
														<button
															type="button"
															className="admin-table-btn admin-table-btn--mini admin-table-btn--view"
															onClick={() => setSelectedSoeReviewId(row.id)}
														>
															<HiOutlineEye />
															View
														</button>
													</td>
												</tr>
											))
										)}
									</tbody>
								</table>
							</div>
							<TablePagination
								currentPage={requestedSoeTablePage.currentPage}
								totalItems={requestedSoeRows.length}
								onPageChange={(page) => setTablePage("requested_soe", page)}
							/>
						</>
					)}
				</section>
			)
		}

		if (activeSection === "soe-checking") {
			return (
				<section className="admin-management-panel">
					<div className="admin-panel-head">
						<div>
							<h2>Materials Checking</h2>
							<p className="admin-panel-copy">Review downloaded SOEs and verify that the request number and student record data are aligned before signing.</p>
						</div>
					</div>
					<SectionTabs
						tabs={[
							{ id: "incoming", label: "Pending", count: soeCheckingCounts.incoming, icon: HiOutlineClock },
							{ id: "signed", label: "Signed", count: soeCheckingCounts.signed, icon: HiOutlineShieldCheck },
							{ id: "non_compliant", label: "Non-Compliant", count: soeCheckingCounts.non_compliant, icon: HiOutlineExclamation },
						]}
						value={soeCheckingTab}
						onChange={setSoeCheckingTab}
					/>
					<div className="admin-filter-bar">
						<input type="text" placeholder="Search by SOE request number, student number, student, or scholarship" value={soeCheckSearch} onChange={(event) => setSoeCheckSearch(event.target.value)} />
					</div>
					<div className="admin-table-wrap">
						<table className="admin-management-table admin-management-table--roomy">
							<thead>
								<tr>
									<th>SOE Request No.</th>
									<th>Student No.</th>
									<th>Student Name</th>
									<th>Scholarship</th>
									<th>Downloaded At</th>
									<th>Status</th>
									<th>Action</th>
								</tr>
							</thead>
							<tbody>
								{soeCheckingRows.length === 0 ? (
									<EmptyStateRow colSpan={7} />
								) : (
									soeCheckingTablePage.rows.map((row) => (
										<tr key={row.id}>
											<td>{row.requestNumber || row.id || "-"}</td>
											<td>{row.studentNumber || row.studentId || "-"}</td>
											<td>{row.fullName || "-"}</td>
											<td>{row.scholarshipName || "-"}</td>
											<td>{formatDate(row.downloadedDate)}</td>
											<td><span className={toStatusClass(row.reviewStateLabel)}>{row.reviewStateLabel}</span></td>
											<td>
												<button
													type="button"
													className="admin-table-btn admin-table-btn--mini admin-table-btn--view"
													onClick={() => setSelectedSoeReviewId(row.id)}
												>
													<HiOutlineEye />
													View
												</button>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
					<TablePagination
						currentPage={soeCheckingTablePage.currentPage}
						totalItems={soeCheckingRows.length}
						onPageChange={(page) => setTablePage(`soe_checking_${soeCheckingTab}`, page)}
					/>
				</section>
			)
		}

		if (activeSection === "reports") {
			const scholarshipRecipientTotal = scholarshipRows.reduce((sum, row) => sum + Number(row.activeRecipients || 0), 0)
			const pendingMaterialRequests = soeRows.filter((row) => row.reviewState === "incoming").length
			const blockedComplianceRows = complianceRows.filter((row) => row.isBlocked).length
			const totalReportRows = allStudentReportRows.length + scholarshipRows.length + soeRows.length + complianceRows.length
			return (
				<section className="admin-management-panel admin-report-suite">
					<div className="admin-panel-head">
						<div>
							<h2>Report Generation</h2>
							<p className="admin-panel-copy">Preview-first reporting workspace for PDF and CSV exports across the full admin operation.</p>
						</div>
					</div>
					<section className="admin-report-hero">
						<div className="admin-report-hero__content">
							<span className="admin-report-hero__eyebrow">
								<HiOutlineSparkles />
								Report Center
							</span>
							<h3>Generate polished, audit-ready exports from the current admin dataset.</h3>
							<p>Each report opens in the same live preview flow before export, so PDF and CSV output stays aligned with what admins are reviewing inside the dashboard.</p>
							<div className="admin-report-hero__badges">
								<span>
									<HiOutlineEye />
									Preview before export
								</span>
								<span>PDF and CSV ready</span>
								<span>Realtime database</span>
							</div>
						</div>
						<div className="admin-report-kpi-grid">
							<article className="admin-report-kpi">
								<span>Datasets</span>
								<strong>4</strong>
								<p>Students, scholarships, materials, and compliance.</p>
							</article>
							<article className="admin-report-kpi">
								<span>Total Rows</span>
								<strong>{totalReportRows}</strong>
								<p>Live rows currently available for export.</p>
							</article>
							<article className="admin-report-kpi">
								<span>Pending Material Requests</span>
								<strong>{pendingMaterialRequests}</strong>
								<p>Requests still waiting on admin handling.</p>
							</article>
							<article className="admin-report-kpi">
								<span>Blocked Compliance Cases</span>
								<strong>{blockedComplianceRows}</strong>
								<p>Students currently under compliance hold.</p>
							</article>
						</div>
					</section>
					<div className="admin-report-layout">
						<div className="admin-report-grid">
							<article className="admin-report-card admin-report-card--students">
								<div className="admin-report-card__head">
									<div className="admin-report-card__icon">
										<HiOutlineUsers />
									</div>
									<div>
										<span className="admin-report-card__eyebrow">Student Management</span>
										<h3>Students</h3>
									</div>
								</div>
								<p>Lifecycle, validation, and restriction reporting for the entire managed student population.</p>
								<div className="admin-report-card__meta">
									<div className="admin-report-card__metric">
										<strong>{allStudentReportRows.length}</strong>
										<span>Rows</span>
									</div>
									<div className="admin-report-card__metric">
										<strong>{studentValidationCounts.validated}</strong>
										<span>Validated</span>
									</div>
								</div>
								<div className="admin-report-card__chips">
									<span>PDF</span>
									<span>CSV</span>
									<span>Access and lifecycle</span>
								</div>
								<div className="admin-report-card-actions">
									<button type="button" className="admin-export-btn admin-export-btn--mini" onClick={() => openReportPreview(createStudentPreviewConfig(allStudentReportRows, "All student records"))}>
										<HiOutlineEye /> Generate Preview
									</button>
								</div>
							</article>
							<article className="admin-report-card admin-report-card--scholarships">
								<div className="admin-report-card__head">
									<div className="admin-report-card__icon">
										<HiOutlineAcademicCap />
									</div>
									<div>
										<span className="admin-report-card__eyebrow">Program Performance</span>
										<h3>Scholarships</h3>
									</div>
								</div>
								<p>Program inventory, grantor distribution, and active recipient coverage across scholarship offerings.</p>
								<div className="admin-report-card__meta">
									<div className="admin-report-card__metric">
										<strong>{scholarshipRows.length}</strong>
										<span>Programs</span>
									</div>
									<div className="admin-report-card__metric">
										<strong>{scholarshipRecipientTotal}</strong>
										<span>Recipients</span>
									</div>
								</div>
								<div className="admin-report-card__chips">
									<span>Provider view</span>
									<span>PDF</span>
									<span>CSV</span>
								</div>
								<div className="admin-report-card-actions">
									<button type="button" className="admin-export-btn admin-export-btn--mini" onClick={() => openReportPreview(createScholarshipPreviewConfig(scholarshipRows.map((row) => toScholarshipReportRow(row)), "All scholarship programs"))}>
										<HiOutlineEye /> Generate Preview
									</button>
								</div>
							</article>
							<article className="admin-report-card admin-report-card--materials">
								<div className="admin-report-card__head">
									<div className="admin-report-card__icon">
										<HiOutlineClock />
									</div>
									<div>
										<span className="admin-report-card__eyebrow">Request Monitoring</span>
										<h3>Materials</h3>
									</div>
								</div>
								<p>Requested and reviewed scholarship materials, including request state and SOE download handling.</p>
								<div className="admin-report-card__meta">
									<div className="admin-report-card__metric">
										<strong>{soeRows.length}</strong>
										<span>Requests</span>
									</div>
									<div className="admin-report-card__metric">
										<strong>{pendingMaterialRequests}</strong>
										<span>Pending</span>
									</div>
								</div>
								<div className="admin-report-card__chips">
									<span>Request flow</span>
									<span>Download status</span>
									<span>PDF and CSV</span>
								</div>
								<div className="admin-report-card-actions">
									<button type="button" className="admin-export-btn admin-export-btn--mini" onClick={() => openReportPreview(createSoePreviewConfig(soeRows.map((row) => toSoeReportRow(row)), "All material requests"))}>
										<HiOutlineEye /> Generate Preview
									</button>
								</div>
							</article>
							<article className="admin-report-card admin-report-card--compliance">
								<div className="admin-report-card__head">
									<div className="admin-report-card__icon">
										<HiOutlineShieldCheck />
									</div>
									<div>
										<span className="admin-report-card__eyebrow">Risk Oversight</span>
										<h3>Compliance</h3>
									</div>
								</div>
								<p>Violation monitoring, warning states, and scholarship hold visibility for compliance review.</p>
								<div className="admin-report-card__meta">
									<div className="admin-report-card__metric">
										<strong>{complianceRows.length}</strong>
										<span>Cases</span>
									</div>
									<div className="admin-report-card__metric">
										<strong>{blockedComplianceRows}</strong>
										<span>Blocked</span>
									</div>
								</div>
								<div className="admin-report-card__chips">
									<span>Warning history</span>
									<span>Hold status</span>
									<span>Audit ready</span>
								</div>
								<div className="admin-report-card-actions">
									<button type="button" className="admin-export-btn admin-export-btn--mini" onClick={() => openReportPreview(createCompliancePreviewConfig(complianceRows, "Compliance monitoring"))}>
										<HiOutlineEye /> Generate Preview
									</button>
								</div>
							</article>
						</div>
						<aside className="admin-report-aside">
							<article className="admin-report-aside-card">
								<span className="admin-report-card__eyebrow">Workflow Standard</span>
								<h3>How the export flow works</h3>
								<div className="admin-report-step-list">
									<div className="admin-report-step">
										<span className="admin-report-step__index">01</span>
										<div>
											<strong>Select a report</strong>
											<p>Choose the dataset you want to export from the cards in this workspace.</p>
										</div>
									</div>
									<div className="admin-report-step">
										<span className="admin-report-step__index">02</span>
										<div>
											<strong>Review the preview</strong>
											<p>Check the exact rows and summary stats before generating the final file.</p>
										</div>
									</div>
									<div className="admin-report-step">
										<span className="admin-report-step__index">03</span>
										<div>
											<strong>Export in the required format</strong>
											<p>Switch between PDF and CSV in the preview modal before downloading.</p>
										</div>
									</div>
								</div>
							</article>
							<article className="admin-report-aside-card admin-report-aside-card--accent">
								<span className="admin-report-card__eyebrow">Coverage Snapshot</span>
								<h3>Live reporting footprint</h3>
								<div className="admin-report-aside-metrics">
									<div>
										<strong>{studentProfiles.length}</strong>
										<span>Student profiles synced</span>
									</div>
									<div>
										<strong>{scholarshipRows.length}</strong>
										<span>Scholarship programs tracked</span>
									</div>
									<div>
										<strong>{soeRows.length}</strong>
										<span>Material requests indexed</span>
									</div>
									<div>
										<strong>{complianceRows.length}</strong>
										<span>Compliance records monitored</span>
									</div>
								</div>
							</article>
						</aside>
					</div>
				</section>
			)
		}

		return (
			<section className="admin-announcement-modern">
				<div className="admin-panel-head">
					<div>
						<h2>Announcements</h2>
						<p className="admin-panel-copy">Communicate updates, deadlines, and events to the student body.</p>
					</div>
				</div>

				<form className="announcement-builder-modern" onSubmit={postAnnouncement}>
					<div className="announcement-grid-modern">
						<div className="input-group-modern">
							<div className="modern-field">
								<label htmlFor="announcement-title">Announcement Title</label>
								<input 
									id="announcement-title" 
									type="text" 
									placeholder="Enter a descriptive title..." 
									value={announcementTitle} 
									onChange={(event) => setAnnouncementTitle(event.target.value)} 
								/>
							</div>
							<div className="modern-field">
								<label htmlFor="announcement-type">Category</label>
								<select id="announcement-type" value={announcementType} onChange={(event) => setAnnouncementType(event.target.value)}>
									<option value="Update">Update</option>
									<option value="Deadline">Deadline</option>
									<option value="Event">Event</option>
								</select>
							</div>
							<div className="modern-field">
								<label htmlFor="announcement-description">Message Content</label>
								<textarea 
									id="announcement-description" 
									placeholder="Write your announcement details here..." 
									value={announcementDescription} 
									onChange={(event) => setAnnouncementDescription(event.target.value)} 
								/>
							</div>
						</div>

						<div className="input-group-modern">
							<div className="modern-field">
								<label>Visual Media</label>
								<input 
									id="announcement-images" 
									className="admin-file-input-hidden" 
									type="file" 
									accept="image/*" 
									multiple 
									onChange={handleAnnouncementFiles} 
								/>
								<label htmlFor="announcement-images" className="upload-zone-modern">
									<HiOutlineCloudUpload />
									<span>Click or Drag to Upload Images</span>
									<p>PNG, JPG up to 10MB</p>
								</label>
								
								{announcementDraftPreviews.length > 0 && (
									<div className="preview-scroll-modern">
										{announcementDraftPreviews.map((item, index) => (
											<article key={`${item.name}_${index}`} className="preview-card-modern">
												<img src={item.url} alt={item.name} />
												<button type="button" className="remove-btn" onClick={() => removeAnnouncementImage(index)}>
													<HiX />
												</button>
											</article>
										))}
									</div>
								)}
							</div>
						</div>
					</div>

					<div className="action-row-modern">
						<button type="button" className="schedule-btn-modern" onClick={() => setShowAnnouncementSchedule(true)}>
							<HiOutlineClock />
							{announcementStartDate && announcementEndDate ? `${announcementStartDate} to ${announcementEndDate}` : "Add Schedule"}
						</button>
						<button type="submit" className="post-btn-modern" disabled={isPostingAnnouncement}>
							{isPostingAnnouncement ? "Publishing..." : "Publish Announcement"}
						</button>
					</div>
				</form>

				<section className="admin-announcement-section">
					<h3>Current Announcements</h3>
					<div className="admin-announcement-list">
						{!dataLoadState.announcements ? (
							<div className="admin-empty-state-card"><LoadingBars note="Loading announcement board..." /></div>
						) : currentAnnouncements.length === 0 ? (
							<div className="admin-empty-state-card">{EMPTY_STATE_TEXT}</div>
						) : (
							currentAnnouncements.map((item) => (
								<article key={item.id} className="announcement-card-modern">
									<div className="card-header">
										<h4>{item.title || "Announcement"}</h4>
										<span className={`type-badge-modern type-${item.type || "Update"}`}>{item.type || "Update"}</span>
									</div>
									<p>{item.content || item.description || "-"}</p>
									
									{buildAnnouncementImageList(item).length > 0 && (
										<div className="admin-thumbnail-gallery">
											{buildAnnouncementImageList(item).map((url) => (
												<button key={`${item.id}_${url}`} type="button" className="admin-thumbnail-frame" onClick={() => setAnnouncementImagePreview(url)}>
													<img src={url} alt={item.title || "Announcement"} className="admin-announcement-image" />
												</button>
											))}
										</div>
									)}

									<div className="card-footer-modern">
										<div className="date-text-modern">
											<span>{formatDate(item.createdAt || item.date)}</span>
											{item.startDate || item.endDate ? (
												<span style={{ marginLeft: "1rem" }}>
													{toDateString(item.startDate)} - {toDateString(item.endDate)}
												</span>
											) : null}
										</div>
										<button type="button" className="archive-btn-modern" onClick={() => archiveAnnouncement(item.id)}>
											Archive
										</button>
									</div>
								</article>
							))
						)}
					</div>
				</section>

				<section className="admin-announcement-section">
					<h3>Previous Announcements</h3>
					<div className="admin-announcement-list">
						{previousAnnouncements.length === 0 ? (
							<div className="admin-empty-state-card">{EMPTY_STATE_TEXT}</div>
						) : (
							previousAnnouncements.map((item) => (
								<article key={item.id} className="announcement-card-modern" style={{ opacity: 0.7 }}>
									<div className="card-header">
										<h4>{item.title || "Announcement"}</h4>
										<span className="type-badge-modern" style={{ background: "#edf2f7", color: "#4a5568" }}>
											{item.archived === true ? "Archived" : "Expired"}
										</span>
									</div>
									<p>{item.content || item.description || "-"}</p>
									<div className="card-footer-modern">
										<span className="date-text-modern">{formatDate(item.createdAt || item.date)}</span>
									</div>
								</article>
							))
						)}
					</div>
				</section>
			</section>
		)
	}

	return (
		<div className={`admin-portal ${theme === "dark" ? "admin-portal--dark" : ""}`}>
			<aside className="admin-sidebar">
				<div className="admin-sidebar-brand">
					<img src={logo2} alt="BulsuScholar" />
					<div>
						<h1>BulsuScholar</h1>
						<p>Admin Portal</p>
					</div>
				</div>
				<nav className="admin-sidebar-nav">
					{ADMIN_SECTIONS.map((section) => {
						const Icon = section.icon
						const isActive = activeSection === section.id
						return (
							<Link key={section.id} to={section.path} className={`admin-sidebar-link ${isActive ? "active" : ""}`}>
								<Icon />
								<span>{section.label}</span>
							</Link>
						)
					})}
				</nav>
				<div className="admin-sidebar-bottom">
					<div className="admin-theme-switch admin-theme-switch--sidebar">
						<button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>
							<HiOutlineSun /> Light
						</button>
						<button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>
							<HiOutlineMoon /> Dark
						</button>
					</div>
					<div className="admin-sidebar-profile">
						<HiOutlineUserGroup />
						<div>
							<strong>Administrator</strong>
							<p>System Manager</p>
						</div>
					</div>
					<button type="button" className="admin-sidebar-logout" onClick={handleLogout}>
						<HiOutlineLogout /> Logout
					</button>
				</div>
			</aside>
			<main className="admin-workspace">{renderSection()}</main>
			{showAnnouncementSchedule ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={() => setShowAnnouncementSchedule(false)}>
					<div className="admin-detail-modal admin-detail-modal--calendar" role="dialog" aria-modal="true" aria-label="Schedule announcement" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={() => setShowAnnouncementSchedule(false)}>
							<HiX />
						</button>
						<h3>Schedule Announcement</h3>
						<p className="admin-detail-meta">First click sets the start date. Second click sets the end date. Past dates are disabled.</p>
						<div className="admin-calendar-popover admin-calendar-popover--modal">
							<div className="admin-calendar-head">
								<button type="button" disabled={announcementCalendarMonth <= currentMonthStart} onClick={() => setAnnouncementCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
									Prev
								</button>
								<strong>{announcementCalendarMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}</strong>
								<button type="button" onClick={() => setAnnouncementCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
									Next
								</button>
							</div>
							<div className="admin-calendar-weekdays">
								{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
									<span key={day}>{day}</span>
								))}
							</div>
							<div className="admin-calendar-grid">
								{announcementCalendarDays.map((cell) =>
									cell.empty ? (
										<span key={cell.key} className="admin-calendar-cell admin-calendar-cell--empty" />
									) : (
										<button
											key={cell.key}
											type="button"
											className={`admin-calendar-cell ${cell.disabled ? "admin-calendar-cell--disabled" : ""} ${cell.isStart || cell.isEnd ? "admin-calendar-cell--selected" : ""} ${cell.inRange ? "admin-calendar-cell--inrange" : ""}`}
											disabled={cell.disabled}
											onClick={() => handleAnnouncementDatePick(cell.iso, cell.disabled)}
										>
											{cell.day}
										</button>
									),
								)}
							</div>
						</div>
					</div>
				</div>
			) : null}

			{announcementImagePreview ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={() => setAnnouncementImagePreview("")}>
					<div className="admin-lightbox" role="dialog" aria-modal="true" aria-label="Announcement image preview" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={() => setAnnouncementImagePreview("")}>
							<HiX />
						</button>
						<img src={announcementImagePreview} alt="Announcement preview" className="admin-lightbox-image" />
					</div>
				</div>
			) : null}

			{selectedStudent ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={closeStudentModal}>
					<div className="admin-detail-shell admin-detail-shell--student" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={closeStudentModal}>
							<HiX />
						</button>
						<div className="admin-detail-modal admin-detail-modal--student" role="dialog" aria-modal="true" aria-label="Student details">
						<div className="admin-detail-info">
							<div className="admin-detail-header">
								<img src={selectedStudent.profileImageUrl || selectedStudent.imageUrl || logo2} alt={selectedStudent.fullName} className="admin-detail-avatar" />
								<div>
									<h3>{selectedStudent.fullName}</h3>
									<p className="admin-detail-meta">Student ID: {selectedStudent.id}</p>
									<div className="admin-chip-stack">
										<span className={toStatusClass(selectedStudent.recordStatus)}>{selectedStudent.recordStatus}</span>
										{selectedStudent.soeComplianceWarning ? <span className="admin-inline-chip">Compliance Warning</span> : null}
										{selectedStudent.soeComplianceBlocked ? <span className="admin-inline-chip">Automatic Scholarship Block</span> : null}
									</div>
								</div>
							</div>
							<div className="admin-detail-grid">
								<p className="admin-detail-meta">Course: {selectedStudent.course || "-"}</p>
								<p className="admin-detail-meta">Year & Section: {[selectedStudent.year || "-", selectedStudent.section || selectedStudent.yearSection || "-"].join(" / ")}</p>
								<p className="admin-detail-meta">CP Number: {selectedStudent.cpNumber || "-"}</p>
								<p className="admin-detail-meta">
									Address:{" "}
									{[
										selectedStudent.houseNumber ? `#${selectedStudent.houseNumber}` : "",
										selectedStudent.street || "",
										selectedStudent.city || "",
										selectedStudent.province || "",
										selectedStudent.postalCode || "",
									]
										.filter(Boolean)
										.join(", ") || "-"}
								</p>
								<p className="admin-detail-meta">Last SOE Request: {selectedStudentLastSoe}</p>
								<p className="admin-detail-meta">Compliance Violations: {Number(selectedStudent.complianceViolationCount || 0)}</p>
							</div>
						</div>
						<div className="admin-detail-docs">
							<strong>Documents</strong>
							{[
								{ label: "View COR", url: selectedStudent.corFile?.url },
								{ label: "View COG", url: selectedStudent.cogFile?.url },
								{ label: "View School ID", url: selectedStudent.schoolIdFile?.url || selectedStudent.studentIdFile?.url },
							].map((document) =>
								document.url ? (
									<a key={document.label} href={document.url} target="_blank" rel="noreferrer">
										{document.label}
									</a>
								) : (
									<span key={document.label} className="admin-detail-docs-empty">
										{document.label} Unavailable
									</span>
								),
							)}
						</div>
						<div className="admin-detail-actions">
							{selectedStudent.archived === true ? (
								<>
									<button type="button" className="admin-safe-btn" disabled={isBusy} onClick={() => unarchiveStudent(selectedStudent.id)}>
										<HiOutlineRefresh /> Unarchive Student
									</button>
									<button type="button" className="admin-table-btn" onClick={closeStudentModal}>
										Close
									</button>
								</>
							) : isSelectedStudentPendingOnly ? (
								<>
									<button type="button" className="admin-safe-btn" disabled={isBusy} onClick={() => approveStudentValidation(selectedStudent.id)}>
										<HiOutlineShieldCheck /> Validate Student
									</button>
									<button type="button" className="admin-danger-btn admin-danger-btn--hard" disabled={isBusy} onClick={() => disapproveStudentValidation(selectedStudent.id)}>
										<HiOutlineTrash /> Disapprove Application
									</button>
									<button type="button" className="admin-table-btn" onClick={closeStudentModal}>
										Close
									</button>
								</>
							) : (
								<>
									{selectedStudent.validationStatus === "Pending" ? (
										<button type="button" className="admin-safe-btn" disabled={isBusy} onClick={() => approveStudentValidation(selectedStudent.id)}>
											<HiOutlineShieldCheck /> Validate Student
										</button>
									) : (
										<button
											type="button"
											className={selectedStudent.restrictionState.accountAccess ? "admin-safe-btn" : "admin-danger-btn"}
											disabled={isBusy}
											onClick={toggleStudentBlock}
										>
											{selectedStudent.restrictionState.accountAccess ? <HiOutlineRefresh /> : <HiOutlineShieldCheck />}
											{selectedStudent.restrictionState.accountAccess ? "Unblock" : "Block"}
										</button>
									)}
									<button type="button" className="admin-danger-btn admin-danger-btn--hard" disabled={isBusy} onClick={() => openArchiveStudentConfirmation(selectedStudent.id)}>
										<HiOutlineTrash /> Archive Student
									</button>
								</>
							)}
						</div>
					</div>
					</div>
				</div>
			) : null}

			{selectedScholarshipTrackingRow ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={closeScholarshipTrackingModal}>
					<div className="admin-detail-shell admin-detail-shell--review" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={closeScholarshipTrackingModal}>
							<HiX />
						</button>
						<div
							className="admin-detail-modal admin-detail-modal--review"
							role="dialog"
							aria-modal="true"
							aria-label="Scholarship application tracking"
						>
							<div className="admin-detail-info">
								<div className="admin-soe-review-head">
									<div>
										<h3>Scholarship Application Tracking</h3>
										<p className="admin-detail-meta">
											Track the student application flow and complete the current admin-owned step when it is ready.
										</p>
									</div>
									<span className={toStatusClass(selectedScholarshipTrackingRow.status)}>
										{selectedScholarshipTrackingRow.status}
									</span>
								</div>
								<div className="admin-tracking-summary-grid">
									<article className="admin-tracking-summary-card">
										<span>Student</span>
										<strong>{selectedScholarshipTrackingRow.fullName}</strong>
										<small>{selectedScholarshipTrackingRow.studentId}</small>
									</article>
									<article className="admin-tracking-summary-card">
										<span>Scholarship</span>
										<strong>{selectedScholarshipTrackingRow.scholarship}</strong>
										<small>{toProviderLabel(selectedScholarshipTrackingRow.provider)}</small>
									</article>
									<article className="admin-tracking-summary-card">
										<span>Current Step</span>
										<strong>{selectedScholarshipTrackingRow.trackingProgress.currentStepLabel}</strong>
										<small>{selectedScholarshipTrackingRow.trackingProgress.currentStepOwnerLabel}</small>
									</article>
								</div>
								<div className="admin-tracking-step-list">
									{selectedScholarshipTrackingRow.trackingProgress.steps.map((step, index) => (
										<article
											key={`${selectedScholarshipTrackingRow.trackingKey}_${step.id}`}
											className={`admin-tracking-step admin-tracking-step--${step.state}`}
										>
											<div className="admin-tracking-step-marker" aria-hidden="true">
												{index + 1}
											</div>
											<div className="admin-tracking-step-body">
												<div className="admin-tracking-step-head">
													<div>
														<h4>{step.label}</h4>
														<p className="admin-detail-meta">{step.detail}</p>
													</div>
													{step.state === "complete" || step.state === "current" || step.state === "attention" ? (
														<span
															className={`admin-detail-chip admin-detail-chip--${
																step.state === "complete" ? "complete" : "current"
															}`}
														>
															{step.state === "complete" ? "Completed" : "Current"}
														</span>
													) : null}
												</div>
											</div>
										</article>
									))}
								</div>
							</div>
							<div className="admin-tracking-modal-footer">
								<div className="admin-student-alert">
									<div className="admin-student-warning-copy">
										<strong>
											{selectedScholarshipTrackingRow.trackingProgress.canAdminCompleteCurrentStep
												? "Current step is ready for admin completion."
												: "Current step is not ready for admin completion."}
										</strong>
										<span>
											{selectedScholarshipTrackingRow.trackingProgress.canAdminCompleteCurrentStep
												? `Complete "${selectedScholarshipTrackingRow.trackingProgress.currentStepLabel}" to move the student to the next step.`
												: selectedScholarshipTrackingRow.trackingProgress.adminCompletionReason}
										</span>
									</div>
									<HiOutlineSparkles />
								</div>
								<div className="admin-soe-review-actions admin-soe-review-actions--split">
									<button
										type="button"
										className="admin-safe-btn"
										disabled={
											isBusy ||
											!selectedScholarshipTrackingRow.trackingProgress.canAdminCompleteCurrentStep
										}
										onClick={completeScholarshipTrackingCurrentStep}
									>
										Complete Current Step
									</button>
									<button
										type="button"
										className="admin-danger-btn"
										disabled={isBusy}
										onClick={openCancelScholarshipApplicationConfirmation}
									>
										Cancel Application
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			) : null}

			{adminConfirmDialog ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={closeAdminConfirmDialog}>
					<div className="admin-detail-shell admin-detail-shell--confirm" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={closeAdminConfirmDialog}>
							<HiX />
						</button>
						<div
							className="admin-detail-modal admin-detail-modal--confirm"
							role="dialog"
							aria-modal="true"
							aria-label={adminConfirmDialog.title}
						>
							<div className="admin-detail-confirm-copy">
								<h3>{adminConfirmDialog.title}</h3>
								<p className="admin-detail-meta">{adminConfirmDialog.message}</p>
							</div>
							<div className="admin-detail-actions admin-detail-actions--confirm">
								<button type="button" className="admin-table-btn" onClick={closeAdminConfirmDialog} disabled={isBusy}>
									Keep Current State
								</button>
								<button
									type="button"
									className={adminConfirmDialog.tone === "danger" ? "admin-danger-btn" : "admin-safe-btn"}
									onClick={confirmAdminDialogAction}
									disabled={isBusy}
								>
									{adminConfirmDialog.confirmLabel}
								</button>
							</div>
						</div>
					</div>
				</div>
			) : null}

			{selectedSoeReviewRow ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={() => setSelectedSoeReviewId("")}>
					<div className="admin-detail-shell admin-detail-shell--review" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={() => setSelectedSoeReviewId("")}>
							<HiX />
						</button>
						<div
							className="admin-detail-modal admin-detail-modal--review"
							role="dialog"
							aria-modal="true"
							aria-label={isSelectedSoeDownloadReview ? "SOE checking review" : "Materials request review"}
						>
							<div className="admin-detail-info">
								<div className="admin-soe-review-head">
									<div>
										<h3>{isSelectedSoeDownloadReview ? "SOE Checking Review" : "Materials Request Review"}</h3>
										<p className="admin-detail-meta">
											{isSelectedSoeDownloadReview
												? "Verify that the downloaded SOE request number and student record details are aligned before signing."
												: "Focused approval workflow for student material release requests."}
										</p>
									</div>
									<span className={toStatusClass(selectedSoeReviewRow.reviewStateLabel)}>{selectedSoeReviewRow.reviewStateLabel}</span>
								</div>
								<div className="admin-soe-review-layout">
									<section className="admin-soe-review-section">
										<div className="admin-soe-review-section-head">
											<h4>Primary Details</h4>
											<p>Core student, scholarship, and request information for this review.</p>
										</div>
										<div className="admin-soe-review-list">
											<div className="admin-soe-review-row">
												<span>Student</span>
												<strong>{selectedSoeReviewRow.fullName || "-"}</strong>
												<small>{selectedSoeReviewRow.studentId || "-"}</small>
											</div>
											<div className="admin-soe-review-row">
												<span>Scholarship</span>
												<strong>{selectedSoeReviewRow.scholarshipName || "-"}</strong>
												<small>{selectedSoeReviewRow.providerType || "Provider not set"}</small>
											</div>
											<div className="admin-soe-review-row">
												<span>{isSelectedSoeDownloadReview ? "SOE Request Number" : "Application Number"}</span>
												<strong>{selectedSoeReviewRow.requestNumber || selectedSoeReviewRow.id || "-"}</strong>
												<small>{isSelectedSoeDownloadReview ? "Downloaded SOE record" : "Materials request record"}</small>
											</div>
											<div className="admin-soe-review-row">
												<span>{isSelectedSoeDownloadReview ? "Downloaded" : "Requested"}</span>
												<strong>{formatDate(isSelectedSoeDownloadReview ? selectedSoeReviewRow.downloadedDate : selectedSoeReviewRow.requestDate)}</strong>
												<small>{selectedSoeReviewRow.status || "-"}</small>
											</div>
										</div>
									</section>
									{isSelectedSoeDownloadReview ? (
										<section className="admin-soe-review-section">
											<div className="admin-soe-review-section-head">
												<h4>Verification Details</h4>
												<p>Check that the downloaded SOE matches the student record before signing.</p>
											</div>
											<div className="admin-soe-review-list">
												<div className="admin-soe-review-row">
													<span>Student Number</span>
													<strong>{selectedSoeReviewRow.studentNumber || selectedSoeReviewRow.studentId || "-"}</strong>
													<small>Matched against the student profile record.</small>
												</div>
												<div className="admin-soe-review-row admin-soe-review-row--full">
													<span>Student Data</span>
													<strong>
														{[
															selectedSoeReviewRow.studentCourse,
															selectedSoeReviewRow.studentYear ? `Year ${selectedSoeReviewRow.studentYear}` : "",
															selectedSoeReviewRow.studentSection ? `Section ${selectedSoeReviewRow.studentSection}` : "",
														]
															.filter(Boolean)
															.join(" | ") || "-"}
													</strong>
													<small>{selectedSoeReviewRow.studentEmail || "-"}</small>
												</div>
											</div>
										</section>
									) : (
										<>
											<section className="admin-soe-review-section">
												<div className="admin-soe-review-section-head">
													<h4>Material Request</h4>
													<p>Requested items and the current release state.</p>
												</div>
												<div className="admin-soe-review-list">
													<div className="admin-soe-review-row">
														<span>Requested Materials</span>
														<strong>{selectedSoeReviewRow.visibleMaterialsSummary || "-"}</strong>
														<small>
															{selectedSoeReviewRow.pendingMaterialLabels?.length > 0
																? `Pending: ${selectedSoeReviewRow.pendingMaterialLabels.join(", ")}`
																: "No pending materials"}
														</small>
													</div>
													<div className="admin-soe-review-row">
														<span>Material Status</span>
														<strong>{selectedSoeReviewRow.materialStatusSummary || "-"}</strong>
														<small>SOE Download: {selectedSoeReviewRow.downloadStatusLabel || "-"}</small>
													</div>
												</div>
											</section>
											<section className="admin-soe-review-section">
												<div className="admin-soe-review-section-head">
													<h4>Release Timeline</h4>
													<p>Request timing, download activity, and next SOE eligibility.</p>
												</div>
												<div className="admin-soe-review-list">
													<div className="admin-soe-review-row">
														<span>Date Requested</span>
														<strong>{formatDate(selectedSoeReviewRow.requestDate)}</strong>
														<small>Request record created for material release.</small>
													</div>
													<div className="admin-soe-review-row">
														<span>SOE Downloaded At</span>
														<strong>{formatDate(selectedSoeReviewRow.downloadedDate)}</strong>
														<small>
															Application Form Downloaded:{" "}
															{formatDate(selectedSoeReviewRow.applicationFormDownloadedDate)}
														</small>
													</div>
													<div className="admin-soe-review-row admin-soe-review-row--full">
														<span>Next Eligibility Date</span>
														<strong>{selectedSoeReviewRow.nextEligibleLabel || "Not applicable"}</strong>
														<small>Timer status: {selectedSoeReviewRow.timerEndLabel || "Not applicable"}</small>
													</div>
												</div>
											</section>
										</>
									)}
								</div>
							</div>
							{selectedSoeReviewRow.reviewState === "incoming" ? (
								<div className="admin-soe-review-actions admin-soe-review-actions--split">
									{isSelectedSoeDownloadReview ? (
										<>
											<button type="button" className="admin-safe-btn" disabled={isBusy} onClick={() => markSoeCheckingReview(selectedSoeReviewRow, "signed")}>
												Sign SOE
											</button>
											<button type="button" className="admin-danger-btn" disabled={isBusy} onClick={() => markSoeCheckingReview(selectedSoeReviewRow, "non_compliant")}>
												Mark Non-Compliant
											</button>
										</>
									) : (
										<>
											<button type="button" className="admin-safe-btn" disabled={isBusy} onClick={() => markSoeReview(selectedSoeReviewRow, "signed")}>
												{selectedSoeReviewRow.pendingMaterialKeys?.length > 1 ? "Approve Both Requests" : "Approve Request"}
											</button>
											<button type="button" className="admin-danger-btn" disabled={isBusy} onClick={() => markSoeReview(selectedSoeReviewRow, "non_compliant")}>
												{selectedSoeReviewRow.pendingMaterialKeys?.length > 1 ? "Reject Both Requests" : "Reject Request"}
											</button>
										</>
									)}
								</div>
							) : (
								<>
									<div className="admin-student-alert">
										<div className="admin-student-warning-copy">
											<strong>{selectedSoeReviewRow.reviewStateLabel}</strong>
											<span>
												{isSelectedSoeDownloadReview
													? "This SOE download already has a completed checking decision."
													: "This request already has a completed review state."}
											</span>
										</div>
										<HiOutlineSparkles />
									</div>
									<div className="admin-soe-review-actions admin-soe-review-actions--split">
										{!isSelectedSoeDownloadReview && selectedSoeReviewRow.reviewState === "signed" ? (
											<button
												type="button"
												className="admin-table-btn"
												disabled={
													!selectedSoeReviewRow.hasSoeRequest ||
													!selectedSoeReviewRow.downloadedDate ||
													isSoeResetDisabled(
														selectedSoeReviewRow.studentId,
														selectedSoeReviewRow.downloadedDate,
													)
												}
												onClick={() => resetSoeTimer(selectedSoeReviewRow)}
											>
												{!selectedSoeReviewRow.hasSoeRequest
													? "SOE Only"
													: !selectedSoeReviewRow.downloadedDate
														? "Wait for Download"
														: isSoeResetDisabled(
																selectedSoeReviewRow.studentId,
																selectedSoeReviewRow.downloadedDate,
															)
															? "Timer Reset"
															: "Reset Timer"}
											</button>
										) : null}
										<button
											type="button"
											className="admin-table-btn"
											onClick={() => {
												setSelectedSoeReviewId("")
												setSelectedStudentId(selectedSoeReviewRow.studentId)
											}}
										>
											View Student
										</button>
									</div>
								</>
							)}
						</div>
					</div>
				</div>
			) : null}

			{renderReportPreview()}
		</div>
	)
}
