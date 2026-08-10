import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { read, utils } from "xlsx"
import { addDoc, collection, collectionGroup, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from "../services/supabaseDataService"
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
	HiOutlineArchive,
	HiOutlineBan,
	HiOutlineBell,
	HiOutlineChartBar,
	HiOutlineChartPie,
	HiOutlineClock,
	HiOutlineCloudUpload,
	HiOutlineDownload,
	HiOutlineDocumentText,
	HiOutlineExclamation,
	HiOutlineEye,
	HiOutlineHome,
	HiOutlineInbox,
	HiOutlineLogout,
	HiOutlineMenu,
	HiOutlineMoon,
	HiOutlineRefresh,
	HiOutlineSearch,
	HiOutlineCheckCircle,
	HiOutlineSparkles,
	HiOutlineSun,
	HiOutlineTrash,
	HiOutlineUserAdd,
	HiOutlineUserGroup,
	HiOutlineUsers,
	HiX,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { db } from "../services/supabaseDataService"
import { encryptPasswordAES256 } from "../services/authService"
import { GRANTOR_DEFAULT_PASSWORD } from "../constants/grantorAuth"
import logo2 from "../assets/logo2.png"
import "../css/AdminDashboard.css"
import "../css/StudentDashboard.css"
import TablePagination from "../components/TablePagination"
import { TABLE_PAGE_SIZE, paginateRows } from "../utils/tablePaginationUtils"
import useThemeMode from "../hooks/useThemeMode"
import { uploadToStorage } from "../services/storageService"
import { getStorageObjectBlob, normalizeStoragePublicUrl } from "../services/supabaseStorageService"
import { createAdminNotification, createGrantorNotification, createStudentNotification } from "../services/notificationService"
import { createGrantorScholarsWorkflow, materialRequestWorkflow, updateGrantorScholarsWorkflow } from "../services/workflowService"
import {
	buildApplicationDecisionConfirmation,
	canUseGrantorConfirmationForStep,
} from "../services/applicationDecisionConfirmationService"
import { checkAdminStudentDuplicates, matchAdminGrantorStudents } from "../services/adminMatchingService"
import {
	GRANTOR_SUBCOLLECTIONS,
	findScholarDuplicate,
	isAnnouncementArchived,
	matchesGrantorScholarToStudent,
	normalizeGrantorScholar,
} from "../services/grantorService"
import {
	downloadCsvReport,
	downloadStudentReport,
	exportComplianceReportPdf,
	exportScholarshipsReportPdf,
	exportSoeRequestsReportPdf,
	filterStudentRows,
	formatDate,
	mapScholarshipRows,
} from "../services/adminService"
import {
	getMaterialEntry,
	normalizeMaterialRequest,
	toMaterialLabel,
} from "../services/materialRequestService"
import {
	getDocumentUrlsForStudent,
	getCurrentSemesterTag,
	normalizeScholarshipList,
	validateScholarshipDocuments,
} from "../services/scholarshipService"
import { loadRecommendedScholarships } from "../services/recommendedScholarshipService"
import { collectOtherRequirementDocuments } from "../services/otherRequirementService"
import {
	completeScholarshipTrackingStep,
	getScholarshipTrackingProgress,
	getScholarshipTrackingStepBadgeLabel,
	getScholarshipTrackingStatusLabel,
} from "../services/scholarshipTrackingService"
import { convertPdfToImage } from "../utils/pdfConverter"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend)

const ADMIN_SECTIONS = [
	{ id: "dashboard", label: "Dashboard", icon: HiOutlineAcademicCap, path: "/admin/dashboard" },
	{ id: "inbox", label: "Inbox", icon: HiOutlineInbox, path: "/admin/inbox", topbarOnly: true },
	{ id: "notifications", label: "Notifications", icon: HiOutlineBell, path: "/admin/notifications", topbarOnly: true },
	{ id: "logs", label: "System Logs", icon: HiOutlineDocumentText, path: "/admin/logs", topbarOnly: true },
	{ id: "students", label: "Student Management", icon: HiOutlineUsers, path: "/admin/students" },
	{ id: "grantors", label: "Grantor Management", icon: HiOutlineUserGroup, path: "/admin/grantors" },
	{ id: "scholarships", label: "Scholarship Programs", icon: HiOutlineDocumentText, path: "/admin/scholarships" },
	{ id: "requirements", label: "Requirements", icon: HiOutlineCheckCircle, path: "/admin/requirements" },
	{ id: "announcements", label: "Announcements", icon: HiOutlineBell, path: "/admin/announcements" },
	{ id: "reports", label: "Report Generation", icon: HiOutlineChartBar, path: "/admin/reports" },
]

const TREND_RANGES = ["daily", "weekly", "monthly", "yearly"]
const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6
const COMPLIANCE_BLOCK_THRESHOLD = 2
const EMPTY_STATE_TEXT = "No results found matching your criteria."
const APPLICATION_REJECTION_REASONS = [
	"Incomplete Documents",
	"Information Mismatch",
	"Does Not Meet Requirements",
	"Duplicate Scholarship Application",
	"Outside Application Window",
	"Other",
]

const ADMIN_SCHOLAR_FORM = {
	grantorId: "",
	studentId: "",
	fname: "",
	mname: "",
	lname: "",
	email: "",
	cpNumber: "",
	street: "",
	city: "",
	province: "",
	barangay: "",
	postalCode: "",
	course: "",
	yearLevel: "1",
	scholarshipTitle: "",
	status: "Active",
	notes: "",
}

const ADMIN_IMPORT_FIELD_ALIASES = {
	studentId: ["student id", "student number", "student no", "student no.", "id"],
	fullName: ["full name", "student name", "name", "scholar name"],
	fname: ["first name", "fname"],
	mname: ["middle name", "mname"],
	lname: ["last name", "lname", "surname"],
	email: ["email", "email address"],
	cpNumber: ["contact number", "cp number", "phone", "mobile number"],
	street: ["street", "street/subdivision", "street / subdivision", "address"],
	barangay: ["barangay", "baranggay"],
	city: ["city", "municipality", "city/municipality", "city / municipality"],
	province: ["province"],
	postalCode: ["postal code", "zip code"],
	course: ["course", "program"],
	yearLevel: ["year", "year level"],
	scholarshipTitle: ["scholarship", "scholarship title", "program", "program name"],
	status: ["status"],
	notes: ["notes", "remarks"],
}

const ADMIN_IMPORT_MAPPABLE_FIELDS = [
	{ value: "studentId", label: "Student ID" },
	{ value: "fullName", label: "Full Name" },
	{ value: "fname", label: "First Name" },
	{ value: "mname", label: "Middle Name" },
	{ value: "lname", label: "Last Name" },
	{ value: "email", label: "Email Address" },
	{ value: "cpNumber", label: "Contact Number" },
	{ value: "course", label: "Course" },
	{ value: "yearLevel", label: "Year Level" },
	{ value: "scholarshipTitle", label: "Scholarship / Program" },
	{ value: "street", label: "Street / Subdivision" },
	{ value: "barangay", label: "Barangay" },
	{ value: "city", label: "City / Municipality" },
	{ value: "province", label: "Province" },
	{ value: "postalCode", label: "Postal Code" },
	{ value: "status", label: "Status" },
	{ value: "notes", label: "Notes" },
]

function toNumericValue(value, fallback = null) {
	const parsed = Number.parseFloat(value)
	return Number.isNaN(parsed) ? fallback : parsed
}

function isGrantorApplicationOpen(raw = {}) {
	if (raw.applicationsBlocked === true) return false
	if (raw.applyOpen === true || raw.applicationOpen === true || raw.applicationsOpen === true) return true
	if (raw.applyOpen === false || raw.applicationOpen === false || raw.applicationsOpen === false) return false
	return true
}

const GRANTOR_COLORS = {
	kuya_win: "#0f766e",
	tina_pancho: "#1d4ed8",
	morisson: "#dc2626",
	other: "#7c3aed",
	none: "#f59e0b",
}

function mergeGrantorScholarRows(rows = []) {
	const grouped = new Map()

	rows.forEach((row) => {
		const groupKey =
			row.studentRecordId ||
			`${String(row.studentId || "").toLowerCase()}::${String(row.fullName || "").toLowerCase()}`
		if (!grouped.has(groupKey)) {
			grouped.set(groupKey, {
				...row,
				trackingKey: row.trackingKey || groupKey,
				scholarshipNames: new Set(row.scholarship ? [row.scholarship] : []),
				grantorNames: new Set(row.grantorName ? [row.grantorName] : []),
			})
			return
		}

		const existing = grouped.get(groupKey)
		if (row.scholarship) existing.scholarshipNames.add(row.scholarship)
		if (row.grantorName) existing.grantorNames.add(row.grantorName)
		if (!existing.studentRecordId && row.studentRecordId) existing.studentRecordId = row.studentRecordId
	})

	return [...grouped.values()].map((row) => ({
		...row,
		scholarship: [...row.scholarshipNames].join(", ") || "-",
		grantorName: [...row.grantorNames].join(", ") || "-",
	}))
}

function toSectionFromPath(pathname) {
	if (pathname.startsWith("/admin/soe-requests") || pathname.startsWith("/admin/soe-checking")) return "requirements"
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

function buildGrantorIdFromFirstName(value = "") {
	const fname = String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
	return fname ? `grantor_${fname}` : ""
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

function getGrantorScholarProgramName(scholar = {}) {
	return String(scholar.scholarshipTitle || scholar.scholarshipName || scholar.programName || "").trim()
}

function normalizeAdminImportHeader(value = "") {
	return String(value || "")
		.trim()
		.toLowerCase()
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
}

function fieldFromAdminImportHeader(header = "") {
	const normalized = normalizeAdminImportHeader(header)
	return (
		Object.entries(ADMIN_IMPORT_FIELD_ALIASES).find(([, aliases]) =>
			aliases.some((alias) => normalizeAdminImportHeader(alias) === normalized),
		)?.[0] || ""
	)
}

function splitAdminScholarName(record = {}) {
	const existingParts = [record.fname, record.mname, record.lname].filter(Boolean)
	if (existingParts.length > 0) {
		return {
			fname: String(record.fname || "").trim(),
			mname: String(record.mname || "").trim(),
			lname: String(record.lname || "").trim(),
		}
	}
	const parts = String(record.fullName || record.studentName || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
	return {
		fname: parts[0] || "",
		mname: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
		lname: parts.length > 1 ? parts[parts.length - 1] : "",
	}
}

function normalizeStudentIdKey(value = "") {
	return String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "")
}

function buildAdminScholarPayloadFromStudentAccount(student = {}, fallback = {}) {
	const nameParts = splitAdminScholarName(student)
	const studentId = String(student.id || student.studentId || student.studentnumber || student.studentNumber || fallback.studentId || "").trim()
	return {
		...fallback,
		studentId,
		fname: nameParts.fname || fallback.fname || "",
		mname: nameParts.mname || fallback.mname || "",
		lname: nameParts.lname || fallback.lname || "",
		fullName:
			student.fullName ||
			[nameParts.fname, nameParts.mname, nameParts.lname].filter(Boolean).join(" ").trim() ||
			fallback.fullName ||
			"Scholar",
		email: student.email || fallback.email || "",
		cpNumber: student.cpNumber || student.contactNumber || student.phoneNumber || fallback.cpNumber || "",
		street: student.street || student.address || fallback.street || "",
		city: student.city || fallback.city || "",
		province: student.province || fallback.province || "",
		barangay: student.barangay || fallback.barangay || "",
		postalCode: student.postalCode || student.zipCode || fallback.postalCode || "",
		course: student.course || student.program || fallback.course || "",
		yearLevel: String(student.yearLevel || student.year || fallback.yearLevel || "1"),
	}
}

function buildAdminDuplicateScholarshipWarningRecord({ row = {}, payload = {}, duplicate = null } = {}) {
	const matched = duplicate?.record || {}
	const studentId = payload.studentId || row.studentId || matched.studentId || matched.studentnumber || ""
	const studentName =
		payload.fullName ||
		row.fullName ||
		[payload.fname, payload.mname, payload.lname].filter(Boolean).join(" ").trim() ||
		matched.fullName ||
		"Student"
	const newGrantorName = payload.grantorName || payload.providerType || payload.grantorId || "Selected grantor"
	const existingGrantorName = matched.grantorName || matched.providerName || matched.providerType || matched.grantorId || "another grantor"
	return {
		studentId,
		title: "Duplicate Scholarship Warning",
		message: `${studentName} was blocked from being added to ${newGrantorName} because the student already appears under ${existingGrantorName}.`,
		type: "duplicate_scholarship_detected",
		warningType: "duplicate_scholarship",
		source: "admin_roster_add_prevention",
		notificationFallbackTable: "student_warnings",
		studentName,
		newGrantorId: payload.grantorId || "",
		newGrantorName,
		matchedGrantorId: matched.grantorId || matched.parentId || "",
		matchedGrantorName: existingGrantorName,
		matchedScholarId: matched.id || "",
		matchedStudentId: matched.studentId || matched.studentnumber || "",
		matchedStudentName: matched.fullName || [matched.fname, matched.mname, matched.lname].filter(Boolean).join(" ").trim(),
		similarityScore: duplicate?.score ?? duplicate?.evaluation?.score ?? "",
		reasons: duplicate?.reasons || duplicate?.evaluation?.reasons || [],
		rowNumber: row.rowNumber || "",
		read: false,
		archived: false,
		createdAt: serverTimestamp(),
		updatedAt: serverTimestamp(),
	}
}

function buildAdminScholarPayload(form = {}, grantor = {}) {
	const nameParts = splitAdminScholarName(form)
	const grantorName = buildGrantorName(grantor) || form.grantorName || "Grantor"
	const providerType = grantor.providerType || toProviderType(grantorName || grantor.id)
	return {
		studentId: String(form.studentId || "").trim(),
		fname: String(nameParts.fname || "").trim(),
		mname: String(nameParts.mname || "").trim(),
		lname: String(nameParts.lname || "").trim(),
		fullName: [nameParts.fname, nameParts.mname, nameParts.lname].filter(Boolean).join(" ").trim(),
		email: String(form.email || "").trim(),
		cpNumber: String(form.cpNumber || "").trim(),
		street: String(form.street || "").trim(),
		city: String(form.city || "").trim(),
		province: String(form.province || "").trim(),
		barangay: String(form.barangay || "").trim(),
		postalCode: String(form.postalCode || "").trim(),
		course: String(form.course || "").trim(),
		yearLevel: String(form.yearLevel || "1").trim(),
		scholarshipTitle: String(form.scholarshipTitle || grantorName || "Scholarship").trim(),
		status: String(form.status || "Active").trim(),
		notes: String(form.notes || "").trim(),
		archived: false,
		grantorId: grantor.id || form.grantorId || "",
		grantorName,
		providerType,
		addedBy: "admin",
		addedByRole: "admin",
		addedByAdmin: true,
		source: "admin_roster_add",
	}
}

function buildGrantorScholarAddress(scholar = {}) {
	return [scholar.street, scholar.barangay, scholar.city, scholar.province, scholar.postalCode]
		.filter(Boolean)
		.join(" ")
		.trim()
}

function buildGrantorName(grantor = {}) {
	return (
		[grantor.fname, grantor.mname, grantor.lname].filter(Boolean).join(" ").trim() ||
		grantor.providerName ||
		grantor.name ||
		grantor.grantorName ||
		""
	)
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

function formatRelativeTime(value) {
	const date = toJsDate(value)
	if (!date) return "Recently"
	const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
	if (seconds < 60) return "Just now"
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
	const days = Math.floor(hours / 24)
	if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`
	return formatDate(date)
}

function toAdminNotificationTitle(item = {}) {
	if (item.title) return item.title
	const action = String(item.action || item.type || "System activity").replace(/[_-]+/g, " ").trim()
	return action ? action.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "System Activity"
}

function toAdminNotificationMessage(item = {}) {
	if (item.message) return item.message
	if (typeof item.details === "string") return item.details
	if (item.details && typeof item.details === "object") {
		return Object.entries(item.details)
			.slice(0, 3)
			.map(([key, value]) => `${key.replace(/[_-]+/g, " ")}: ${String(value)}`)
			.join(" | ")
	}
	return "A new activity was recorded in BulsuScholar."
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
	return [...new Set(
		scholarships
			.map((entry) => entry?.name || entry?.provider || "Scholarship")
			.filter(Boolean),
	)]
}

function getStudentRestrictionState(student) {
	const scholarshipEligibility =
		student?.scholarshipConflictWarning === true ||
		student?.scholarshipRestrictionReason === "multiple_scholarships"
	return { accountAccess: false, scholarshipEligibility }
}

function toStudentLifecycle(student) {
	if (student?.archived === true) return "archived"
	return "students"
}

function toDisplayStudentId(value = "") {
	return String(value || "-").replace(/^roster_/, "") || "-"
}

function toGrantorStatus(grantor = {}) {
	if (grantor?.archived === true) return "Archived"
	if (grantor?.passwordChangeRequested === true || grantor?.passwordChangeRequestStatus === "pending") {
		return "Password Requested"
	}
	return grantor?.status || "Active"
}

function buildGrantorReportRow(grantor = {}) {
	return {
		id: grantor.id || "-",
		name: buildGrantorName(grantor) || "-",
		email: grantor.email || "-",
		organization: grantor.organization || "-",
		providerType: grantor.providerType || toProviderType(grantor.providerName || grantor.name || ""),
		totalScholars: Number(grantor.totalScholars || 0),
		status: toGrantorStatus(grantor),
		createdAt: formatDate(grantor.createdAt),
	}
}

function toReviewStateLabel(value = "") {
	const normalized = String(value).toLowerCase()
	if (normalized === "signed") return "Approved"
	if (normalized === "non_compliant") return "Rejected"
	if (normalized === "incoming") return "Pending Approval"
	return value || "Pending Approval"
}

function toMaterialStateLabel(status = "") {
	const normalized = String(status).toLowerCase()
	if (normalized === "approved") return "Approved"
	if (normalized === "rejected") return "Rejected"
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
	if (normalized.rejectedMaterialKeys.length > 0) return "Rejected"
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

function toStudentReportRow(student) {
	const restrictionState = student.restrictionState || getStudentRestrictionState(student)
	return {
		id: toDisplayStudentId(student.studentId || student.id),
		fullName: student.fullName || studentFullName(student),
		course: student.course || "-",
		yearLevel: student.year || student.yearLevel || "-",
		gwa: student.gwa || student.currentGwa || student.currentGWA || "-",
		grantor: student.grantorName || student.providerName || (student.providerType ? toProviderLabel(student.providerType) : "N/A"),
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

function toScholarshipWarningReportRow(row) {
	return {
		studentId: row.studentId || "-",
		fullName: row.fullName || "-",
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

function getInitials(value = "") {
	const parts = String(value || "").trim().split(/\s+/).filter(Boolean)
	if (parts.length === 0) return "ST"
	return `${parts[0]?.[0] || ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : parts[0]?.[1] || ""}`.toUpperCase()
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

function AdminFilterSelect({ label, value, options, onChange }) {
	const [isOpen, setIsOpen] = useState(false)
	const selectRef = useRef(null)
	const currentLabel = options.find((option) => option.value === value)?.label || value

	useEffect(() => {
		if (!isOpen) return undefined
		const closeOnOutsideClick = (event) => {
			if (!selectRef.current?.contains(event.target)) setIsOpen(false)
		}
		document.addEventListener("mousedown", closeOnOutsideClick)
		return () => document.removeEventListener("mousedown", closeOnOutsideClick)
	}, [isOpen])

	return (
		<div className="admin-filter-select" ref={selectRef}>
			<button
				type="button"
				className={`admin-filter-select__button ${isOpen ? "active" : ""}`}
				onClick={() => setIsOpen((open) => !open)}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				aria-label={label}
			>
				<span>{currentLabel}</span>
			</button>
			{isOpen ? (
				<div className="admin-filter-select__menu" role="listbox" aria-label={label}>
					{options.map((option) => (
						<button
							key={option.value}
							type="button"
							className={option.value === value ? "active" : ""}
							role="option"
							aria-selected={option.value === value}
							onClick={() => {
								onChange(option.value)
								setIsOpen(false)
							}}
						>
							{option.label}
						</button>
					))}
				</div>
			) : null}
		</div>
	)
}

export default function AdminDashboard() {
	const navigate = useNavigate()
	const location = useLocation()
	const { theme, setTheme } = useThemeMode()
	const activeSection = toSectionFromPath(location.pathname)

	const [studentsRaw, setStudentsRaw] = useState([])
	const [providersRaw, setProvidersRaw] = useState([])
	const [applicationsRaw, setApplicationsRaw] = useState([])
	const [soeRequests, setSoeRequests] = useState([])
	const [soeDownloads, setSoeDownloads] = useState([])
	const [announcements, setAnnouncements] = useState([])
	const [grantorAnnouncementsRaw, setGrantorAnnouncementsRaw] = useState([])
	const [grantorScholarsRaw, setGrantorScholarsRaw] = useState([])
	const [grantorScholarStudentRecordLookup, setGrantorScholarStudentRecordLookup] = useState(new Map())
	const [dataLoadState, setDataLoadState] = useState({
		students: false,
		providers: false,
		applications: false,
		soe: false,
		soeDownloads: false,
		announcements: false,
		grantorScholars: false,
	})

	const [studentSearch, setStudentSearch] = useState("")
	const [selectedStudentIds, setSelectedStudentIds] = useState([])
	const [studentCourse, setStudentCourse] = useState("All")
	const [studentYear, setStudentYear] = useState("All")
	const [studentViewTab, setStudentViewTab] = useState("students")
	const [studentArchiveTrendRange, setStudentArchiveTrendRange] = useState("monthly")
	const [selectedStudentId, setSelectedStudentId] = useState("")
	const [selectedScholarshipTrackingKey, setSelectedScholarshipTrackingKey] = useState("")
	const [selectedStudentRecommendations, setSelectedStudentRecommendations] = useState([])
	const [selectedStudentRecommendationsLoading, setSelectedStudentRecommendationsLoading] = useState(false)
	const [recommendingScholarshipId, setRecommendingScholarshipId] = useState("")
	const [adminRejectModalOpen, setAdminRejectModalOpen] = useState(false)
	const [adminRejectReason, setAdminRejectReason] = useState(APPLICATION_REJECTION_REASONS[0])
	const [adminRejectNotes, setAdminRejectNotes] = useState("")
	const [soeRejectModalRow, setSoeRejectModalRow] = useState(null)
	const [soeRejectReason, setSoeRejectReason] = useState(APPLICATION_REJECTION_REASONS[0])
	const [soeRejectNotes, setSoeRejectNotes] = useState("")
	const [adminStudentDuplicateAudit, setAdminStudentDuplicateAudit] = useState({ duplicateIds: [], groups: [] })
	const [previewDocument, setPreviewDocument] = useState(null)
	const [previewBlobUrl, setPreviewBlobUrl] = useState("")
	const [isPreviewLoading, setIsPreviewLoading] = useState(false)

	const [grantorTab, setGrantorTab] = useState("grantors")
	const [grantorSearch, setGrantorSearch] = useState("")
	const [selectedGrantorIds, setSelectedGrantorIds] = useState([])
	const [selectedGrantorId, setSelectedGrantorId] = useState("")
	const [showGrantorModal, setShowGrantorModal] = useState(false)
	const [grantorForm, setGrantorForm] = useState({
		id: "",
		fname: "",
		mname: "",
		lname: "",
		email: "",
		organization: "",
	})
	const [isCreatingGrantor, setIsCreatingGrantor] = useState(false)

	const [scholarshipProvider, setScholarshipProvider] = useState("All")
	const [scholarshipSearch, setScholarshipSearch] = useState("")
	const [scholarshipTab, setScholarshipTab] = useState("scholars")
	const [selectedScholarshipScholarKeys, setSelectedScholarshipScholarKeys] = useState([])
	const [selectedScholarshipWarningKey, setSelectedScholarshipWarningKey] = useState("")
	const [scholarshipGrantorHoverId, setScholarshipGrantorHoverId] = useState("")
	const [grantorScholarTrendRange, setGrantorScholarTrendRange] = useState("monthly")
	const [grantorDistributionHoverId, setGrantorDistributionHoverId] = useState("")
	const [adminScholarModalOpen, setAdminScholarModalOpen] = useState(false)
	const [adminScholarForm, setAdminScholarForm] = useState(ADMIN_SCHOLAR_FORM)
	const [adminScholarImportRows, setAdminScholarImportRows] = useState([])
	const [adminScholarImportHeaders, setAdminScholarImportHeaders] = useState([])
	const [adminScholarColumnMapping, setAdminScholarColumnMapping] = useState([])
	const [selectedAdminScholarImportRows, setSelectedAdminScholarImportRows] = useState([])
	const [highlightedAdminScholarGrantorRows, setHighlightedAdminScholarGrantorRows] = useState([])
	const [adminScholarImportGrantorAssignments, setAdminScholarImportGrantorAssignments] = useState({})
	const [adminScholarImportFile, setAdminScholarImportFile] = useState(null)
	const [adminScholarImportWarnings, setAdminScholarImportWarnings] = useState([])

	const [applicantTrendRange, setApplicantTrendRange] = useState("monthly")
	const [soeTrendRange, setSoeTrendRange] = useState("monthly")
	const [soeSearch, setSoeSearch] = useState("")
	const [soeTab, setSoeTab] = useState("requesting")
	const [soeProviderFilter, setSoeProviderFilter] = useState("All")
	const [soeMaterialFilter, setSoeMaterialFilter] = useState("All")
	const [soeResetByStudent, setSoeResetByStudent] = useState({})

	const [soeCheckSearch, setSoeCheckSearch] = useState("")
	const [soeCheckingTab, setSoeCheckingTab] = useState("current")
	const [selectedSoeReviewId, setSelectedSoeReviewId] = useState("")
	const [adminConfirmDialog, setAdminConfirmDialog] = useState(null)
	const [tablePages, setTablePages] = useState({})

	const [reportPreview, setReportPreview] = useState(null)
	const [reportExportFormat, setReportExportFormat] = useState("pdf")
	const [exportTopStudentsPerGrantor, setExportTopStudentsPerGrantor] = useState(false)
	const [isReportExporting, setIsReportExporting] = useState(false)

	const [announcementTitle, setAnnouncementTitle] = useState("")
	const [announcementDescription, setAnnouncementDescription] = useState("")
	const [announcementType, setAnnouncementType] = useState("Update")
	const [announcementImageFiles, setAnnouncementImageFiles] = useState([])
	const [announcementDraftPreviews, setAnnouncementDraftPreviews] = useState([])
	const [announcementImagePreview, setAnnouncementImagePreview] = useState("")
	const [announcementImageZoom, setAnnouncementImageZoom] = useState(1)
	const [announcementStartDate, setAnnouncementStartDate] = useState("")
	const [announcementEndDate, setAnnouncementEndDate] = useState("")
	const [showAnnouncementSchedule, setShowAnnouncementSchedule] = useState(false)
	const [showCreateAdminAnnouncementModal, setShowCreateAdminAnnouncementModal] = useState(false)
	const [selectedAdminAnnouncement, setSelectedAdminAnnouncement] = useState(null)
	const [showAllAdminAnnouncements, setShowAllAdminAnnouncements] = useState(false)
	const [adminAnnouncementTab, setAdminAnnouncementTab] = useState("announcements")
	const [adminAnnouncementSourceFilter, setAdminAnnouncementSourceFilter] = useState("all")
	const [announcementCalendarMonth, setAnnouncementCalendarMonth] = useState(() => {
		const now = new Date()
		return new Date(now.getFullYear(), now.getMonth(), 1)
	})
	const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false)
	const [isBusy, setIsBusy] = useState(false)
	const [adminNotifications, setAdminNotifications] = useState([])
	const [systemLogs, setSystemLogs] = useState([])
	const [notificationSearch, setNotificationSearch] = useState("")
	const [notificationFilter, setNotificationFilter] = useState("inbox")
	const [selectedAdminNotificationIds, setSelectedAdminNotificationIds] = useState([])
	const [logSearch, setLogSearch] = useState("")
	const [logTypeFilter, setLogTypeFilter] = useState("all")
	const [logActorFilter, setLogActorFilter] = useState("all")
	const [logDateFrom, setLogDateFrom] = useState("")
	const [logDateTo, setLogDateTo] = useState("")
	const [adminMenuOpen, setAdminMenuOpen] = useState(false)
	const adminMenuRef = useRef(null)

	const setTablePage = useCallback((tableKey, page) => {
		setTablePages((prev) => ({ ...prev, [tableKey]: page }))
	}, [])

	useEffect(() => {
		const storedType = sessionStorage.getItem("bulsuscholar_userType")
		if (storedType !== "admin") navigate("/", { replace: true })
	}, [navigate])

	useEffect(() => {
		const unsubscribeLogs = onSnapshot(
			collection(db, "systemLogs"),
			(snapshot) => {
				const rows = snapshot.docs.map((item) => ({ id: item.id, sourceTable: "systemLogs", ...(item.data() || {}) }))
				setAdminNotifications(
					rows
						.filter((item) => item.notificationFallbackTable === "adminNotifications")
						.sort((left, right) => {
							const leftDate = toJsDate(left.createdAt || left.created_at || left.timestamp)?.getTime() || 0
							const rightDate = toJsDate(right.createdAt || right.created_at || right.timestamp)?.getTime() || 0
							return rightDate - leftDate
						}),
				)
				setSystemLogs(
					rows
						.filter((item) => item.notificationFallbackTable !== "adminNotifications")
						.sort((left, right) => {
							const leftDate = toJsDate(left.createdAt || left.created_at || left.timestamp)?.getTime() || 0
							const rightDate = toJsDate(right.createdAt || right.created_at || right.timestamp)?.getTime() || 0
							return rightDate - leftDate
						}),
				)
			},
			(error) => {
				console.error("Unable to load backend system logs.", error)
				setSystemLogs([])
				setAdminNotifications([])
			},
		)
		return unsubscribeLogs
	}, [])

	useEffect(() => {
		const handleOutsideClick = (event) => {
			if (adminMenuRef.current && !adminMenuRef.current.contains(event.target)) setAdminMenuOpen(false)
		}
		document.addEventListener("mousedown", handleOutsideClick)
		return () => document.removeEventListener("mousedown", handleOutsideClick)
	}, [])

	useEffect(() => {
		setSelectedStudentIds([])
	}, [studentViewTab])

	useEffect(() => {
		setSelectedGrantorIds([])
	}, [grantorTab])

	useEffect(() => {
		if (grantorTab === "overview") setGrantorTab("grantors")
	}, [grantorTab])

	useEffect(() => {
		const getAdminTableColumnWidth = (header = "", headerCell = null) => {
			const text = String(header || "").replace(/\s+/g, " ").trim()
			if (headerCell?.querySelector?.("input[type='checkbox']") || !text) return 48
			const normalized = text.toLowerCase()
			if (normalized.includes("action")) return 122
			if (normalized.includes("status")) return 128
			if (normalized === "gwa" || normalized.includes("year level") || normalized === "year") return 92
			if (normalized.includes("date")) return 142
			if (normalized.includes("application no")) return 142
			if (normalized.includes("student id") || normalized.includes("grantor id")) return 132
			const measured = Math.ceil(text.length * 8.5 + 46)
			return Math.max(96, Math.min(measured, 190))
		}

		const applyAdminTableColumnWidths = () => {
			document.querySelectorAll(".admin-portal table").forEach((table) => {
				const headerRow = table.tHead?.rows?.[0]
				if (!headerRow) return
				const headers = Array.from(headerRow.cells).filter((cell) => Number(cell.colSpan || 1) === 1)
				if (!headers.length) return
				let totalWidth = 0
				headers.forEach((headerCell, index) => {
					const width = getAdminTableColumnWidth(headerCell.textContent, headerCell)
					totalWidth += width
					headerCell.style.width = `${width}px`
					headerCell.style.minWidth = `${width}px`
					headerCell.style.maxWidth = `${width}px`
					Array.from(table.rows).forEach((row) => {
						const cell = row.cells?.[index]
						if (!cell || Number(cell.colSpan || 1) !== 1) return
						cell.style.width = `${width}px`
						cell.style.minWidth = `${width}px`
						cell.style.maxWidth = `${width}px`
					})
				})
				table.style.minWidth = `${Math.max(totalWidth, table.parentElement?.clientWidth || totalWidth)}px`
			})
		}

		const applyAdminTableTooltips = () => {
			applyAdminTableColumnWidths()
			document
				.querySelectorAll(
					".admin-portal table th, .admin-portal table td",
				)
				.forEach((cell) => {
					const text = String(cell.textContent || "").replace(/\s+/g, " ").trim()
					if (!text || cell.querySelector("button, input, select, textarea")) {
						if (cell.dataset.autoTooltip === "true") {
							cell.removeAttribute("title")
							delete cell.dataset.autoTooltip
						}
						return
					}
					const isClipped = cell.scrollWidth > cell.clientWidth || cell.scrollHeight > cell.clientHeight
					if (isClipped) {
						cell.setAttribute("title", text)
						cell.dataset.autoTooltip = "true"
					} else if (cell.dataset.autoTooltip === "true") {
						cell.removeAttribute("title")
						delete cell.dataset.autoTooltip
					}
				})
		}
		const frame = requestAnimationFrame(applyAdminTableTooltips)
		const timeout = setTimeout(applyAdminTableTooltips, 120)
		window.addEventListener("resize", applyAdminTableTooltips)
		return () => {
			cancelAnimationFrame(frame)
			clearTimeout(timeout)
			window.removeEventListener("resize", applyAdminTableTooltips)
		}
	})

	useEffect(() => {
		if (location.pathname === "/admin" || location.pathname === "/admin/") {
			navigate("/admin/dashboard", { replace: true })
		}
	}, [location.pathname, navigate])

	const unreadAdminNotifications = useMemo(
		() => adminNotifications.filter((item) => item.read !== true && item.archived !== true),
		[adminNotifications],
	)

	const visibleAdminNotifications = useMemo(() => {
		const keyword = notificationSearch.trim().toLowerCase()
		return adminNotifications.filter((item) => {
			const archived = item.archived === true
			if (notificationFilter === "inbox" && archived) return false
			if (notificationFilter === "unread" && (archived || item.read === true)) return false
			if (notificationFilter === "read" && (archived || item.read !== true)) return false
			if (notificationFilter === "archived" && !archived) return false
			if (!keyword) return true
			return `${toAdminNotificationTitle(item)} ${toAdminNotificationMessage(item)} ${item.type || ""}`.toLowerCase().includes(keyword)
		})
	}, [adminNotifications, notificationFilter, notificationSearch])

	const logTypeOptions = useMemo(
		() => [...new Set(systemLogs.map((item) => String(item.action || item.type || "system")).filter(Boolean))].sort(),
		[systemLogs],
	)

	const logActorOptions = useMemo(
		() => [...new Set(systemLogs.map((item) => String(item.actorType || "system")).filter(Boolean))].sort(),
		[systemLogs],
	)

	const visibleSystemLogs = useMemo(() => {
		const keyword = logSearch.trim().toLowerCase()
		const fromDate = logDateFrom ? startOfDay(logDateFrom) : null
		const toDate = logDateTo ? endOfDay(logDateTo) : null
		return systemLogs.filter((item) => {
			const action = String(item.action || item.type || "system")
			const actorType = String(item.actorType || "system")
			const createdDate = toJsDate(item.createdAt || item.created_at || item.timestamp)
			if (logTypeFilter !== "all" && action !== logTypeFilter) return false
			if (logActorFilter !== "all" && actorType !== logActorFilter) return false
			if (fromDate && (!createdDate || createdDate < fromDate)) return false
			if (toDate && (!createdDate || createdDate > toDate)) return false
			if (!keyword) return true
			return `${action} ${actorType} ${item.actorId || ""} ${item.target || ""} ${toAdminNotificationMessage(item)}`.toLowerCase().includes(keyword)
		})
	}, [logActorFilter, logDateFrom, logDateTo, logSearch, logTypeFilter, systemLogs])

	const markAdminNotificationRead = useCallback(async (notification) => {
		if (!notification?.id || notification.read === true) return
		try {
			await setDoc(doc(db, notification.sourceTable || "adminNotifications", notification.id), { read: true, readAt: new Date().toISOString() }, { merge: true })
		} catch (error) {
			console.error("Unable to mark administrator notification as read.", error)
			toast.error("Unable to update this inbox message.")
		}
	}, [])

	const markAllAdminNotificationsRead = useCallback(async () => {
		if (unreadAdminNotifications.length === 0) return
		try {
			await Promise.all(
				unreadAdminNotifications.map((notification) =>
					setDoc(doc(db, notification.sourceTable || "adminNotifications", notification.id), { read: true, readAt: new Date().toISOString() }, { merge: true }),
				),
			)
			toast.success("All admin inbox messages are marked as read.")
		} catch (error) {
			console.error("Unable to mark all administrator notifications as read.", error)
			toast.error("Unable to update the administrator inbox.")
		}
	}, [unreadAdminNotifications])

	const archiveAdminNotifications = useCallback(async (notifications = []) => {
		const rows = notifications.filter((item) => item?.id)
		if (rows.length === 0) return
		try {
			await Promise.all(
				rows.map((notification) =>
					setDoc(doc(db, notification.sourceTable || "adminNotifications", notification.id), { archived: true, archivedAt: new Date().toISOString(), read: true }, { merge: true }),
				),
			)
			setSelectedAdminNotificationIds([])
			toast.success(`${rows.length} notification${rows.length === 1 ? "" : "s"} archived.`)
		} catch (error) {
			console.error("Unable to archive administrator notifications.", error)
			toast.error("Unable to archive the selected notifications.")
		}
	}, [])

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
				collection(db, "providers"),
				(snap) => {
					setProvidersRaw(snap.docs.map((row) => ({ id: row.id, ...(row.data() || {}) })))
					markLoaded("providers")
				},
				() => markLoaded("providers"),
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
				collectionGroup(db, GRANTOR_SUBCOLLECTIONS.announcements),
				(snap) => {
					setGrantorAnnouncementsRaw(
						snap.docs
							.map((row) => {
								const raw = row.data() || {}
								return {
									id: row.id,
									...raw,
									grantorId: raw.grantorId || row.ref.parent?.parent?.id || "",
								}
							})
							.sort((a, b) => (toJsDate(b.createdAt || b.updatedAt)?.getTime() || 0) - (toJsDate(a.createdAt || a.updatedAt)?.getTime() || 0)),
					)
				},
				() => setGrantorAnnouncementsRaw([]),
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

	const allStudentsRaw = useMemo(
		() => studentsRaw.map((student) => ({ ...student, sourceCollection: "students" })),
		[studentsRaw],
	)

	const studentAccountProfiles = useMemo(
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
					recordStatus: student.archived === true ? "Archived" : "Active",
				}
			}),
		[allStudentsRaw],
	)

	const rosterPendingStudentProfiles = useMemo(() => {
		const accountByStudentId = new Map(
			studentAccountProfiles.map((student) => [normalizeGrantorScholarLookupValue(student.id), student]),
		)
		const pendingRows = new Map()

		grantorScholarsRaw.forEach((scholar) => {
			const scholarStudentId = normalizeGrantorScholarLookupValue(scholar.studentId)
			const matchedAccount =
				(scholarStudentId && accountByStudentId.get(scholarStudentId)) ||
				studentAccountProfiles.find((student) => matchesGrantorScholarToStudent(student, scholar))

			if (matchedAccount) return

			const fullName = buildGrantorScholarFullName(scholar)
			const pendingKey =
				scholarStudentId ||
				normalizeGrantorScholarLookupValue(fullName) ||
				`${scholar.grantorId || scholar.providerType || "grantor"}_${scholar.id}`

			if (pendingRows.has(pendingKey)) return

			pendingRows.set(pendingKey, {
				id: `roster_${pendingKey}`,
				studentId: scholar.studentId || "-",
				fname: scholar.fname || "",
				mname: scholar.mname || "",
				lname: scholar.lname || "",
				fullName,
				email: scholar.email || "",
				cpNumber: scholar.cpNumber || "",
				street: scholar.street || "",
				city: scholar.city || "",
				province: scholar.province || "",
				barangay: scholar.barangay || "",
				postalCode: scholar.postalCode || "",
				course: scholar.course || "-",
				year: scholar.yearLevel || "-",
				yearLevel: scholar.yearLevel || "-",
				scholarships: [],
				restrictionState: { accountAccess: false, scholarshipEligibility: false },
				sourceCollection: "grantorRoster",
				rosterScholarId: scholar.id,
				grantorId: scholar.grantorId || "",
				providerType: scholar.providerType || "",
				archived: scholar.archived === true,
				recordStatus: scholar.archived === true ? "Archived" : "Pending",
				createdAt: scholar.createdAt || null,
				updatedAt: scholar.updatedAt || null,
			})
		})

		return [...pendingRows.values()]
	}, [grantorScholarsRaw, studentAccountProfiles])

	const studentProfiles = useMemo(
		() => [...studentAccountProfiles, ...rosterPendingStudentProfiles],
		[rosterPendingStudentProfiles, studentAccountProfiles],
	)

	useEffect(() => {
		if (studentProfiles.length < 2) {
			setAdminStudentDuplicateAudit({ duplicateIds: [], groups: [] })
			return undefined
		}

		let active = true
		checkAdminStudentDuplicates(studentProfiles)
			.then((result) => {
				if (!active) return
				setAdminStudentDuplicateAudit({
					duplicateIds: Array.isArray(result.duplicateIds) ? result.duplicateIds : [],
					groups: Array.isArray(result.groups) ? result.groups : [],
					algorithm: result.algorithm || "",
				})
			})
			.catch((error) => {
				console.warn("Python admin duplicate audit unavailable. Showing unfiltered student rows.", error)
				if (active) setAdminStudentDuplicateAudit({ duplicateIds: [], groups: [] })
			})

		return () => {
			active = false
		}
	}, [studentProfiles])

	const uniqueStudentProfiles = useMemo(() => {
		const duplicateIds = new Set(adminStudentDuplicateAudit.duplicateIds || [])
		return studentProfiles.filter((student) => !duplicateIds.has(student.id))
	}, [adminStudentDuplicateAudit.duplicateIds, studentProfiles])

	const baseStudentRows = useMemo(
		() =>
			uniqueStudentProfiles.map((student) => ({
				id: student.id || "-",
				fullName: student.fullName || studentFullName(student),
				email: student.email || "",
				fname: student.fname || "",
				scholarships: Array.isArray(student.scholarships) ? student.scholarships : [],
				course: student.course || "-",
				yearLevel: student.year || student.yearLevel || "-",
				recordStatus: student.recordStatus || (student.archived === true ? "Archived" : "Active"),
				restrictionSummary: "-",
			})),
		[uniqueStudentProfiles],
	)
	const scholarshipRows = useMemo(() => mapScholarshipRows(allStudentsRaw, applicationsRaw), [allStudentsRaw, applicationsRaw])

	const studentsByCourse = useMemo(
		() => [...new Set(baseStudentRows.map((row) => row.course).filter(Boolean).filter((value) => value !== "-"))].sort(),
		[baseStudentRows],
	)
	const studentsByYear = useMemo(
		() => [...new Set(baseStudentRows.map((row) => row.yearLevel).filter(Boolean).filter((value) => value !== "-"))].sort(),
		[baseStudentRows],
	)

	const selectedStudent = useMemo(
		() => studentProfiles.find((student) => student.id === selectedStudentId) || null,
		[selectedStudentId, studentProfiles],
	)

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
			}),
		[baseStudentRows, studentSearch, studentCourse, studentYear],
	)

	const filteredStudents = useMemo(() => {
		const allowedIds = new Set(filteredStudentsBase.map((row) => row.id))
		return uniqueStudentProfiles.filter((student) => {
			if (!allowedIds.has(student.id)) return false
			return toStudentLifecycle(student) === studentViewTab
		})
	}, [filteredStudentsBase, studentViewTab, uniqueStudentProfiles])

	const studentTabCounts = useMemo(
		() => ({
			students: uniqueStudentProfiles.filter((student) => toStudentLifecycle(student) === "students").length,
			archived: uniqueStudentProfiles.filter((student) => toStudentLifecycle(student) === "archived").length,
		}),
		[uniqueStudentProfiles],
	)

	const studentManagementStats = useMemo(() => {
		const activeStudents = uniqueStudentProfiles.filter((student) => toStudentLifecycle(student) === "students")
		const archivedStudents = uniqueStudentProfiles.filter((student) => toStudentLifecycle(student) === "archived")
		const scholars = activeStudents.filter((student) => {
			const hasProfileScholarship = normalizeScholarshipList(student.scholarships || []).length > 0
			const hasGrantorScholarship = grantorScholarsRaw.some((scholar) => {
				if (scholar.archived === true) return false
				if (!getGrantorScholarProgramName(scholar)) return false
				const directMatchId =
					grantorScholarStudentRecordLookup.get(
						`${scholar.grantorId || scholar.providerType || "grantor"}::${scholar.id}`,
					) || ""
				return directMatchId === student.id || matchesGrantorScholarToStudent(student, scholar)
			})
			return hasProfileScholarship || hasGrantorScholarship
		}).length
		const withWarnings = activeStudents.filter((student) => student.soeComplianceWarning || Number(student.complianceViolationCount || 0) > 0).length
		return {
			total: uniqueStudentProfiles.length,
			active: activeStudents.filter((student) => student.recordStatus === "Active").length,
			scholars,
			archived: archivedStudents.length,
			warnings: withWarnings,
		}
	}, [grantorScholarStudentRecordLookup, grantorScholarsRaw, uniqueStudentProfiles])

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
			labels: ["Active", "Archived"],
			datasets: [
				{
					data: [studentTabCounts.students, studentTabCounts.archived],
					backgroundColor: theme === "dark" ? ["#22c55e", "#94a3b8"] : ["#166534", "#64748b"],
					borderColor: theme === "dark" ? "#0f172a" : "#ffffff",
					borderWidth: 3,
				},
			],
		}),
		[studentTabCounts, theme],
	)

	const grantorScholarCountsById = useMemo(() => {
		const counts = new Map()
		grantorScholarsRaw.forEach((scholar) => {
			const grantorId = scholar.grantorId || scholar.parentId || ""
			if (!grantorId) return
			counts.set(grantorId, (counts.get(grantorId) || 0) + 1)
		})
		return counts
	}, [grantorScholarsRaw])

	const grantorRows = useMemo(
		() =>
			providersRaw
				.map((provider) => ({
					...provider,
					name: buildGrantorName(provider) || provider.id,
					providerType: provider.providerType || toProviderType(buildGrantorName(provider)),
					totalScholars: grantorScholarCountsById.get(provider.id) || 0,
					minimumGwa: toNumericValue(provider.minimumGwa ?? provider.minGwa ?? provider.minimumGrade, null),
					applicationOpen: isGrantorApplicationOpen(provider),
					statusLabel: toGrantorStatus(provider),
				}))
				.sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""))),
		[grantorScholarCountsById, providersRaw],
	)

	const activeGrantorRows = useMemo(
		() => grantorRows.filter((grantor) => grantor.archived !== true),
		[grantorRows],
	)

	const archivedGrantorRows = useMemo(
		() => grantorRows.filter((grantor) => grantor.archived === true),
		[grantorRows],
	)

	const selectedGrantor = useMemo(
		() => grantorRows.find((grantor) => grantor.id === selectedGrantorId) || null,
		[grantorRows, selectedGrantorId],
	)
	const adminScholarGrantorOptions = useMemo(
		() =>
			activeGrantorRows.map((grantor) => ({
				value: grantor.id,
				label: buildGrantorName(grantor) || grantor.id,
			})),
		[activeGrantorRows],
	)
	const adminScholarImportColumnCount = useMemo(
		() =>
			Math.max(
				adminScholarImportHeaders.length,
				...adminScholarImportRows.map((row) => (row.raw?.length || 0) + 1),
				0,
			),
		[adminScholarImportHeaders, adminScholarImportRows],
	)
	const adminScholarImportColumns = useMemo(
		() =>
			Array.from({ length: adminScholarImportColumnCount }, (_, index) => ({
				index,
				header: adminScholarImportHeaders[index] || `Column ${index + 1}`,
			})),
		[adminScholarImportColumnCount, adminScholarImportHeaders],
	)
	const selectedAdminScholarImportSet = useMemo(
		() => new Set(selectedAdminScholarImportRows),
		[selectedAdminScholarImportRows],
	)
	const allAdminScholarImportRowsSelected = Boolean(
		adminScholarImportRows.length > 0 &&
			selectedAdminScholarImportRows.length === adminScholarImportRows.length,
	)
	const selectedGrantorPasswordChangePending = Boolean(
		selectedGrantor?.passwordChangeRequested === true ||
			selectedGrantor?.passwordChangeRequestStatus === "pending" ||
			selectedGrantor?.statusLabel === "Password Requested",
	)

	const selectedGrantorAnnouncements = useMemo(() => {
		if (!selectedGrantor?.id) return []
		const grantorKeys = new Set(
			[selectedGrantor.id, selectedGrantor.providerType, selectedGrantor.name]
				.filter(Boolean)
				.map((item) => String(item).toLowerCase()),
		)
		return grantorAnnouncementsRaw.filter((announcement) => {
			const values = [
				announcement.grantorId,
				announcement.providerType,
				announcement.providerLabel,
				announcement.grantorName,
				announcement.sourceLabel,
			].map((item) => String(item || "").toLowerCase())
			return values.some((value) => value && grantorKeys.has(value))
		})
	}, [grantorAnnouncementsRaw, selectedGrantor])

	const selectedGrantorCurrentAnnouncement = useMemo(
		() => selectedGrantorAnnouncements.find((announcement) => !isAnnouncementArchived(announcement)) || selectedGrantorAnnouncements[0] || null,
		[selectedGrantorAnnouncements],
	)

	const visibleGrantorRows = useMemo(() => {
		const sourceRows = grantorTab === "archived" ? archivedGrantorRows : activeGrantorRows
		const keyword = grantorSearch.trim().toLowerCase()
		if (!keyword) return sourceRows
		return sourceRows.filter((grantor) =>
			[
				grantor.id,
				grantor.name,
				grantor.email,
				grantor.organization,
				String(grantor.totalScholars || 0),
				grantor.statusLabel,
			]
				.join(" ")
				.toLowerCase()
				.includes(keyword),
		)
	}, [activeGrantorRows, archivedGrantorRows, grantorSearch, grantorTab])

	const grantorTabCounts = useMemo(
		() => ({
			grantors: activeGrantorRows.length,
			archived: archivedGrantorRows.length,
		}),
		[activeGrantorRows.length, archivedGrantorRows.length],
	)

	const grantorManagementStats = useMemo(() => {
		const passwordRequests = activeGrantorRows.filter(
			(row) => row.passwordChangeRequestStatus === "pending" || row.passwordChangeRequested === true || row.statusLabel === "Password Requested",
		).length
		return {
			total: grantorRows.length,
			active: activeGrantorRows.length,
			passwordRequests,
			archived: archivedGrantorRows.length,
		}
	}, [activeGrantorRows, archivedGrantorRows.length, grantorRows.length])

	const grantorTablePage = useMemo(
		() => paginateRows(visibleGrantorRows, tablePages[`grantors_${grantorTab}`] || 1, TABLE_PAGE_SIZE),
		[grantorTab, tablePages, visibleGrantorRows],
	)

	const grantorReportRows = useMemo(
		() => visibleGrantorRows.map((grantor) => buildGrantorReportRow(grantor)),
		[visibleGrantorRows],
	)

	const grantorLabelById = useMemo(
		() =>
			new Map(
				grantorRows.flatMap((grantor) => [
					[grantor.id, grantor.name || buildGrantorName(grantor) || grantor.id],
					[grantor.providerType, grantor.name || buildGrantorName(grantor) || toProviderLabel(grantor.providerType)],
				]),
			),
		[grantorRows],
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

	useEffect(() => {
		let active = true
		const buildFallbackLookup = () => {
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
		}

		if (!grantorScholarsRaw.length || !studentProfiles.length) {
			setGrantorScholarStudentRecordLookup(new Map())
			return undefined
		}

		matchAdminGrantorStudents(studentProfiles, grantorScholarsRaw)
			.then((result) => {
				if (!active) return
				setGrantorScholarStudentRecordLookup(new Map(Object.entries(result.lookup || {})))
			})
			.catch((error) => {
				console.warn("Python admin grantor-student matching unavailable. Falling back to browser matching.", error)
				if (active) setGrantorScholarStudentRecordLookup(buildFallbackLookup())
			})

		return () => {
			active = false
		}
	}, [grantorScholarsRaw, studentProfiles])

	const studentGrantorLabelById = useMemo(() => {
		const labels = new Map()
		studentProfiles.forEach((student) => {
			const matchedLabels = []
			grantorScholarsRaw.forEach((scholar) => {
				const directMatchId =
					grantorScholarStudentRecordLookup.get(
						`${scholar.grantorId || scholar.providerType || "grantor"}::${scholar.id}`,
					) || ""
				const studentIdMatch =
					normalizeGrantorScholarLookupValue(scholar.studentId) &&
					normalizeGrantorScholarLookupValue(scholar.studentId) ===
						normalizeGrantorScholarLookupValue(student.studentId || student.id)
				const isMatch =
					directMatchId === student.id ||
					studentIdMatch ||
					matchesGrantorScholarToStudent(student, scholar)
				if (!isMatch) return

				const label =
					scholar.grantorName ||
					grantorLabelById.get(scholar.grantorId) ||
					grantorLabelById.get(scholar.providerType) ||
					scholar.providerName ||
					(scholar.providerType && scholar.providerType !== "other" ? toProviderLabel(scholar.providerType) : "")
				if (label && !matchedLabels.includes(label)) matchedLabels.push(label)
			})
			if (matchedLabels.length > 0) labels.set(student.id, matchedLabels.join(", "))
		})
		return labels
	}, [grantorLabelById, grantorScholarStudentRecordLookup, grantorScholarsRaw, studentProfiles])

	const selectedStudentGrantorScholarships = useMemo(() => {
		if (!selectedStudent?.id) return []

		const matchedRows = [...activeGrantorScholars, ...archivedGrantorScholars].filter((scholar) => {
			if (!getGrantorScholarProgramName(scholar)) return false
			const directMatchId =
				grantorScholarStudentRecordLookup.get(
					`${scholar.grantorId || scholar.providerType || "grantor"}::${scholar.id}`,
				) || ""
			return directMatchId === selectedStudent.id || matchesGrantorScholarToStudent(selectedStudent, scholar)
		})

		return [
			...new Map(
				matchedRows.map((scholar) => {
					const provider = scholar.providerType || toProviderType(scholar.grantorName || scholar.scholarshipTitle)
					const scholarshipName = getGrantorScholarProgramName(scholar)
					return [
						`${provider}::${scholarshipName.toLowerCase()}`,
						{
							provider,
							scholarshipName,
							grantorName: scholar.grantorName || toProviderLabel(provider),
							status: scholar.status || "Active",
						},
					]
				}),
			).values(),
		]
	}, [activeGrantorScholars, archivedGrantorScholars, grantorScholarStudentRecordLookup, selectedStudent])

	const selectedStudentHasScholarship = useMemo(() => {
		if (!selectedStudent?.id) return false
		return (
			selectedStudentGrantorScholarships.length > 0 ||
			normalizeScholarshipList(selectedStudent.scholarships || []).length > 0 ||
			getStudentScholarshipNames(selectedStudent).length > 0
		)
	}, [selectedStudent, selectedStudentGrantorScholarships])

	const selectedGrantorRecommendedStudents = useMemo(() => {
		if (!selectedGrantor?.id) return []
		const minimumGwa = toNumericValue(selectedGrantor.minimumGwa ?? selectedGrantor.minGwa, 2.25)
		const grantorProvince = String(selectedGrantor.province || "").trim().toLowerCase()
		const grantorCity = String(selectedGrantor.city || "").trim().toLowerCase()

		return studentProfiles
			.filter((student) => {
				if (student.archived === true || student.sourceCollection !== "students") return false
				if (normalizeScholarshipList(student.scholarships || []).length > 0) return false
				if (getStudentScholarshipNames(student).length > 0) return false
				const hasGrantorScholarship = grantorScholarsRaw.some((scholar) => {
					if (scholar.archived === true) return false
					const directMatchId =
						grantorScholarStudentRecordLookup.get(
							`${scholar.grantorId || scholar.providerType || "grantor"}::${scholar.id}`,
						) || ""
					return directMatchId === student.id || matchesGrantorScholarToStudent(student, scholar)
				})
				return !hasGrantorScholarship
			})
			.map((student) => {
				const gwa = toNumericValue(student.gwa ?? student.currentGwa ?? student.currentGWA, null)
				const gwaEligible = gwa !== null && minimumGwa !== null ? gwa <= minimumGwa : false
				const sameProvince = grantorProvince && String(student.province || "").trim().toLowerCase() === grantorProvince
				const sameCity = grantorCity && String(student.city || student.municipality || "").trim().toLowerCase() === grantorCity
				const score =
					(gwaEligible ? 70 : 0) +
					(gwa !== null && minimumGwa !== null ? Math.max(0, (minimumGwa - gwa) * 10) : 0) +
					(sameCity ? 18 : sameProvince ? 10 : 0) +
					(student.corFile?.url || student.cogFile?.url ? 4 : 0)
				return {
					...student,
					recommendationScore: Math.round(score),
					recommendationGwa: gwa,
					recommendationReason: gwaEligible
						? sameCity || sameProvince
							? "GWA and location match"
							: "GWA matches grantor requirement"
						: "Potential match, review student details",
				}
			})
			.sort((left, right) => right.recommendationScore - left.recommendationScore)
			.slice(0, 3)
	}, [grantorScholarStudentRecordLookup, grantorScholarsRaw, selectedGrantor, studentProfiles])

	useEffect(() => {
		let active = true
		setSelectedStudentRecommendations([])
		if (!selectedStudent?.id || selectedStudentHasScholarship) {
			setSelectedStudentRecommendationsLoading(false)
			return () => {
				active = false
			}
		}

		setSelectedStudentRecommendationsLoading(true)
		loadRecommendedScholarships(selectedStudent)
			.then((result) => {
				if (!active) return
				setSelectedStudentRecommendations((result.recommendations || []).slice(0, 3))
			})
			.catch((error) => {
				if (!active) return
				console.error("Admin student recommendation load failed.", {
					studentId: selectedStudent.id,
					error,
				})
				setSelectedStudentRecommendations([])
			})
			.finally(() => {
				if (active) setSelectedStudentRecommendationsLoading(false)
			})

		return () => {
			active = false
		}
	}, [selectedStudent, selectedStudentHasScholarship])

	const scholarshipOverviewRows = useMemo(() => {
		const rows = new Map()
		activeGrantorScholars.forEach((scholar) => {
			const programName = getGrantorScholarProgramName(scholar)
			if (!programName) return
			const provider = scholar.providerType || toProviderType(scholar.grantorName || scholar.scholarshipTitle)
			const key = `${provider}::${programName.toLowerCase()}`
			if (!rows.has(key)) {
				rows.set(key, {
					programName,
					grantorId: scholar.grantorId || "",
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
		return activeGrantorRows
			.map((grantor) => ({
				value: grantor.id,
				label: grantor.name || buildGrantorName(grantor) || grantor.id,
			}))
			.sort((left, right) => left.label.localeCompare(right.label))
	}, [activeGrantorRows])

	const selectedScholarshipGrantor = useMemo(
		() => activeGrantorRows.find((grantor) => grantor.id === scholarshipProvider) || null,
		[activeGrantorRows, scholarshipProvider],
	)

	const matchesSelectedScholarshipGrantor = useCallback(
		(row = {}) => {
			if (scholarshipProvider === "All") return true
			const grantor = selectedScholarshipGrantor
			const accepted = new Set(
				[
					scholarshipProvider,
					grantor?.id,
					grantor?.providerType,
					grantor?.name,
					grantor ? buildGrantorName(grantor) : "",
					grantor ? toProviderType(grantor.name || buildGrantorName(grantor) || grantor.providerType || "") : "",
				]
					.filter(Boolean)
					.map((value) => String(value).toLowerCase()),
			)
			return [
				row.grantorId,
				row.providerType,
				row.provider,
				row.grantorName,
				row.providerName,
				row.scholarship,
			]
				.filter(Boolean)
				.some((value) => accepted.has(String(value).toLowerCase()))
		},
		[scholarshipProvider, selectedScholarshipGrantor],
	)

	const filteredScholarships = useMemo(() => {
		const keyword = scholarshipSearch.trim().toLowerCase()
		return scholarshipOverviewRows.filter((row) => {
			const providerMatch = matchesSelectedScholarshipGrantor(row)
			const searchMatch =
				!keyword ||
				String(row.programName || "").toLowerCase().includes(keyword) ||
				String(row.grantorName || "").toLowerCase().includes(keyword) ||
				String(row.status || "").toLowerCase().includes(keyword)
			return providerMatch && searchMatch
		})
	}, [matchesSelectedScholarshipGrantor, scholarshipOverviewRows, scholarshipSearch])

	const studentGrantorMatches = useMemo(() => {
		return studentProfiles
			.map((student) => {
				const normalizedStudentId = normalizeGrantorScholarLookupValue(student.id)
				const matches = activeGrantorScholars.filter((scholar) => {
					if (!getGrantorScholarProgramName(scholar)) return false
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
								label:
									scholar.grantorName ||
									grantorLabelById.get(scholar.grantorId) ||
									grantorLabelById.get(scholar.providerType) ||
									toProviderLabel(scholar.providerType),
								provider: scholar.providerType || toProviderType(scholar.grantorName || scholar.scholarshipTitle),
							},
						]),
					).values(),
				]
				const scholarshipTitles = [...new Set(matches.map((scholar) => getGrantorScholarProgramName(scholar)))]
				return { student, matches, distinctGrantors, scholarshipTitles }
			})
			.filter((entry) => entry.matches.length > 0)
	}, [activeGrantorScholars, grantorLabelById, studentProfiles])

	const warningRows = useMemo(() => {
		const keyword = scholarshipSearch.trim().toLowerCase()
		const flaggedRosterEntries = activeGrantorScholars
			.filter((scholar) => scholar.scholarshipConflictWarning || scholar.duplicateScholarshipWarning || scholar.duplicateScholarshipDetected)
			.map((scholar) => {
				const student =
					studentProfiles.find((profile) => {
						const studentId = normalizeGrantorScholarLookupValue(profile.id || profile.studentId || profile.studentnumber)
						const scholarStudentId = normalizeGrantorScholarLookupValue(scholar.studentId || scholar.studentnumber || scholar.id)
						return Boolean(studentId && scholarStudentId && studentId === scholarStudentId) || matchesGrantorScholarToStudent(profile, scholar)
					}) || {
						id: scholar.studentId || scholar.id,
						fullName: buildGrantorScholarFullName(scholar),
					}
				const matchedGrantorLabel =
					scholar.duplicateMatchedGrantorName ||
					grantorLabelById.get(scholar.duplicateMatchedGrantorId) ||
					scholar.duplicateMatchedGrantorId ||
					"Another grantor"
				return {
					student,
					matches: [scholar],
					distinctGrantors: [
						{
							id: scholar.grantorId || scholar.providerType || scholar.grantorName || "current",
							label: scholar.grantorName || grantorLabelById.get(scholar.grantorId) || "Current grantor",
							provider: scholar.providerType || toProviderType(scholar.grantorName || scholar.scholarshipTitle),
						},
						{
							id: scholar.duplicateMatchedGrantorId || matchedGrantorLabel,
							label: matchedGrantorLabel,
							provider: toProviderType(matchedGrantorLabel),
						},
					],
					scholarshipTitles: [getGrantorScholarProgramName(scholar)].filter(Boolean),
					hasConflict: true,
				}
			})

		const rosterConflictEntries = studentGrantorMatches
			.filter((entry) => entry.distinctGrantors.length > 1)
			.map((entry) => ({ ...entry, hasConflict: true }))

		const combinedEntries = [...rosterConflictEntries, ...flaggedRosterEntries]
		const dedupedEntries = [
			...new Map(
				combinedEntries.map((entry) => [
					normalizeGrantorScholarLookupValue(entry.student?.id || entry.student?.studentId || entry.student?.fullName),
					entry,
				]),
			).values(),
		]

		return dedupedEntries
			.filter(
				(entry) =>
					scholarshipProvider === "All" ||
					entry.distinctGrantors.some((grantor) => {
						const selected = String(scholarshipProvider || "").toLowerCase()
						return (
							String(grantor.id || "").toLowerCase() === selected ||
							String(grantor.provider || "").toLowerCase() === selected ||
							String(grantor.label || "").toLowerCase() === selected
						)
					}),
			)
			.map((entry) => {
				const grantorLabels = entry.distinctGrantors.map((grantor) => grantor.label)
				const studentIdKey = normalizeGrantorScholarLookupValue(entry.student?.id || entry.student?.studentId || entry.student?.studentnumber)
				const studentNameKey = normalizeGrantorScholarLookupValue(entry.student?.fullName || studentFullName(entry.student || {}))
				const conflictMatches = activeGrantorScholars.filter((scholar) => {
					const scholarIdKey = normalizeGrantorScholarLookupValue(scholar.studentId || scholar.studentnumber || scholar.studentNumber || scholar.id)
					const scholarNameKey = normalizeGrantorScholarLookupValue(buildGrantorScholarFullName(scholar))
					return (
						(studentIdKey && scholarIdKey && studentIdKey === scholarIdKey) ||
						(studentNameKey && scholarNameKey && studentNameKey === scholarNameKey) ||
						matchesGrantorScholarToStudent(entry.student, scholar)
					)
				})
				const conflictOptions = [
					...new Map(
						conflictMatches.map((scholar) => {
							const grantorId = scholar.grantorId || scholar.parentId || scholar.providerType || ""
							const scholarId = scholar.id || scholar.studentId || scholar.studentnumber || ""
							const key = `${grantorId}::${scholarId}`
							return [
								key,
								{
									key,
									grantorId,
									scholarId,
									grantorName:
										scholar.grantorName ||
										grantorLabelById.get(grantorId) ||
										toProviderLabel(scholar.providerType || grantorId),
									scholarshipName: getGrantorScholarProgramName(scholar) || "Scholarship",
									providerType: scholar.providerType || toProviderType(scholar.grantorName || scholar.scholarshipTitle || grantorId),
									studentId: scholar.studentId || scholar.studentnumber || entry.student?.id || "",
									fullName: buildGrantorScholarFullName(scholar) || entry.student?.fullName || studentFullName(entry.student || {}),
									status: scholar.status || "Active",
								},
							]
						}),
					).values(),
				]
				return {
					trackingKey: `warning::${entry.student.id || entry.student.studentId || entry.student.fullName}`,
					studentId: String(entry.student.id || entry.student.studentId || "-"),
					fullName: String(entry.student.fullName || studentFullName(entry.student) || "Student"),
					details: `Grantors: ${grantorLabels.join(", ") || "-"} | Scholarships: ${entry.scholarshipTitles.join(", ") || "-"}`,
					grantors: grantorLabels.join(", "),
					studentRecordId: entry.student.id || "",
					conflictOptions,
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
	}, [activeGrantorScholars, grantorLabelById, scholarshipProvider, scholarshipSearch, studentGrantorMatches, studentProfiles])

	const selectedScholarshipWarningRow = useMemo(
		() => warningRows.find((row) => row.trackingKey === selectedScholarshipWarningKey) || null,
		[warningRows, selectedScholarshipWarningKey],
	)

	useEffect(() => {
		if (!warningRows.length) return
		const storageKey = "bulsuscholar_admin_duplicate_scholarship_notices"
		let deliveredKeys = []
		try {
			deliveredKeys = JSON.parse(localStorage.getItem(storageKey) || "[]")
		} catch {
			deliveredKeys = []
		}
		const deliveredSet = new Set(Array.isArray(deliveredKeys) ? deliveredKeys : [])
		const newWarnings = warningRows.filter((row) => {
			const key = `${row.studentId || row.fullName}::${row.grantors || row.details}`
			return key && !deliveredSet.has(key)
		})
		if (!newWarnings.length) return

		newWarnings.forEach((row) => {
			const key = `${row.studentId || row.fullName}::${row.grantors || row.details}`
			deliveredSet.add(key)
			createAdminNotification({
				type: "duplicate_scholarship_detected",
				title: "Duplicate Scholarship Detected",
				message: `${row.fullName || "A student"} appears in multiple grantor scholarship rosters. ${row.details || ""}`,
				studentId: row.studentId,
				studentName: row.fullName,
				grantors: row.grantors,
				source: "admin_warning_section",
				read: false,
				createdAt: serverTimestamp(),
			}).catch((error) => console.error("Admin duplicate scholarship notification failed.", error))
		})
		localStorage.setItem(storageKey, JSON.stringify([...deliveredSet].slice(-250)))
	}, [warningRows])

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
				const restrictions = student.restrictions && typeof student.restrictions === "object" ? student.restrictions : {}
				const scholarshipNames = scholarships
					.map((entry) => entry?.name || entry?.provider || "Scholarship")
					.filter(Boolean)
				const hasConflict =
					scholarships.length > 1 || (Boolean(conflictEntry) && scholarships.length !== 1)
				
				const nextConflictMessage = hasConflict
					? conflictEntry
						? `Multiple grantors detected: ${conflictEntry.distinctGrantors
								.map((grantor) => grantor.label)
								.join(", ")}. Choose one scholarship only to comply with the one scholarship per student policy.`
						: `Multiple scholarships detected: ${scholarshipNames.join(", ")}. Choose one scholarship only to comply with the one scholarship per student policy.`
					: ""

				const nextRestrictions = hasConflict
					? {
							...restrictions,
							scholarshipEligibility: true,
							complianceHold: true,
						}
					: currentReason === "multiple_scholarships"
						? {
								...restrictions,
								scholarshipEligibility: false,
								complianceHold: false,
							}
						: restrictions
				const nextScholarships = hasConflict
					? scholarships.map((scholarship) => ({
							...scholarship,
							frozen: true,
							freezeReason: "Multiple scholarship records detected. Visit the Office of the Scholarship to choose one scholarship.",
							frozenBy: "admin",
							frozenByName: "Office of the Scholarship",
							frozenAt: scholarship?.frozenAt || new Date().toISOString(),
						}))
					: currentReason === "multiple_scholarships"
						? scholarships.map((scholarship) => ({
								...scholarship,
								frozen: false,
								freezeReason: "",
								frozenBy: "",
								frozenByName: "",
								frozenAt: null,
							}))
						: scholarships

				const nextPayload = {
					scholarshipConflictWarning: hasConflict,
					scholarshipConflictMessage:
						hasConflict || currentReason === "multiple_scholarships"
							? nextConflictMessage
							: student?.scholarshipConflictMessage || "",
					scholarshipRestrictionReason:
						hasConflict ? "multiple_scholarships" : currentReason === "multiple_scholarships" ? null : currentReason,
					restrictions: nextRestrictions,
					scholarships: nextScholarships,
				}
				const didChange =
					student?.scholarshipConflictWarning !== nextPayload.scholarshipConflictWarning ||
					(student?.scholarshipConflictMessage || "") !== nextPayload.scholarshipConflictMessage ||
					(student?.scholarshipRestrictionReason || null) !== nextPayload.scholarshipRestrictionReason ||
					JSON.stringify(restrictions) !== JSON.stringify(nextRestrictions) ||
					JSON.stringify(scholarships) !== JSON.stringify(nextScholarships)
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

	const resolveDuplicateScholarshipWarning = async (warningRow, selectedOption) => {
		if (!warningRow?.studentRecordId || !selectedOption?.grantorId) {
			toast.error("Select a valid scholarship record first.")
			return
		}
		const confirmed = window.confirm(`Choose ${selectedOption.scholarshipName || "this scholarship"} under ${selectedOption.grantorName || "the selected grantor"} for ${warningRow.fullName}? Other duplicate scholarship roster records will be archived.`)
		if (!confirmed) return

		setIsBusy(true)
		try {
			const student = studentsRaw.find((row) => row.id === warningRow.studentRecordId) || null
			const conflictOptions = Array.isArray(warningRow.conflictOptions) ? warningRow.conflictOptions : []
			const selectedGrantorId = String(selectedOption.grantorId || "").trim()
			const selectedScholarId = String(selectedOption.scholarId || "").trim()
			const selectedGrantorName = selectedOption.grantorName || grantorLabelById.get(selectedGrantorId) || selectedGrantorId
			const selectedGrantorProvider = selectedOption.providerType || toProviderType(selectedGrantorName || selectedGrantorId)
			const selectedGrantorAliases = new Set(
				[selectedGrantorId, selectedGrantorName, selectedGrantorProvider]
					.map((value) => String(value || "").trim().toLowerCase())
					.filter(Boolean),
			)
			const now = serverTimestamp()

			const rosterUpdates = conflictOptions
				.filter((option) => option.grantorId && option.scholarId)
				.map((option) => {
					const isSelected =
						String(option.grantorId || "") === selectedGrantorId &&
						String(option.scholarId || "") === selectedScholarId
					const payload = isSelected
						? {
								archived: false,
								status: option.status === "Archived" ? "Active" : option.status || "Active",
								scholarshipConflictWarning: false,
								duplicateScholarshipWarning: false,
								duplicateScholarshipDetected: false,
								duplicateMatchedGrantorId: "",
								duplicateMatchedGrantorName: "",
								duplicateResolvedAt: now,
								duplicateResolution: "selected_by_admin",
								updatedAt: now,
							}
						: {
								archived: true,
								status: "Archived",
								archivedAt: now,
								archivedBy: "admin",
								archivedReason: "Duplicate scholarship resolved by admin",
								scholarshipConflictWarning: false,
								duplicateScholarshipWarning: false,
								duplicateScholarshipDetected: false,
								duplicateResolvedAt: now,
								duplicateResolution: "archived_by_admin_resolution",
								updatedAt: now,
							}
					return setDoc(doc(db, "grantorPortals", option.grantorId, "scholars", option.scholarId), payload, { merge: true })
				})

			const studentScholarships = Array.isArray(student?.scholarships) ? student.scholarships : []
			const selectedProvider = toProviderType(selectedOption.scholarshipName || selectedGrantorName)
			const selectedScholarships = studentScholarships
				.filter((scholarship) => {
					const scholarshipGrantorId = String(scholarship.grantorId || scholarship.providerId || scholarship.grantor_id || "").trim()
					const scholarshipGrantorName = String(scholarship.grantorName || scholarship.providerName || scholarship.provider || "").trim().toLowerCase()
					const scholarshipProvider = toProviderType(scholarship.providerType || scholarship.provider || scholarship.name)
					return (
						(scholarshipGrantorId && scholarshipGrantorId === selectedGrantorId) ||
						(scholarshipGrantorName && selectedGrantorAliases.has(scholarshipGrantorName)) ||
						(scholarshipProvider && (scholarshipProvider === selectedProvider || selectedGrantorAliases.has(scholarshipProvider)))
					)
				})
				.map((scholarship) => ({
					...scholarship,
					frozen: false,
					freezeReason: "",
					frozenBy: "",
					frozenByName: "",
					frozenAt: null,
				}))
			const fallbackScholarship = {
				id: selectedScholarId || selectedOption.key || `${selectedGrantorId}_${warningRow.studentId}`,
				name: selectedOption.scholarshipName || selectedGrantorName,
				provider: selectedGrantorName,
				providerType: selectedProvider,
				grantorId: selectedGrantorId,
				grantorName: selectedGrantorName,
				status: "Active",
				frozen: false,
				assignedBy: "admin",
				updatedAt: now,
			}

			const nextRestrictions = {
				...(student?.restrictions && typeof student.restrictions === "object" ? student.restrictions : {}),
				scholarshipEligibility: false,
				complianceHold: false,
			}
			await Promise.all([
				...rosterUpdates,
				setDoc(doc(db, "students", warningRow.studentRecordId), {
					scholarships: selectedScholarships.length > 0 ? selectedScholarships : [fallbackScholarship],
					restrictions: nextRestrictions,
					scholarshipConflictWarning: false,
					scholarshipConflictMessage: "",
					scholarshipRestrictionReason: null,
					duplicateScholarshipWarning: false,
					duplicateScholarshipDetected: false,
					duplicateResolvedAt: now,
					duplicateResolutionGrantorId: selectedGrantorId,
					duplicateResolutionGrantorName: selectedGrantorName,
					updatedAt: now,
				}, { merge: true }),
				...applicationsRaw
					.filter((application) => {
						const appStudentId = normalizeStudentIdKey(application.studentId || application.studentnumber || application.studentNumber || application.applicantId)
						const targetStudentId = normalizeStudentIdKey(warningRow.studentId)
						if (!appStudentId || appStudentId !== targetStudentId) return false
						const appGrantorAliases = [
							application.grantorId,
							application.providerId,
							application.providerType,
							application.grantorName,
							application.providerName,
							application.scholarship,
							application.scholarshipName,
						].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean)
						return appGrantorAliases.length > 0 && !appGrantorAliases.some((alias) => selectedGrantorAliases.has(alias) || toProviderType(alias) === selectedGrantorProvider)
					})
					.map((application) =>
						setDoc(doc(db, "scholarshipApplications", application.id), {
							archived: true,
							status: "Rejected",
							approvalStatus: "Rejected",
							rejectionReason: "Duplicate scholarship resolved by admin",
							rejectedBy: "admin",
							rejectedByName: "Office of the Scholarship",
							rejectedAt: now,
							updatedAt: now,
						}, { merge: true }),
					),
				createStudentNotification({
					studentId: warningRow.studentRecordId,
					type: "duplicate_scholarship_resolved",
					title: "Scholarship Selection Confirmed",
					message: `The Office of the Scholarship resolved your duplicate scholarship record. Your active scholarship is now ${selectedOption.scholarshipName || selectedGrantorName} under ${selectedGrantorName}.`,
					studentName: warningRow.fullName,
					grantorId: selectedGrantorId,
					grantorName: selectedGrantorName,
					read: false,
					createdAt: now,
				}).catch((error) => {
					console.error("Student duplicate resolution notification failed.", error)
					return null
				}),
				createAdminNotification({
					type: "duplicate_scholarship_resolved",
					title: "Duplicate Scholarship Resolved",
					message: `${warningRow.fullName} was assigned to ${selectedGrantorName}. Other duplicate roster records were archived.`,
					studentId: warningRow.studentId,
					studentName: warningRow.fullName,
					grantorId: selectedGrantorId,
					grantorName: selectedGrantorName,
					source: "admin_warning_resolution",
					read: false,
					createdAt: now,
				}).catch((error) => {
					console.error("Admin duplicate resolution notification failed.", error)
					return null
				}),
			])
			setSelectedScholarshipWarningKey("")
			toast.success("Duplicate scholarship warning resolved.")
		} catch (error) {
			console.error("Unable to resolve duplicate scholarship warning.", error)
			toast.error("Unable to resolve the duplicate scholarship right now.")
		} finally {
			setIsBusy(false)
		}
	}

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
					grantorId: scholarship.grantorId || scholarship.providerId || scholarship.grantor_id || "",
					grantorName: scholarship.grantorName || scholarship.providerName || scholarship.provider || "",
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

	const studentTrackingById = useMemo(() => {
		const trackingByStudent = new Map()
		allScholarshipTrackingRows.forEach((row) => {
			const existing = trackingByStudent.get(row.studentId)
			const isInactive = ["Rejected", "Cancelled", "Withdrawn"].includes(row.status)
			if (!existing || (!isInactive && ["Rejected", "Cancelled", "Withdrawn"].includes(existing.status))) {
				trackingByStudent.set(row.studentId, row)
			}
		})
		return trackingByStudent
	}, [allScholarshipTrackingRows])

	const buildStudentReportRows = useCallback(
		(rows = []) =>
			rows.map((student) => {
				const grantorMatch = studentGrantorMatches.find((entry) => entry.student?.id === student.id)
				const grantorLabel =
					grantorMatch?.distinctGrantors?.map((grantor) => grantor.label).filter(Boolean).join(", ") ||
					studentGrantorLabelById.get(student.id) ||
					student.grantorName ||
					student.providerName ||
					grantorLabelById.get(student.grantorId) ||
					grantorLabelById.get(student.providerType) ||
					(student.providerType ? toProviderLabel(student.providerType) : "") ||
					"N/A"
				return {
					...toStudentReportRow(student),
					id: toDisplayStudentId(student.studentId || student.id),
					gwa: student.gwa || student.currentGwa || student.currentGWA || "-",
					grantor: grantorLabel,
					recordStatus: student.recordStatus || (student.archived === true ? "Archived" : "Active"),
				}
			}),
		[grantorLabelById, studentGrantorLabelById, studentGrantorMatches],
	)

	const allStudentReportRows = useMemo(
		() => buildStudentReportRows(studentProfiles),
		[buildStudentReportRows, studentProfiles],
	)

	const selectedStudentTracking = selectedStudent?.id ? studentTrackingById.get(selectedStudent.id) || null : null

	function normalizeDocumentPreviewUrl(url = "") {
		return normalizeStoragePublicUrl(url)
	}

	useEffect(() => {
		if (!previewDocument?.url) {
			setPreviewBlobUrl("")
			setIsPreviewLoading(false)
			return undefined
		}

		let cancelled = false
		let objectUrl = ""
		setIsPreviewLoading(true)
		setPreviewBlobUrl("")

		getStorageObjectBlob(previewDocument)
			.then(async (blob) => {
				if (cancelled) return
				if (previewDocument.isPdf) {
					const pdfFile = new File([blob], previewDocument.name || "document.pdf", {
						type: "application/pdf",
					})
					const previewImageBlob = await convertPdfToImage(pdfFile)
					if (cancelled) return
					objectUrl = URL.createObjectURL(previewImageBlob)
				} else {
					objectUrl = URL.createObjectURL(blob)
				}
				setPreviewBlobUrl(objectUrl)
			})
			.catch((error) => {
				if (cancelled) return
				console.error("Failed to load admin student document preview:", error)
				toast.error("Unable to preview the document. You can still download it.")
			})
			.finally(() => {
				if (!cancelled) setIsPreviewLoading(false)
			})

		return () => {
			cancelled = true
			if (objectUrl) URL.revokeObjectURL(objectUrl)
		}
	}, [previewDocument])

	const scholarshipStudentRows = useMemo(
		() =>
			mergeGrantorScholarRows(activeGrantorScholars.filter((scholar) => getGrantorScholarProgramName(scholar)).map((scholar) => {
				const provider = scholar.providerType || toProviderType(scholar.grantorName || scholar.scholarshipTitle)
				const programName = getGrantorScholarProgramName(scholar)
				const studentRecordId =
					grantorScholarStudentRecordLookup.get(
						`${scholar.grantorId || scholar.providerType || "grantor"}::${scholar.id}`,
					) || ""
				return {
					trackingKey: `grantor_scholar::${scholar.grantorId || provider}::${scholar.id}`,
					scholarArchiveKey: `${scholar.grantorId || provider}::${scholar.id}`,
					studentId: scholar.studentId || "-",
					fullName: buildGrantorScholarFullName(scholar),
					scholarship: programName,
					provider,
					grantorName: scholar.grantorName || toProviderLabel(provider),
					yearLevel: scholar.yearLevel || "-",
					contactNumber: scholar.cpNumber || "-",
					street: buildGrantorScholarAddress(scholar) || "-",
					status: scholar.status || "Active",
					sourceLabel: scholar.addedByAdmin || scholar.addedBy === "admin" ? "Added by admin" : "Grantor roster",
					updatedAtLabel: formatDate(scholar.updatedAt || scholar.createdAt),
					studentRecordId,
					rawScholar: scholar,
				}
			})),
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
				matchesSelectedScholarshipGrantor(row)
			)
		})
	}, [matchesSelectedScholarshipGrantor, scholarshipSearch, scholarshipStudentRows])

	const archivedScholarshipRows = useMemo(
		() =>
			mergeGrantorScholarRows(archivedGrantorScholars.filter((scholar) => getGrantorScholarProgramName(scholar)).map((scholar) => {
				const provider = scholar.providerType || toProviderType(scholar.grantorName || scholar.scholarshipTitle)
				const programName = getGrantorScholarProgramName(scholar)
				const studentRecordId =
					grantorScholarStudentRecordLookup.get(
						`${scholar.grantorId || scholar.providerType || "grantor"}::${scholar.id}`,
					) || ""
				return {
					trackingKey: `archived_grantor_scholar::${scholar.grantorId || provider}::${scholar.id}`,
					studentId: scholar.studentId || "-",
					fullName: buildGrantorScholarFullName(scholar),
					scholarship: programName,
					provider,
					grantorName: scholar.grantorName || toProviderLabel(provider),
					yearLevel: scholar.yearLevel || "-",
					status: scholar.status || "Archived",
					sourceLabel: scholar.addedByAdmin || scholar.addedBy === "admin" ? "Added by admin" : "Grantor roster",
					archivedAtLabel: formatDate(scholar.archivedAt || scholar.updatedAt || scholar.createdAt),
					studentRecordId,
					rawScholar: scholar,
				}
			})),
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
				matchesSelectedScholarshipGrantor(row)
			)
		})
	}, [archivedScholarshipRows, matchesSelectedScholarshipGrantor, scholarshipSearch])

	const scholarshipTrackingRows = useMemo(() => {
		const keyword = scholarshipSearch.trim().toLowerCase()
		return allScholarshipTrackingRows.filter((row) => {
			const statusText = String(row.status || "").toLowerCase()
			const stepText = String(row.currentStepLabel || "").toLowerCase()
			const isClosedTrackingRow =
				row.archived === true ||
				["rejected", "archived", "cancelled", "withdrawn"].some((value) => statusText.includes(value)) ||
				(["approved", "active", "complete", "completed"].some((value) => statusText === value || statusText.includes(value)) &&
					["completed", "complete"].some((value) => stepText === value || stepText.includes(value)))
			if (isClosedTrackingRow) return false
			return (
				(!keyword ||
					row.studentId.toLowerCase().includes(keyword) ||
					row.fullName.toLowerCase().includes(keyword) ||
					row.scholarship.toLowerCase().includes(keyword) ||
					row.status.toLowerCase().includes(keyword) ||
					row.currentStepLabel.toLowerCase().includes(keyword) ||
					row.currentStepOwnerLabel.toLowerCase().includes(keyword) ||
					toProviderLabel(row.provider).toLowerCase().includes(keyword)) &&
				matchesSelectedScholarshipGrantor(row)
			)
		})
	}, [allScholarshipTrackingRows, matchesSelectedScholarshipGrantor, scholarshipSearch])

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

	useEffect(() => {
		if (scholarshipTab !== "scholars") {
			setSelectedScholarshipScholarKeys([])
			return
		}
		const visibleKeys = new Set(scholarshipStudentTableRows.map((row) => row.scholarArchiveKey || row.trackingKey))
		setSelectedScholarshipScholarKeys((current) => current.filter((key) => visibleKeys.has(key)))
	}, [scholarshipStudentTableRows, scholarshipTab])

	const selectedScholarshipTrackingRow = useMemo(
		() =>
			allScholarshipTrackingRows.find((row) => row.trackingKey === selectedScholarshipTrackingKey) ||
			null,
		[allScholarshipTrackingRows, selectedScholarshipTrackingKey],
	)

	const selectedScholarshipScholarRows = useMemo(
		() =>
			scholarshipStudentRows.filter((row) =>
				selectedScholarshipScholarKeys.includes(row.scholarArchiveKey || row.trackingKey),
			),
		[scholarshipStudentRows, selectedScholarshipScholarKeys],
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
				columns: ["Student ID", "Full Name"],
				csvRows: warningReportRows.map((row) => [row.studentId, row.fullName]),
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
					columns: ["Student ID", "Full Name", "Scholarship", "Grantor", "Current Step"],
					csvRows: trackingReportRows.map((row) => [
						row.studentId,
						row.fullName,
						row.scholarship,
						row.grantor,
						row.currentStep,
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
					getGrantorScholarProgramName(row) &&
					(
						scholarshipProvider === "All" ||
						(row.providerType || toProviderType(row.grantorName || row.scholarshipTitle)) === scholarshipProvider
					),
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
					getGrantorScholarProgramName(row) &&
					(
						scholarshipProvider === "All" ||
						(row.providerType || toProviderType(row.grantorName || row.scholarshipTitle)) === scholarshipProvider
					),
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
		return studentsRaw.flatMap((student) => {
			const fallbackDate = toJsDate(student.createdAt || student.updatedAt)
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
	}, [studentsRaw, recordedApplicationReferences])

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
					label: "Requirements Requests",
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

	const approvedSoeRows = useMemo(() => {
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

	const rejectedSoeRows = useMemo(() => {
		const keyword = soeSearch.trim().toLowerCase()
		return soeRows.filter((row) => {
			if (row.reviewState !== "non_compliant") return false
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
			approved: soeRows.filter((row) => row.reviewState === "signed").length,
			rejected: soeRows.filter((row) => row.reviewState === "non_compliant").length,
		}),
		[soeRows],
	)

	const requestingSoeReportRows = useMemo(() => requestingSoeRows.map((row) => toSoeReportRow(row)), [requestingSoeRows])
	const approvedSoeReportRows = useMemo(() => approvedSoeRows.map((row) => toSoeReportRow(row)), [approvedSoeRows])
	const rejectedSoeReportRows = useMemo(() => rejectedSoeRows.map((row) => toSoeReportRow(row)), [rejectedSoeRows])
	const currentSemesterTag = getCurrentSemesterTag()

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
							? "Rejected"
							: "Waiting for Signature"
				const semesterTag =
					download.semesterTag ||
					download.soeSnapshot?.semesterTag ||
					download.requestSnapshot?.semesterTag ||
					snapshot.semesterTag ||
					currentSemesterTag
				return {
					...download,
					reviewSource: "download",
					semesterTag,
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
	}, [currentSemesterTag, soeDownloads, studentProfiles])

	const soeCheckingRows = useMemo(() => {
		const keyword = soeCheckSearch.trim().toLowerCase()
		return soeDownloadRows.filter((row) => {
			if (row.reviewState !== "incoming") return false
			const isCurrentCycle = !row.semesterTag || row.semesterTag === currentSemesterTag
			if (soeCheckingTab === "current" && !isCurrentCycle) return false
			if (soeCheckingTab === "previous" && isCurrentCycle) return false
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
				String(row.reviewStateLabel || "").toLowerCase().includes(keyword) ||
				String(row.semesterTag || "").toLowerCase().includes(keyword)
			)
		})
	}, [currentSemesterTag, soeCheckSearch, soeCheckingTab, soeDownloadRows])

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

	const approvedSoeTablePage = useMemo(
		() => paginateRows(approvedSoeRows, tablePages.approved_soe || 1, TABLE_PAGE_SIZE),
		[approvedSoeRows, tablePages],
	)

	const rejectedSoeTablePage = useMemo(
		() => paginateRows(rejectedSoeRows, tablePages.rejected_soe || 1, TABLE_PAGE_SIZE),
		[rejectedSoeRows, tablePages],
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
			current: soeDownloadRows.filter((row) => row.reviewState === "incoming" && (!row.semesterTag || row.semesterTag === currentSemesterTag)).length,
			previous: soeDownloadRows.filter((row) => row.reviewState === "incoming" && row.semesterTag && row.semesterTag !== currentSemesterTag).length,
		}),
		[currentSemesterTag, soeDownloadRows],
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
		() => selectedSoeRequestReviewRow || selectedSoeCheckingReviewRow,
		[selectedSoeCheckingReviewRow, selectedSoeRequestReviewRow],
	)
	const isSelectedSoeDownloadReview = selectedSoeReviewRow?.reviewSource === "download"
	const selectedSoeReviewStudent = useMemo(
		() =>
			selectedSoeReviewRow?.studentId
				? studentProfiles.find((student) => student.id === selectedSoeReviewRow.studentId) || null
				: null,
		[selectedSoeReviewRow, studentProfiles],
	)
	const selectedSoeReviewScholarship = useMemo(() => {
		if (!selectedSoeReviewStudent || !selectedSoeReviewRow) return null
		const scholarships = Array.isArray(selectedSoeReviewStudent.scholarships)
			? selectedSoeReviewStudent.scholarships
			: []
		const rowKeys = [
			selectedSoeReviewRow.scholarshipId,
			selectedSoeReviewRow.scholarshipName,
			selectedSoeReviewRow.providerType,
			selectedSoeReviewRow.requestNumber,
			selectedSoeReviewRow.applicationNumber,
		]
			.filter(Boolean)
			.map((value) => String(value).trim().toLowerCase())
		return (
			scholarships.find((scholarship) => {
				const scholarshipKeys = [
					scholarship.id,
					scholarship.name,
					scholarship.provider,
					scholarship.providerType,
					scholarship.requestNumber,
					scholarship.applicationNumber,
				]
					.filter(Boolean)
					.map((value) => String(value).trim().toLowerCase())
				return scholarshipKeys.some((key) => rowKeys.includes(key))
			}) || scholarships[0] || null
		)
	}, [selectedSoeReviewRow, selectedSoeReviewStudent])
	const selectedSoeReviewDocuments = useMemo(() => {
		const documentUrls = getDocumentUrlsForStudent(selectedSoeReviewStudent || {})
		const student = selectedSoeReviewStudent || {}
		return [
			{
				key: "cor",
				label: "COR",
				title: "Certificate of Registration",
				url: documentUrls.cor,
				name: student.corFile?.name || student.corDocument?.name || "COR",
				...(student.corFile || student.corDocument || {}),
			},
			{
				key: "cog",
				label: "COG",
				title: "Certificate of Grades",
				url: documentUrls.cog,
				name: student.cogFile?.name || student.cogDocument?.name || "COG",
				...(student.cogFile || student.cogDocument || {}),
			},
			{
				key: "school_id",
				label: "School ID",
				title: "School ID",
				url: documentUrls.schoolId,
				name:
					student.schoolIdFile?.name ||
					student.studentIdFile?.name ||
					student.validIdFile?.name ||
					"School ID",
				...(student.schoolIdFile || student.studentIdFile || student.validIdFile || {}),
			},
			{
				key: "application_form",
				label: "Application Form",
				title: "Application Form",
				url: documentUrls.applicationForm,
				name:
					student.scholarshipApplicationFile?.name ||
					student.applicationFormFile?.name ||
					"Application Form",
				...(student.scholarshipApplicationFile || student.applicationFormFile || {}),
			},
		]
	}, [selectedSoeReviewStudent])
	const selectedSoeReviewOtherDocuments = useMemo(
		() => collectOtherRequirementDocuments(selectedSoeReviewScholarship || {}),
		[selectedSoeReviewScholarship],
	)
	const selectedSoeReviewRejectionDetails = useMemo(() => {
		if (!selectedSoeReviewRow || selectedSoeReviewRow.reviewState !== "non_compliant") return []
		const normalizedRequest = normalizeMaterialRequest(selectedSoeReviewRow)
		const rejectedKeys =
			Array.isArray(normalizedRequest.rejectedMaterialKeys) && normalizedRequest.rejectedMaterialKeys.length > 0
				? normalizedRequest.rejectedMaterialKeys
				: Array.isArray(selectedSoeReviewRow.rejectedMaterialKeys)
					? selectedSoeReviewRow.rejectedMaterialKeys
					: []
		return rejectedKeys.map((materialKey) => {
			const material = getMaterialEntry(normalizedRequest, materialKey)
			return {
				key: materialKey,
				label: toMaterialLabel(materialKey),
				reason:
					material.rejectionReason ||
					selectedSoeReviewRow.rejectionReason ||
					selectedSoeReviewRow.reason ||
					"Reason not provided",
				notes:
					material.rejectionNotes ||
					selectedSoeReviewRow.rejectionNotes ||
					selectedSoeReviewRow.notes ||
					"",
			}
		})
	}, [selectedSoeReviewRow])

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

	const adminAnnouncementSourceOptions = useMemo(
		() => [
			{ value: "all", label: "All" },
			{ value: "admin", label: "Admin" },
			...activeGrantorRows.map((grantor) => ({
				value: `grantor:${grantor.id}`,
				label: buildGrantorName(grantor) || grantor.id,
			})),
		],
		[activeGrantorRows],
	)
	const allPortalAnnouncements = useMemo(() => {
		const grantorLookup = new Map(activeGrantorRows.map((grantor) => [grantor.id, grantor]))
		const adminRows = announcements.map((announcement) => ({
			...announcement,
			sourceType: "admin",
			sourceKey: "admin",
			sourceLabel: "Admin",
		}))
		const grantorRowsForAnnouncements = grantorAnnouncementsRaw.map((announcement) => {
			const grantor = grantorLookup.get(announcement.grantorId)
			const grantorLabel =
				announcement.grantorName ||
				announcement.providerLabel ||
				announcement.sourceLabel ||
				buildGrantorName(grantor || {}) ||
				announcement.grantorId ||
				"Grantor"
			return {
				...announcement,
				sourceType: "grantor",
				sourceKey: `grantor:${announcement.grantorId || toProviderType(grantorLabel)}`,
				sourceLabel: grantorLabel,
			}
		})
		return [...adminRows, ...grantorRowsForAnnouncements].sort(
			(left, right) => (toJsDate(right.createdAt || right.updatedAt || right.date)?.getTime() || 0) - (toJsDate(left.createdAt || left.updatedAt || left.date)?.getTime() || 0),
		)
	}, [activeGrantorRows, announcements, grantorAnnouncementsRaw])
	const filteredPortalAnnouncements = useMemo(() => {
		if (adminAnnouncementSourceFilter === "all") return allPortalAnnouncements
		return allPortalAnnouncements.filter((announcement) => announcement.sourceKey === adminAnnouncementSourceFilter)
	}, [adminAnnouncementSourceFilter, allPortalAnnouncements])
	const filteredCurrentAnnouncements = useMemo(
		() => filteredPortalAnnouncements.filter((announcement) => !isAnnouncementArchived(announcement)),
		[filteredPortalAnnouncements],
	)
	const filteredPreviousAnnouncements = useMemo(
		() => filteredPortalAnnouncements.filter((announcement) => isAnnouncementArchived(announcement)),
		[filteredPortalAnnouncements],
	)
	const compactAdminAnnouncements = useMemo(() => filteredCurrentAnnouncements.slice(0, 6), [filteredCurrentAnnouncements])
	const adminAnnouncementRows = adminAnnouncementTab === "archived" ? filteredPreviousAnnouncements : filteredCurrentAnnouncements

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

	const isAnalyticsLoading = !dataLoadState.students || !dataLoadState.applications || !dataLoadState.soe
	const isScholarshipLoading =
		!dataLoadState.students ||
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
		setSelectedStudentRecommendations([])
		setRecommendingScholarshipId("")
	}

	const recommendScholarshipToSelectedStudent = async (recommendation = {}) => {
		if (!selectedStudent?.id || !recommendation?.grantorId || recommendingScholarshipId) return
		const recommendationId = recommendation.announcementId || recommendation.grantorId
		setRecommendingScholarshipId(recommendationId)
		try {
			const scholarshipName =
				recommendation.announcementTitle ||
				recommendation.providerLabel ||
				recommendation.grantorName ||
				"recommended scholarship"
			const grantorName = recommendation.grantorName || recommendation.providerLabel || "a grantor"
			await createStudentNotification({
				studentId: selectedStudent.id,
				source: "personal",
				type: "admin_scholarship_recommendation",
				title: "Scholarship Recommendation",
				message: `BulsuScholar Admin recommends ${scholarshipName} from ${grantorName} based on your GWA, location, and scholarship profile. Review the scholarship before applying.`,
				studentName: selectedStudent.fullName || studentFullName(selectedStudent),
				grantorId: recommendation.grantorId || "",
				grantorName,
				scholarshipName,
				announcementId: recommendation.announcementId || "",
				minimumGwa: recommendation.minimumGwa ?? recommendation.minGwa ?? "",
				score: recommendation.score ?? "",
				reasons: recommendation.reasons || [],
				authorName: "BulsuScholar Admin",
				read: false,
				createdAt: serverTimestamp(),
			})
			toast.success(`Recommendation sent to ${selectedStudent.fullName || "student"}.`)
		} catch (error) {
			console.error("Unable to send student scholarship recommendation.", {
				studentId: selectedStudent.id,
				recommendation,
				error,
			})
			toast.error("Unable to send the recommendation right now.")
		} finally {
			setRecommendingScholarshipId("")
		}
	}

	const isPreviewPdf = (file = {}) => {
		const type = String(file?.type || file?.contentType || "").toLowerCase()
		const name = String(file?.name || file?.url || "").toLowerCase()
		return type.includes("pdf") || name.includes(".pdf")
	}

	const openDocumentPreview = (document) => {
		if (!document?.url) return
		setPreviewDocument({
			...document,
			title: document.title || document.label || "Document",
			url: normalizeDocumentPreviewUrl(document.url),
			name: document.name || document.title || document.label || "document",
			isPdf: isPreviewPdf(document),
		})
	}

	const closeDocumentPreview = () => setPreviewDocument(null)

	const closeAdminScholarModal = () => {
		setAdminScholarModalOpen(false)
		setAdminScholarForm(ADMIN_SCHOLAR_FORM)
		setAdminScholarImportRows([])
		setAdminScholarImportHeaders([])
		setAdminScholarColumnMapping([])
		setSelectedAdminScholarImportRows([])
		setHighlightedAdminScholarGrantorRows([])
		setAdminScholarImportGrantorAssignments({})
		setAdminScholarImportFile(null)
		setAdminScholarImportWarnings([])
	}

	const resolveAdminScholarGrantor = useCallback(
		(value = "") => {
			const lookup = normalizeGrantorScholarLookupValue(value)
			if (!lookup) return null
			return activeGrantorRows.find((grantor) => {
				const candidates = [
					grantor.id,
					buildGrantorName(grantor),
					grantor.providerName,
					grantor.grantorName,
					grantor.organization,
					grantor.email,
					grantor.providerType,
					toProviderLabel(grantor.providerType),
				]
				return candidates.some((candidate) => normalizeGrantorScholarLookupValue(candidate) === lookup)
			}) || null
		},
		[activeGrantorRows],
	)

	const parseAdminScholarImportFile = async (file) => {
		if (!file) return
		try {
			const buffer = await file.arrayBuffer()
			const workbook = read(buffer, { type: "array" })
			const sheet = workbook.Sheets[workbook.SheetNames[0]]
			const rows = utils.sheet_to_json(sheet, { header: 1, defval: "" })
				.map((row) => row.map((cell) => String(cell ?? "").trim()))
				.filter((row) => row.some(Boolean))
			if (rows.length < 2) {
				toast.error("Import file must include a header row and at least one student row.")
				return
			}
			const [headers, ...bodyRows] = rows
			const displayHeaders = ["", ...headers]
			const fieldMap = ["", ...headers.map((header) => fieldFromAdminImportHeader(header))]
			const parsedRows = bodyRows.map((row, rowIndex) => ({
				rowNumber: rowIndex + 2,
				raw: row,
			}))
			setAdminScholarImportFile(file)
			setAdminScholarImportHeaders(displayHeaders)
			setAdminScholarColumnMapping(fieldMap)
			setAdminScholarImportRows(parsedRows)
			setSelectedAdminScholarImportRows([])
			setHighlightedAdminScholarGrantorRows([])
			setAdminScholarImportGrantorAssignments({})
			setAdminScholarImportWarnings([])
			toast.success(`${parsedRows.length} import row${parsedRows.length === 1 ? "" : "s"} loaded. Select a grantor before saving.`)
		} catch (error) {
			console.error("Unable to parse admin scholar import file.", error)
			toast.error("Unable to read the selected spreadsheet.")
		}
	}

	const clearAdminScholarImport = () => {
		setAdminScholarImportFile(null)
		setAdminScholarImportHeaders([])
		setAdminScholarColumnMapping([])
		setAdminScholarImportRows([])
		setSelectedAdminScholarImportRows([])
		setHighlightedAdminScholarGrantorRows([])
		setAdminScholarImportGrantorAssignments({})
		setAdminScholarImportWarnings([])
	}

	const removeSelectedAdminScholarImportRows = () => {
		if (selectedAdminScholarImportRows.length === 0) return
		const selected = new Set(selectedAdminScholarImportRows)
		const removedRowNumbers = new Set(adminScholarImportRows.filter((_, index) => selected.has(index)).map((row) => row.rowNumber))
		setAdminScholarImportRows((prev) => prev.filter((_, index) => !selected.has(index)))
		setSelectedAdminScholarImportRows([])
		setHighlightedAdminScholarGrantorRows((prev) => prev.filter((rowNumber) => !removedRowNumbers.has(rowNumber)))
		setAdminScholarImportGrantorAssignments((prev) => {
			const next = { ...prev }
			removedRowNumbers.forEach((rowNumber) => delete next[rowNumber])
			return next
		})
	}

	const getAdminScholarImportGrantorLabel = (grantorId = "") =>
		adminScholarGrantorOptions.find((grantor) => grantor.value === grantorId)?.label || ""

	const applyAdminScholarImportGrantor = (grantorId = "") => {
		setAdminScholarForm((prev) => ({ ...prev, grantorId }))
		if (!adminScholarImportRows.length || !grantorId || highlightedAdminScholarGrantorRows.length === 0) return
		setAdminScholarImportGrantorAssignments((prev) => {
			const next = { ...prev }
			highlightedAdminScholarGrantorRows.forEach((rowNumber) => {
				next[rowNumber] = grantorId
			})
			return next
		})
		setHighlightedAdminScholarGrantorRows([])
	}

	const buildAdminScholarImportRecord = (rowRecord = {}) => {
		const record = {
			rowNumber: rowRecord.rowNumber,
			raw: rowRecord.raw || [],
			reservedGrantorColumn: "",
		}
		adminScholarColumnMapping.forEach((field, colIndex) => {
			if (!field || colIndex === 0) return
			record[field] = rowRecord.raw?.[colIndex - 1] || ""
		})
		if (!record.fullName) {
			record.fullName = [record.fname, record.mname, record.lname].filter(Boolean).join(" ").trim()
		}
		return record
	}

	const submitAdminScholarRows = async (inputRows = []) => {
		if (isBusy) return
		setIsBusy(true)
		try {
			const existingStudents = studentProfiles
			const acceptedByGrantor = new Map()
			const acceptedScholars = []
			const blockedRows = []
			const warningRows = []
			const groupedPayload = new Map()

			for (const row of inputRows) {
				const grantor = resolveAdminScholarGrantor(row.grantorId || row.grantorInput)
				if (!grantor) {
					blockedRows.push({ row, reason: "Grantor not found or inactive." })
					continue
				}

				let payload = buildAdminScholarPayload(row, grantor)
				if (!payload.studentId && !payload.fullName) {
					blockedRows.push({ row, reason: "Missing student identity." })
					continue
				}

				const accountDuplicate = await findScholarDuplicate(payload, existingStudents)
				if (accountDuplicate?.record) {
					payload = buildAdminScholarPayloadFromStudentAccount(accountDuplicate.record, payload)
				}

				const sameGrantorExisting = grantorScholarsRaw.find((scholar) => {
					if (scholar.archived === true) return false
					if (String(scholar.grantorId || "").trim() !== String(grantor.id || "").trim()) return false
					const sameId =
						normalizeStudentIdKey(scholar.studentId || scholar.studentnumber || scholar.studentNumber) &&
						normalizeStudentIdKey(scholar.studentId || scholar.studentnumber || scholar.studentNumber) === normalizeStudentIdKey(payload.studentId)
					const sameName =
						normalizeGrantorScholarLookupValue(buildGrantorScholarFullName(scholar)) &&
						normalizeGrantorScholarLookupValue(buildGrantorScholarFullName(scholar)) === normalizeGrantorScholarLookupValue(payload.fullName)
					return sameId || sameName
				})
				if (sameGrantorExisting) {
					blockedRows.push({ row, reason: "Student already exists in the same grantor roster." })
					continue
				}

				const acceptedRowsForGrantor = acceptedByGrantor.get(grantor.id) || []
				const sameBatchDuplicate = acceptedRowsForGrantor.find((scholar) => {
					const sameId =
						normalizeStudentIdKey(scholar.studentId) &&
						normalizeStudentIdKey(scholar.studentId) === normalizeStudentIdKey(payload.studentId)
					const sameName =
						normalizeGrantorScholarLookupValue(scholar.fullName) &&
						normalizeGrantorScholarLookupValue(scholar.fullName) === normalizeGrantorScholarLookupValue(payload.fullName)
					return sameId || sameName
				})
				if (sameBatchDuplicate) {
					blockedRows.push({ row, reason: "Duplicate row for the same grantor in this import." })
					continue
				}

				const duplicate = await findScholarDuplicate(payload, [...grantorScholarsRaw, ...acceptedScholars])
				if (duplicate?.record) {
					const sameGrantor = String(duplicate.record.grantorId || "").trim() === String(grantor.id || "").trim()
					if (sameGrantor) {
						blockedRows.push({ row, reason: "Student already exists in the same grantor roster." })
						continue
					}
					warningRows.push({ row, payload, duplicate })
					blockedRows.push({ row, reason: "Student already exists in another grantor roster." })
					continue
				}

				acceptedScholars.push(payload)
				acceptedByGrantor.set(grantor.id, [...acceptedRowsForGrantor, payload])
				groupedPayload.set(grantor.id, [...(groupedPayload.get(grantor.id) || []), {
					...payload,
					createdAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				}])
			}

			if (warningRows.length > 0) {
				const examples = warningRows.slice(0, 3).map(({ row, duplicate }) => {
					const matchedName = duplicate.record?.fullName || buildGrantorScholarFullName(duplicate.record || {}) || "an existing student"
					const owner = duplicate.record?.grantorName || duplicate.record?.grantorId || "another grantor"
					return `row ${row.rowNumber || "-"} matches ${matchedName} under ${owner}`
				}).join("; ")
				setAdminScholarImportWarnings(
					warningRows.map(({ row, duplicate }) => {
						const matchedName = duplicate.record?.fullName || buildGrantorScholarFullName(duplicate.record || {}) || "an existing student"
						const owner = duplicate.record?.grantorName || duplicate.record?.grantorId || "another grantor"
						return `Before import: Row ${row.rowNumber || "-"} matches ${matchedName} under ${owner}. This row will not be added.`
					}),
				)
				const confirmed = window.confirm(`${warningRows.length} student${warningRows.length === 1 ? "" : "s"} already appear in another grantor roster. Highlighted rows will not be added. Continue importing only the valid rows?\n\n${examples}`)
				if (!confirmed) return
			}

			let insertedCount = 0
			for (const [grantorId, scholars] of groupedPayload.entries()) {
				if (!scholars.length) continue
				await createGrantorScholarsWorkflow({ grantorId, scholars })
				insertedCount += scholars.length
			}

			if (warningRows.length > 0) {
				await createAdminNotification({
					type: "duplicate_scholarship_prevented",
					title: "Duplicate Scholarship Prevented",
					message: `Admin blocked ${warningRows.length} student${warningRows.length === 1 ? "" : "s"} from being added to another grantor roster.`,
					count: warningRows.length,
					source: "admin_roster_add_prevention",
					read: false,
					createdAt: serverTimestamp(),
				}).catch((error) => console.error("Admin duplicate warning notification failed.", error))

				await Promise.all(
					warningRows.map(({ row, payload, duplicate }, index) => {
						const warningPayload = buildAdminDuplicateScholarshipWarningRecord({ row, payload, duplicate })
						const warningId = [
							"duplicate_scholarship",
							warningPayload.studentId || "student",
							warningPayload.newGrantorId || "grantor",
							Date.now(),
							index,
						].join("_")
						return setDoc(doc(db, "studentWarning", warningId), warningPayload).catch((error) => {
							console.error("Admin duplicate scholarship warning save failed.", error)
							return null
						})
					}),
				)
			}

			setAdminScholarImportWarnings([
				...warningRows.map(({ row }) => `Row ${row.rowNumber || "-"} blocked because the student already has another grantor roster.`),
				...blockedRows.map(({ row, reason }) => `Row ${row.rowNumber || "-"} skipped: ${reason}`),
			])
			if (insertedCount > 0) {
				toast.success(`${insertedCount} scholar${insertedCount === 1 ? "" : "s"} added by admin.`)
				closeAdminScholarModal()
			} else {
				toast.warning("No scholars were added. Review the skipped rows.")
			}
		} catch (error) {
			console.error("Unable to add admin scholars.", error)
			toast.error("Unable to add scholars right now.")
		} finally {
			setIsBusy(false)
		}
	}

	const submitAdminScholarManual = () => {
		if (!adminScholarForm.grantorId) {
			toast.error("Select an active grantor first.")
			return
		}
		if (!adminScholarForm.studentId.trim() || !adminScholarForm.course.trim()) {
			toast.error("Student ID and course are required.")
			return
		}
		if (!adminScholarForm.fname.trim() && !adminScholarForm.fullName?.trim()) {
			toast.error("Student name is required.")
			return
		}
		submitAdminScholarRows([{ ...adminScholarForm, grantorInput: adminScholarForm.grantorId, rowNumber: "Manual" }])
	}

	const submitAdminScholarImport = () => {
		if (!adminScholarImportRows.length) {
			toast.error("Upload a spreadsheet first.")
			return
		}
		const mappedRows = adminScholarImportRows.map((row) => buildAdminScholarImportRecord(row))
		const rowsMissingGrantor = mappedRows.filter((row) => !(adminScholarImportGrantorAssignments[row.rowNumber] || adminScholarForm.grantorId))
		if (rowsMissingGrantor.length > 0) {
			toast.error("Assign a grantor to every imported row, or select one grantor as the fallback.")
			return
		}
		const hasIdentityMapping = mappedRows.some((row) => row.studentId || row.fullName || row.fname || row.lname)
		if (!hasIdentityMapping) {
			toast.error("Map at least one identity column such as Student ID, Full Name, First Name, or Last Name.")
			return
		}
		submitAdminScholarRows(
			mappedRows.map((row) => ({
				...row,
				grantorId: adminScholarImportGrantorAssignments[row.rowNumber] || adminScholarForm.grantorId,
				grantorInput: adminScholarImportGrantorAssignments[row.rowNumber] || adminScholarForm.grantorId,
			})),
		)
	}

	const downloadPreviewDocument = async () => {
		if (!previewDocument?.url) return
		try {
			const blob = await getStorageObjectBlob(previewDocument)
			const url = URL.createObjectURL(blob)
			const link = document.createElement("a")
			link.href = url
			link.download = previewDocument.name || "document"
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)
		} catch (error) {
			console.error("Failed to download admin student document:", error)
			toast.error("Unable to download the document.")
		}
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

		const currentStep = selectedScholarshipTrackingRow.trackingProgress.currentStep
		if (!currentStep) {
			toast.info("No active tracking step is available for this scholarship.")
			return
		}

		if (currentStep.owner === "student") {
			toast.info("This step must be completed by the student.")
			return
		}

		if (!selectedScholarshipTrackingRow.trackingProgress.canAdminCompleteCurrentStep) {
			toast.info(
				selectedScholarshipTrackingRow.trackingProgress.adminCompletionReason ||
					"This step cannot be completed yet.",
			)
			return
		}

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

		if (canUseGrantorConfirmationForStep(currentStep.id) && matchingApplication?.grantorId) {
			await runAction(async () => {
				const confirmation = buildApplicationDecisionConfirmation({
					decision: "approve",
					stepId: currentStep.id,
					stepLabel: currentStep.label,
					studentId: selectedScholarshipTrackingRow.studentId,
					studentName: selectedScholarshipTrackingRow.fullName,
					scholarshipName:
						selectedScholarshipTrackingRow.scholarship ||
						selectedScholarshipTrackingRow.scholarshipEntry.name ||
						"Scholarship Application",
					applicationNumber:
						matchingApplication.applicationNumber ||
						matchingApplication.requestNumber ||
						matchingApplication.id ||
						"",
				})
				await setDoc(
					doc(db, "scholarshipApplications", matchingApplication.id),
					{
						decisionConfirmation: confirmation,
						grantorConfirmationPending: true,
						grantorConfirmationDecision: "approve",
						grantorConfirmationDeadlineAt: confirmation.deadlineAt,
						updatedAt: serverTimestamp(),
					},
					{ merge: true },
				)
				await createGrantorNotification({
					grantorId: matchingApplication.grantorId,
					type: "application_decision_confirmation",
					title: "Application Approval Needs Confirmation",
					message: `Admin approved ${selectedScholarshipTrackingRow.fullName}'s ${currentStep.label}. Confirm approval within 3 days or it will be approved automatically.`,
					studentId: selectedScholarshipTrackingRow.studentId,
					studentName: selectedScholarshipTrackingRow.fullName,
					applicationNumber: confirmation.applicationNumber,
					scholarshipName: confirmation.scholarshipName,
					decision: "approve",
					deadlineAt: confirmation.deadlineAt,
					read: false,
					createdAt: serverTimestamp(),
				})
			}, `${currentStep.label} approval sent to the grantor for confirmation.`)
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

			const isDocumentReview = currentStep.id === "document_review"
			await createStudentNotification({
				studentId: selectedScholarshipTrackingRow.studentId,
				source: "personal",
				type: "scholarship_progress",
				title: isDocumentReview ? "Document Review Passed" : `${currentStep.label} Completed`,
				message: isDocumentReview
					? `BulsuScholar Admin reviewed your submitted documents and marked them as passed for ${updatedScholarship.name || "your scholarship application"}.`
					: `BulsuScholar Admin completed the ${currentStep.label.toLowerCase()} stage for ${updatedScholarship.name || "your scholarship application"}.`,
				grantorId: updatedScholarship.grantorId || updatedScholarship.providerId || "",
				grantorName: updatedScholarship.grantorName || updatedScholarship.providerLabel || "",
				applicationNumber:
					matchingApplication?.applicationNumber ||
					matchingApplication?.requestNumber ||
					updatedScholarship.applicationNumber ||
					updatedScholarship.requestNumber ||
					"",
				scholarshipId: updatedScholarship.id || "",
				scholarshipName: updatedScholarship.name || "",
				stageId: currentStep.id,
				stageLabel: currentStep.label,
				authorName: "BulsuScholar Admin",
				read: false,
				createdAt: serverTimestamp(),
			})
		}, `${currentStep.label} completed. The student can now move to the next step.`)
	}



	const openRejectScholarshipApplicationModal = () => {
		if (!selectedScholarshipTrackingRow?.scholarshipEntry || !selectedScholarshipTrackingRow?.studentSnapshot) return
		setAdminRejectReason(APPLICATION_REJECTION_REASONS[0])
		setAdminRejectNotes("")
		setAdminRejectModalOpen(true)
	}

	const closeRejectScholarshipApplicationModal = () => {
		if (isBusy) return
		setAdminRejectModalOpen(false)
		setAdminRejectReason(APPLICATION_REJECTION_REASONS[0])
		setAdminRejectNotes("")
	}

	const executeRejectScholarshipApplication = async (trackingRow = null) => {
		if (!trackingRow?.scholarshipEntry || !trackingRow?.studentSnapshot) return
		if (!adminRejectReason) {
			toast.error("Select a rejection reason first.")
			return
		}
		await runAction(async () => {
			const rejectedAt = new Date().toISOString()
			const rejectedByName = "BulsuScholar Admin"
			const rejectedMessage = `${rejectedByName} rejected your application for ${trackingRow.scholarship || trackingRow.scholarshipEntry.name || "your scholarship application"}. Reason: ${adminRejectReason}${adminRejectNotes.trim() ? ` - ${adminRejectNotes.trim()}` : ""}`
			const matchingApplications = applicationsRaw.filter((application) => {
				return (
					application.studentId === trackingRow.studentId &&
					(application.scholarshipId === trackingRow.scholarshipEntry.id ||
						application.applicationNumber === trackingRow.scholarshipEntry.applicationNumber ||
						application.requestNumber === trackingRow.scholarshipEntry.requestNumber ||
						application.providerType === trackingRow.scholarshipEntry.providerType)
				)
			})

			const grantorOwnedMatchingApplications = matchingApplications.filter((application) => application.grantorId)
			if (
				canUseGrantorConfirmationForStep(trackingRow.trackingProgress?.currentStep?.id) &&
				grantorOwnedMatchingApplications.length > 0
			) {
				for (const application of grantorOwnedMatchingApplications) {
					const confirmation = buildApplicationDecisionConfirmation({
						decision: "reject",
						stepId: trackingRow.trackingProgress?.currentStep?.id || "",
						stepLabel: trackingRow.trackingProgress?.currentStepLabel || "Current Stage",
						studentId: trackingRow.studentId,
						studentName: trackingRow.fullName,
						scholarshipName:
							trackingRow.scholarship || trackingRow.scholarshipEntry.name || "Scholarship Application",
						applicationNumber:
							application.applicationNumber || application.requestNumber || application.id || "",
						reason: adminRejectReason,
						notes: adminRejectNotes.trim(),
					})
					await setDoc(
						doc(db, "scholarshipApplications", application.id),
						{
							decisionConfirmation: confirmation,
							grantorConfirmationPending: true,
							grantorConfirmationDecision: "reject",
							grantorConfirmationDeadlineAt: confirmation.deadlineAt,
							adminProposedRejectionReason: adminRejectReason,
							adminProposedRejectionNotes: adminRejectNotes.trim(),
							adminProposedRejectionMessage: rejectedMessage,
							updatedAt: serverTimestamp(),
						},
						{ merge: true },
					)
					await createGrantorNotification({
						grantorId: application.grantorId,
						type: "application_decision_confirmation",
						title: "Application Rejection Needs Confirmation",
						message: `Admin rejected ${trackingRow.fullName}'s application. Confirm rejection within 3 days or it will be rejected automatically. Reason: ${adminRejectReason}${adminRejectNotes.trim() ? ` - ${adminRejectNotes.trim()}` : ""}`,
						studentId: trackingRow.studentId,
						studentName: trackingRow.fullName,
						applicationNumber: confirmation.applicationNumber,
						scholarshipName: confirmation.scholarshipName,
						decision: "reject",
						reason: adminRejectReason,
						notes: adminRejectNotes.trim(),
						deadlineAt: confirmation.deadlineAt,
						read: false,
						createdAt: serverTimestamp(),
					})
				}
				setAdminRejectModalOpen(false)
				toast.success("Rejection sent to the grantor for confirmation.")
				return
			}

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

			for (const application of matchingApplications) {
				await setDoc(
					doc(db, "scholarshipApplications", application.id),
					{
						status: "Rejected",
						rejected: true,
						archived: true,
						rejectionReason: adminRejectReason,
						rejectionNotes: adminRejectNotes.trim(),
						rejectionMessage: rejectedMessage,
						rejectedAt,
						rejectedBy: "admin",
						rejectedByName,
						rejectedByRole: "admin",
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
						status: "Rejected",
						reviewState: "rejected",
						rejectionReason: adminRejectReason,
						rejectionNotes: adminRejectNotes.trim(),
						rejectionMessage: rejectedMessage,
						rejectedAt,
						rejectedBy: "admin",
						rejectedByName,
						rejectedByRole: "admin",
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
						status: "Rejected",
						reviewState: "rejected",
						rejectionReason: adminRejectReason,
						rejectionNotes: adminRejectNotes.trim(),
						rejectionMessage: rejectedMessage,
						rejectedAt,
						rejectedBy: "admin",
						rejectedByName,
						rejectedByRole: "admin",
						updatedAt: serverTimestamp(),
					},
					{ merge: true },
				)
			}

			await createStudentNotification({
				studentId: trackingRow.studentId,
				source: "personal",
				type: "application_rejected",
				title: "Scholarship Application Rejected",
				message: rejectedMessage,
				grantorId: trackingRow.scholarshipEntry.grantorId || trackingRow.scholarshipEntry.providerId || "",
				grantorName: trackingRow.scholarshipEntry.grantorName || trackingRow.scholarshipEntry.providerLabel || "",
				applicationNumber:
					matchingApplications[0]?.applicationNumber ||
					matchingApplications[0]?.requestNumber ||
					trackingRow.scholarshipEntry.applicationNumber ||
					trackingRow.scholarshipEntry.requestNumber ||
					"",
				scholarshipId: trackingRow.scholarshipEntry.id || "",
				scholarshipName: trackingRow.scholarship || trackingRow.scholarshipEntry.name || "",
				rejectionReason: adminRejectReason,
				rejectionNotes: adminRejectNotes.trim(),
				rejectionMessage: rejectedMessage,
				rejectedBy: "admin",
				rejectedByName,
				rejectedByRole: "admin",
				authorName: rejectedByName,
				read: false,
				createdAt: rejectedAt,
			})

			setAdminRejectModalOpen(false)
			setAdminRejectReason(APPLICATION_REJECTION_REASONS[0])
			setAdminRejectNotes("")
			closeScholarshipTrackingModal()
		}, "Scholarship application rejected.")
	}

	const openBatchArchiveConfirmation = () => {
		setAdminConfirmDialog({
			type: "batch_archive",
			title: "Archive Selected Students",
			message: `Are you sure you want to archive ${selectedStudentIds.length} students? This will disable their account access and move them to the archive list.`,
			confirmLabel: "Archive Selected",
			tone: "danger",
		})
	}

	const openGrantorArchiveConfirmation = () => {
		setAdminConfirmDialog({
			type: "batch_archive_grantors",
			title: "Archive Selected Grantors",
			message: `Are you sure you want to archive ${selectedGrantorIds.length} grantors? This will move them to the archived grantor list.`,
			confirmLabel: "Archive Selected",
			tone: "danger",
		})
	}

	const openScholarshipScholarArchiveConfirmation = () => {
		setAdminConfirmDialog({
			type: "batch_archive_scholarship_scholars",
			title: "Archive Selected Scholars",
			message: `Are you sure you want to archive ${selectedScholarshipScholarKeys.length} selected scholar records? This will move them out of the active scholarship roster.`,
			confirmLabel: "Archive Selected",
			tone: "danger",
		})
	}

	const handleBatchArchive = async () => {
		const targetIds = [...selectedStudentIds]
		setAdminConfirmDialog(null)
		await runAction(async () => {
			const batch = writeBatch(db)
			targetIds.forEach((id) => {
				const student = studentProfiles.find((s) => s.id === id)
				const nextScholarships = (student?.scholarships || []).map((entry) => ({
					...entry,
					adminBlocked: false,
					adminBlockedAt: null,
				}))

				batch.set(
					doc(db, "students", id),
					{
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
							...(student?.restrictions || {}),
							accountAccess: false,
							scholarshipEligibility: false,
							complianceHold: false,
						},
						updatedAt: serverTimestamp(),
					},
					{ merge: true },
				)
			})
			await batch.commit()
			setSelectedStudentIds([])
		}, `Successfully archived ${targetIds.length} students.`)
	}

	const handleGrantorBatchArchive = async () => {
		const targetIds = [...selectedGrantorIds]
		setAdminConfirmDialog(null)
		await runAction(async () => {
			const batch = writeBatch(db)
			targetIds.forEach((id) => {
				const archivePayload = {
					archived: true,
					archivedAt: serverTimestamp(),
					status: "Archived",
					updatedAt: serverTimestamp(),
				}
				batch.set(doc(db, "providers", id), archivePayload, { merge: true })
				batch.set(doc(db, "grantorPortals", id), archivePayload, { merge: true })
			})
			await batch.commit()
			setSelectedGrantorIds([])
		}, `Successfully archived ${targetIds.length} grantors.`)
	}

	const handleScholarshipScholarBatchArchive = async () => {
		const targetRows = [...selectedScholarshipScholarRows].filter((row) => row.rawScholar?.id && row.rawScholar?.grantorId)
		setAdminConfirmDialog(null)
		if (!targetRows.length) {
			toast.warning("No selected scholarship rows can be archived.")
			return
		}
		await runAction(async () => {
			const grouped = new Map()
			targetRows.forEach((row) => {
				const grantorId = row.rawScholar.grantorId
				grouped.set(grantorId, [...(grouped.get(grantorId) || []), row.rawScholar.id])
			})
			for (const [grantorId, scholarIds] of grouped.entries()) {
				await updateGrantorScholarsWorkflow({
					grantorId,
					scholarIds,
					data: {
						archived: true,
						status: "Archived",
						archivedAt: serverTimestamp(),
						updatedAt: serverTimestamp(),
						archivedBy: "admin",
					},
				})
			}
			setSelectedScholarshipScholarKeys([])
		}, `Successfully archived ${targetRows.length} scholar${targetRows.length === 1 ? "" : "s"}.`)
	}

	const confirmAdminDialogAction = async () => {
		if (!adminConfirmDialog || isBusy) return
		const currentDialog = adminConfirmDialog
		setAdminConfirmDialog(null)

		if (currentDialog.type === "batch_archive") {
			await handleBatchArchive()
			return
		}

		if (currentDialog.type === "batch_archive_grantors") {
			await handleGrantorBatchArchive()
			return
		}

		if (currentDialog.type === "batch_archive_scholarship_scholars") {
			await handleScholarshipScholarBatchArchive()
			return
		}

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
			await materialRequestWorkflow({
				updates: [{
					table: "students",
					id: studentId,
					data: {
						soeLastExportAt: null,
						soeCooldownOverrideAt: serverTimestamp(),
						updatedAt: serverTimestamp(),
					},
				}],
			})
			if (row?.id) {
				await materialRequestWorkflow({
					updates: [{
						table: "soe_requests",
						id: row.id,
						data: {
							"materials.soe.downloadedAt": null,
							downloadStatus: null,
							downloadedAt: null,
							updatedAt: serverTimestamp(),
						},
					}],
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

	const markSoeReview = async (row, action, rejectionDetails = {}) => {
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
				? "Requirement requests"
				: `${toMaterialLabel(pendingMaterialKeys[0])} request`
		const rejectionReason = String(rejectionDetails.reason || "").trim()
		const rejectionNotes = String(rejectionDetails.notes || "").trim()
		const rejectionMessage = rejectionReason
			? `Your ${primaryMaterialLabel.toLowerCase()} was rejected. Reason: ${rejectionReason}${rejectionNotes ? ` - ${rejectionNotes}` : ""}`
			: `Your ${primaryMaterialLabel.toLowerCase()} was rejected.`

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
				requestUpdate[`materials.${materialKey}.rejectionReason`] = action === "non_compliant" ? rejectionReason : ""
				requestUpdate[`materials.${materialKey}.rejectionNotes`] = action === "non_compliant" ? rejectionNotes : ""
			})

			await materialRequestWorkflow({
				updates: [{
					table: "soe_requests",
					id: row.id,
					data: requestUpdate,
				}],
			})

			if (student && hasPendingSoe) {
				const reviewedScholarships = student.scholarships.map((entry) => {
					const matchesRequest =
						entry.id === row.scholarshipId ||
						entry.requestNumber === row.requestNumber ||
						entry.requestNumber === row.scholarshipId
					if (!matchesRequest) return entry
					const nextTracking =
						action === "signed"
							? completeScholarshipTrackingStep(entry.tracking, {
									providerType: entry.providerType || entry.provider || entry.name,
									scholarshipName: entry.name || entry.provider || "Scholarship",
									stepId: "request_materials",
									completedBy: "admin",
								})
							: entry.tracking
					return {
						...entry,
						finalizedState: action === "signed" ? "Approved" : "Non-Compliant",
						tracking: nextTracking,
					}
				})

				if (action === "signed") {
					await materialRequestWorkflow({
						updates: [{
							table: "students",
							id: student.id,
							data: {
								scholarships: reviewedScholarships,
								updatedAt: serverTimestamp(),
							},
						}],
					})
					await createStudentNotification({
						studentId: student.id,
						source: "personal",
						type: "material_request_approved",
						title: "Requirements Request Approved",
						message: `Your ${primaryMaterialLabel.toLowerCase()} for ${row.scholarshipName || "your scholarship"} was approved. You can now proceed to the downloading materials stage.`,
						studentName: student.fullName || studentFullName(student),
						scholarshipName: row.scholarshipName || "",
						applicationNumber: row.requestNumber || row.applicationNumber || row.id || "",
						materialLabel: primaryMaterialLabel,
						stageId: "request_materials",
						stageLabel: "Requesting of Materials",
						approvedBy: "BulsuScholar Admin",
						authorName: "BulsuScholar Admin",
						read: false,
						createdAt: serverTimestamp(),
					}).catch((error) => console.error("Student material approval notification failed.", error))
				}

				if (action === "non_compliant") {
					await createStudentNotification({
						studentId: student.id,
						type: "material_request_rejected",
						title: "Requirements Request Rejected",
						message: rejectionMessage,
						studentName: student.fullName || studentFullName(student),
						scholarshipName: row.scholarshipName || "",
						applicationNumber: row.requestNumber || row.id || "",
						reason: rejectionReason,
						notes: rejectionNotes,
						rejectedBy: "BulsuScholar Admin",
						read: false,
						createdAt: serverTimestamp(),
					}).catch((error) => console.error("Student material rejection notification failed.", error))
				}
			}

			setSelectedSoeReviewId("")
		}, action === "signed" ? `${primaryMaterialLabel} approved.` : `${primaryMaterialLabel} rejected.`)
	}

	const openSoeRejectModal = (row) => {
		setSoeRejectModalRow(row)
		setSoeRejectReason(APPLICATION_REJECTION_REASONS[0])
		setSoeRejectNotes("")
	}

	const closeSoeRejectModal = () => {
		setSoeRejectModalRow(null)
		setSoeRejectReason(APPLICATION_REJECTION_REASONS[0])
		setSoeRejectNotes("")
	}

	const confirmSoeRejection = async () => {
		if (!soeRejectModalRow) return
		if (!soeRejectReason) {
			toast.error("Select a rejection reason first.")
			return
		}
		await markSoeReview(soeRejectModalRow, "non_compliant", {
			reason: soeRejectReason,
			notes: soeRejectNotes,
		})
		closeSoeRejectModal()
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

	const openAnnouncementImagePreview = (url) => {
		setAnnouncementImagePreview(url)
		setAnnouncementImageZoom(1)
	}

	const closeAnnouncementImagePreview = () => {
		setAnnouncementImagePreview("")
		setAnnouncementImageZoom(1)
	}

	const adjustAnnouncementImageZoom = (amount) => {
		setAnnouncementImageZoom((prev) => Math.min(3, Math.max(0.5, Number((prev + amount).toFixed(2)))))
	}

	const handleAnnouncementImageZoom = (event) => {
		event.preventDefault()
		event.stopPropagation()
		adjustAnnouncementImageZoom(event.deltaY < 0 ? 0.12 : -0.12)
	}

	const resetAnnouncementDraft = () => {
		setAnnouncementTitle("")
		setAnnouncementDescription("")
		setAnnouncementType("Update")
		setAnnouncementImageFiles([])
		setAnnouncementStartDate("")
		setAnnouncementEndDate("")
		setShowAnnouncementSchedule(false)
	}

	const closeCreateAdminAnnouncementModal = () => {
		setShowCreateAdminAnnouncementModal(false)
		resetAnnouncementDraft()
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
			const uploads = await Promise.all(announcementImageFiles.map((file) => uploadToStorage(file)))
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
			resetAnnouncementDraft()
			setShowCreateAdminAnnouncementModal(false)
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

	const updateGrantorForm = (field, value) => {
		setGrantorForm((prev) => ({
			...prev,
			[field]: value,
			...(field === "fname" ? { id: buildGrantorIdFromFirstName(value) } : {}),
		}))
	}

	const resetGrantorForm = () => {
		setGrantorForm({
			id: "",
			fname: "",
			mname: "",
			lname: "",
			email: "",
			organization: "",
		})
	}

	const closeGrantorModal = () => {
		setShowGrantorModal(false)
		resetGrantorForm()
	}

	const createGrantor = async (event) => {
		event.preventDefault()
		const fname = grantorForm.fname.trim()
		const grantorId = buildGrantorIdFromFirstName(fname)
		const mname = grantorForm.mname.trim()
		const lname = grantorForm.lname.trim()
		const providerName = [fname, mname, lname].filter(Boolean).join(" ").trim()
		const email = grantorForm.email.trim()
		if (!grantorId || !fname || !lname || !email) {
			toast.error("First name, last name, and email are required.")
			return
		}
		if (providersRaw.some((provider) => provider.id === grantorId)) {
			toast.error("Grantor ID already exists.")
			return
		}

		setIsCreatingGrantor(true)
		try {
			const encryptedPassword = await encryptPasswordAES256(GRANTOR_DEFAULT_PASSWORD)
			const payload = {
				providerId: grantorId,
				providerName,
				name: providerName,
				fname,
				mname,
				lname,
				providerType: toProviderType(providerName),
				organization: grantorForm.organization.trim(),
				email,
				password: encryptedPassword,
				mustChangePassword: true,
				role: "provider",
				userType: "provider",
				status: "Active",
				archived: false,
				createdAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			}
			await Promise.all([
				setDoc(doc(db, "providers", grantorId), payload),
				setDoc(doc(db, "grantorPortals", grantorId), {
					grantorId,
					providerName,
					name: providerName,
					fname,
					mname,
					lname,
					providerType: payload.providerType,
					organization: payload.organization,
					email,
					createdAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				}, { merge: true }),
			])
			toast.success("Grantor account created.")
			closeGrantorModal()
		} catch (error) {
			console.error(error)
			toast.error("Failed to create grantor.")
		} finally {
			setIsCreatingGrantor(false)
		}
	}

	const approveGrantorPasswordChange = async (grantorId) => {
		if (!grantorId) return
		try {
			await setDoc(doc(db, "providers", grantorId), {
				passwordChangeRequested: false,
				passwordChangeRequestStatus: "approved",
				passwordChangeApprovedAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			}, { merge: true })
			await createGrantorNotification({
				grantorId,
				type: "password_change_approved",
				title: "Password Change Approved",
				message: "Your administrator approved the request. You can now change your password from your profile.",
				read: false,
				createdAt: serverTimestamp(),
			})
			toast.success("Password change request approved.")
		} catch (error) {
			console.error("Unable to approve password change request.", error)
			toast.error("Unable to approve the password change request.")
		}
	}

	const openSingleGrantorArchiveConfirmation = (grantorId) => {
		if (!grantorId) return
		setSelectedGrantorIds([grantorId])
		setAdminConfirmDialog({
			type: "batch_archive_grantors",
			title: "Archive Grantor",
			message: "Are you sure you want to archive this grantor? This will move the account to archived grantor records.",
			confirmLabel: "Archive Grantor",
			tone: "danger",
		})
	}

	const handleLogout = () => {
		sessionStorage.removeItem("bulsuscholar_userId")
		sessionStorage.removeItem("bulsuscholar_userType")
		navigate("/", { replace: true })
	}

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

	const buildTopStudentsPerGrantorReport = () => {
		const groups = new Map()
		activeGrantorScholars
			.filter((scholar) => getGrantorScholarProgramName(scholar))
			.forEach((scholar) => {
				const provider = scholar.providerType || toProviderType(scholar.grantorName || scholar.scholarshipTitle)
				const grantorKey = scholar.grantorId || provider || scholar.grantorName || "grantor"
				const grantorName = scholar.grantorName || grantorLabelById.get(grantorKey) || toProviderLabel(provider)
				const studentRecordId =
					grantorScholarStudentRecordLookup.get(`${scholar.grantorId || scholar.providerType || "grantor"}::${scholar.id}`) || ""
				const studentRecord = studentRecordId ? studentProfiles.find((student) => student.id === studentRecordId) : null
				const gwaValue = studentRecord?.gwa || studentRecord?.currentGwa || studentRecord?.currentGWA || scholar.gwa || scholar.currentGwa || scholar.currentGWA || ""
				const numericGwa = Number.parseFloat(String(gwaValue).replace(/[^\d.]/g, ""))
				if (!groups.has(grantorKey)) {
					groups.set(grantorKey, {
						title: grantorName || "Grantor",
						subtitle: "Top 10 students ranked by current GWA.",
						headers: ["Rank", "Student ID", "Full Name", "Course", "Year Level", "GWA", "Status"],
						rows: [],
					})
				}
				groups.get(grantorKey).rows.push({
					sortGwa: Number.isFinite(numericGwa) ? numericGwa : Number.POSITIVE_INFINITY,
					row: [
						"",
						scholar.studentId || studentRecord?.id || "-",
						buildGrantorScholarFullName(scholar) || studentRecord?.fullName || studentFullName(studentRecord || {}) || "-",
						studentRecord?.course || getGrantorScholarProgramName(scholar) || "-",
						scholar.yearLevel || studentRecord?.year || studentRecord?.yearLevel || "-",
						gwaValue || "-",
						scholar.status || "Active",
					],
				})
			})

		const groupedPages = [...groups.values()]
			.map((group) => {
				const rankedRows = group.rows
					.sort((left, right) => {
						if (left.sortGwa !== right.sortGwa) return left.sortGwa - right.sortGwa
						return String(left.row[2]).localeCompare(String(right.row[2]))
					})
					.slice(0, 10)
					.map((entry, index) => [String(index + 1), ...entry.row.slice(1)])
				return { ...group, rows: rankedRows }
			})
			.filter((group) => group.rows.length > 0)
			.sort((left, right) => left.title.localeCompare(right.title))

		return {
			groupedPages,
			columns: ["Grantor", "Rank", "Student ID", "Full Name", "Course", "Year Level", "GWA", "Status"],
			csvRows: groupedPages.flatMap((group) => group.rows.map((row) => [group.title, ...row])),
		}
	}

	const createGrantorPreviewConfig = (rows, filterLabel) => {
		const topStudentsReport = buildTopStudentsPerGrantorReport()
		return {
			key: "scholarships",
			reportType: "grantors",
			title: "Grantor Management Report",
			description: "Preview of grantor account records before export.",
			filterLabel,
			filename: `grantors-report-${Date.now()}`,
			stats: [
				{ label: "Grantors", value: rows.length },
				{ label: "Active", value: rows.filter((row) => row.status !== "Archived").length },
				{ label: "Archived", value: rows.filter((row) => row.status === "Archived").length },
				{ label: "Password Requests", value: rows.filter((row) => row.status === "Password Requested").length },
			],
			columns: ["Grantor ID", "Name", "Email", "Organization", "Total Scholars", "Status", "Created"],
			csvRows: rows.map((row) => [
				row.id,
				row.name,
				row.email,
				row.organization,
				String(row.totalScholars),
				row.status,
				row.createdAt,
			]),
			pdfRows: rows,
			pdfColumns: ["Grantor ID", "Name", "Email", "Organization", "Total Scholars", "Status", "Created"],
			pdfBodyRows: rows.map((row) => [
				row.id,
				row.name,
				row.email,
				row.organization,
				String(row.totalScholars),
				row.status,
				row.createdAt,
			]),
			topStudentsPerGrantor: topStudentsReport,
		}
	}

	const createSoePreviewConfig = (rows, filterLabel) => ({
		key: "soe",
		title: "Requirements Request Report",
		description: "Preview requirement request lifecycle data before exporting PDF or CSV.",
		filterLabel,
		filename: `requirements-request-report-${Date.now()}`,
		stats: [
			{ label: "Rows", value: rows.length },
			{ label: "Pending", value: rows.filter((row) => String(row.reviewStateLabel).toLowerCase().includes("pending")).length },
			{ label: "Approved", value: rows.filter((row) => String(row.reviewStateLabel).toLowerCase().includes("approved")).length },
			{ label: "SOE Downloaded", value: rows.filter((row) => row.downloadStatusLabel === "Downloaded").length },
		],
		columns: ["Student ID", "Student Name", "Scholarship", "Requirements", "Status", "Request Date", "Next Eligible", "Review State"],
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
		description: "Preview non-compliance monitoring and scholarship records.",
		filterLabel,
		filename: `compliance-report-${Date.now()}`,
		stats: [
			{ label: "Rows", value: rows.length },
			{ label: "High Risk", value: rows.filter((row) => Number(row.violationCount) >= COMPLIANCE_BLOCK_THRESHOLD).length },
			{ label: "Flags", value: rows.filter((row) => row.complianceStatus === "Non-Compliant").length },
		],
		columns: ["Student ID", "Full Name", "Status", "Violations", "Last Reviewed"],
		csvRows: rows.map((row) => [
			row.studentId,
			row.fullName,
			row.complianceStatus,
			String(row.violationCount),
			row.lastReviewed,
		]),
		pdfRows: rows,
	})

	const openReportPreview = (config) => {
		setReportPreview(config)
		setReportExportFormat("pdf")
		setExportTopStudentsPerGrantor(false)
	}

	const createStudentPreviewConfig = (filters, rows) => {
		const reportRows = buildStudentReportRows(rows)
		const columns = ["Student ID", "Full Name", "Course", "Year Level", "GWA", "Grantor", "Record Status"]
		const csvRows = reportRows.map((row) => [
			row.id || "-",
			row.fullName || "-",
			row.course || "-",
			row.yearLevel || "-",
			row.gwa || "-",
			row.grantor || "N/A",
			row.recordStatus || "-",
		])
		const filterLabel = `View: ${filters.view || "students"} | Search: ${filters.search || "-"} | Course: ${filters.course || "All"} | Year: ${filters.year || "All"}`
		return {
			key: "students",
			title: "Student Management Report",
			description: "Preview of student records using the current management filters.",
			filterLabel,
			filename: `student-management-${Date.now()}`,
			stats: [
				{ label: "Records", value: reportRows.length },
				{ label: "Active", value: reportRows.filter((row) => row.recordStatus === "Active").length },
				{ label: "Archived", value: reportRows.filter((row) => row.recordStatus === "Archived").length },
			],
			columns,
			csvRows,
			pdfRows: reportRows,
			reportRows,
			filters,
		}
	}

	const openStudentReportPreview = async (filters, rows = filteredStudents) => {
		if (isReportExporting) return
		setIsReportExporting(true)
		try {
			openReportPreview(createStudentPreviewConfig(filters, rows))
		} catch (error) {
			console.error(error)
			toast.error(error.message || "Unable to load the student report preview.")
		} finally {
			setIsReportExporting(false)
		}
	}

	const exportPreviewReport = async () => {
		if (!reportPreview || isReportExporting) return
		setIsReportExporting(true)
		try {
			const useTopStudentsPerGrantor =
				reportPreview.reportType === "grantors" &&
				exportTopStudentsPerGrantor &&
				reportPreview.topStudentsPerGrantor?.groupedPages?.length > 0
			if (reportPreview.key === "students") {
				await downloadStudentReport(reportExportFormat, reportPreview.filters, reportPreview.reportRows || [])
			} else if (reportExportFormat === "csv") {
				downloadCsvReport(
					`${reportPreview.filename}.csv`,
					useTopStudentsPerGrantor ? reportPreview.topStudentsPerGrantor.columns : reportPreview.columns,
					useTopStudentsPerGrantor ? reportPreview.topStudentsPerGrantor.csvRows : reportPreview.csvRows,
				)
			} else if (reportPreview.key === "scholarships") {
				await exportScholarshipsReportPdf(
					reportPreview.pdfRows,
					reportPreview.filterLabel,
					logo2,
					useTopStudentsPerGrantor ? ["Rank", "Student ID", "Full Name", "Course", "Year Level", "GWA", "Status"] : reportPreview.pdfColumns,
					useTopStudentsPerGrantor ? [] : reportPreview.pdfBodyRows,
					useTopStudentsPerGrantor ? "Top Students per Grantor Report" : reportPreview.title,
					useTopStudentsPerGrantor
						? {
								filename: `top-students-per-grantor-${Date.now()}.pdf`,
								subtitle: "Each page lists one grantor and their top 10 students ranked by current GWA.",
								groupedPages: reportPreview.topStudentsPerGrantor.groupedPages,
							}
						: {},
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
		const isStudentReport = reportPreview.key === "students"
		const isGrantorReport = reportPreview.reportType === "grantors"
		const canExportTopStudentsPerGrantor = Boolean(isGrantorReport && reportPreview.topStudentsPerGrantor?.groupedPages?.length)
		return (
			<div className="admin-detail-backdrop admin-detail-backdrop--report" role="presentation" onClick={closeReportPreview}>
				<div className="admin-detail-shell admin-detail-shell--report admin-report-preview-modal-shell" onClick={(event) => event.stopPropagation()}>
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
							<div className="admin-report-preview-controls">
								{isGrantorReport ? (
									<label className="admin-report-option-check">
										<input
											type="checkbox"
											checked={exportTopStudentsPerGrantor}
											onChange={(event) => setExportTopStudentsPerGrantor(event.target.checked)}
											disabled={!canExportTopStudentsPerGrantor}
										/>
										<span>Export Top Students per Grantor</span>
									</label>
								) : null}
								<div className="admin-report-format-toggle">
									<button type="button" className={reportExportFormat === "pdf" ? "active" : ""} onClick={() => setReportExportFormat("pdf")}>
										PDF
									</button>
									<button type="button" className={reportExportFormat === (isStudentReport ? "excel" : "csv") ? "active" : ""} onClick={() => setReportExportFormat(isStudentReport ? "excel" : "csv")}>
										{isStudentReport ? "Excel" : "CSV"}
									</button>
								</div>
								<button type="button" className="admin-export-btn" disabled={isReportExporting} onClick={exportPreviewReport}>
									{isReportExporting ? "Exporting..." : `Export ${reportExportFormat.toUpperCase()}`}
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
								</div>
								{reportExportFormat === "pdf" || isStudentReport ? (
									<>
										<div className="admin-table-wrap admin-report-table-scroll">
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
										{reportPreviewTablePage.totalPages > 1 ? (
											<TablePagination
												currentPage={reportPreviewTablePage.currentPage}
												totalItems={reportPreview.csvRows.length}
												onPageChange={(page) => setTablePage(`report_preview_${reportPreview.key || "default"}`, page)}
											/>
										) : (
											<div className="admin-report-preview-footer">
												<span>
													Showing {reportPreviewTablePage.startIndex}-{reportPreviewTablePage.endIndex} of {reportPreview.csvRows.length} rows | 25 per page
												</span>
											</div>
										)}
									</>
								) : (
									<pre className="admin-report-preview-code">{csvPreview}</pre>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		)
	}

	const renderSection = () => {
		if (activeSection === "inbox") {
			return (
				<section className="admin-inbox-page admin-inbox-overview">
					<header className="admin-inbox-head">
						<div>
							<span className="admin-page-eyebrow">Personal Inbox</span>
							<h2>Messages</h2>
							<p>Actionable notifications and backend activity are separated for easier review.</p>
						</div>
					</header>
					<section className="admin-inbox-preview-section">
						<header><div><HiOutlineInbox /><span><strong>Notifications</strong><small>{unreadAdminNotifications.length} unread</small></span></div><Link to="/admin/notifications">See all</Link></header>
						<div className="admin-inbox-list admin-inbox-list--limited">
							{adminNotifications.filter((item) => item.archived !== true).length === 0 ? (
								<div className="admin-inbox-empty admin-inbox-empty--compact"><HiOutlineInbox /><strong>No notifications yet.</strong></div>
							) : adminNotifications.filter((item) => item.archived !== true).slice(0, 5).map((notification) => (
								<button key={notification.id} type="button" className={`admin-inbox-item ${notification.read === true ? "" : "unread"}`} onClick={() => { markAdminNotificationRead(notification); if (notification.route) navigate(notification.route) }}>
									<span className="admin-inbox-item-icon"><HiOutlineBell /></span>
									<span className="admin-inbox-item-copy"><strong>{toAdminNotificationTitle(notification)}</strong><small>{toAdminNotificationMessage(notification)}</small></span>
									<span className="admin-inbox-item-meta"><time>{formatRelativeTime(notification.createdAt || notification.created_at)}</time>{notification.read !== true ? <i aria-label="Unread" /> : <HiOutlineCheckCircle aria-label="Read" />}</span>
								</button>
							))}
						</div>
					</section>
					<section className="admin-inbox-preview-section admin-inbox-preview-section--logs">
						<header><div><HiOutlineDocumentText /><span><strong>System Logs</strong><small>Backend activity records</small></span></div><Link to="/admin/logs">See all</Link></header>
						<div className="admin-log-preview-list">
							{systemLogs.length === 0 ? <div className="admin-inbox-empty admin-inbox-empty--compact"><HiOutlineDocumentText /><strong>No backend logs yet.</strong></div> : systemLogs.slice(0, 7).map((log) => (
								<div className="admin-log-preview-row" key={log.id}><span>{toAdminNotificationTitle(log)}</span><small>{log.actorType || "system"}</small><time>{formatRelativeTime(log.createdAt || log.created_at)}</time></div>
							))}
						</div>
					</section>
				</section>
			)
		}

		if (activeSection === "notifications") {
			const selectedRows = visibleAdminNotifications.filter((item) => selectedAdminNotificationIds.includes(item.id))
			return (
				<section className="admin-notifications-page">
					<header className="admin-inbox-head"><div><span className="admin-page-eyebrow">Administrator Inbox</span><h2>Notifications</h2><p>Review, search, mark, and archive administrator updates.</p></div><Link className="admin-page-back-link" to="/admin/inbox">Back to inbox</Link></header>
					<div className="admin-mail-toolbar">
						<label className="admin-mail-search"><HiOutlineSearch /><input value={notificationSearch} onChange={(event) => setNotificationSearch(event.target.value)} placeholder="Search notifications" /></label>
						<select value={notificationFilter} onChange={(event) => { setNotificationFilter(event.target.value); setSelectedAdminNotificationIds([]) }} aria-label="Filter notifications"><option value="inbox">Inbox</option><option value="unread">Unread</option><option value="read">Read</option><option value="archived">Archived</option></select>
						<button type="button" onClick={markAllAdminNotificationsRead} disabled={unreadAdminNotifications.length === 0}><HiOutlineCheckCircle /> Mark all read</button>
						<button type="button" onClick={() => archiveAdminNotifications(selectedRows)} disabled={selectedRows.length === 0}><HiOutlineArchive /> Archive{selectedRows.length ? ` (${selectedRows.length})` : ""}</button>
					</div>
					<div className="admin-mail-list">
						{visibleAdminNotifications.length === 0 ? <div className="admin-inbox-empty"><HiOutlineInbox /><strong>No matching notifications.</strong><span>Try another search or filter.</span></div> : visibleAdminNotifications.map((notification) => (
							<div key={notification.id} className={`admin-mail-row ${notification.read === true ? "" : "unread"}`}>
								<input type="checkbox" checked={selectedAdminNotificationIds.includes(notification.id)} onChange={(event) => setSelectedAdminNotificationIds((current) => event.target.checked ? [...new Set([...current, notification.id])] : current.filter((id) => id !== notification.id))} aria-label={`Select ${toAdminNotificationTitle(notification)}`} />
								<button type="button" className="admin-mail-row-main" onClick={() => { markAdminNotificationRead(notification); if (notification.route) navigate(notification.route) }}>
									<span className="admin-mail-sender">{notification.actorType || "BulsuScholar"}</span><span className="admin-mail-subject"><strong>{toAdminNotificationTitle(notification)}</strong><small>{toAdminNotificationMessage(notification)}</small></span><time>{formatRelativeTime(notification.createdAt || notification.created_at)}</time>
								</button>
								{notification.archived !== true ? <button type="button" className="admin-mail-archive" onClick={() => archiveAdminNotifications([notification])} aria-label="Archive notification"><HiOutlineArchive /></button> : null}
							</div>
						))}
					</div>
				</section>
			)
		}

		if (activeSection === "logs") {
			return (
				<section className="admin-logs-page">
					<header className="admin-inbox-head"><div><span className="admin-page-eyebrow">Backend Records</span><h2>System Logs</h2><p>Read-only activity generated by backend services.</p></div><Link className="admin-page-back-link" to="/admin/inbox">Back to inbox</Link></header>
					<div className="admin-log-filters">
						<label className="admin-mail-search"><HiOutlineSearch /><input value={logSearch} onChange={(event) => setLogSearch(event.target.value)} placeholder="Search action, actor, target, or details" /></label>
						<select value={logTypeFilter} onChange={(event) => setLogTypeFilter(event.target.value)} aria-label="Filter logs by type"><option value="all">All types</option>{logTypeOptions.map((type) => <option key={type} value={type}>{type.replace(/[_-]+/g, " ")}</option>)}</select>
						<select value={logActorFilter} onChange={(event) => setLogActorFilter(event.target.value)} aria-label="Filter logs by actor"><option value="all">All actors</option>{logActorOptions.map((actor) => <option key={actor} value={actor}>{actor}</option>)}</select>
						<label className="admin-log-date"><span>From</span><input type="date" value={logDateFrom} onChange={(event) => setLogDateFrom(event.target.value)} /></label>
						<label className="admin-log-date"><span>To</span><input type="date" value={logDateTo} min={logDateFrom || undefined} onChange={(event) => setLogDateTo(event.target.value)} /></label>
						<button type="button" onClick={() => { setLogSearch(""); setLogTypeFilter("all"); setLogActorFilter("all"); setLogDateFrom(""); setLogDateTo("") }}><HiOutlineRefresh /> Reset</button>
					</div>
					<div className="admin-log-table-wrap"><table className="admin-log-table"><thead><tr><th>Date</th><th>Type</th><th>Actor</th><th>Actor ID</th><th>Target</th><th>Details</th></tr></thead><tbody>{visibleSystemLogs.length === 0 ? <tr><td colSpan="6">No system logs matched the selected filters.</td></tr> : visibleSystemLogs.map((log) => <tr key={log.id}><td>{formatDate(log.createdAt || log.created_at)}</td><td><span>{String(log.action || log.type || "system").replace(/[_-]+/g, " ")}</span></td><td>{log.actorType || "system"}</td><td>{log.actorId || "-"}</td><td>{log.target || "-"}</td><td>{toAdminNotificationMessage(log)}</td></tr>)}</tbody></table></div>
					<p className="admin-log-result-count">Showing {visibleSystemLogs.length} of {systemLogs.length} backend logs</p>
				</section>
			)
		}

		if (activeSection === "dashboard") {
			return (
				<section className="admin-dashboard-overview">
					<header className="admin-overview-head">
						<div>
							<span className="admin-page-eyebrow">System Overview</span>
							<h2>Welcome Back, Administrator</h2>
							<p>Monitor student activity, scholarship coverage, grantors, and pending requests.</p>
						</div>
						<span className="admin-overview-date">{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
					</header>
					<section className="admin-kpi-grid">
						{[
							{
								id: "students",
								label: "Total Students",
								value: metrics.totalStudents,
								description: "Active student accounts",
								icon: HiOutlineUsers,
							},
							{
								id: "grantors",
								label: "Grantors",
								value: grantorRows.length,
								description: "Registered scholarship providers",
								icon: HiOutlineUserGroup,
							},
							{
								id: "scholars",
								label: "Total Scholars",
								value: metrics.totalScholars,
								description: "Active scholarship records",
								icon: HiOutlineAcademicCap,
							},
							{
								id: "requests",
								label: "Pending Requests",
								value: soeRows.filter((row) => row.reviewState === "incoming").length,
								description: "Requirements awaiting review",
								icon: HiOutlineClock,
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
					<section className="admin-overview-grid">
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
						<article className="admin-overview-actions">
							<div className="admin-trend-head admin-trend-head--compact"><div><span className="admin-page-eyebrow">Quick Access</span><h3>Management Areas</h3><p>Open the sections used most often.</p></div></div>
							<nav>
								<Link to="/admin/students"><span><HiOutlineUsers /></span><div><strong>Student Management</strong><small>{metrics.totalStudents} active accounts</small></div></Link>
								<Link to="/admin/grantors"><span><HiOutlineUserGroup /></span><div><strong>Grantor Management</strong><small>{grantorRows.length} registered providers</small></div></Link>
								<Link to="/admin/requirements"><span><HiOutlineDocumentText /></span><div><strong>Requirements</strong><small>{soeRows.filter((row) => row.reviewState === "incoming").length} pending requests</small></div></Link>
								<Link to="/admin/reports"><span><HiOutlineChartBar /></span><div><strong>Reports</strong><small>Generate system records</small></div></Link>
							</nav>
						</article>
						<article className="admin-analytics-card admin-analytics-card--timeline">
							<div className="admin-trend-head admin-trend-head--compact">
								<div>
									<h3>Requirements Request Timeline</h3>
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
								{isAnalyticsLoading ? <LoadingBars note={`Loading requirements request timeline for ${soeTrendRange} view...`} /> : <Bar data={soeVolumeData} options={barChartOptions} />}
							</div>
						</article>
					</section>
				</section>
			)
		}

		if (activeSection === "students") {
			return (
				<section className="admin-management-panel admin-student-management">
					<div className="admin-panel-head">
						<div className="admin-student-title">
							<span aria-hidden="true"><HiOutlineUsers /></span>
							<div>
								<h2>Student Management</h2>
								<p className="admin-panel-copy">Search, review, archive, and report on live student records.</p>
							</div>
						</div>
						<div className="admin-head-actions">
							<button
								type="button"
								className="admin-student-report-btn"
								disabled={isReportExporting}
								onClick={() => openStudentReportPreview({ view: studentViewTab, search: studentSearch, course: studentCourse, year: studentYear }, filteredStudents)}
							>
								<HiOutlineDocumentText /> {isReportExporting ? "Preparing..." : "Generate Report"}
							</button>
						</div>
					</div>
					{studentViewTab === "overview" ? (
						<section className="admin-tab-panel">
							<div className="admin-summary-strip">
								<article className="admin-summary-card">
									<h3>Managed Students</h3>
									<strong>{studentProfiles.length}</strong>
									<p>Total student records currently available in Student Management.</p>
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
											<p className="admin-trend-copy">Current distribution of active and archived records.</p>
										</div>
									</div>
									<div className="admin-chart-wrap">
										{isAnalyticsLoading ? <LoadingBars note="Loading student lifecycle analytics..." /> : <Doughnut data={studentLifecycleData} options={doughnutOptions} />}
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
							<div className="admin-student-stats-row" aria-label="Student management statistics">
								<article>
									<HiOutlineUsers />
									<span>Total Students</span>
									<strong>{studentManagementStats.total}</strong>
								</article>
								<article>
									<HiOutlineCheckCircle />
									<span>Active Records</span>
									<strong>{studentManagementStats.active}</strong>
								</article>
								<article>
									<HiOutlineAcademicCap />
									<span>Active Scholars</span>
									<strong>{studentManagementStats.scholars}</strong>
								</article>
								<article>
									<HiOutlineArchive />
									<span>Archived</span>
									<strong>{studentManagementStats.archived}</strong>
								</article>
							</div>
							<div className="admin-student-pagination-row">
								<SectionTabs
									tabs={[
										{ id: "students", label: "Students", count: studentTabCounts.students, icon: HiOutlineUsers },
										{ id: "archived", label: "Archived", count: studentTabCounts.archived, icon: HiOutlineTrash },
									]}
									value={studentViewTab}
									onChange={setStudentViewTab}
									className="admin-student-inline-tabs"
								/>
								<button
									type="button"
									className="admin-student-archive-btn"
									disabled={studentViewTab !== "students" || selectedStudentIds.length === 0}
									onClick={() => openBatchArchiveConfirmation()}
								>
									<HiOutlineTrash /> Archive {selectedStudentIds.length > 0 ? `(${selectedStudentIds.length})` : ""}
								</button>
							</div>
							<div className="admin-student-command-row">
								<div className="admin-student-toolbar">
									<label className="admin-student-search" aria-label="Search student records">
										<HiOutlineSearch />
										<input type="text" placeholder="Search student ID or name" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} />
									</label>
									<AdminFilterSelect
										label="Filter by course"
										value={studentCourse}
										options={[{ value: "All", label: "All Courses" }, ...studentsByCourse.map((course) => ({ value: course, label: course }))]}
										onChange={setStudentCourse}
									/>
									<AdminFilterSelect
										label="Filter by year level"
										value={studentYear}
										options={[{ value: "All", label: "All Year Levels" }, ...studentsByYear.map((year) => ({ value: year, label: year }))]}
										onChange={setStudentYear}
									/>
								</div>
							</div>
							<div className="admin-table-wrap">
								<table className="admin-management-table admin-management-table--roomy">
									<thead>
										<tr>
											<th style={{ width: "40px" }}>
												<input
													type="checkbox"
													checked={
														studentsTablePage.rows.filter((s) => s.sourceCollection === "students").length > 0 &&
														studentsTablePage.rows
															.filter((s) => s.sourceCollection === "students")
															.every((s) => selectedStudentIds.includes(s.id))
													}
													onChange={(e) => {
														const rowIds = studentsTablePage.rows
															.filter((s) => s.sourceCollection === "students")
															.map((s) => s.id)
														if (e.target.checked) {
															setSelectedStudentIds((prev) => [...new Set([...prev, ...rowIds])])
														} else {
															setSelectedStudentIds((prev) => prev.filter((id) => !rowIds.includes(id)))
														}
													}}
												/>
											</th>
											<th>Student ID</th>
											<th>Full Name</th>
											<th>Course</th>
											<th>Year Level</th>
											<th>Status</th>
											<th>Action</th>
										</tr>
									</thead>
									<tbody>
										{filteredStudents.length === 0 ? (
											<EmptyStateRow colSpan={7} />
										) : (
											studentsTablePage.rows.map((student) => {
												const statusText = student.recordStatus || "Active"
												const statusKey = statusText.toLowerCase().replace(/[^a-z0-9]+/g, "-")
												return (
													<tr key={student.id}>
														<td>
															<input
																type="checkbox"
																disabled={student.sourceCollection !== "students"}
																checked={selectedStudentIds.includes(student.id)}
																onChange={(e) => {
																	if (e.target.checked) {
																		setSelectedStudentIds((prev) => [...prev, student.id])
																	} else {
																		setSelectedStudentIds((prev) => prev.filter((id) => id !== student.id))
																	}
																}}
															/>
														</td>
														<td>{toDisplayStudentId(student.studentId || student.id)}</td>
														<td>{student.fullName}</td>
														<td>{student.course || "-"}</td>
														<td>{student.year || "-"}</td>
														<td>
															<span className={`admin-student-status admin-student-status--${statusKey}`}>
																{statusText}
															</span>
														</td>
														<td>
															<button
																type="button"
																className="admin-student-action-btn"
																onClick={() => setSelectedStudentId(student.id)}
															>
																<HiOutlineEye />
																View
															</button>
														</td>
													</tr>
												)
											})
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

		if (activeSection === "grantors") {
			const selectableGrantorIds = grantorTab === "grantors" ? visibleGrantorRows.map((grantor) => grantor.id) : []
			const allVisibleGrantorsSelected =
				selectableGrantorIds.length > 0 &&
				selectableGrantorIds.every((id) => selectedGrantorIds.includes(id))
			return (
				<section className="admin-management-panel admin-grantor-management">
					<div className="admin-panel-head">
						<div className="admin-student-title admin-grantor-title">
							<span aria-hidden="true"><HiOutlineUserGroup /></span>
							<div>
								<h2>Grantor Management</h2>
								<p className="admin-panel-copy">Manage scholarship provider accounts, password requests, and archived grantor records.</p>
							</div>
						</div>
						<div className="admin-head-actions">
							<button
								type="button"
								className="admin-student-report-btn"
								onClick={() => openReportPreview(createGrantorPreviewConfig(grantorReportRows, `View: ${grantorTab} | Search: ${grantorSearch || "-"}`))}
							>
								<HiOutlineDocumentText /> Generate Report
							</button>
							<button
								type="button"
								className="admin-grantor-new-btn"
								onClick={() => setShowGrantorModal(true)}
							>
								<HiOutlineUserAdd /> New Grantor
							</button>
						</div>
					</div>
					<div className="admin-student-stats-row admin-grantor-stats-row" aria-label="Grantor management statistics">
						<article>
							<HiOutlineUserGroup />
							<span>Total Grantors</span>
							<strong>{grantorManagementStats.total}</strong>
						</article>
						<article>
							<HiOutlineCheckCircle />
							<span>Active Grantors</span>
							<strong>{grantorManagementStats.active}</strong>
						</article>
						<article>
							<HiOutlineRefresh />
							<span>Password Requests</span>
							<strong>{grantorManagementStats.passwordRequests}</strong>
						</article>
						<article>
							<HiOutlineArchive />
							<span>Archived</span>
							<strong>{grantorManagementStats.archived}</strong>
						</article>
					</div>
					<div className="admin-grantor-pagination-row">
						<SectionTabs
							tabs={[
								{ id: "grantors", label: "Grantors", count: grantorTabCounts.grantors, icon: HiOutlineUserGroup },
								{ id: "archived", label: "Archived", count: grantorTabCounts.archived, icon: HiOutlineTrash },
							]}
							value={grantorTab}
							onChange={setGrantorTab}
							className="admin-grantor-inline-tabs"
						/>
						<button
							type="button"
							className="admin-student-archive-btn"
							disabled={grantorTab !== "grantors" || selectedGrantorIds.length === 0}
							onClick={openGrantorArchiveConfirmation}
						>
							<HiOutlineTrash /> Archive {selectedGrantorIds.length > 0 ? `(${selectedGrantorIds.length})` : ""}
						</button>
					</div>
					<section className="admin-tab-panel admin-tab-panel--grantors">
							<div className="admin-student-command-row admin-grantor-command-row">
								<div className="admin-student-toolbar admin-grantor-toolbar">
									<label className="admin-student-search" aria-label="Search grantor records">
										<HiOutlineSearch />
										<input
											type="text"
											placeholder="Search grantor ID, name, email, organization, or status"
											value={grantorSearch}
											onChange={(event) => setGrantorSearch(event.target.value)}
										/>
									</label>
								</div>
							</div>
							<div className="admin-table-wrap admin-table-wrap--grantors">
								<table className="admin-management-table admin-management-table--roomy admin-grantor-table">
									<colgroup>
										{grantorTab === "grantors" ? <col className="admin-grantor-col-select" /> : null}
										<col className="admin-grantor-col-id" />
										<col className="admin-grantor-col-name" />
										<col className="admin-grantor-col-email" />
										<col className="admin-grantor-col-org" />
										<col className="admin-grantor-col-total" />
										<col className="admin-grantor-col-status" />
										<col className="admin-grantor-col-action" />
									</colgroup>
									<thead>
										<tr>
											{grantorTab === "grantors" ? (
												<th style={{ width: "40px" }}>
													<input
														type="checkbox"
														checked={allVisibleGrantorsSelected}
														onChange={(event) => {
															if (event.target.checked) {
																setSelectedGrantorIds((prev) => [...new Set([...prev, ...selectableGrantorIds])])
															} else {
																setSelectedGrantorIds((prev) => prev.filter((id) => !selectableGrantorIds.includes(id)))
															}
														}}
													/>
												</th>
											) : null}
											<th>Grantor ID</th>
											<th>Name</th>
											<th>Email</th>
											<th>Organization</th>
											<th>Total Scholars</th>
											<th>Status</th>
											<th>Action</th>
										</tr>
									</thead>
									<tbody>
										{visibleGrantorRows.length === 0 ? (
											<EmptyStateRow colSpan={grantorTab === "grantors" ? 8 : 7} />
										) : (
											grantorTablePage.rows.map((grantor) => (
												<tr key={grantor.id}>
													{grantorTab === "grantors" ? (
														<td>
															<input
																type="checkbox"
																checked={selectedGrantorIds.includes(grantor.id)}
																onChange={(event) => {
																	if (event.target.checked) {
																		setSelectedGrantorIds((prev) => [...new Set([...prev, grantor.id])])
																	} else {
																		setSelectedGrantorIds((prev) => prev.filter((id) => id !== grantor.id))
																	}
																}}
															/>
														</td>
													) : null}
													<td>{grantor.id}</td>
													<td>{grantor.name}</td>
													<td>{grantor.email || "-"}</td>
													<td>{grantor.organization || "-"}</td>
													<td>{grantor.totalScholars || 0}</td>
													<td>
														<span
															className={`admin-student-status admin-student-status--${String(grantor.statusLabel || "active").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
															title={grantor.statusLabel || "Active"}
														>
															{grantor.statusLabel}
														</span>
													</td>
													<td>
														<div className="admin-grantor-row-actions">
															<button type="button" className="admin-student-action-btn" onClick={() => setSelectedGrantorId(grantor.id)}>
																<HiOutlineEye /> View
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
								currentPage={grantorTablePage.currentPage}
								totalItems={visibleGrantorRows.length}
								onPageChange={(page) => setTablePage(`grantors_${grantorTab}`, page)}
							/>
					</section>
				</section>
			)
		}

		if (activeSection === "scholarships") {
			return (
				<section className="admin-management-panel admin-scholarship-management">
					<div className="admin-panel-head">
						<div className="admin-student-title admin-scholarship-title">
							<span aria-hidden="true">
								<HiOutlineDocumentText />
							</span>
							<div>
								<h2>Scholarship Programs</h2>
								<p className="admin-panel-copy">Review synced grantor scholar rosters, application tracking, archived records, and scholarship conflicts.</p>
							</div>
						</div>
						<div className="admin-head-actions">
							<button
								type="button"
								className="admin-table-btn admin-table-btn--view"
								onClick={() => setAdminScholarModalOpen(true)}
							>
								<HiOutlineCloudUpload /> Add / Import
							</button>
							<button
								type="button"
								className="admin-student-report-btn"
								onClick={() => openReportPreview(scholarshipSectionPreviewConfig)}
							>
								<HiOutlineEye /> Generate Preview
							</button>
						</div>
					</div>
					<div className="admin-student-stats-row admin-scholarship-stats-row" aria-label="Scholarship program statistics">
						<article>
							<HiOutlineDocumentText />
							<span>Programs</span>
							<strong>{scholarshipTabCounts.overview}</strong>
						</article>
						<article>
							<HiOutlineUsers />
							<span>Active Scholars</span>
							<strong>{scholarshipOverviewTotalRecipients}</strong>
						</article>
						<article>
							<HiOutlineClock />
							<span>Tracking Records</span>
							<strong>{scholarshipTabCounts.tracking}</strong>
						</article>
						<article>
							<HiOutlineArchive />
							<span>Archived Records</span>
							<strong>{scholarshipTabCounts.archived}</strong>
						</article>
					</div>
					<div className="admin-scholarship-tab-actions">
						<SectionTabs
							tabs={[
								{ id: "scholars", label: "Scholars", count: scholarshipTabCounts.scholars, icon: HiOutlineUsers },
								{ id: "tracking", label: "Tracking", count: scholarshipTabCounts.tracking, icon: HiOutlineClock },
								{ id: "warning", label: "Warning", count: scholarshipTabCounts.warning, icon: HiOutlineExclamation },
								{ id: "archived", label: "Archived", count: scholarshipTabCounts.archived, icon: HiOutlineTrash },
							]}
							value={scholarshipTab}
							onChange={setScholarshipTab}
							className="admin-section-tabs--compact admin-section-tabs--scholarships admin-scholarship-inline-tabs"
						/>
						<button
							type="button"
							className="admin-student-archive-btn admin-scholarship-archive-btn"
							onClick={openScholarshipScholarArchiveConfirmation}
							disabled={scholarshipTab !== "scholars" || selectedScholarshipScholarKeys.length === 0}
						>
							<HiOutlineTrash /> Archive {selectedScholarshipScholarKeys.length > 0 ? `(${selectedScholarshipScholarKeys.length})` : ""}
						</button>
					</div>
					{scholarshipTab === "overview" ? (
						<section className="admin-tab-panel">
							<div className="admin-student-command-row admin-scholarship-command-row">
								<div className="admin-student-toolbar admin-scholarship-toolbar">
									<label className="admin-student-search" aria-label="Search scholarship programs">
										<HiOutlineSearch />
										<input
											type="text"
											placeholder="Search by scholarship name or grantor"
											value={scholarshipSearch}
											onChange={(event) => setScholarshipSearch(event.target.value)}
										/>
									</label>
									<AdminFilterSelect
										label="Filter by grantor"
										value={scholarshipProvider}
										options={[{ value: "All", label: "All Grantors" }, ...scholarshipProviderOptions]}
										onChange={setScholarshipProvider}
									/>
								</div>
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
									<div className="admin-table-wrap admin-table-wrap--scholarships">
										<table className="admin-management-table admin-management-table--roomy admin-scholarship-table">
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
							<div className="admin-student-command-row admin-scholarship-command-row">
								<div className="admin-student-toolbar admin-scholarship-toolbar">
									<label className="admin-student-search" aria-label="Search scholarship records">
										<HiOutlineSearch />
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
									</label>
									<AdminFilterSelect
										label="Filter by grantor"
										value={scholarshipProvider}
										options={[{ value: "All", label: "All Grantors" }, ...scholarshipProviderOptions]}
										onChange={setScholarshipProvider}
									/>
								</div>
							</div>
							<div className="admin-table-wrap admin-table-wrap--scholarships">
								<table className={`admin-management-table admin-management-table--roomy admin-scholarship-table ${scholarshipTab === "tracking" ? "admin-scholarship-table--tracking" : ""}`}>
									<thead>
										{scholarshipTab === "warning" ? (
											<tr>
												<th>Student ID</th>
												<th>Full Name</th>
												<th>Grantors</th>
												<th>Action</th>
											</tr>
										) : scholarshipTab === "tracking" ? (
											<tr>
												<th>Student ID</th>
												<th>Full Name</th>
												<th>Scholarship</th>
												<th>Current Step</th>
												<th>Action</th>
											</tr>
										) : scholarshipTab === "archived" ? (
											<tr>
												<th>Student ID</th>
												<th>Full Name</th>
												<th>Scholarship</th>
												<th>Year Level</th>
												<th>Archived At</th>
												<th>Status</th>
												<th>Action</th>
											</tr>
										) : (
											<tr>
												<th className="admin-scholarship-checkbox-col">
													<input
														type="checkbox"
														checked={
															scholarshipTablePage.rows.length > 0 &&
															scholarshipTablePage.rows.every((row) =>
																selectedScholarshipScholarKeys.includes(row.scholarArchiveKey || row.trackingKey),
															)
														}
														onChange={(event) => {
															const pageKeys = scholarshipTablePage.rows.map((row) => row.scholarArchiveKey || row.trackingKey)
															if (event.target.checked) {
																setSelectedScholarshipScholarKeys((prev) => [...new Set([...prev, ...pageKeys])])
															} else {
																setSelectedScholarshipScholarKeys((prev) => prev.filter((key) => !pageKeys.includes(key)))
															}
														}}
														aria-label="Select all visible scholars"
													/>
												</th>
												<th>Student ID</th>
												<th>Full Name</th>
												<th>Scholarship</th>
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
															? 4
															: scholarshipTab === "tracking"
																? 5
																: scholarshipTab === "archived"
																	? 7
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
														? 4
													: scholarshipTab === "tracking"
															? 5
															: scholarshipTab === "archived"
																? 7
																: 9
												}
											/>
										) : scholarshipTab === "warning" ? (
											scholarshipTablePage.rows.map((row) => (
												<tr key={row.trackingKey || row.studentId}>
													<td>{toDisplayStudentId(row.studentId) || "-"}</td>
													<td>{row.fullName || "-"}</td>
													<td>{row.grantors || "-"}</td>
													<td>
														<button
															type="button"
															className="admin-table-btn admin-table-btn--mini admin-table-btn--view"
															onClick={() => setSelectedScholarshipWarningKey(row.trackingKey)}
															disabled={!row.conflictOptions?.length}
														>
															<HiOutlineEye />
															{row.conflictOptions?.length ? "View" : "Unavailable"}
														</button>
													</td>
												</tr>
											))
										) : scholarshipTab === "tracking" ? (
											scholarshipTablePage.rows.map((row) => (
												<tr key={row.trackingKey}>
													<td>{toDisplayStudentId(row.studentId) || "-"}</td>
													<td>{row.fullName || "-"}</td>
													<td>{row.scholarship || "-"}</td>
													<td>{row.currentStepLabel || "-"}</td>
													<td>
														<div className="admin-table-action-row">
															<button
																type="button"
																className="admin-table-btn admin-table-btn--mini admin-table-btn--view"
																onClick={() => setSelectedScholarshipTrackingKey(row.trackingKey)}
															>
																<HiOutlineEye />
																View
															</button>
														</div>
													</td>
												</tr>
											))
										) : scholarshipTab === "archived" ? (
											scholarshipTablePage.rows.map((row) => (
												<tr key={row.trackingKey}>
													<td>{toDisplayStudentId(row.studentId) || "-"}</td>
													<td>{row.fullName || "-"}</td>
													<td>{row.scholarship || "-"}</td>
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
																{row.studentRecordId ? "View" : "Unavailable"}
															</button>
														</div>
													</td>
												</tr>
											))
										) : (
											scholarshipTablePage.rows.map((row) => (
												<tr key={row.trackingKey || `${scholarshipTab}_${row.studentId}_${row.scholarship}`}>
													<td className="admin-scholarship-checkbox-col">
														<input
															type="checkbox"
															checked={selectedScholarshipScholarKeys.includes(row.scholarArchiveKey || row.trackingKey)}
															onChange={(event) => {
																const key = row.scholarArchiveKey || row.trackingKey
																if (event.target.checked) {
																	setSelectedScholarshipScholarKeys((prev) => [...new Set([...prev, key])])
																} else {
																	setSelectedScholarshipScholarKeys((prev) => prev.filter((item) => item !== key))
																}
															}}
															aria-label={`Select ${row.fullName || row.studentId || "scholar"}`}
														/>
													</td>
													<td>{toDisplayStudentId(row.studentId) || "-"}</td>
													<td>{row.fullName || "-"}</td>
													<td>{row.scholarship || "-"}</td>
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
																{row.studentRecordId ? "View" : "Unavailable"}
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

		if (activeSection === "requirements") {
			const visibleRows =
				soeTab === "requesting"
					? requestingSoeReportRows
					: soeTab === "approved"
						? approvedSoeReportRows
						: soeTab === "rejected"
							? rejectedSoeReportRows
							: soeCheckingRows.map((row) => toSoeReportRow(row))
			return (
				<section className="admin-management-panel admin-requirements-management">
					<div className="admin-panel-head">
						<div className="admin-student-title admin-requirements-title">
							<span aria-hidden="true">
								<HiOutlineCheckCircle />
							</span>
							<div>
								<h2>Requirements</h2>
								<p className="admin-panel-copy">Review requested materials, track approved releases, and verify downloaded SOE records.</p>
							</div>
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
					<div className="admin-student-stats-row admin-requirements-stats-row" aria-label="Requirements statistics">
						<article>
							<HiOutlineClock />
							<span>Pending Requests</span>
							<strong>{soeRequestTabCounts.requesting}</strong>
						</article>
						<article>
							<HiOutlineCheckCircle />
							<span>Approved Requests</span>
							<strong>{soeRequestTabCounts.approved}</strong>
						</article>
						<article>
							<HiOutlineEye />
							<span>Checking</span>
							<strong>{soeCheckingCounts.current}</strong>
						</article>
					</div>
					<SectionTabs
						tabs={[
							{ id: "requesting", label: "Requesting", count: soeRequestTabCounts.requesting, icon: HiOutlineClock },
							{ id: "approved", label: "Approved", count: soeRequestTabCounts.approved, icon: HiOutlineCheckCircle },
							{ id: "rejected", label: "Rejected", count: soeRequestTabCounts.rejected, icon: HiOutlineBan },
							{ id: "checking", label: "Checking", count: soeCheckingCounts.current, icon: HiOutlineEye },
						]}
						value={soeTab}
						onChange={setSoeTab}
						className="admin-requirements-inline-tabs"
					/>
					{soeTab === "checking" ? (
						<SectionTabs
							tabs={[
								{ id: "current", label: "Current", count: soeCheckingCounts.current, icon: HiOutlineClock },
								{ id: "previous", label: "Previous", count: soeCheckingCounts.previous, icon: HiOutlineArchive },
							]}
							value={soeCheckingTab}
							onChange={setSoeCheckingTab}
							className="admin-section-tabs--compact admin-requirements-subtabs"
						/>
					) : null}
					<div className="admin-student-command-row admin-requirements-command-row">
						<div className="admin-student-toolbar admin-requirements-toolbar">
						{soeTab === "checking" ? (
							<label className="admin-student-search" aria-label="Search SOE checking records">
								<HiOutlineSearch />
								<input type="text" placeholder="Search by SOE request number, student number, student, or scholarship" value={soeCheckSearch} onChange={(event) => setSoeCheckSearch(event.target.value)} />
							</label>
						) : (
							<>
								<label className="admin-student-search" aria-label="Search requirement requests">
									<HiOutlineSearch />
									<input
										type="text"
										placeholder={
											soeTab === "requesting"
												? "Search approval requests by application number, student, scholarship, or material"
												: "Search reviewed requests by application number, student, scholarship, material, or status"
										}
										value={soeSearch}
										onChange={(event) => setSoeSearch(event.target.value)}
									/>
								</label>
								<AdminFilterSelect
									label="Filter by grantor"
									value={soeProviderFilter}
									options={[
										{ value: "All", label: "All Grantors" },
										...soeProviderOptions.map((provider) => ({ value: provider, label: toProviderLabel(provider) })),
									]}
									onChange={setSoeProviderFilter}
								/>
								<AdminFilterSelect
									label="Filter by requirement"
									value={soeMaterialFilter}
									options={[
										{ value: "All", label: "All Requirements" },
										{ value: "soe", label: "SOE" },
										{ value: "application_form", label: "Application Form" },
									]}
									onChange={setSoeMaterialFilter}
								/>
							</>
						)}
						</div>
					</div>
					{soeTab === "requesting" ? (
						<>
							<div className="admin-table-wrap admin-table-wrap--requirements">
								<table className="admin-management-table admin-management-table--roomy admin-requirements-table">
									<thead>
										<tr>
											<th>Application No.</th>
											<th>Student ID</th>
											<th>Student Name</th>
											<th>Scholarship</th>
											<th>Status</th>
											<th>Date Requested</th>
											<th>Action</th>
										</tr>
									</thead>
									<tbody>
										{requestingSoeRows.length === 0 ? (
											<EmptyStateRow colSpan={7} />
										) : (
											requestingSoeTablePage.rows.map((row) => (
												<tr key={row.id}>
													<td>{row.requestNumber || row.id || "-"}</td>
													<td>{row.studentId || "-"}</td>
													<td>{row.fullName || "-"}</td>
													<td>{row.scholarshipName || "-"}</td>
													<td><span className={toStatusClass(row.status)}>{row.status || "-"}</span></td>
													<td>{formatDate(row.requestDate)}</td>
													<td>
															<div className="admin-table-action-row">
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
					) : soeTab === "approved" || soeTab === "rejected" ? (
						<>
							<div className="admin-table-wrap admin-table-wrap--requirements">
								<table className="admin-management-table admin-management-table--roomy admin-requirements-table">
									<thead>
										<tr>
											<th>Application No.</th>
											<th>Student ID</th>
											<th>Student Name</th>
											<th>Scholarship</th>
											<th>Approval Status</th>
											<th>Action</th>
										</tr>
									</thead>
									<tbody>
										{(soeTab === "approved" ? approvedSoeRows : rejectedSoeRows).length === 0 ? (
											<EmptyStateRow colSpan={6} />
										) : (
											(soeTab === "approved" ? approvedSoeTablePage.rows : rejectedSoeTablePage.rows).map((row) => (
												<tr key={row.id}>
													<td>{row.requestNumber || row.id || "-"}</td>
													<td>{row.studentId || "-"}</td>
													<td>{row.fullName || "-"}</td>
													<td>{row.scholarshipName || "-"}</td>
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
								currentPage={soeTab === "approved" ? approvedSoeTablePage.currentPage : rejectedSoeTablePage.currentPage}
								totalItems={soeTab === "approved" ? approvedSoeRows.length : rejectedSoeRows.length}
								onPageChange={(page) => setTablePage(soeTab === "approved" ? "approved_soe" : "rejected_soe", page)}
							/>
						</>
					) : (
						<>
							<div className="admin-table-wrap admin-table-wrap--requirements">
								<table className="admin-management-table admin-management-table--roomy admin-requirements-table">
									<thead>
										<tr>
											<th>SOE Request No.</th>
											<th>Student No.</th>
											<th>Student Name</th>
											<th>Scholarship</th>
											<th>Downloaded At</th>
											<th>Cycle</th>
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
													<td>{row.semesterTag || currentSemesterTag}</td>
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
							{ id: "current", label: "Current", count: soeCheckingCounts.current, icon: HiOutlineClock },
							{ id: "previous", label: "Previous", count: soeCheckingCounts.previous, icon: HiOutlineArchive },
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
									<th>Cycle</th>
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
											<td>{row.semesterTag || currentSemesterTag}</td>
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
			const highRiskComplianceRows = complianceRows.filter((row) => Number(row.violationCount) >= COMPLIANCE_BLOCK_THRESHOLD).length
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
								<span>High Risk Compliance Cases</span>
								<strong>{highRiskComplianceRows}</strong>
								<p>Students with multiple compliance violations.</p>
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
								<p>Lifecycle and restriction reporting for the entire managed student population.</p>
								<div className="admin-report-card__meta">
									<div className="admin-report-card__metric">
										<strong>{allStudentReportRows.length}</strong>
										<span>Rows</span>
									</div>
									<div className="admin-report-card__metric">
										<strong>{studentTabCounts.archived}</strong>
										<span>Archived</span>
									</div>
								</div>
								<div className="admin-report-card__chips">
									<span>PDF</span>
									<span>Excel</span>
									<span>Access and lifecycle</span>
								</div>
								<div className="admin-report-card-actions">
									<button type="button" className="admin-export-btn admin-export-btn--mini" onClick={() => openStudentReportPreview({ view: "all", search: "", course: "All", year: "All" }, studentProfiles)}>
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
										<h3>Requirements</h3>
									</div>
								</div>
								<p>Requested and reviewed scholarship requirements, including request state and SOE download handling.</p>
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
										<HiOutlineCheckCircle />
									</div>
									<div>
										<span className="admin-report-card__eyebrow">Risk Oversight</span>
										<h3>Compliance</h3>
									</div>
								</div>
								<p>Violation monitoring and warning states visibility for compliance review.</p>
								<div className="admin-report-card__meta">
									<div className="admin-report-card__metric">
										<strong>{complianceRows.length}</strong>
										<span>Cases</span>
									</div>
									<div className="admin-report-card__metric">
										<strong>{highRiskComplianceRows}</strong>
										<span>High Risk</span>
									</div>
								</div>
								<div className="admin-report-card__chips">
									<span>Warning history</span>
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
										<span>Requirement requests indexed</span>
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
				<div className="admin-panel-head admin-announcement-head">
					<span className="admin-panel-icon"><HiOutlineBell /></span>
					<div>
						<h2>Announcements</h2>
						<p className="admin-panel-copy">Publish campus-wide notices, deadlines, and scholarship updates.</p>
					</div>
					<button type="button" className="admin-announcement-create-btn" onClick={() => setShowCreateAdminAnnouncementModal(true)}>
						<HiOutlineCloudUpload />
						Create Announcement
					</button>
				</div>

				<div className="admin-announcement-summary">
					<article><HiOutlineBell /><span>Active Announcements</span><strong>{filteredCurrentAnnouncements.length}</strong></article>
					<article><HiOutlineArchive /><span>Previous Announcements</span><strong>{filteredPreviousAnnouncements.length}</strong></article>
					<article><HiOutlineClock /><span>Latest Posted</span><strong>{filteredPortalAnnouncements[0] ? formatDate(filteredPortalAnnouncements[0].createdAt || filteredPortalAnnouncements[0].updatedAt || filteredPortalAnnouncements[0].date) : "None"}</strong></article>
				</div>

				{showAllAdminAnnouncements ? (
					<section className="admin-announcement-section admin-announcement-section--cards">
						<header className="admin-announcement-section-head admin-announcement-all-head">
							<div>
								<h3>All Announcements</h3>
								<p>Review active and archived announcements separately.</p>
							</div>
							<div className="admin-announcement-history-actions">
								<span>{filteredPortalAnnouncements.length} total</span>
								<button type="button" onClick={() => setShowAllAdminAnnouncements(false)}>
									<HiOutlineRefresh />
									Back
								</button>
							</div>
						</header>
						<div className="admin-announcement-filter-row">
							<AdminFilterSelect
								label="Filter announcements by source"
								value={adminAnnouncementSourceFilter}
								options={adminAnnouncementSourceOptions}
								onChange={setAdminAnnouncementSourceFilter}
							/>
						</div>
						<div className="admin-announcement-tabs">
							<button type="button" className={adminAnnouncementTab === "announcements" ? "active" : ""} onClick={() => setAdminAnnouncementTab("announcements")}>
								Announcements <span>{filteredCurrentAnnouncements.length}</span>
							</button>
							<button type="button" className={adminAnnouncementTab === "archived" ? "active" : ""} onClick={() => setAdminAnnouncementTab("archived")}>
								Archived <span>{filteredPreviousAnnouncements.length}</span>
							</button>
						</div>
						<div className="admin-announcement-card-grid">
							{!dataLoadState.announcements ? (
								<div className="admin-announcement-empty"><LoadingBars note="Loading announcement board..." /></div>
							) : adminAnnouncementRows.length === 0 ? (
								<div className="admin-announcement-empty">
									<HiOutlineBell />
									<strong>No {adminAnnouncementTab === "archived" ? "archived" : "active"} announcements yet.</strong>
									<p>Announcements in this tab will appear here.</p>
								</div>
							) : (
								adminAnnouncementRows.map((item) => (
									<article key={item.id} className={`admin-announcement-card-modern ${isAnnouncementArchived(item) ? "is-archived" : ""}`}>
										<div className="admin-announcement-card-media">
											{buildAnnouncementImageList(item)[0] ? <img src={buildAnnouncementImageList(item)[0]} alt={item.title || "Announcement"} /> : <span>{isAnnouncementArchived(item) ? <HiOutlineArchive /> : <HiOutlineBell />}</span>}
										</div>
										<div className="admin-announcement-card-body">
											<div className="admin-announcement-card-top">
												<span className={`type-badge-modern ${isAnnouncementArchived(item) ? "type-Archived" : `type-${item.type || "Update"}`}`}>{isAnnouncementArchived(item) ? "Archived" : item.type || "Update"}</span>
												<time>{formatDate(item.createdAt || item.date)}</time>
											</div>
											<span className="admin-announcement-source-label">{item.sourceLabel || "Admin"}</span>
											<h4>{item.title || "Announcement"}</h4>
											<p>{item.content || item.description || "-"}</p>
											<div className="admin-announcement-card-window">
												<HiOutlineClock />
												<span>{item.startDate || item.endDate ? `${toDateString(item.startDate)} - ${toDateString(item.endDate)}` : "No schedule set"}</span>
											</div>
										</div>
										<div className="admin-announcement-card-actions">
											<button type="button" onClick={() => setSelectedAdminAnnouncement(item)}><HiOutlineEye /> View</button>
											{isAnnouncementArchived(item) || item.sourceType !== "admin" ? (
												<span className="admin-announcement-archived-note">{isAnnouncementArchived(item) ? "Archived" : "Grantor Post"}</span>
											) : (
												<button type="button" className="is-danger" onClick={() => archiveAnnouncement(item.id)}>
													<HiOutlineTrash />
													Archive
												</button>
											)}
										</div>
									</article>
								))
							)}
						</div>
					</section>
				) : (
					<section className="admin-announcement-section admin-announcement-section--cards">
						<header className="admin-announcement-section-head">
							<div>
								<h3>Published Announcements</h3>
								<p>Showing the latest 6 published announcements.</p>
							</div>
							<div className="admin-announcement-history-actions">
								<span>{filteredCurrentAnnouncements.length} total</span>
								<button type="button" onClick={() => { setAdminAnnouncementTab("announcements"); setShowAllAdminAnnouncements(true) }}>
									See all Announcements
								</button>
							</div>
						</header>
						<div className="admin-announcement-filter-row">
							<AdminFilterSelect
								label="Filter announcements by source"
								value={adminAnnouncementSourceFilter}
								options={adminAnnouncementSourceOptions}
								onChange={setAdminAnnouncementSourceFilter}
							/>
						</div>
						<div className="admin-announcement-card-grid">
							{!dataLoadState.announcements ? (
								<div className="admin-announcement-empty"><LoadingBars note="Loading announcement board..." /></div>
							) : compactAdminAnnouncements.length === 0 ? (
								<div className="admin-announcement-empty">
									<HiOutlineBell />
									<strong>No announcements published yet.</strong>
									<p>Your published notices will appear here.</p>
								</div>
							) : (
								compactAdminAnnouncements.map((item) => (
									<article key={item.id} className="admin-announcement-card-modern">
										<div className="admin-announcement-card-media">
											{buildAnnouncementImageList(item)[0] ? <img src={buildAnnouncementImageList(item)[0]} alt={item.title || "Announcement"} /> : <span><HiOutlineBell /></span>}
										</div>
										<div className="admin-announcement-card-body">
											<div className="admin-announcement-card-top">
												<span className={`type-badge-modern type-${item.type || "Update"}`}>{item.type || "Update"}</span>
												<time>{formatDate(item.createdAt || item.date)}</time>
											</div>
											<span className="admin-announcement-source-label">{item.sourceLabel || "Admin"}</span>
											<h4>{item.title || "Announcement"}</h4>
											<p>{item.content || item.description || "-"}</p>
											<div className="admin-announcement-card-window">
												<HiOutlineClock />
												<span>{item.startDate || item.endDate ? `${toDateString(item.startDate)} - ${toDateString(item.endDate)}` : "No schedule set"}</span>
											</div>
										</div>
										<div className="admin-announcement-card-actions">
											<button type="button" onClick={() => setSelectedAdminAnnouncement(item)}><HiOutlineEye /> View</button>
											{item.sourceType === "admin" ? (
												<button type="button" className="is-danger" onClick={() => archiveAnnouncement(item.id)}>
													<HiOutlineTrash />
													Archive
												</button>
											) : (
												<span className="admin-announcement-archived-note">Grantor Post</span>
											)}
										</div>
									</article>
								))
							)}
						</div>
					</section>
				)}
			</section>
		)
	}

	return (
		<div className={`admin-portal ${theme === "dark" ? "admin-portal--dark" : ""}`}>
			<header className="admin-topbar">
				<Link to="/admin/dashboard" className="admin-topbar-brand" aria-label="Go to admin dashboard">
					<img src={logo2} alt="" />
					<div>
						<strong>BulsuScholar</strong>
						<span>Admin Portal</span>
					</div>
				</Link>
				<div className="admin-topbar-actions">
					<Link to="/admin/inbox" className={`admin-topbar-inbox ${["inbox", "notifications", "logs"].includes(activeSection) ? "active" : ""}`} aria-label="Open administrator inbox">
						<HiOutlineInbox />
						{unreadAdminNotifications.length > 0 ? <span>{unreadAdminNotifications.length > 99 ? "99+" : unreadAdminNotifications.length}</span> : null}
					</Link>
					<div className="admin-account" ref={adminMenuRef}>
						<button type="button" className="admin-account-btn" onClick={() => setAdminMenuOpen((open) => !open)} aria-label="Open administrator menu" aria-expanded={adminMenuOpen} aria-haspopup="menu">
							<span className="admin-topbar-avatar">AD</span>
							<HiOutlineMenu className="admin-account-menu-icon" />
						</button>
						{adminMenuOpen ? (
							<div className="admin-account-menu" role="menu">
								<div className="admin-account-card">
									<span className="admin-topbar-avatar admin-topbar-avatar--large">AD</span>
									<div><strong>Administrator</strong><p>System Manager</p></div>
								</div>
								<nav className="admin-account-links">
									<Link to="/admin/dashboard" onClick={() => setAdminMenuOpen(false)}><HiOutlineHome /> Dashboard</Link>
									<Link to="/admin/inbox" onClick={() => setAdminMenuOpen(false)}><HiOutlineInbox /> Inbox{unreadAdminNotifications.length > 0 ? <span>{unreadAdminNotifications.length}</span> : null}</Link>
								</nav>
								<div className="admin-account-theme">
									<span>Theme</span>
									<div>
										<button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}><HiOutlineSun /> Light</button>
										<button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}><HiOutlineMoon /> Dark</button>
									</div>
								</div>
								<button type="button" className="admin-account-logout" onClick={handleLogout}><HiOutlineLogout /> Logout</button>
							</div>
						) : null}
					</div>
				</div>
			</header>
			<aside className="admin-sidebar">
				<span className="admin-sidebar-label">Workspace</span>
				<nav className="admin-sidebar-nav">
					{ADMIN_SECTIONS.filter((section) => !section.topbarOnly).map((section) => {
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
			</aside>
			<main className="admin-workspace">{renderSection()}</main>
			{showCreateAdminAnnouncementModal ? (
				<div className="admin-detail-backdrop admin-announcement-modal-backdrop" role="presentation" onClick={closeCreateAdminAnnouncementModal}>
					<section className="admin-announcement-create-modal" role="dialog" aria-modal="true" aria-label="Create announcement" onClick={(event) => event.stopPropagation()}>
						<header>
							<div className="admin-scholar-import-head-icon" aria-hidden="true"><HiOutlineCloudUpload /></div>
							<div>
								<h3>Create Announcement</h3>
								<p>Share deadlines, reminders, and student-facing notices.</p>
							</div>
							<button type="button" onClick={closeCreateAdminAnnouncementModal} aria-label="Close create announcement modal"><HiX /></button>
						</header>
						<form className="admin-announcement-compose-form" onSubmit={postAnnouncement}>
							<div className="admin-announcement-compose-grid">
								<label>
									<span>Announcement Title</span>
									<input
										id="announcement-title"
										type="text"
										placeholder="Enter announcement title"
										value={announcementTitle}
										onChange={(event) => setAnnouncementTitle(event.target.value)}
									/>
								</label>
								<div className="admin-announcement-category-field">
									<span>Category</span>
									<AdminFilterSelect
										label="Announcement category"
										value={announcementType}
										options={[
											{ value: "Update", label: "Update" },
											{ value: "Deadline", label: "Deadline" },
											{ value: "Event", label: "Event" },
										]}
										onChange={setAnnouncementType}
									/>
								</div>
								<label>
									<span>Schedule</span>
									<button type="button" className={`admin-announcement-calendar-btn ${announcementStartDate ? "has-value" : ""}`} onClick={() => setShowAnnouncementSchedule(true)}>
										<HiOutlineClock />
										<span>{announcementStartDate && announcementEndDate ? `${announcementStartDate} to ${announcementEndDate}` : "Add schedule"}</span>
									</button>
								</label>
							</div>
							<label className="admin-announcement-message-field">
								<span>Message</span>
								<textarea
									id="announcement-description"
									placeholder="Write the complete announcement details."
									value={announcementDescription}
									onChange={(event) => setAnnouncementDescription(event.target.value)}
								/>
							</label>
							<div className="admin-announcement-images-field">
								<input
									id="announcement-images"
									type="file"
									accept="image/*"
									multiple
									onChange={handleAnnouncementFiles}
								/>
								<label htmlFor="announcement-images">
									<HiOutlineCloudUpload />
									<span>Add Images</span>
									<small>{announcementImageFiles.length} selected</small>
								</label>
								{announcementDraftPreviews.length > 0 ? (
									<div className="admin-announcement-preview-grid-modern">
										{announcementDraftPreviews.map((item, index) => (
											<article key={`${item.name}_${index}`}>
												<button type="button" className="admin-announcement-preview-open" onClick={() => openAnnouncementImagePreview(item.url)} aria-label={`Preview ${item.name || "announcement image"}`}>
													<img src={item.url} alt={item.name} />
												</button>
												<button type="button" className="admin-announcement-preview-remove" onClick={() => removeAnnouncementImage(index)} aria-label={`Remove ${item.name || "image"}`}>
													<HiX />
												</button>
											</article>
										))}
									</div>
								) : null}
							</div>
							<footer>
								<button type="button" className="admin-announcement-cancel-btn" onClick={closeCreateAdminAnnouncementModal} disabled={isPostingAnnouncement}>
									<HiX />
									Cancel
								</button>
								<button type="submit" className="admin-announcement-publish-btn" disabled={isPostingAnnouncement}>
									<HiOutlineCloudUpload />
									{isPostingAnnouncement ? "Publishing..." : "Publish Announcement"}
								</button>
							</footer>
						</form>
					</section>
				</div>
			) : null}

			{selectedAdminAnnouncement ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={() => setSelectedAdminAnnouncement(null)}>
					<section className="admin-announcement-view-modal" role="dialog" aria-modal="true" aria-label="Announcement details" onClick={(event) => event.stopPropagation()}>
						<header>
							<div>
								<span className={`admin-announcement-status ${isAnnouncementArchived(selectedAdminAnnouncement) ? "is-archived" : ""}`}>
									{isAnnouncementArchived(selectedAdminAnnouncement) ? "Archived" : selectedAdminAnnouncement.type || "Open"}
								</span>
								<h3>{selectedAdminAnnouncement.title || "Announcement"}</h3>
								<p>{selectedAdminAnnouncement.sourceLabel || "Admin"} announcement</p>
							</div>
							<button type="button" onClick={() => setSelectedAdminAnnouncement(null)} aria-label="Close announcement details"><HiX /></button>
						</header>
						{buildAnnouncementImageList(selectedAdminAnnouncement).length > 0 ? (
							<div className="admin-announcement-view-gallery">
								{buildAnnouncementImageList(selectedAdminAnnouncement).map((url) => (
									<button key={`${selectedAdminAnnouncement.id}_${url}`} type="button" onClick={() => openAnnouncementImagePreview(url)}>
										<img src={url} alt={selectedAdminAnnouncement.title || "Announcement"} />
									</button>
								))}
							</div>
						) : null}
						<p className="admin-announcement-view-message">{selectedAdminAnnouncement.description || selectedAdminAnnouncement.content || "-"}</p>
						<footer>
							<span><HiOutlineClock /> {selectedAdminAnnouncement.startDate || selectedAdminAnnouncement.endDate ? `${toDateString(selectedAdminAnnouncement.startDate)} - ${toDateString(selectedAdminAnnouncement.endDate)}` : "No schedule set"}</span>
							{isAnnouncementArchived(selectedAdminAnnouncement) || selectedAdminAnnouncement.sourceType !== "admin" ? (
								<i>{isAnnouncementArchived(selectedAdminAnnouncement) ? "Archived" : "Grantor Post"}</i>
							) : (
								<button type="button" onClick={() => archiveAnnouncement(selectedAdminAnnouncement.id)}>
									<HiOutlineTrash />
									Archive
								</button>
							)}
						</footer>
					</section>
				</div>
			) : null}

			{showAnnouncementSchedule ? (
				<div className="admin-detail-backdrop admin-announcement-schedule-backdrop" role="presentation" onClick={() => setShowAnnouncementSchedule(false)}>
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
				<div className="admin-detail-backdrop" role="presentation" onClick={closeAnnouncementImagePreview}>
					<div className="admin-lightbox admin-zoom-lightbox" role="dialog" aria-modal="true" aria-label="Announcement image preview" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={closeAnnouncementImagePreview}>
							<HiX />
						</button>
						<div className="admin-zoom-lightbox-toolbar" aria-label="Image zoom controls">
							<button type="button" onClick={() => adjustAnnouncementImageZoom(-0.2)} disabled={announcementImageZoom <= 0.5}>-</button>
							<span>{Math.round(announcementImageZoom * 100)}%</span>
							<button type="button" onClick={() => adjustAnnouncementImageZoom(0.2)} disabled={announcementImageZoom >= 3}>+</button>
							<button type="button" onClick={() => setAnnouncementImageZoom(1)}>Reset</button>
						</div>
						<div className="admin-zoom-lightbox-stage" onWheel={handleAnnouncementImageZoom}>
							<img src={announcementImagePreview} alt="Announcement preview" className="admin-lightbox-image admin-zoom-lightbox-image" style={{ width: `${Math.round(announcementImageZoom * 100)}%` }} />
						</div>
						<p className="admin-zoom-lightbox-hint">Scroll or use the touchpad over the image to zoom.</p>
					</div>
				</div>
			) : null}

			{showGrantorModal ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={closeGrantorModal}>
					<div className="admin-detail-modal admin-detail-modal--grantor" role="dialog" aria-modal="true" aria-label="Create new grantor" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={closeGrantorModal}>
							<HiX />
						</button>
						<div className="admin-grantor-modal-head">
							<div className="admin-grantor-modal-icon" aria-hidden="true">
								<HiOutlineUserAdd />
							</div>
							<div>
								<span className="admin-grantor-modal-eyebrow">Provider account</span>
								<h3>New Grantor</h3>
								<p>Set up a grantor portal profile and login credentials.</p>
							</div>
						</div>
						<div className="admin-grantor-modal-note">
							<strong>Default access</strong>
							<span>New grantors start with {GRANTOR_DEFAULT_PASSWORD} and must change it before entering the portal.</span>
						</div>
						<form className="admin-grantor-form" onSubmit={createGrantor}>
							<div className="admin-grantor-form-grid">
								<label className="admin-grantor-field">
									<span>First Name</span>
									<input
										type="text"
										value={grantorForm.fname}
										onChange={(event) => updateGrantorForm("fname", event.target.value)}
										placeholder="First name"
									/>
								</label>
								<label className="admin-grantor-field">
									<span>Middle Name</span>
									<input
										type="text"
										value={grantorForm.mname}
										onChange={(event) => updateGrantorForm("mname", event.target.value)}
										placeholder="Optional"
									/>
								</label>
								<label className="admin-grantor-field">
									<span>Last Name</span>
									<input
										type="text"
										value={grantorForm.lname}
										onChange={(event) => updateGrantorForm("lname", event.target.value)}
										placeholder="Last name"
									/>
								</label>
								<label className="admin-grantor-field">
									<span>Email</span>
									<input
										type="email"
										value={grantorForm.email}
										onChange={(event) => updateGrantorForm("email", event.target.value)}
										placeholder="grantor@example.com"
									/>
								</label>
								<label className="admin-grantor-field">
									<span>Organization</span>
									<input
										type="text"
										value={grantorForm.organization}
										onChange={(event) => updateGrantorForm("organization", event.target.value)}
										placeholder="Office or foundation"
									/>
								</label>
								<label className="admin-grantor-field">
									<span>Grantor ID</span>
									<input
										type="text"
										value={grantorForm.id}
										placeholder="Auto-generated from first name"
										autoComplete="off"
										readOnly
									/>
								</label>
							</div>
							<div className="admin-grantor-modal-actions">
								<button type="button" className="admin-grantor-secondary-btn" onClick={closeGrantorModal}>
									Cancel
								</button>
								<button type="submit" className="admin-grantor-primary-btn" disabled={isCreatingGrantor}>
									<HiOutlineUserAdd />
									{isCreatingGrantor ? "Creating..." : "Create Grantor"}
								</button>
							</div>
						</form>
					</div>
				</div>
			) : null}

			{selectedGrantor ? (
				<div className="admin-detail-backdrop admin-detail-backdrop--grantor" role="presentation" onClick={() => setSelectedGrantorId("")}>
					<div className="admin-detail-shell admin-detail-shell--grantor" onClick={(event) => event.stopPropagation()}>
						<div className="admin-detail-modal admin-detail-modal--grantor" role="dialog" aria-modal="true" aria-label="Grantor details">
							<button type="button" className="admin-detail-close" onClick={() => setSelectedGrantorId("")} aria-label="Close grantor details">
								<HiX />
							</button>
							<div className="admin-detail-header admin-grantor-modal-header">
								<div className="admin-detail-avatar admin-detail-avatar--grantor">
									{selectedGrantor.profileImageUrl || selectedGrantor.imageUrl || selectedGrantor.authorImageUrl ? (
										<img src={selectedGrantor.profileImageUrl || selectedGrantor.imageUrl || selectedGrantor.authorImageUrl} alt={selectedGrantor.name} />
									) : (
										<span>{getInitials(selectedGrantor.name)}</span>
									)}
								</div>
								<div>
									<h3>{selectedGrantor.name}</h3>
									<p className="admin-student-header-id">Grantor ID: {selectedGrantor.id}</p>
									<div className="admin-chip-stack">
										<span className={`admin-student-status admin-student-status--${String(selectedGrantor.statusLabel || "active").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{selectedGrantor.statusLabel}</span>
										<span className="admin-inline-chip">{selectedGrantor.applicationOpen ? "Applications Open" : "Applications Closed"}</span>
									</div>
								</div>
							</div>
							<h4 className="admin-student-detail-divider"><span>Grantor Information</span></h4>
							<div className="admin-detail-grid admin-grantor-detail-grid">
								<p className="admin-detail-meta"><span>Email</span><strong>{selectedGrantor.email || "-"}</strong></p>
								<p className="admin-detail-meta"><span>Organization</span><strong>{selectedGrantor.organization || "-"}</strong></p>
								<p className="admin-detail-meta"><span>Contact Number</span><strong>{selectedGrantor.cpNumber || selectedGrantor.contactNumber || "-"}</strong></p>
								<p className="admin-detail-meta"><span>Total Scholars</span><strong>{selectedGrantor.totalScholars || 0}</strong></p>
								<p className="admin-detail-meta"><span>Minimum GWA Required</span><strong>{selectedGrantor.minimumGwa ?? selectedGrantor.minGwa ?? "-"}</strong></p>
								<p className="admin-detail-meta"><span>Application Status</span><strong>{selectedGrantor.applicationOpen ? "Open" : "Closed"}</strong></p>
								<p className="admin-detail-meta"><span>Province</span><strong>{selectedGrantor.province || "-"}</strong></p>
								<p className="admin-detail-meta"><span>City / Municipality</span><strong>{selectedGrantor.city || "-"}</strong></p>
							</div>
							<div className="admin-grantor-detail-stats">
								<article><HiOutlineBell /><span>Current Announcement</span><strong>{selectedGrantorCurrentAnnouncement?.title || selectedGrantorCurrentAnnouncement?.announcementTitle || "No current announcement"}</strong></article>
								<article><HiOutlineDocumentText /><span>Posted Announcements</span><strong>{selectedGrantorAnnouncements.length}</strong></article>
								<article><HiOutlineAcademicCap /><span>Total Scholars</span><strong>{selectedGrantor.totalScholars || 0}</strong></article>
							</div>
							<div className="admin-grantor-recommended-students">
								<div className="admin-student-recommendations-head">
									<div>
										<span>Recommended Student</span>
										<strong>Top Suitable Students</strong>
									</div>
									<small>{selectedGrantorRecommendedStudents.length} found</small>
								</div>
								{selectedGrantorRecommendedStudents.length > 0 ? (
									<div className="admin-grantor-student-grid">
										{selectedGrantorRecommendedStudents.map((student, index) => (
											<article key={`${selectedGrantor.id}_student_${student.id}`} className="admin-grantor-student-card">
												<div>
													<span>{getInitials(student.fullName || studentFullName(student))}</span>
													<div>
														<strong>{student.fullName || studentFullName(student)}</strong>
														<small>{student.id} • Rank #{index + 1}</small>
													</div>
												</div>
												<p>{student.recommendationReason}</p>
												<ul>
													<li>GWA: {student.recommendationGwa ?? "-"}</li>
													<li>Course: {student.course || "-"}</li>
													<li>Score: {student.recommendationScore}</li>
												</ul>
											</article>
										))}
									</div>
								) : (
									<p className="admin-student-recommendation-empty">No eligible student without scholarship matched this grantor yet.</p>
								)}
							</div>
							<footer className="admin-detail-actions admin-grantor-detail-actions">
								<button
									type="button"
									className="admin-table-btn"
									disabled={!selectedGrantorPasswordChangePending}
									title={
										selectedGrantorPasswordChangePending
											? "Approve this grantor password change request"
											: "No password change request is pending for this grantor"
									}
									onClick={() => approveGrantorPasswordChange(selectedGrantor.id)}
								>
									<HiOutlineCheckCircle /> Approve Password Change
								</button>
								<button type="button" className="admin-danger-btn" disabled={selectedGrantor.archived === true} onClick={() => openSingleGrantorArchiveConfirmation(selectedGrantor.id)}>
									<HiOutlineTrash /> Archive Grantor
								</button>
							</footer>
						</div>
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
						<div className="admin-detail-info admin-student-detail-info">
							<div className="admin-detail-header admin-student-modal-header">
								<div className="admin-detail-avatar admin-detail-avatar--student">
									{selectedStudent.profileImageUrl || selectedStudent.profilePhotoUrl || selectedStudent.photoURL || selectedStudent.avatarUrl || selectedStudent.imageUrl ? (
										<img
											src={selectedStudent.profileImageUrl || selectedStudent.profilePhotoUrl || selectedStudent.photoURL || selectedStudent.avatarUrl || selectedStudent.imageUrl}
											alt={selectedStudent.fullName}
										/>
									) : (
										<span>{getInitials(selectedStudent.fullName)}</span>
									)}
								</div>
								<div>
									<h3>{selectedStudent.fullName}</h3>
									<p className="admin-student-header-id">Student ID: {selectedStudent.studentId || selectedStudent.id}</p>
									<div className="admin-chip-stack">
										<span className={toStatusClass(selectedStudent.recordStatus)}>{selectedStudent.recordStatus}</span>
										{selectedStudent.soeComplianceWarning ? <span className="admin-inline-chip">Compliance Warning</span> : null}

									</div>
								</div>
							</div>
							<h4 className="admin-student-detail-divider"><span>Student Information</span></h4>
							<div className="admin-detail-grid admin-student-detail-grid">
								<p className="admin-detail-meta"><span>Full Name</span><strong>{selectedStudent.fullName}</strong></p>
								<p className="admin-detail-meta"><span>Email</span><strong>{selectedStudent.email || "-"}</strong></p>
								<p className="admin-detail-meta"><span>Contact Number</span><strong>{selectedStudent.cpNumber || selectedStudent.contactNumber || "-"}</strong></p>
								<p className="admin-detail-meta"><span>Record Status</span><strong>{selectedStudent.recordStatus}</strong></p>
							</div>
							<h4 className="admin-student-detail-divider"><span>Academic Information</span></h4>
							<div className="admin-detail-grid admin-student-detail-grid">
								<p className="admin-detail-meta"><span>Course</span><strong>{selectedStudent.course || "-"}</strong></p>
								<p className="admin-detail-meta"><span>Year Level</span><strong>{selectedStudent.year || selectedStudent.yearLevel || "-"}</strong></p>
								<p className="admin-detail-meta"><span>Section</span><strong>{selectedStudent.section || selectedStudent.yearSection || "-"}</strong></p>
								<p className="admin-detail-meta"><span>Current GWA</span><strong>{selectedStudent.gwa || selectedStudent.currentGwa || selectedStudent.currentGWA || "-"}</strong></p>
							</div>
							<h4 className="admin-student-detail-divider"><span>Address</span></h4>
							<div className="admin-detail-grid admin-student-detail-grid">
								<p className="admin-detail-meta"><span>Street / Subdivision</span><strong>{selectedStudent.street || selectedStudent.subdivision || "-"}</strong></p>
								<p className="admin-detail-meta"><span>Barangay</span><strong>{selectedStudent.barangay || "-"}</strong></p>
								<p className="admin-detail-meta"><span>City / Municipality</span><strong>{selectedStudent.city || selectedStudent.municipality || "-"}</strong></p>
								<p className="admin-detail-meta"><span>Province</span><strong>{selectedStudent.province || "-"}</strong></p>
								<p className="admin-detail-meta"><span>Postal Code</span><strong>{selectedStudent.postalCode || selectedStudent.zipCode || "-"}</strong></p>
								<p className="admin-detail-meta"><span>Last SOE Request</span><strong>{selectedStudentLastSoe}</strong></p>
							</div>
						</div>
						<div className="admin-detail-docs">
							<strong>Documents</strong>
							{[
								{ ...(selectedStudent.corFile || {}), label: "View COR", title: "Certificate of Registration", url: selectedStudent.corFile?.url, name: selectedStudent.corFile?.name || "COR" },
								{ ...(selectedStudent.cogFile || {}), label: "View COG", title: "Certificate of Grades", url: selectedStudent.cogFile?.url, name: selectedStudent.cogFile?.name || "COG" },
								{ ...(selectedStudent.schoolIdFile || selectedStudent.studentIdFile || {}), label: "View School ID", title: "School ID", url: selectedStudent.schoolIdFile?.url || selectedStudent.studentIdFile?.url, name: selectedStudent.schoolIdFile?.name || selectedStudent.studentIdFile?.name || "School ID" },
								{
									...(selectedStudent.scholarshipApplicationFile || selectedStudent.applicationFormFile || {}),
									label: "View Application Form",
									title: "Scholarship Application Form",
									url:
										selectedStudent.scholarshipApplicationFile?.url ||
										selectedStudent.applicationFormFile?.url,
									name:
										selectedStudent.scholarshipApplicationFile?.name ||
										selectedStudent.applicationFormFile?.name ||
										"Application Form",
								},
							].map((document) =>
								document.url ? (
									<button key={document.label} type="button" onClick={() => openDocumentPreview(document)}>
										<HiOutlineEye />
										{document.label}
									</button>
								) : (
									<span key={document.label} className="admin-detail-docs-empty">
										{document.label} Unavailable
									</span>
								),
							)}
							{(() => {
								const otherDocuments = (Array.isArray(selectedStudent.scholarships) ? selectedStudent.scholarships : [])
									.flatMap((scholarship) => collectOtherRequirementDocuments(scholarship))
								if (otherDocuments.length === 0) return null
								return (
									<div className="admin-detail-other-docs admin-detail-other-docs--student">
										<strong>Other documents</strong>
										<div className="admin-detail-other-docs-list">
											{otherDocuments.map((document, index) => (
												<button
													key={`${document.requirementId}_${document.url}_${index}`}
													type="button"
													onClick={() => openDocumentPreview(document)}
												>
													<HiOutlineEye />
													<span>{document.requirementName}</span>
													<small>{document.name}</small>
												</button>
											))}
										</div>
									</div>
								)
							})()}
						</div>
						<div className="admin-detail-scholarships">
							<strong>Scholarships</strong>
							<div className="admin-student-current-stage admin-student-current-stage--scholarship">
								<div><span>Current Tracking</span><strong>{selectedStudentTracking?.currentStepLabel || "Account Created"}</strong></div>
								<p>{selectedStudentTracking ? `${selectedStudentTracking.scholarship} | ${selectedStudentTracking.currentStepOwnerLabel || "Student"}` : "No active scholarship tracking record."}</p>
							</div>
							{selectedStudentGrantorScholarships.length > 0 ? (
								selectedStudentGrantorScholarships.map((entry, index) => (
									<div
										key={`${selectedStudent.id}_scholarship_${index}`}
										className="admin-detail-scholarship-row"
									>
										<p>{entry.scholarshipName}</p>
										<span>{entry.grantorName} • {entry.status}</span>
									</div>
								))
							) : getStudentScholarshipNames(selectedStudent).length > 0 ? (
								getStudentScholarshipNames(selectedStudent).map((scholarshipName, index) => (
									<div
										key={`${selectedStudent.id}_student_scholarship_${index}`}
										className="admin-detail-scholarship-row"
									>
										<p>{scholarshipName}</p>
										<span>Assigned scholarship</span>
									</div>
								))
							) : (
								<span className="admin-detail-docs-empty">No scholarships assigned</span>
							)}
							{!selectedStudentHasScholarship ? (
								<div className="admin-student-recommendations">
									<div className="admin-student-recommendations-head">
										<div>
											<span>Admin Recommendation</span>
											<strong>Recommended Scholarships</strong>
										</div>
										<small>{selectedStudentRecommendationsLoading ? "Checking..." : `${selectedStudentRecommendations.length} found`}</small>
									</div>
									{selectedStudentRecommendationsLoading ? (
										<p className="admin-student-recommendation-empty">Loading recommended scholarships for this student.</p>
									) : selectedStudentRecommendations.length > 0 ? (
										<div className="admin-student-recommendation-grid">
											{selectedStudentRecommendations.map((recommendation, index) => {
												const recommendationId = recommendation.announcementId || recommendation.grantorId || `recommendation_${index}`
												const grantorName = recommendation.grantorName || recommendation.providerLabel || "Grantor"
												const scholarshipName = recommendation.announcementTitle || recommendation.providerLabel || grantorName
												return (
													<article key={recommendationId} className="admin-student-recommendation-card">
														<div className="admin-student-recommendation-author">
															<span>
																{recommendation.profileImageUrl || recommendation.authorImageUrl ? (
																	<img src={recommendation.profileImageUrl || recommendation.authorImageUrl} alt={grantorName} />
																) : (
																	getInitials(grantorName)
																)}
															</span>
															<div>
																<strong>{grantorName}</strong>
																<small>Rank #{index + 1}</small>
															</div>
														</div>
														<h5>{scholarshipName}</h5>
														<p>{recommendation.label || "Best scholarship match for this student."}</p>
														<div className="admin-student-recommendation-meta">
															<span><HiOutlineAcademicCap /> Minimum GWA {recommendation.minimumGwa ?? recommendation.minGwa ?? "-"}</span>
															<span><HiOutlineUsers /> {recommendation.rosterCount || 0} roster scholars</span>
															<span><HiOutlineSparkles /> Score {Math.round(Number(recommendation.score || 0))}</span>
														</div>
														<button
															type="button"
															onClick={() => recommendScholarshipToSelectedStudent(recommendation)}
															disabled={recommendingScholarshipId === recommendationId}
														>
															<HiOutlineSparkles />
															{recommendingScholarshipId === recommendationId ? "Sending..." : "Recommend"}
														</button>
													</article>
												)
											})}
										</div>
									) : (
										<p className="admin-student-recommendation-empty">No open scholarship recommendation matched this student yet.</p>
									)}
								</div>
							) : null}
						</div>
						<div className="admin-detail-actions">
							{selectedStudent.archived === true && (
								<button type="button" className="admin-safe-btn" disabled={isBusy} onClick={() => unarchiveStudent(selectedStudent.id)}>
									<HiOutlineRefresh /> Unarchive Student
								</button>
							)}
						</div>
					</div>
					</div>
				</div>
			) : null}

			{adminScholarModalOpen ? (
				<div className="admin-detail-backdrop admin-detail-backdrop--admin-scholar-import" role="presentation" onClick={closeAdminScholarModal}>
					<div className="admin-detail-shell admin-detail-shell--review admin-detail-shell--admin-scholar-import" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={closeAdminScholarModal} aria-label="Close add scholar modal">
							<HiX />
						</button>
						<div className="admin-detail-modal admin-detail-modal--review admin-detail-modal--admin-scholar-import" role="dialog" aria-modal="true" aria-label="Add scholars">
							<header className="admin-scholar-import-head">
								<span className="admin-scholar-import-head-icon" aria-hidden="true">
									<HiOutlineCloudUpload />
								</span>
								<div>
									<h3>{adminScholarImportRows.length > 0 ? "Import Scholars" : "Add Scholars"}</h3>
									<p>{adminScholarImportRows.length > 0 ? "Review the mapped records before importing them into the grantor roster." : "Upload a spreadsheet or enter scholar information manually."}</p>
								</div>
								{adminScholarImportRows.length > 0 ? (
									<span className="admin-scholar-import-count">{adminScholarImportRows.length} Rows</span>
								) : null}
							</header>
							<div className="admin-scholar-import-body">
								{adminScholarImportRows.length > 0 ? (
									<>
										<div className="admin-scholar-import-info">
											<div>
												<strong>{adminScholarImportRows.length} rows detected from <em>{adminScholarImportFile?.name || "selected file"}</em></strong>
												<span>Select the corresponding system field for each column below.</span>
											</div>
											<div className="admin-scholar-import-info-actions">
												<button
													type="button"
													className="admin-danger-btn"
													disabled={selectedAdminScholarImportRows.length === 0}
													onClick={removeSelectedAdminScholarImportRows}
												>
													<HiOutlineTrash /> Remove Selected
												</button>
												<button type="button" className="admin-import-clear-btn" onClick={clearAdminScholarImport}>
													<HiOutlineRefresh /> Clear & Restart
												</button>
											</div>
										</div>
										<label className="admin-scholar-import-grantor-select">
											<span>{highlightedAdminScholarGrantorRows.length > 0 ? `Apply Grantor To ${highlightedAdminScholarGrantorRows.length} Highlighted Cell${highlightedAdminScholarGrantorRows.length === 1 ? "" : "s"}` : "Fallback Grantor"}</span>
											<select value={highlightedAdminScholarGrantorRows.length > 0 ? "" : adminScholarForm.grantorId} onChange={(event) => applyAdminScholarImportGrantor(event.target.value)}>
												<option value="">Select active grantor</option>
												{adminScholarGrantorOptions.map((grantor) => (
													<option key={grantor.value} value={grantor.value}>{grantor.label}</option>
												))}
											</select>
										</label>
										<div className="admin-scholar-duplicate-policy-note">
											<HiOutlineExclamation />
											<span>Duplicate prevention is active. Same-grantor and cross-grantor duplicate scholarships are blocked before import.</span>
										</div>
										<div className="admin-scholar-import-table-wrap">
											<table className="admin-scholar-import-table">
												<thead>
													<tr>
														<th className="admin-scholar-import-checkbox-col">
															<input
																type="checkbox"
																checked={allAdminScholarImportRowsSelected}
																onChange={(event) => {
																	setSelectedAdminScholarImportRows(event.target.checked ? adminScholarImportRows.map((_, index) => index) : [])
																}}
																aria-label="Select all imported rows"
															/>
														</th>
														{adminScholarImportColumns.map((column) => (
															<th
																key={`admin_import_column_${column.index}`}
																className={column.index === 0 ? "admin-scholar-import-grantor-col" : undefined}
															>
																<select
																	className="admin-scholar-import-select"
																	value={adminScholarColumnMapping[column.index] || ""}
																	disabled={column.index === 0}
																	onChange={(event) => {
																		setAdminScholarColumnMapping((prev) => {
																			const next = [...prev]
																			next[column.index] = event.target.value
																			return next
																		})
																	}}
																	aria-label={`Map ${column.header}`}
																>
																	{column.index === 0 ? <option value="">Grantor</option> : <option value="">Ignore Column</option>}
																	{column.index === 0 ? null : ADMIN_IMPORT_MAPPABLE_FIELDS.map((field) => (
																		<option key={field.value} value={field.value}>{field.label}</option>
																	))}
																</select>
															</th>
														))}
													</tr>
												</thead>
												<tbody>
													{adminScholarImportRows.map((row, rowIndex) => (
														<tr key={`admin_import_${row.rowNumber}_${rowIndex}`}>
															<td className="admin-scholar-import-checkbox-col">
																<input
																	type="checkbox"
																	checked={selectedAdminScholarImportSet.has(rowIndex)}
																	onChange={(event) => {
																		setSelectedAdminScholarImportRows((prev) => {
																			const selected = new Set(prev)
																			if (event.target.checked) selected.add(rowIndex)
																			else selected.delete(rowIndex)
																			return [...selected].sort((left, right) => left - right)
																		})
																	}}
																	aria-label={`Select row ${row.rowNumber}`}
																/>
															</td>
															{adminScholarImportColumns.map((column) => (
																<td
																	key={`admin_import_${row.rowNumber}_${column.index}`}
																	className={[
																		column.index === 0 ? "admin-scholar-import-grantor-col admin-scholar-import-grantor-cell" : "",
																		column.index === 0 && adminScholarImportGrantorAssignments[row.rowNumber] ? "has-grantor" : "",
																		column.index === 0 && highlightedAdminScholarGrantorRows.includes(row.rowNumber) ? "is-highlighted" : "",
																	].filter(Boolean).join(" ")}
																	onClick={column.index === 0 ? () => {
																		setHighlightedAdminScholarGrantorRows((prev) =>
																			prev.includes(row.rowNumber)
																				? prev.filter((rowNumber) => rowNumber !== row.rowNumber)
																				: [...prev, row.rowNumber],
																		)
																	} : undefined}
																>
																	{column.index === 0
																		? getAdminScholarImportGrantorLabel(adminScholarImportGrantorAssignments[row.rowNumber])
																		: row.raw?.[column.index - 1] || "-"}
																</td>
															))}
														</tr>
													))}
												</tbody>
											</table>
										</div>
									</>
								) : (
									<>
										<label
											className="admin-scholar-dropzone"
											onDragOver={(event) => event.preventDefault()}
											onDrop={(event) => {
												event.preventDefault()
												parseAdminScholarImportFile(event.dataTransfer.files?.[0])
											}}
										>
											<span className="admin-scholar-dropzone-icon" aria-hidden="true">
												<HiOutlineCloudUpload />
											</span>
											<strong>Drag and drop a scholar file here</strong>
											<small>Supported formats: .csv, .xls, .xlsx, .xlsb, .xlsc, .xlsm</small>
											<em>{adminScholarImportFile?.name || "Choose File"}</em>
											<input
												type="file"
												accept=".xlsx,.xls,.csv,.xlsb,.xlsm"
												onChange={(event) => parseAdminScholarImportFile(event.target.files?.[0])}
											/>
										</label>
										<div className="admin-scholar-import-grid">
											<select value={adminScholarForm.grantorId} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, grantorId: event.target.value }))}>
												<option value="">Scholarship / Grantor</option>
												{adminScholarGrantorOptions.map((grantor) => (
													<option key={grantor.value} value={grantor.value}>{grantor.label}</option>
												))}
											</select>
											<input placeholder="Student ID" value={adminScholarForm.studentId} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, studentId: event.target.value }))} />
											<input placeholder="Email" value={adminScholarForm.email} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, email: event.target.value }))} />
											<input placeholder="Contact Number" value={adminScholarForm.cpNumber} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, cpNumber: event.target.value }))} />
											<input placeholder="First Name" value={adminScholarForm.fname} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, fname: event.target.value }))} />
											<input placeholder="Middle Name" value={adminScholarForm.mname} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, mname: event.target.value }))} />
											<input placeholder="Last Name" value={adminScholarForm.lname} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, lname: event.target.value }))} />
											<input placeholder="Street" value={adminScholarForm.street} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, street: event.target.value }))} />
											<input placeholder="Barangay" value={adminScholarForm.barangay} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, barangay: event.target.value }))} />
											<input placeholder="City" value={adminScholarForm.city} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, city: event.target.value }))} />
											<input placeholder="Province" value={adminScholarForm.province} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, province: event.target.value }))} />
											<input placeholder="Postal Code" value={adminScholarForm.postalCode} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, postalCode: event.target.value }))} />
											<input placeholder="Course" value={adminScholarForm.course} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, course: event.target.value }))} />
											<select value={adminScholarForm.yearLevel} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, yearLevel: event.target.value }))}>
												{["1", "2", "3", "4"].map((level) => <option key={level} value={level}>Year {level}</option>)}
											</select>
											<input placeholder="Scholarship / Program" value={adminScholarForm.scholarshipTitle} onChange={(event) => setAdminScholarForm((prev) => ({ ...prev, scholarshipTitle: event.target.value }))} />
										</div>
									</>
								)}
								{adminScholarImportWarnings.length > 0 ? (
									<div className="admin-student-alert">
										<div className="admin-student-warning-copy">
											<strong>Import notes</strong>
											<span>{adminScholarImportWarnings.slice(0, 4).join(" ")}</span>
										</div>
										<HiOutlineExclamation />
									</div>
								) : null}
								<div className="admin-scholar-import-actions">
									<button type="button" className="admin-danger-btn" onClick={closeAdminScholarModal}>
										<HiX /> Cancel
									</button>
									<button
										type="button"
										className="admin-safe-btn"
										disabled={isBusy}
										onClick={adminScholarImportRows.length > 0 ? submitAdminScholarImport : submitAdminScholarManual}
									>
										<HiOutlineCheckCircle /> {isBusy ? "Saving..." : adminScholarImportRows.length > 0 ? `Import ${adminScholarImportRows.length} Scholars` : "Save Scholar"}
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			) : null}

			{previewDocument ? (
				<div
					className="admin-document-preview-backdrop"
					role="dialog"
					aria-modal="true"
					aria-label={`${previewDocument.title} preview`}
					onClick={closeDocumentPreview}
				>
					<div className="admin-document-preview-modal" onClick={(event) => event.stopPropagation()}>
						<header className="admin-document-preview-head">
							<div>
								<span>Document Preview</span>
								<h3>{previewDocument.title}</h3>
								<p>{previewDocument.name}</p>
							</div>
							<div className="admin-document-preview-actions">
								<button type="button" className="admin-document-preview-download" onClick={downloadPreviewDocument}>
									<HiOutlineDownload /> Download
								</button>
								<button type="button" className="admin-document-preview-close" onClick={closeDocumentPreview} aria-label="Close document preview">
									<HiX />
								</button>
							</div>
						</header>
						<div className="admin-document-preview-body">
							{isPreviewLoading ? (
								<div className="admin-document-preview-state">
									<HiOutlineDocumentText />
									<span>Loading preview...</span>
								</div>
							) : !previewBlobUrl ? (
								<div className="admin-document-preview-state">
									<HiOutlineDocumentText />
									<span>Preview is unavailable.</span>
								</div>
							) : (
								<img src={previewBlobUrl} alt={`${previewDocument.title} preview`} className="admin-document-preview-image" />
							)}
						</div>
					</div>
				</div>
			) : null}

			{selectedScholarshipTrackingRow ? (
				<div className="admin-detail-backdrop admin-detail-backdrop--review" role="presentation" onClick={closeScholarshipTrackingModal}>
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
								<div className="admin-soe-review-head admin-soe-review-head--tracking">
									<span className="admin-review-modal-icon" aria-hidden="true">
										<HiOutlineAcademicCap />
									</span>
									<div>
										<span>Scholarship Programs</span>
										<h3>Application Tracking</h3>
										<p className="admin-detail-meta">
											Track the student application flow and complete the current admin-owned step when it is ready.
										</p>
									</div>
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
													{getScholarshipTrackingStepBadgeLabel(
														step,
														selectedScholarshipTrackingRow.trackingProgress.steps,
													) ? (
														<span
															className={`admin-detail-chip admin-detail-chip--${
																step.state === "complete"
																	? "complete"
																	: step.state === "upcoming"
																		? "pending"
																		: "current"
															}`}
														>
															{getScholarshipTrackingStepBadgeLabel(
																step,
																selectedScholarshipTrackingRow.trackingProgress.steps,
															)}
														</span>
													) : null}
												</div>
											</div>
										</article>
									))}
								</div>
								<div className="admin-tracking-documents">
									<strong className="admin-tracking-documents-title">Documents</strong>
									<div className="admin-tracking-documents-grid">
										{(() => {
											const documentUrls = getDocumentUrlsForStudent(
												selectedScholarshipTrackingRow.studentSnapshot,
											)
											return [
												{ label: "COR", title: "Certificate of Registration", url: documentUrls.cor },
												{ label: "COG", title: "Certificate of Grades", url: documentUrls.cog },
												{ label: "School ID", title: "School ID", url: documentUrls.schoolId },
												{ label: "Application Form", title: "Application Form", url: documentUrls.applicationForm },
											].map((document) =>
												document.url ? (
													<button
														key={document.label}
														type="button"
														onClick={() => openDocumentPreview(document)}
													>
														<HiOutlineEye />
														<span>View {document.label}</span>
													</button>
												) : (
													<span key={document.label} className="admin-tracking-documents-empty">
														View {document.label} Unavailable
													</span>
												),
											)
										})()}
									</div>
									{(() => {
										const otherDocuments = collectOtherRequirementDocuments(
											selectedScholarshipTrackingRow.scholarshipEntry,
										)
										return (
											<div className="admin-tracking-other-documents">
												<strong>Other Documents</strong>
												{otherDocuments.length === 0 ? (
													<span className="admin-tracking-other-documents-none">None</span>
												) : (
													<div className="admin-tracking-other-documents-list">
														{otherDocuments.map((document, index) => (
															<button
																key={`${document.requirementId}_${document.url}_${index}`}
																type="button"
																onClick={() => openDocumentPreview(document)}
															>
																<HiOutlineEye />
																<span>{document.requirementName}</span>
																<small>{document.name}</small>
															</button>
														))}
													</div>
												)}
											</div>
										)
									})()}
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
												? canUseGrantorConfirmationForStep(selectedScholarshipTrackingRow.trackingProgress.currentStep?.id)
													? `Confirm "${selectedScholarshipTrackingRow.trackingProgress.currentStepLabel}" for review. Grantor-owned applications will be sent to the grantor for final confirmation.`
													: `Complete "${selectedScholarshipTrackingRow.trackingProgress.currentStepLabel}" to move the student to the next step.`
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
											selectedScholarshipTrackingRow.trackingProgress.currentStep?.owner === "student" ||
											!selectedScholarshipTrackingRow.trackingProgress.canAdminCompleteCurrentStep
										}
										title={
											selectedScholarshipTrackingRow.trackingProgress.currentStep?.owner === "student"
												? "This step must be completed by the student."
												: selectedScholarshipTrackingRow.trackingProgress.adminCompletionReason || ""
										}
										onClick={completeScholarshipTrackingCurrentStep}
									>
										<HiOutlineCheckCircle aria-hidden />
										Confirm Approval
									</button>
									<button
										type="button"
										className="admin-danger-btn"
										disabled={isBusy}
										onClick={openRejectScholarshipApplicationModal}
									>
										<HiOutlineBan aria-hidden />
										Reject Application
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			) : null}

			{adminRejectModalOpen && selectedScholarshipTrackingRow ? (
				<div
					className="admin-reject-modal-backdrop"
					role="presentation"
					onClick={closeRejectScholarshipApplicationModal}
				>
					<div
						className="admin-reject-modal"
						role="dialog"
						aria-modal="true"
						aria-label="Reject scholarship application"
						onClick={(event) => event.stopPropagation()}
					>
						<header className="admin-reject-modal-head">
							<div className="admin-reject-modal-icon" aria-hidden="true">
								<HiOutlineExclamation />
							</div>
							<div>
								<span>Application Decision</span>
								<h3>Reject Application</h3>
								<p>
									This archives the application, removes it from the student's active scholarship,
									and sends the rejection details to their inbox.
								</p>
							</div>
							<button type="button" onClick={closeRejectScholarshipApplicationModal} aria-label="Close rejection modal">
								<HiX />
							</button>
						</header>
						<div className="admin-reject-modal-body">
							<div className="admin-reject-summary-grid">
								<p><span>Applicant</span><strong>{selectedScholarshipTrackingRow.fullName}</strong></p>
								<p><span>Student ID</span><strong>{selectedScholarshipTrackingRow.studentId}</strong></p>
								<p><span>Scholarship</span><strong>{selectedScholarshipTrackingRow.scholarship}</strong></p>
								<p><span>Rejected By</span><strong>BulsuScholar Admin</strong></p>
							</div>
							<label>
								Reason
								<select value={adminRejectReason} onChange={(event) => setAdminRejectReason(event.target.value)}>
									{APPLICATION_REJECTION_REASONS.map((reason) => (
										<option key={reason} value={reason}>{reason}</option>
									))}
								</select>
							</label>
							<label>
								Message / Notes
								<textarea
									value={adminRejectNotes}
									onChange={(event) => setAdminRejectNotes(event.target.value)}
									placeholder="Add a clear message for the student, such as which document or requirement caused the rejection."
									rows={4}
								/>
							</label>
						</div>
						<footer className="admin-reject-modal-actions">
							<button type="button" className="admin-reject-cancel-btn" onClick={closeRejectScholarshipApplicationModal} disabled={isBusy}>
								Cancel
							</button>
							<button type="button" className="admin-reject-confirm-btn" onClick={() => executeRejectScholarshipApplication(selectedScholarshipTrackingRow)} disabled={isBusy}>
								<HiOutlineExclamation /> {isBusy ? "Confirming..." : "Confirm Rejection"}
							</button>
						</footer>
					</div>
				</div>
			) : null}

			{selectedScholarshipWarningRow ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={() => setSelectedScholarshipWarningKey("")}>
					<div className="admin-detail-shell admin-detail-shell--review" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={() => setSelectedScholarshipWarningKey("")}>
							<HiX />
						</button>
						<div
							className="admin-detail-modal admin-detail-modal--review admin-duplicate-resolution-modal"
							role="dialog"
							aria-modal="true"
							aria-label="Resolve duplicate scholarship"
						>
							<div className="admin-detail-info">
								<div className="admin-soe-review-head">
									<span className="admin-review-modal-icon admin-review-modal-icon--warning" aria-hidden="true">
										<HiOutlineExclamation />
									</span>
									<div>
										<span>Duplicate Scholarship Warning</span>
										<h3>{selectedScholarshipWarningRow.fullName}</h3>
										<p className="admin-detail-meta">
											Student ID: {toDisplayStudentId(selectedScholarshipWarningRow.studentId) || "-"}.
											Choose one scholarship to keep. The other grantor roster records will be archived.
										</p>
									</div>
								</div>
								<section className="admin-soe-review-section">
									<div className="admin-soe-review-section-head">
										<h4>Detected Scholarships</h4>
										<p>Only one scholarship can remain active for this student.</p>
									</div>
									<div className="admin-duplicate-choice-grid">
										{selectedScholarshipWarningRow.conflictOptions?.map((option) => (
											<article key={option.key} className="admin-duplicate-choice-card">
												<div>
													<span>{option.grantorName || "Grantor"}</span>
													<strong>{option.scholarshipName || "Scholarship"}</strong>
													<p>{option.status || "Active"} roster record</p>
												</div>
												<button
													type="button"
													className="admin-safe-btn"
													onClick={() => resolveDuplicateScholarshipWarning(selectedScholarshipWarningRow, option)}
													disabled={isBusy}
												>
													<HiOutlineCheckCircle />
													Choose this Scholar
												</button>
											</article>
										))}
									</div>
								</section>
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
							<div className="admin-detail-confirm-head">
								<span
									className={`admin-detail-confirm-icon ${
										adminConfirmDialog.tone === "danger" ? "admin-detail-confirm-icon--danger" : ""
									}`}
									aria-hidden="true"
								>
									{adminConfirmDialog.tone === "danger" ? <HiOutlineArchive /> : <HiOutlineCheckCircle />}
								</span>
								<div className="admin-detail-confirm-copy">
									<p className="admin-detail-confirm-kicker">Confirmation Required</p>
									<h3>{adminConfirmDialog.title}</h3>
									<p className="admin-detail-meta">{adminConfirmDialog.message}</p>
								</div>
							</div>
							<div className="admin-detail-actions admin-detail-actions--confirm">
								<button type="button" className="admin-table-btn" onClick={closeAdminConfirmDialog} disabled={isBusy}>
									<HiX />
									Keep Current State
								</button>
								<button
									type="button"
									className={adminConfirmDialog.tone === "danger" ? "admin-danger-btn" : "admin-safe-btn"}
									onClick={confirmAdminDialogAction}
									disabled={isBusy}
								>
									{adminConfirmDialog.tone === "danger" ? <HiOutlineArchive /> : <HiOutlineCheckCircle />}
									{adminConfirmDialog.confirmLabel}
								</button>
							</div>
						</div>
					</div>
				</div>
			) : null}

			{selectedSoeReviewRow ? (
				<div className="admin-detail-backdrop admin-detail-backdrop--soe-review" role="presentation" onClick={() => setSelectedSoeReviewId("")}>
					<div className="admin-detail-shell admin-detail-shell--review admin-detail-shell--soe-review" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="admin-detail-close" onClick={() => setSelectedSoeReviewId("")}>
							<HiX />
						</button>
						<div
							className="admin-detail-modal admin-detail-modal--review admin-detail-modal--soe-review"
							role="dialog"
							aria-modal="true"
							aria-label={isSelectedSoeDownloadReview ? "SOE checking review" : "Materials request review"}
						>
							<div className="admin-detail-info">
								<div className="admin-soe-review-head">
									<span className="admin-review-modal-icon" aria-hidden="true">
										{isSelectedSoeDownloadReview ? <HiOutlineEye /> : <HiOutlineCheckCircle />}
									</span>
									<div>
										<span>{isSelectedSoeDownloadReview ? "SOE Verification" : "Requirements Review"}</span>
										<h3>{isSelectedSoeDownloadReview ? "SOE Checking Review" : "Requirements Request Review"}</h3>
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
												<span>Student Name</span>
												<strong>{selectedSoeReviewRow.fullName || "-"}</strong>
											</div>
											<div className="admin-soe-review-row">
												<span>Student Number</span>
												<strong>{selectedSoeReviewRow.studentId || "-"}</strong>
											</div>
											<div className="admin-soe-review-row">
												<span>Scholarship</span>
												<strong>{selectedSoeReviewRow.scholarshipName || "-"}</strong>
											</div>
											<div className="admin-soe-review-row">
												<span>Application Number</span>
												<strong>{selectedSoeReviewRow.requestNumber || selectedSoeReviewRow.id || "-"}</strong>
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
													<p>Requested documents that need approval before release.</p>
												</div>
												<div className="admin-soe-review-list">
													<div className="admin-soe-review-row">
														<span>Requested Documents</span>
														<strong>{selectedSoeReviewRow.visibleMaterialsSummary || "-"}</strong>
													</div>
													<div className="admin-soe-review-row">
														<span>Date Requested</span>
														<strong>{formatDate(selectedSoeReviewRow.requestDate)}</strong>
													</div>
												</div>
											</section>
										</>
									)}
									<section className="admin-soe-review-section admin-soe-review-documents">
										<div className="admin-soe-review-section-head admin-soe-review-documents-head">
											<div className="admin-soe-review-documents-icon" aria-hidden="true">
												<HiOutlineDocumentText />
											</div>
											<div>
												<h4>Documents</h4>
												<p>Preview uploaded student files before completing this review.</p>
											</div>
										</div>
										<div className="admin-soe-review-doc-grid">
											{selectedSoeReviewDocuments.map((document) =>
												document.url ? (
													<button
														key={document.key}
														type="button"
														className="admin-soe-review-doc-btn"
														onClick={() => openDocumentPreview(document)}
													>
														<HiOutlineEye />
														<span>View {document.label}</span>
													</button>
												) : (
													<span key={document.key} className="admin-soe-review-doc-empty">
														<HiOutlineDocumentText />
														<span>{document.label} unavailable</span>
													</span>
												),
											)}
										</div>
										<div className="admin-soe-review-other-docs">
											<div className="admin-soe-review-other-docs-title">
												<strong>Other Requirements</strong>
												<span>{selectedSoeReviewOtherDocuments.length || "None"}</span>
											</div>
											{selectedSoeReviewOtherDocuments.length === 0 ? (
												<p>No other requirement documents uploaded.</p>
											) : (
												<div className="admin-soe-review-other-docs-list">
													{selectedSoeReviewOtherDocuments.map((document, index) => (
														<button
															key={`${document.requirementId}_${document.url}_${index}`}
															type="button"
															onClick={() => openDocumentPreview(document)}
														>
															<HiOutlineEye />
															<span>{document.requirementName}</span>
															<small>{document.name}</small>
														</button>
													))}
												</div>
											)}
										</div>
									</section>
									{selectedSoeReviewRejectionDetails.length > 0 ? (
										<section className="admin-soe-review-section admin-soe-review-rejection">
											<div className="admin-soe-review-section-head">
												<h4>Rejection Details</h4>
												<p>This reason is shown to the student in their inbox.</p>
											</div>
											<div className="admin-soe-review-rejection-list">
												{selectedSoeReviewRejectionDetails.map((detail) => (
													<div key={detail.key} className="admin-soe-review-rejection-item">
														<span>{detail.label}</span>
														<strong>{detail.reason}</strong>
														{detail.notes ? <small>{detail.notes}</small> : null}
													</div>
												))}
											</div>
										</section>
									) : null}
								</div>
							</div>
							{selectedSoeReviewRow.reviewState === "incoming" ? (
								<div className="admin-soe-review-actions admin-soe-review-actions--split">
									{isSelectedSoeDownloadReview ? (
										<>
											<button
												type="button"
												className="admin-table-btn"
												onClick={() => {
													setSelectedSoeReviewId("")
													setSelectedStudentId(selectedSoeReviewRow.studentId)
												}}
											>
												<HiOutlineEye />
												View Student
											</button>
											<button type="button" className="admin-table-btn" onClick={() => setSelectedSoeReviewId("")}>
												<HiX />
												Close
											</button>
										</>
									) : (
										<>
											<button type="button" className="admin-safe-btn" disabled={isBusy} onClick={() => markSoeReview(selectedSoeReviewRow, "signed")}>
												<HiOutlineCheckCircle />
												{selectedSoeReviewRow.pendingMaterialKeys?.length > 1 ? "Approve Both Requests" : "Approve Request"}
											</button>
											<button type="button" className="admin-danger-btn" disabled={isBusy} onClick={() => openSoeRejectModal(selectedSoeReviewRow)}>
												<HiOutlineBan />
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
												<HiOutlineRefresh />
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
											<HiOutlineEye />
											View Student
										</button>
									</div>
								</>
							)}
						</div>
					</div>
				</div>
			) : null}

			{soeRejectModalRow ? (
				<div
					className="admin-reject-modal-backdrop admin-reject-modal-backdrop--soe"
					role="presentation"
					onClick={closeSoeRejectModal}
				>
					<div
						className="admin-reject-modal admin-reject-modal--soe"
						role="dialog"
						aria-modal="true"
						aria-label="Reject requirements request"
						onClick={(event) => event.stopPropagation()}
					>
						<header className="admin-reject-modal-head">
							<div className="admin-reject-modal-icon" aria-hidden="true">
								<HiOutlineBan />
							</div>
							<div>
								<span>Requirements Decision</span>
								<h3>Reject Request</h3>
								<p>
									This rejects the requested documents and sends the reason to the student's inbox.
								</p>
							</div>
							<button type="button" onClick={closeSoeRejectModal} aria-label="Close rejection modal">
								<HiX />
							</button>
						</header>
						<div className="admin-reject-modal-body">
							<div className="admin-reject-summary-grid">
								<p><span>Student</span><strong>{soeRejectModalRow.fullName || "-"}</strong></p>
								<p><span>Student Number</span><strong>{soeRejectModalRow.studentId || "-"}</strong></p>
								<p><span>Requested Documents</span><strong>{soeRejectModalRow.visibleMaterialsSummary || "-"}</strong></p>
								<p><span>Application No.</span><strong>{soeRejectModalRow.requestNumber || soeRejectModalRow.id || "-"}</strong></p>
							</div>
							<label>
								Reason
								<select value={soeRejectReason} onChange={(event) => setSoeRejectReason(event.target.value)}>
									{APPLICATION_REJECTION_REASONS.map((reason) => (
										<option key={reason} value={reason}>{reason}</option>
									))}
								</select>
							</label>
							<label>
								Message / Notes
								<textarea
									value={soeRejectNotes}
									onChange={(event) => setSoeRejectNotes(event.target.value)}
									placeholder="Tell the student what must be corrected before requesting again."
									rows={4}
								/>
							</label>
						</div>
						<footer className="admin-reject-modal-actions">
							<button type="button" className="admin-reject-cancel-btn" onClick={closeSoeRejectModal} disabled={isBusy}>
								Cancel
							</button>
							<button type="button" className="admin-reject-confirm-btn" onClick={confirmSoeRejection} disabled={isBusy}>
								<HiOutlineBan /> {isBusy ? "Rejecting..." : "Confirm Rejection"}
							</button>
						</footer>
					</div>
				</div>
			) : null}

			{renderReportPreview()}
		</div>
	)
}
