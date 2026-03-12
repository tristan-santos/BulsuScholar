import { useEffect, useMemo, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore"
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
import useThemeMode from "../hooks/useThemeMode"
import { uploadToCloudinary } from "../services/cloudinaryService"
import {
	downloadCsvReport,
	exportComplianceReportPdf,
	exportScholarshipsReportPdf,
	exportSoeRequestsReportPdf,
	exportStudentsReportPdf,
	filterScholarshipRows,
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
const REPORT_PREVIEW_LIMIT = 8
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
	if (value === "warning") return "Warning"
	return toProviderLabel(value)
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
		scholarships.some((entry) => entry?.adminBlocked === true)
	return { accountAccess, scholarshipEligibility }
}

function toRestrictionSelection(student) {
	if (!student) return ""
	if (student.archived === true) return "archived"
	const restrictionState = getStudentRestrictionState(student)
	if (restrictionState.accountAccess) return "account_access"
	if (restrictionState.scholarshipEligibility) return "scholarship_eligibility"
	return "unblocked"
}

function toRestrictionLabel(selection) {
	if (selection === "account_access") return "Account Access Blocked"
	if (selection === "scholarship_eligibility") return "Scholarship Eligibility Blocked"
	if (selection === "archived") return "Archived"
	return "Unblocked"
}

function toRestrictionBooleans(selection) {
	return {
		accountAccess: selection === "account_access",
		scholarshipEligibility: selection === "scholarship_eligibility",
	}
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
		...rows.slice(0, REPORT_PREVIEW_LIMIT).map((row) => row.map((value) => String(value ?? "")).join(",")),
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
	const [dataLoadState, setDataLoadState] = useState({
		students: false,
		pendingStudents: false,
		applications: false,
		soe: false,
		soeDownloads: false,
		announcements: false,
	})

	const [studentSearch, setStudentSearch] = useState("")
	const [studentCourse, setStudentCourse] = useState("All")
	const [studentYear, setStudentYear] = useState("All")
	const [studentValidation, setStudentValidation] = useState("All")
	const [studentViewTab, setStudentViewTab] = useState("students")
	const [studentArchiveTrendRange, setStudentArchiveTrendRange] = useState("monthly")
	const [selectedStudentId, setSelectedStudentId] = useState("")
	const [studentRestrictionDraft, setStudentRestrictionDraft] = useState("")

	const [scholarshipProvider, setScholarshipProvider] = useState("All")
	const [scholarshipStatus, setScholarshipStatus] = useState("All")
	const [scholarshipSearch, setScholarshipSearch] = useState("")
	const [scholarshipTab, setScholarshipTab] = useState("overview")
	const [scholarshipGrantorHoverId, setScholarshipGrantorHoverId] = useState("")
	const [grantorDistributionHoverId, setGrantorDistributionHoverId] = useState("")

	const [applicantTrendRange, setApplicantTrendRange] = useState("monthly")
	const [soeTrendRange, setSoeTrendRange] = useState("monthly")
	const [soeSearch, setSoeSearch] = useState("")
	const [soeTab, setSoeTab] = useState("requesting")
	const [soeResetByStudent, setSoeResetByStudent] = useState({})

	const [soeCheckSearch, setSoeCheckSearch] = useState("")
	const [soeCheckingTab, setSoeCheckingTab] = useState("incoming")
	const [selectedSoeReviewId, setSelectedSoeReviewId] = useState("")

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
				const scholarships = Array.isArray(student.scholarships) ? student.scholarships : []
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

	const selectedStudentRestrictionMode = useMemo(
		() => toRestrictionSelection(selectedStudent),
		[selectedStudent],
	)

	const isSelectedStudentPendingOnly = selectedStudent?.sourceCollection === "pendingStudent"

	const studentRestrictionBaseline = useMemo(
		() =>
			selectedStudentRestrictionMode === "account_access" || selectedStudentRestrictionMode === "scholarship_eligibility"
				? selectedStudentRestrictionMode
				: "",
		[selectedStudentRestrictionMode],
	)

	const hasStudentRestrictionChanges = studentRestrictionDraft !== studentRestrictionBaseline

	useEffect(() => {
		setStudentRestrictionDraft(studentRestrictionBaseline)
	}, [selectedStudentId, studentRestrictionBaseline])

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

	const filteredScholarships = useMemo(
		() =>
			filterScholarshipRows(scholarshipRows, {
				provider: scholarshipProvider,
				status: scholarshipStatus,
				search: scholarshipTab === "overview" ? scholarshipSearch : "",
			}),
		[scholarshipRows, scholarshipProvider, scholarshipSearch, scholarshipStatus, scholarshipTab],
	)

	const warningStudentIds = useMemo(
		() => new Set(studentProfiles.filter((student) => student.scholarships.length > 1).map((student) => student.id)),
		[studentProfiles],
	)

	const warningRows = useMemo(() => {
		const keyword = scholarshipSearch.trim().toLowerCase()
		return studentProfiles
			.filter((student) => warningStudentIds.has(student.id))
			.map((student) => ({
				studentId: student.id,
				fullName: student.fullName,
				details: student.scholarships.map((scholarship) => scholarship.name || scholarship.provider || "Scholarship").join(", "),
			}))
			.filter(
				(row) =>
					!keyword ||
					row.studentId.toLowerCase().includes(keyword) ||
					row.fullName.toLowerCase().includes(keyword) ||
					row.details.toLowerCase().includes(keyword),
			)
	}, [scholarshipSearch, studentProfiles, warningStudentIds])

	const scholarshipProviderRows = useMemo(() => {
		const rows = { kuya_win: [], tina_pancho: [], morisson: [], other: [], none: [] }
		studentProfiles.forEach((student) => {
			if (warningStudentIds.has(student.id)) {
				return
			}
			if (student.scholarships.length === 0) {
				rows.none.push({
					studentId: student.id,
					fullName: student.fullName,
					scholarship: "-",
					status: "No Scholarship",
				})
				return
			}
			student.scholarships.forEach((scholarship) => {
				const provider = toProviderType(scholarship.providerType || scholarship.provider || scholarship.name)
				rows[provider].push({
					studentId: student.id,
					fullName: student.fullName,
					scholarship: scholarship.name || scholarship.provider || "Scholarship",
					status: scholarship.adminBlocked ? "Blocked" : scholarship.status || "Saved",
				})
			})
		})
		return rows
	}, [studentProfiles, warningStudentIds])

	const visibleScholarshipRows = useMemo(() => {
		if (scholarshipTab === "warning") return warningRows
		if (scholarshipTab === "overview") return filteredScholarships
		const keyword = scholarshipSearch.trim().toLowerCase()
		return (scholarshipProviderRows[scholarshipTab] || []).filter((row) => {
			return (
				!keyword ||
				row.studentId.toLowerCase().includes(keyword) ||
				row.fullName.toLowerCase().includes(keyword) ||
				row.scholarship.toLowerCase().includes(keyword) ||
				row.status.toLowerCase().includes(keyword)
			)
		})
	}, [filteredScholarships, scholarshipProviderRows, scholarshipSearch, scholarshipTab, warningRows])

	const scholarshipSectionPreviewConfig = useMemo(() => {
		if (scholarshipTab === "overview") {
			return createScholarshipPreviewConfig(
				scholarshipRows.map((row) => toScholarshipReportRow(row)),
				"Table: Overview | Scope: All scholarship programs",
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

		const tableReportRows = visibleScholarshipRows.map((row) => toScholarshipTableReportRow(row))
		return createScholarshipPreviewConfig(tableReportRows, `Table: ${toScholarshipTabLabel(scholarshipTab)} | Search: ${scholarshipSearch || "-"}`, {
			description: "Preview of the currently selected scholarship table before export.",
			stats: [
				{ label: "Rows", value: tableReportRows.length },
				{ label: "Students", value: new Set(tableReportRows.map((row) => row.studentId)).size },
				{ label: "Scholarships", value: new Set(tableReportRows.map((row) => row.scholarshipName)).size },
				{ label: "Blocked", value: tableReportRows.filter((row) => String(row.status).toLowerCase().includes("blocked")).length },
			],
			columns: ["Student ID", "Full Name", "Scholarship", "Status"],
			csvRows: tableReportRows.map((row) => [row.studentId, row.fullName, row.scholarshipName, row.status]),
		})
	}, [scholarshipRows, scholarshipSearch, scholarshipTab, visibleScholarshipRows])

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

	const scholarshipOverviewTotalRecipients = useMemo(
		() => filteredScholarships.reduce((sum, row) => sum + Number(row.activeRecipients || 0), 0),
		[filteredScholarships],
	)

	const scholarshipOverviewLeader = useMemo(() => {
		if (filteredScholarships.length === 0) return null
		return filteredScholarships.slice().sort((left, right) => right.activeRecipients - left.activeRecipients)[0]
	}, [filteredScholarships])

	const recordedApplicationReferences = useMemo(() => {
		const ids = new Set()
		const compositeKeys = new Set()
		applicationsRaw.forEach((application) => {
			const scholarshipId = application.scholarshipId || application.requestNumber || application.id
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
					const scholarshipId = String(scholarship.id || scholarship.requestNumber || "")
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

	const requestingSoeRows = useMemo(() => {
		const keyword = soeSearch.trim().toLowerCase()
		return soeRows.filter((row) => {
			if (row.reviewState !== "incoming") return false
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
	}, [soeRows, soeSearch])

	const requestedSoeRows = useMemo(() => {
		const keyword = soeSearch.trim().toLowerCase()
		return soeRows.filter((row) => {
			if (row.reviewState !== "signed") return false
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
	}, [soeRows, soeSearch])

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
							return `${row.label}: ${row.percent} (${row.value} active recipients)`
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
		setStudentRestrictionDraft("")
	}

	const toggleStudentRestrictionDraft = (value) => {
		setStudentRestrictionDraft((current) => (current === value ? "" : value))
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

	const saveStudentRestrictions = async () => {
		if (!selectedStudent || selectedStudent.sourceCollection !== "students" || selectedStudent.archived === true || !hasStudentRestrictionChanges) return
		const { accountAccess, scholarshipEligibility } = toRestrictionBooleans(studentRestrictionDraft)
		const hasMultipleScholarshipConflict = scholarshipEligibility && selectedStudent.scholarships.length > 1
		const conflictMessage = hasMultipleScholarshipConflict ? getMultipleScholarshipComplianceMessage(selectedStudent) : ""
		const shouldSendConflictEmail =
			hasMultipleScholarshipConflict &&
			selectedStudent.scholarshipRestrictionReason !== "multiple_scholarships" &&
			Boolean(selectedStudent.email)
		let emailWarning = ""
		const nextScholarships = selectedStudent.scholarships.map((entry) => ({
			...entry,
			adminBlocked: scholarshipEligibility,
			adminBlockedAt: scholarshipEligibility ? new Date().toISOString() : null,
		}))

		await runAction(async () => {
			await updateDoc(doc(db, "students", selectedStudent.id), {
				isBlocked: accountAccess,
				accountStatus: accountAccess ? "blocked" : "active",
				scholarships: nextScholarships,
				soeComplianceBlocked: false,
				scholarshipConflictWarning: hasMultipleScholarshipConflict,
				scholarshipConflictMessage: conflictMessage,
				scholarshipRestrictionReason: hasMultipleScholarshipConflict ? "multiple_scholarships" : null,
				restrictions: {
					...(selectedStudent.restrictions || {}),
					accountAccess,
					scholarshipEligibility,
					complianceHold: false,
				},
				updatedAt: serverTimestamp(),
			})

			if (hasMultipleScholarshipConflict && !selectedStudent.email) {
				emailWarning = "Compliance email not sent because the student record has no email address."
			} else if (shouldSendConflictEmail) {
				try {
					const emailResult = await sendEmailNotification(
						selectedStudent.email,
						selectedStudent.fullName || studentFullName(selectedStudent),
						"Scholarship Compliance Required",
						getMultipleScholarshipComplianceEmailBody(
							selectedStudent.fname || selectedStudent.fullName || "Student",
							getStudentScholarshipNames(selectedStudent),
						),
					)
					if (!emailResult?.sent) {
						emailWarning =
							emailResult?.reason === "missing_recipient"
								? "Compliance email not sent because the student email address is empty."
								: "Compliance email was not sent because EmailJS is not configured."
					}
				} catch (error) {
					console.error("Multiple scholarship compliance email failed:", error)
					emailWarning = "Student restriction was saved, but the compliance email could not be sent."
				}
			}
		}, scholarshipEligibility || accountAccess ? "Student restriction updated." : "Student restored to active status.")
		if (emailWarning) {
			toast.warning(emailWarning)
		}
	}

	const archiveStudent = async (studentId) => {
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
			setStudentRestrictionDraft("")
		}, "Student archived.")
	}

	const approveStudentValidation = async (studentId) => {
		if (!studentId) return
		const student = studentProfiles.find((item) => item.id === studentId)
		const pendingStudent = pendingStudentsRaw.find(
			(item) => String(item.id || item.studentnumber || "") === String(studentId),
		)

		await runAction(async () => {
			if (pendingStudent) {
				const { id, ...pendingData } = pendingStudent
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
			setStudentRestrictionDraft("")
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
		const previewRows = reportPreview.csvRows.slice(0, REPORT_PREVIEW_LIMIT)
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
										Showing {Math.min(reportPreview.csvRows.length, REPORT_PREVIEW_LIMIT)} of {reportPreview.csvRows.length} rows
									</span>
								</div>
								{reportExportFormat === "pdf" ? (
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
											filteredStudents.map((student) => (
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
							<p className="admin-panel-copy">Analytics-first overview for program distribution and grantor performance.</p>
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
							{ id: "overview", label: "Overview", icon: HiOutlineChartBar },
							{ id: "kuya_win", label: "Kuya Win", count: scholarshipProviderRows.kuya_win.length, icon: HiOutlineChartPie },
							{ id: "tina_pancho", label: "Tina Pancho", count: scholarshipProviderRows.tina_pancho.length, icon: HiOutlineChartPie },
							{ id: "morisson", label: "Morisson", count: scholarshipProviderRows.morisson.length, icon: HiOutlineChartPie },
							{ id: "other", label: "Other", count: scholarshipProviderRows.other.length, icon: HiOutlineChartPie },
							{ id: "none", label: "No Program", count: scholarshipProviderRows.none.length, icon: HiOutlineChartPie },
							{ id: "warning", label: "Warning", count: warningRows.length, icon: HiOutlineExclamation },
						]}
						value={scholarshipTab}
						onChange={setScholarshipTab}
						className="admin-section-tabs--compact admin-section-tabs--scholarships"
					/>
					<div className="admin-filter-bar">
						<input type="text" placeholder="Search scholarship records" value={scholarshipSearch} onChange={(event) => setScholarshipSearch(event.target.value)} />
						<select value={scholarshipProvider} onChange={(event) => setScholarshipProvider(event.target.value)} disabled={scholarshipTab !== "overview"}>
							<option value="All">All Providers</option>
							<option value="kuya_win">Kuya Win</option>
							<option value="tina_pancho">Tina Pancho</option>
							<option value="morisson">Morisson</option>
							<option value="other">Other</option>
						</select>
						<select value={scholarshipStatus} onChange={(event) => setScholarshipStatus(event.target.value)} disabled={scholarshipTab !== "overview"}>
							<option value="All">All Status</option>
							<option value="Open">Open</option>
						</select>
					</div>

					{scholarshipTab === "overview" ? (
						<section className="admin-tab-panel">
							<div className="admin-summary-strip">
								<article className="admin-summary-card">
									<h3>Programs in View</h3>
									<strong>{filteredScholarships.length}</strong>
									<p>Programs included in the current analytics filter.</p>
								</article>
								<article className="admin-summary-card">
									<h3>Total Recipients</h3>
									<strong>{scholarshipOverviewTotalRecipients}</strong>
									<p>Students currently attached to filtered programs.</p>
								</article>
								<article className="admin-summary-card">
									<h3>Top Program</h3>
									<strong>{scholarshipOverviewLeader?.programName || "-"}</strong>
									<p>{scholarshipOverviewLeader ? `${scholarshipOverviewLeader.activeRecipients} active recipients` : "No records yet."}</p>
								</article>
							</div>
							<div className="admin-analytics-grid">
								<article className="admin-analytics-card admin-analytics-card--wide">
									<h3>Grantor Distribution</h3>
									{isAnalyticsLoading ? (
										<LoadingBars note="Loading grantor overview..." />
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
							</div>
						</section>
					) : (
						<div className="admin-table-wrap">
							<table className="admin-management-table admin-management-table--roomy">
								<thead>
									<tr>
										<th>Student ID</th>
										<th>Full Name</th>
										<th>{scholarshipTab === "warning" ? "Conflict Details" : "Scholarship"}</th>
										<th>{scholarshipTab === "warning" ? "Action" : "Status"}</th>
										{scholarshipTab === "warning" ? null : <th>Action</th>}
									</tr>
								</thead>
								<tbody>
									{visibleScholarshipRows.length === 0 ? (
										<EmptyStateRow colSpan={scholarshipTab === "warning" ? 4 : 5} />
									) : scholarshipTab === "warning" ? (
										visibleScholarshipRows.map((row) => (
											<tr key={`${row.studentId}_warning`}>
												<td>{row.studentId}</td>
												<td>{row.fullName}</td>
												<td>{row.details}</td>
												<td>
													<button
														type="button"
														className="admin-table-btn admin-table-btn--mini admin-table-btn--view"
														onClick={() => setSelectedStudentId(row.studentId)}
													>
														<HiOutlineEye />
														View Information
													</button>
												</td>
											</tr>
										))
									) : (
										visibleScholarshipRows.map((row) => (
											<tr key={`${row.studentId}_${row.scholarship}`}>
												<td>{row.studentId}</td>
												<td>{row.fullName}</td>
												<td>{row.scholarship}</td>
												<td>
													<span className={toStatusClass(row.status)}>{row.status}</span>
												</td>
												<td>
													<button
														type="button"
														className="admin-table-btn admin-table-btn--mini admin-table-btn--view"
														onClick={() => setSelectedStudentId(row.studentId)}
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
									? "Search approval requests by request number, student, scholarship, or material"
									: "Search approved requests by request number, student, scholarship, material, or SOE download status"
							}
							value={soeSearch}
							onChange={(event) => setSoeSearch(event.target.value)}
						/>
					</div>
					{soeTab === "requesting" ? (
						<div className="admin-table-wrap">
							<table className="admin-management-table admin-management-table--roomy">
								<thead>
									<tr>
										<th>Request No.</th>
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
										requestingSoeRows.map((row) => (
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
					) : (
						<div className="admin-table-wrap">
							<table className="admin-management-table admin-management-table--roomy">
								<thead>
									<tr>
										<th>Request No.</th>
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
										requestedSoeRows.map((row) => (
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
									soeCheckingRows.map((row) => (
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
						<div className="admin-restriction-panel">
							<div className="admin-restriction-panel-head">
								<div>
									<h4>Restriction Control</h4>
									<p>
										Current state: <strong>{toRestrictionLabel(selectedStudentRestrictionMode)}</strong>
									</p>
								</div>
								<span className={toStatusClass(selectedStudent.recordStatus)}>{selectedStudent.recordStatus}</span>
							</div>
							{selectedStudent.archived === true ? (
								<div className="admin-student-alert">
									<div className="admin-student-warning-copy">
										<strong>Archived records are log-only.</strong>
										<span>Account access and scholarship restrictions are disabled until this student is unarchived.</span>
									</div>
									<HiOutlineSparkles />
								</div>
							) : isSelectedStudentPendingOnly ? (
								<div className="admin-student-alert">
									<div className="admin-student-warning-copy">
										<strong>Pending records are validation-only.</strong>
										<span>Validate this student first before applying restriction or archive actions.</span>
									</div>
									<HiOutlineSparkles />
								</div>
							) : (
								<>
									<div className="admin-restriction-grid">
										<label className={`admin-restriction-option ${studentRestrictionDraft === "account_access" ? "active" : ""}`}>
											<input
												type="checkbox"
												checked={studentRestrictionDraft === "account_access"}
												onChange={() => toggleStudentRestrictionDraft("account_access")}
											/>
											<div>
												<strong>Block Account Access</strong>
												<span>Prevent dashboard access while keeping scholarship data untouched.</span>
											</div>
										</label>
										<label className={`admin-restriction-option ${studentRestrictionDraft === "scholarship_eligibility" ? "active" : ""}`}>
											<input
												type="checkbox"
												checked={studentRestrictionDraft === "scholarship_eligibility"}
												onChange={() => toggleStudentRestrictionDraft("scholarship_eligibility")}
											/>
											<div>
												<strong>Block Scholarship Eligibility</strong>
												<span>Keep account access active but suspend scholarship eligibility.</span>
											</div>
										</label>
									</div>
									<p className="admin-detail-meta">Leave both options unchecked to keep or restore the student as unblocked.</p>
								</>
							)}
						</div>
						<div className="admin-detail-scholarships">
							<strong>Scholarships</strong>
							{selectedStudent.scholarships.length === 0 ? (
								<p className="dashboard-placeholder">No scholarship entries.</p>
							) : (
								selectedStudent.scholarships.map((scholarship) => (
									<div key={scholarship.id || `${scholarship.name}_${scholarship.provider}`} className="admin-detail-scholarship-row">
										<div>
											<p>{scholarship.name || scholarship.provider || "Scholarship"}</p>
											<span>{scholarship.status || "Saved"}</span>
										</div>
										{scholarship.adminBlocked ? <span className="admin-inline-chip">Blocked</span> : null}
									</div>
								))
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
										<button type="button" className="admin-safe-btn" disabled={isBusy || !hasStudentRestrictionChanges} onClick={saveStudentRestrictions}>
											<HiOutlineShieldCheck /> Save Restriction
										</button>
									)}
									<button type="button" className="admin-danger-btn admin-danger-btn--hard" disabled={isBusy} onClick={() => archiveStudent(selectedStudent.id)}>
										<HiOutlineTrash /> Archive Student
									</button>
								</>
							)}
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
												<span>{isSelectedSoeDownloadReview ? "SOE Request Number" : "Request Number"}</span>
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
										<button type="button" className="admin-table-btn" onClick={() => setSelectedSoeReviewId("")}>
											Close
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
