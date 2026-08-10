import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	serverTimestamp,
	setDoc,
	where,
} from "../services/supabaseDataService"
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
	HiCheck,
	HiChevronLeft,
	HiChevronRight,
	HiX,
	HiOutlineBell,
	HiOutlineBan,
	HiOutlineChartBar,
	HiOutlineCamera,
	HiOutlineCalendar,
	HiOutlineCloudUpload,
	HiOutlineDocumentText,
	HiOutlineDownload,
	HiOutlineEye,
	HiOutlineExclamationCircle,
	HiOutlineAcademicCap,
	HiOutlineIdentification,
	HiOutlineInbox,
	HiOutlineLocationMarker,
	HiOutlineLockClosed,
	HiOutlineLogout,
	HiOutlineMail,
	HiOutlineMenu,
	HiOutlineMoon,
	HiOutlinePhone,
	HiOutlinePencil,
	HiOutlineRefresh,
	HiOutlineSearch,
	HiOutlineSave,
	HiOutlineCheckCircle,
	HiOutlineSun,
	HiOutlineTrash,
	HiOutlineUserGroup,
	HiOutlineUsers,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { grantorMustChangePassword, GRANTOR_PASSWORD_CHANGE_ID_KEY } from "../constants/grantorAuth"
import { read, utils } from "xlsx"
import { db } from "../services/supabaseDataService"
import logo2 from "../assets/logo2.png"
import "../css/AdminDashboard.css"
import "../css/ProviderDashboard.css"
import TablePagination from "../components/TablePagination"
import { TABLE_PAGE_SIZE, paginateRows } from "../utils/tablePaginationUtils"
import useThemeMode from "../hooks/useThemeMode"
import { PROVINCES, getCitiesByProvince } from "../data/philippineLocations"
import { uploadToStorage } from "../services/storageService"
import { getStorageObjectBlob, normalizeStoragePublicUrl } from "../services/supabaseStorageService"
import { convertPdfToImage } from "../utils/pdfConverter"
import {
	createAdminNotification,
	createStudentNotification,
	deleteGrantorNotification as deleteGrantorNotificationRecord,
	updateGrantorNotification,
} from "../services/notificationService"
import {
	adminReviewWorkflow,
	createGrantorAnnouncementWorkflow,
	createGrantorScholarsWorkflow,
	requestGrantorPasswordChangeWorkflow,
	updateGrantorAnnouncementWorkflow,
	updateGrantorProfileWorkflow,
	updateGrantorScholarWorkflow,
	updateGrantorScholarsWorkflow,
} from "../services/workflowService"
import {
	GRANTOR_ACCEPT_ATTR,
	GRANTOR_ACCEPTED_UPLOAD_EXTENSIONS,
	buildGrantorScholarTrend,
	buildGrantorYearDistribution,
	findScholarDuplicate,
	getAllGrantorScholars,
	getGrantorAnnouncementsCollection,
	getGrantorPortalDoc,
	getGrantorScholarsCollection,
	isAnnouncementArchived,
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
import { collectOtherRequirementDocuments } from "../services/otherRequirementService"
import {
	completeScholarshipTrackingStep,
	getScholarshipTrackingProgress,
	getScholarshipTrackingStepBadgeLabel,
	getScholarshipTrackingStatusLabel,
} from "../services/scholarshipTrackingService"
import {
	formatApplicationDecisionLabel,
	formatApplicationDecisionVerb,
	formatConfirmationDeadline,
	getPendingApplicationDecisionConfirmation,
	isApplicationDecisionConfirmationExpired,
} from "../services/applicationDecisionConfirmationService"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend)

const SECTIONS = [
	{ id: "dashboard", label: "Dashboard", icon: HiOutlineChartBar, path: "/provider-dashboard/dashboard" },
	{ id: "scholars", label: "Scholars", icon: HiOutlineUsers, path: "/provider-dashboard/scholars" },
	{ id: "applications", label: "Applications", icon: HiOutlineDocumentText, path: "/provider-dashboard/applications" },
	{ id: "announcements", label: "Announcements", icon: HiOutlineBell, path: "/provider-dashboard/announcements" },
]

const RANGES = ["daily", "weekly", "monthly", "yearly"]
const YEAR_LEVELS = ["1", "2", "3", "4"]
const COURSE_OPTIONS = [
	"Bachelor of Elementary Education",
	"Bachelor of Early Childhood Education",
	"Bachelor of Secondary Education",
	"Bachelor of Technology and Livelihood Education - Home Economics",
	"Bachelor of Physical Education",
	"Bachelor of Science in Business Administration",
	"Bachelor of Science in Entrepreneurship",
	"Bachelor of Science in Information Technology",
	"Bachelor of Science in Computer Engineering",
	"Bachelor of Science in Industrial Engineering",
	"Bachelor in Industrial Technology",
]
const SCHOLAR_TABS = ["active", "warning", "archived"]
const GRANTOR_COMPLETABLE_STEP_LABELS = {
	document_review: "Document Review",
	interview: "Interview",
	application_review: "Application Review",
	final_screening: "Final Screening",
}
const APPLICATION_REJECTION_REASONS = [
	"Incomplete Documents",
	"Information Mismatch",
	"Does Not Meet Requirements",
	"Duplicate Scholarship Application",
	"Outside Application Window",
	"Other",
]
const SCHOLAR_FORM = {
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
	customColumns: {},
}
const ANNOUNCEMENT_FORM = {
	title: "",
	subtitle: "",
	description: "",
	applicationWindow: "",
	applicationEnabled: false,
	minimumGrade: "",
	requiredDocuments: {
		cog: false,
		cor: false,
		applicationForm: false,
	},
	otherRequirements: [],
}
const ADD_CUSTOM_IMPORT_FIELD = "__add_custom_import_field__"

const MAPPABLE_FIELDS = [
	{ id: "studentId", label: "Student ID" },
	{ id: "fullName", label: "Full Name" },
	{ id: "fname", label: "First Name" },
	{ id: "mname", label: "Middle Name" },
	{ id: "lname", label: "Last Name" },
	{ id: "email", label: "Email Address" },
	{ id: "course", label: "Course" },
	{ id: "yearLevel", label: "Year Level" },
	{ id: "scholarshipTitle", label: "Scholarship Title" },
	{ id: "status", label: "Status" },
	{ id: "cpNumber", label: "Contact Number" },
	{ id: "street", label: "Street" },
	{ id: "city", label: "City" },
	{ id: "province", label: "Province" },
	{ id: "barangay", label: "Barangay" },
	{ id: "postalCode", label: "Postal Code" },
	{ id: "notes", label: "Notes" },
]

function toCustomImportFieldId(label = "") {
	return String(label || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
}

function buildMappedImportScholar(row = [], columnMapping = [], customImportFields = [], grantorMeta = {}) {
	const scholar = {
		grantorId: grantorMeta.grantorId || "",
		grantorName: grantorMeta.grantorName || "",
		providerType: grantorMeta.providerType || "",
		status: "Active",
		archived: false,
	}

	columnMapping.forEach((fieldId, colIndex) => {
		if (!fieldId) return
		if (fieldId.startsWith("custom:")) {
			const customId = fieldId.replace("custom:", "")
			const customField = customImportFields.find((field) => field.id === customId)
			const customLabel = customField?.label || customId
			scholar.customColumns = {
				...(scholar.customColumns || {}),
				[customLabel]: row[colIndex] || "",
			}
			return
		}
		scholar[fieldId] = row[colIndex] || ""
	})

	if (!scholar.fullName) {
		scholar.fullName = [scholar.fname, scholar.mname, scholar.lname].filter(Boolean).join(" ").trim()
	}
	return scholar
}

function hasScholarIdentity(scholar = {}) {
	return Boolean(
		String(scholar.studentId || "").trim() ||
		String(scholar.fullName || "").trim() ||
		String(scholar.email || "").trim() ||
		String(scholar.cpNumber || "").trim(),
	)
}

function normalizeStudentIdKey(value = "") {
	return String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "")
}

function normalizeDuplicateOwnerId(record = {}) {
	return String(record.grantorId || record.parentId || record.providerType || "").trim()
}

function isDuplicateOwnedByGrantor(duplicate = null, grantorId = "", providerType = "") {
	if (!duplicate?.record) return false
	const ownerId = normalizeDuplicateOwnerId(duplicate.record)
	const currentGrantorId = String(grantorId || "").trim()
	const currentProviderType = String(providerType || "").trim()
	return Boolean(
		(currentGrantorId && ownerId === currentGrantorId) ||
		(currentProviderType && ownerId === currentProviderType) ||
		(currentProviderType && String(duplicate.record.providerType || "").trim() === currentProviderType),
	)
}

function splitStudentName(student = {}) {
	const existingParts = [student.fname, student.mname, student.lname].filter(Boolean)
	if (existingParts.length > 0) {
		return {
			fname: String(student.fname || "").trim(),
			mname: String(student.mname || "").trim(),
			lname: String(student.lname || "").trim(),
		}
	}
	const parts = String(student.fullName || student.studentName || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
	return {
		fname: parts[0] || "",
		mname: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
		lname: parts.length > 1 ? parts[parts.length - 1] : "",
	}
}

function buildScholarPayloadFromStudentAccount(student = {}, fallback = {}) {
	const nameParts = splitStudentName(student)
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

function buildExactStudentIdConflict(record = {}, kind = "roster") {
	return {
		record,
		kind,
		sameGrantor: true,
		reasons: ["Student ID"],
		score: 100,
	}
}

function findCurrentGrantorStudentIdConflict(candidate = {}, rosterRows = [], applicationRows = [], grantorId = "", providerType = "", acceptedRows = []) {
	const candidateId = normalizeStudentIdKey(candidate.studentId || candidate.studentnumber || candidate.studentNumber)
	if (!candidateId) return null

	const rosterConflict = [...rosterRows, ...acceptedRows].find((row) => {
		const rowStudentId = normalizeStudentIdKey(row.studentId || row.studentnumber || row.studentNumber)
		if (!rowStudentId || rowStudentId !== candidateId) return false
		return (
			row === candidate ||
			String(row.grantorId || "").trim() === String(grantorId || "").trim() ||
			String(row.providerType || "").trim() === String(providerType || "").trim()
		)
	})
	if (rosterConflict) return buildExactStudentIdConflict(rosterConflict, "roster")

	const applicationConflict = applicationRows.find((row) => {
		const rowStudentId = normalizeStudentIdKey(row.studentId || row.studentnumber || row.studentNumber)
		return rowStudentId && rowStudentId === candidateId && isApplicationOwnedByGrantor(row, grantorId)
	})
	if (applicationConflict) return buildExactStudentIdConflict(applicationConflict, "application")

	return null
}

function sectionFromPath(pathname = "") {
	if (pathname.startsWith("/provider-dashboard/profile")) return "profile"
	if (pathname.startsWith("/provider-dashboard/inbox")) return "inbox"
	return SECTIONS.find((section) => pathname.startsWith(section.path))?.id || "dashboard"
}

function statusClass(value = "") {
	const text = String(value || "").toLowerCase()
	if (text.includes("active") || text.includes("open") || text.includes("approved")) return "admin-status-badge admin-status-badge--ok"
	if (text.includes("pending") || text.includes("applied") || text.includes("review")) return "admin-status-badge admin-status-badge--pending"
	if (text.includes("archived") || text.includes("rejected") || text.includes("closed")) return "admin-status-badge admin-status-badge--danger"
	return "admin-status-badge admin-status-badge--neutral"
}

function trackingBadgeClass(value = "") {
	const text = String(value || "").toLowerCase()
	if (text.includes("completed")) return "grantor-tracking-badge grantor-tracking-badge--completed"
	if (text.includes("going") || text.includes("progress") || text.includes("needed")) return "grantor-tracking-badge grantor-tracking-badge--ongoing"
	if (text.includes("pending")) return "grantor-tracking-badge grantor-tracking-badge--pending"
	return "grantor-tracking-badge"
}

function formatDateTime(value) {
	const date = toJsDate(value)
	if (!date) return "-"
	return date.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function formatRelativeDate(value) {
	const date = toJsDate(value)
	if (!date) return "-"

	const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
	const intervals = [
		{ seconds: 31536000, label: "year" },
		{ seconds: 2592000, label: "month" },
		{ seconds: 86400, label: "day" },
		{ seconds: 3600, label: "hour" },
		{ seconds: 60, label: "minute" },
	]

	for (const interval of intervals) {
		if (elapsedSeconds >= interval.seconds) {
			const amount = Math.floor(elapsedSeconds / interval.seconds)
			return `${amount} ${interval.label}${amount === 1 ? "" : "s"} ago`
		}
	}

	return "Just now"
}

function toLocalDateString(value) {
	const date = toJsDate(value)
	if (!date) return ""
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function formatAnnouncementWindow(startDate, endDate) {
	if (!startDate) return "Select application dates"
	const format = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
	return endDate ? `${format(startDate)} - ${format(endDate)}` : `${format(startDate)} - Select end date`
}

function buildAnnouncementImageList(item = {}) {
	const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls : []
	const imageObjects = Array.isArray(item.images) ? item.images.map((image) => image?.url).filter(Boolean) : []
	return [...new Set([item.imageUrl, ...imageUrls, ...imageObjects].filter(Boolean))]
}

function getGrantorNotificationCategory(notification = {}) {
	const type = String(notification.type || "").toLowerCase()
	if (type.includes("password") || type.includes("security")) return "Account Security"
	if (type.includes("application")) return "Applications"
	return "Account Updates"
}

const GRANTOR_NOTIFICATION_DETAIL_EXCLUDED_KEYS = new Set([
	"id",
	"sourceTable",
	"notificationFallbackTable",
	"grantorId",
	"title",
	"message",
	"type",
	"read",
	"createdAt",
	"created_at",
	"updatedAt",
	"updated_at",
	"readAt",
	"read_at",
])

function formatNotificationDetailValue(value) {
	if (value == null || value === "") return "-"
	if (typeof value === "boolean") return value ? "Yes" : "No"
	if (typeof value === "object") {
		if (typeof value.toDate === "function") return formatDateTime(value)
		try {
			return JSON.stringify(value)
		} catch {
			return String(value)
		}
	}
	return String(value)
}

function formatNotificationDetailLabel(value = "") {
	return String(value)
		.replace(/[_-]+/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const GRANTOR_PROFILE_CHANGE_FIELDS = [
	{ key: "providerName", label: "Display Name" },
	{ key: "organization", label: "Organization" },
	{ key: "email", label: "Email Address" },
	{ key: "cpNumber", label: "Contact Number" },
	{ key: "minimumGwa", label: "Minimum GWA to Apply" },
	{ key: "province", label: "Province" },
	{ key: "city", label: "City / Municipality" },
	{ key: "street", label: "Street / Subdivision" },
	{ key: "postalCode", label: "Postal Code" },
	{ key: "profileImageUrl", label: "Profile Picture" },
]

function normalizeProfileChangeValue(value) {
	if (value == null) return ""
	if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""
	return String(value || "").trim()
}

function buildGrantorProfileChanges(previousProfile = {}, nextProfile = {}) {
	return GRANTOR_PROFILE_CHANGE_FIELDS.map(({ key, label }) => {
		const previousValue = key === "minimumGwa" ? previousProfile?.minimumGwa ?? previousProfile?.minGwa : previousProfile?.[key]
		const nextValue = key === "minimumGwa" ? nextProfile?.minimumGwa ?? nextProfile?.minGwa : nextProfile?.[key]
		const before = normalizeProfileChangeValue(previousValue)
		const after = normalizeProfileChangeValue(nextValue)
		if (before === after) return null
		return {
			field: key,
			label,
			from: before || "Not set",
			to: after || "Not set",
		}
	}).filter(Boolean)
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
	const applicationGrantorId = String(application.grantorId || application.grantor_id || "").trim()
	return (
		scholarships.find((item) => {
			if (applicationGrantorId && String(item.grantorId || "").trim() !== applicationGrantorId) {
				return false
			}
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

function getApplicationGrantorId(application = {}) {
	return String(application.grantorId || application.grantor_id || "").trim()
}

function isApplicationOwnedByGrantor(application = {}, grantorId = "") {
	const applicationGrantorId = getApplicationGrantorId(application)
	return Boolean(grantorId) && Boolean(applicationGrantorId) && applicationGrantorId === String(grantorId).trim()
}

function pickLatestGrantorRow(rows = [], application = {}) {
	const applicationGrantorId = getApplicationGrantorId(application)
	return [...rows]
		.filter((row) => {
			if (applicationGrantorId && String(row.grantorId || row.grantor_id || "").trim() !== applicationGrantorId) {
				return false
			}
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

function getApplicationLookupKey(application = {}) {
	return application.id || application.applicationNumber || application.requestNumber || application.studentId || ""
}

function firstPresentValue(...values) {
	return values.find((value) => value != null && String(value).trim() !== "") ?? ""
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
		street: form.street.trim(),
		city: form.city.trim(),
		province: form.province.trim(),
		barangay: form.barangay.trim(),
		postalCode: form.postalCode.trim(),
		course: form.course.trim(),
		yearLevel: String(form.yearLevel || "1"),
		scholarshipTitle: form.scholarshipTitle.trim(),
		status: form.status.trim() || "Active",
		notes: form.notes.trim(),
		customColumns: Object.entries(form.customColumns || {}).reduce((columns, [label, value]) => {
			columns[label] = String(value ?? "").trim()
			return columns
		}, {}),
		archived: false,
		grantorId,
		grantorName,
		providerType,
		sourceFile: file ? { name: file.name, type: file.type, size: file.size } : null,
	}
}

function scholarToForm(scholar = {}, student = {}) {
	const merged = { ...student, ...scholar }
	const fullNameParts = String(scholar.fullName || student.fullName || student.studentName || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
	const fallbackFirstName = fullNameParts[0] || ""
	const fallbackLastName = fullNameParts.length > 1 ? fullNameParts[fullNameParts.length - 1] : ""
	const fallbackMiddleName = fullNameParts.length > 2 ? fullNameParts.slice(1, -1).join(" ") : ""

	return {
		studentId: merged.studentId || merged.studentnumber || merged.studentNumber || scholar.id || "",
		fname: student.fname || student.firstName || scholar.fname || fallbackFirstName,
		mname: student.mname || student.middleName || scholar.mname || fallbackMiddleName,
		lname: student.lname || student.lastName || scholar.lname || fallbackLastName,
		email: student.email || scholar.email || "",
		cpNumber:
			student.cpNumber ||
			student.contactNumber ||
			student.phoneNumber ||
			scholar.cpNumber ||
			"",
		street: student.street || student.address || scholar.street || "",
		city: student.city || scholar.city || "",
		province: student.province || scholar.province || "",
		barangay: student.barangay || scholar.barangay || "",
		postalCode: student.postalCode || student.zipCode || scholar.postalCode || "",
		course: student.course || student.program || scholar.course || "",
		yearLevel: String(student.yearLevel || student.year || scholar.yearLevel || "1"),
		scholarshipTitle:
			scholar.scholarshipTitle || scholar.scholarshipName || student.scholarshipTitle || "",
		status: scholar.status || "Active",
		notes: scholar.notes || "",
		customColumns: {
			...(student.customColumns || {}),
			...(scholar.customColumns || {}),
		},
	}
}

function buildScholarRecordFromScreening(student = {}, scholarship = {}, application = {}, grantorMeta = {}) {
	return {
		studentId:
			String(
				student.id ||
					student.studentId ||
					student.studentnumber ||
					student.studentNumber ||
					application.studentId ||
					"",
			).trim(),
		fname: String(student.fname || application.fname || "").trim(),
		mname: String(student.mname || application.mname || "").trim(),
		lname: String(student.lname || application.lname || "").trim(),
		fullName: [student.fname || application.fname, student.mname || application.mname, student.lname || application.lname]
			.filter(Boolean)
			.join(" ")
			.trim(),
		email: String(student.email || application.email || "").trim(),
		cpNumber: String(student.cpNumber || student.contactNumber || application.cpNumber || application.contactNumber || "").trim(),
		street: String(student.street || student.address || "").trim(),
		city: String(student.city || "").trim(),
		province: String(student.province || "").trim(),
		barangay: String(student.barangay || "").trim(),
		postalCode: String(student.postalCode || "").trim(),
		course: String(student.course || "").trim(),
		yearLevel: String(student.yearLevel || student.year || "1"),
		scholarshipTitle: String(
			scholarship.name || application.scholarshipName || grantorMeta.grantorName || "Scholarship",
		).trim(),
		status: "Active",
		notes: "Auto-saved after final screening completion.",
		archived: false,
		grantorId: grantorMeta.grantorId || "",
		grantorName: grantorMeta.grantorName || "",
		providerType: grantorMeta.providerType || "",
		scholarshipId: String(scholarship.id || application.scholarshipId || "").trim(),
		applicationId: String(application.id || "").trim(),
		applicationNumber: String(application.applicationNumber || application.requestNumber || application.id || "").trim(),
		requestNumber: String(application.requestNumber || application.applicationNumber || application.id || "").trim(),
	}
}

function findExistingScholarForScreening(scholars = [], student = {}, scholarship = {}, application = {}, providerType = "") {
	const studentId = String(student.id || student.studentId || application.studentId || "").trim()
	const scholarshipId = String(scholarship.id || application.scholarshipId || "").trim()
	const applicationId = String(application.id || "").trim()
	const scholarshipTitle = String(scholarship.name || application.scholarshipName || "").trim().toLowerCase()

	return (
		scholars.find((row) => applicationId && row.applicationId === applicationId) ||
		scholars.find(
			(row) =>
				row.studentId === studentId &&
				((scholarshipId && row.scholarshipId === scholarshipId) ||
					(String(row.scholarshipTitle || "").trim().toLowerCase() === scholarshipTitle &&
						String(row.providerType || "").trim() === String(providerType || "").trim())),
		) ||
		null
	)
}

function validScholar(form) {
	return Boolean(form.studentId.trim() && form.fname.trim() && form.lname.trim() && form.course.trim())
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
	const labels = {
		active: "Scholars",
		warning: "Warning",
		archived: "Archived",
	}
	return (
		<div className="admin-section-tabs grantor-scholar-tabs" role="tablist">
			{SCHOLAR_TABS.map((tab) => (
				<button key={tab} type="button" className={`admin-section-tab ${value === tab ? "active" : ""}`} onClick={() => onChange(tab)}>
					<span className="admin-section-tab-main">
						<span className="admin-section-tab-label">{labels[tab]}</span>
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
	const profilePhotoInputRef = useRef(null)
	const profileMenuRef = useRef(null)
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
	const [applicationStudents, setApplicationStudents] = useState({})
	const [applicationMaterialRequests, setApplicationMaterialRequests] = useState({})
	const [applicationSoeDownloads, setApplicationSoeDownloads] = useState({})
	const [announcements, setAnnouncements] = useState([])
	const [personalNotifications, setPersonalNotifications] = useState([])
	const [selectedGrantorNotification, setSelectedGrantorNotification] = useState(null)
	const [range, setRange] = useState("monthly")
	const [tab, setTab] = useState("active")
	const [scholarSearch, setScholarSearch] = useState("")
	const [yearFilter, setYearFilter] = useState("All")
	const [applicationSearch, setApplicationSearch] = useState("")
	const [applicationStatusFilter, setApplicationStatusFilter] = useState("All")
	const [applicationArchiveTab, setApplicationArchiveTab] = useState("active")
	const [selectedScholarId, setSelectedScholarId] = useState("")
	const [selectedScholarIds, setSelectedScholarIds] = useState([])
	const [hoveredYear, setHoveredYear] = useState("")
	const [showCreateModal, setShowCreateModal] = useState(false)
	const [showEditModal, setShowEditModal] = useState(false)
	const [createForm, setCreateForm] = useState(SCHOLAR_FORM)
	const [editForm, setEditForm] = useState(SCHOLAR_FORM)
	const [editScholarAccountExists, setEditScholarAccountExists] = useState(false)
	const [editScholarLockedProfile, setEditScholarLockedProfile] = useState(null)
	const [announcementForm, setAnnouncementForm] = useState(ANNOUNCEMENT_FORM)
	const [announcementSubmitAttempted, setAnnouncementSubmitAttempted] = useState(false)
	const [announcementImageFiles, setAnnouncementImageFiles] = useState([])
	const [announcementImagePreviews, setAnnouncementImagePreviews] = useState([])
	const [announcementImagePreview, setAnnouncementImagePreview] = useState("")
	const [announcementImageZoom, setAnnouncementImageZoom] = useState(1)
	const [selectedAnnouncement, setSelectedAnnouncement] = useState(null)
	const [showAllAnnouncements, setShowAllAnnouncements] = useState(false)
	const [showCreateAnnouncementModal, setShowCreateAnnouncementModal] = useState(false)
	const [allAnnouncementTab, setAllAnnouncementTab] = useState("announcements")
	const [showApplicationWindowCalendar, setShowApplicationWindowCalendar] = useState(false)
	const [announcementWindowStart, setAnnouncementWindowStart] = useState("")
	const [announcementWindowEnd, setAnnouncementWindowEnd] = useState("")
	const [announcementCalendarMonth, setAnnouncementCalendarMonth] = useState(() => {
		const today = new Date()
		return new Date(today.getFullYear(), today.getMonth(), 1)
	})
	const [uploadFile, setUploadFile] = useState(null)
	const [uploadActive, setUploadActive] = useState(false)
	const [importData, setImportData] = useState(null)
	const [columnMapping, setColumnMapping] = useState([])
	const [customImportFields, setCustomImportFields] = useState([])
	const [customImportDrafts, setCustomImportDrafts] = useState({})
	const [customImportEditColumn, setCustomImportEditColumn] = useState(null)
	const [selectedImportRowIndexes, setSelectedImportRowIndexes] = useState([])
	const [importDuplicateMatches, setImportDuplicateMatches] = useState({})
	const [checkingImportDuplicates, setCheckingImportDuplicates] = useState(false)
	const [profileMenuOpen, setProfileMenuOpen] = useState(false)
	const [profileSaving, setProfileSaving] = useState(false)
	const [profilePhotoUploading, setProfilePhotoUploading] = useState(false)
	const [passwordRequestSubmitting, setPasswordRequestSubmitting] = useState(false)
	const [grantorProfileForm, setGrantorProfileForm] = useState({
		providerName: "",
		organization: "",
		email: "",
		cpNumber: "",
		minimumGwa: "",
		province: "",
		city: "",
		street: "",
		postalCode: "",
	})
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
	const [previewDocument, setPreviewDocument] = useState(null)
	const [previewBlobUrl, setPreviewBlobUrl] = useState("")
	const [isPreviewLoading, setIsPreviewLoading] = useState(false)
	const [rejectModalOpen, setRejectModalOpen] = useState(false)
	const [rejectReason, setRejectReason] = useState(APPLICATION_REJECTION_REASONS[0])
	const [rejectNotes, setRejectNotes] = useState("")
	const [busy, setBusy] = useState("")
	const [tablePages, setTablePages] = useState({})
	const autoConfirmationResolutionRef = useRef("")
	const grantorId = session.storedUserId || ""
	const grantorName = useMemo(() => toGrantorDisplayName(profile, grantorId), [grantorId, profile])
	const grantorInitials = useMemo(() => {
		const parts = String(grantorName || "Grantor").trim().split(/\s+/).filter(Boolean)
		return `${parts[0]?.[0] || "G"}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase()
	}, [grantorName])
	const grantorProfileImageUrl = profile?.profileImageUrl || profile?.imageUrl || ""
	const isPreviewPdf = (file = {}) => {
		const type = String(file?.type || file?.contentType || "").toLowerCase()
		const name = String(file?.name || file?.url || "").toLowerCase()
		return type.includes("pdf") || name.includes(".pdf")
	}
	const openDocumentPreview = (title, url) => {
		if (!url) return
		setPreviewDocument({
			title,
			url: normalizeStoragePublicUrl(url),
			name: title,
			isPdf: isPreviewPdf({ url }),
		})
	}
	const closeDocumentPreview = () => setPreviewDocument(null)
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
			console.error("Failed to download grantor document:", error)
			toast.error("Unable to download the document.")
		}
	}
	const renderAnnouncementAuthor = (item = {}) => {
		const isCurrentGrantor = !item.grantorId || item.grantorId === grantorId
		const authorName = isCurrentGrantor ? "You" : item.grantorName || item.providerLabel || "Grantor"
		const authorImage = isCurrentGrantor ? grantorProfileImageUrl : item.profileImageUrl || item.authorImageUrl || ""
		const initials = isCurrentGrantor ? grantorInitials : String(authorName || "G").trim().slice(0, 2).toUpperCase()
		return (
			<div className="grantor-announcement-author">
				<span>{authorImage ? <img src={authorImage} alt="" /> : initials}</span>
				<strong>{authorName}</strong>
			</div>
		)
	}
	const grantorProfileCities = useMemo(
		() => getCitiesByProvince(grantorProfileForm.province),
		[grantorProfileForm.province],
	)
	const grantorProviderType = useMemo(
		() => toScholarshipProviderType(profile?.providerType || grantorName || grantorId),
		[grantorId, grantorName, profile?.providerType],
	)
	const activeSection = useMemo(() => sectionFromPath(location.pathname), [location.pathname])
	const activeScholars = useMemo(() => scholars.filter((row) => row.archived !== true), [scholars])
	const warningScholars = useMemo(
		() => activeScholars.filter((row) => row.scholarshipConflictWarning || row.duplicateScholarshipWarning || row.duplicateScholarshipDetected),
		[activeScholars],
	)
	const archivedScholars = useMemo(() => scholars.filter((row) => row.archived === true), [scholars])
	const selectedScholar = useMemo(() => scholars.find((row) => row.id === selectedScholarId) || null, [scholars, selectedScholarId])
	const applicationsBlocked = portalSettings?.applicationsBlocked === true
	const unreadPersonalNotifications = useMemo(
		() => personalNotifications.filter((item) => item.read !== true),
		[personalNotifications],
	)
	const groupedPersonalNotifications = useMemo(() => {
		const groups = new Map()
		personalNotifications.forEach((notification) => {
			const category = getGrantorNotificationCategory(notification)
			if (!groups.has(category)) groups.set(category, [])
			groups.get(category).push(notification)
		})
		return [...groups.entries()].map(([category, items]) => ({ category, items }))
	}, [personalNotifications])
	const selectedGrantorNotificationDetails = useMemo(() => {
		if (!selectedGrantorNotification) return []
		return Object.entries(selectedGrantorNotification)
			.filter(([key, value]) => !GRANTOR_NOTIFICATION_DETAIL_EXCLUDED_KEYS.has(key) && value != null && value !== "")
			.map(([key, value]) => ({
				label: formatNotificationDetailLabel(key),
				value: formatNotificationDetailValue(value),
			}))
	}, [selectedGrantorNotification])
	const setTablePage = useCallback((tableKey, page) => {
		setTablePages((prev) => ({ ...prev, [tableKey]: page }))
	}, [])
	const yearRows = useMemo(() => buildGrantorYearDistribution(activeScholars), [activeScholars])
	const trendSeries = useMemo(() => buildGrantorScholarTrend(scholars, range), [range, scholars])
	const hoveredYearRow = useMemo(() => yearRows.find((row) => row.id === hoveredYear) || null, [hoveredYear, yearRows])
	const latestScholarAddedAt = useMemo(() => {
		return scholars.reduce((latest, scholar) => {
			const createdAt = toJsDate(scholar.createdAt)
			if (!createdAt) return latest
			return !latest || createdAt.getTime() > latest.getTime() ? createdAt : latest
		}, null)
	}, [scholars])
	const dashboardInsights = useMemo(() => {
		const totalRecords = activeScholars.length + archivedScholars.length
		const latestTrendValue = trendSeries.values[trendSeries.values.length - 1] || 0
		const topYear = [...yearRows].sort((left, right) => right.value - left.value)[0] || null
		const activeRate = totalRecords > 0 ? Math.round((activeScholars.length / totalRecords) * 100) : 0
		const pendingApplications = applications.filter((row) => {
			const status = String(row.status || "").toLowerCase()
			return status.includes("pending") || status.includes("review") || status.includes("applied")
		}).length
		const latestAnnouncement = announcements[0] || null
		return {
			totalRecords,
			latestTrendValue,
			topYear,
			activeRate,
			pendingApplications,
			latestAnnouncement,
		}
	}, [activeScholars.length, announcements, applications, archivedScholars.length, trendSeries.values, yearRows])
	const publishedAnnouncements = useMemo(
		() => announcements.filter((item) => !isAnnouncementArchived(item)),
		[announcements],
	)
	const archivedAnnouncements = useMemo(
		() => announcements.filter((item) => isAnnouncementArchived(item)),
		[announcements],
	)
	const compactAnnouncements = useMemo(() => publishedAnnouncements.slice(0, 6), [publishedAnnouncements])
	const allAnnouncementRows = allAnnouncementTab === "archived" ? archivedAnnouncements : publishedAnnouncements
	const shouldShowAllAnnouncementsButton = publishedAnnouncements.length > compactAnnouncements.length || archivedAnnouncements.length > 0
	const announcementMissingFields = useMemo(() => ({
		title: !announcementForm.title.trim(),
		description: !announcementForm.description.trim(),
		applicationWindow: announcementForm.applicationEnabled && !announcementForm.applicationWindow.trim(),
		minimumGrade:
			announcementForm.applicationEnabled &&
			(!String(announcementForm.minimumGrade || "").trim() ||
				Number.isNaN(Number(announcementForm.minimumGrade))),
		otherRequirement:
			announcementForm.applicationEnabled &&
			(Array.isArray(announcementForm.otherRequirements) ? announcementForm.otherRequirements : []).some(
				(item) => !String(item?.name || "").trim() || item?.confirmed !== true,
			),
	}), [announcementForm])

	useEffect(() => {
		if (!session.isProvider) navigate("/", { replace: true })
	}, [navigate, session.isProvider])

	useEffect(() => {
		if (!profileMenuOpen) return undefined
		const closeOnOutsideClick = (event) => {
			if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false)
		}
		document.addEventListener("mousedown", closeOnOutsideClick)
		return () => document.removeEventListener("mousedown", closeOnOutsideClick)
	}, [profileMenuOpen])

	useEffect(() => {
		if (location.pathname === "/provider-dashboard" || location.pathname === "/provider-dashboard/") {
			navigate("/provider-dashboard/dashboard", { replace: true })
		}
	}, [location.pathname, navigate])

	useEffect(() => {
		if (!grantorId || !session.isProvider) return
		return onSnapshot(doc(db, "providers", grantorId), (snap) => {
			const nextProfile = snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null
			setProfile(nextProfile)
			setLoaded(true)
			if (nextProfile && grantorMustChangePassword(nextProfile)) {
				sessionStorage.setItem(GRANTOR_PASSWORD_CHANGE_ID_KEY, grantorId)
				sessionStorage.removeItem("bulsuscholar_userId")
				sessionStorage.removeItem("bulsuscholar_userType")
				toast.info("Set your own password before accessing the grantor portal.")
				navigate("/grantor/change-password", { replace: true })
			}
		}, () => setLoaded(true))
	}, [grantorId, navigate, session.isProvider])

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
		if (!profile) return
		setGrantorProfileForm({
			providerName: profile.providerName || profile.name || profile.grantorName || "",
			organization: profile.organization || "",
			email: profile.email || "",
			cpNumber: profile.cpNumber || profile.contactNumber || profile.contact || "",
			minimumGwa: profile.minimumGwa ?? profile.minGwa ?? "",
			province: profile.province || "",
			city: profile.city || "",
			street: profile.street || profile.address || "",
			postalCode: profile.postalCode || profile.zipCode || "",
		})
	}, [profile])

	useEffect(() => {
		if (!grantorId) return
		console.log("[BulsuScholar] Grantor profile sync skipped inbox notification.", {
			reason: "automatic page-load metadata sync",
			grantorId,
		})
		updateGrantorProfileWorkflow({
			grantorId,
			data: {
				grantorId,
				grantorName,
				providerType: grantorProviderType,
				updatedAt: serverTimestamp(),
			},
			updatePortal: true,
			suppressNotification: true,
			notificationReason: "automatic_metadata_sync",
		}).catch(() => {})
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
		setAnnouncementImagePreviews((prev) => {
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
			announcementImagePreviews.forEach((item) => URL.revokeObjectURL(item.url))
		}
	}, [announcementImagePreviews])

	useEffect(() => {
		if (!grantorId) return
		let notificationRows = []
		let fallbackRows = []
		const updateGrantorInboxRows = () => {
			setPersonalNotifications(
				[...notificationRows, ...fallbackRows].sort(
					(a, b) => (toJsDate(b.createdAt)?.getTime() || 0) - (toJsDate(a.createdAt)?.getTime() || 0),
				),
			)
		}
		const unsubscribeNotifications = onSnapshot(
			query(collection(db, "grantorNotifications"), where("grantorId", "==", grantorId)),
			(snap) => {
				notificationRows = snap.docs.map((row) => ({ id: row.id, sourceTable: "grantorNotifications", ...(row.data() || {}) }))
				updateGrantorInboxRows()
			},
			() => {
				notificationRows = []
				updateGrantorInboxRows()
			},
		)
		const unsubscribeFallback = onSnapshot(
			query(collection(db, "systemLogs"), where("grantorId", "==", grantorId)),
			(snap) => {
				fallbackRows = snap.docs
					.map((row) => ({ id: row.id, sourceTable: "systemLogs", ...(row.data() || {}) }))
					.filter((row) => row.notificationFallbackTable === "systemLogs")
				updateGrantorInboxRows()
			},
			() => {
				fallbackRows = []
				updateGrantorInboxRows()
			},
		)
		return () => {
			unsubscribeNotifications()
			unsubscribeFallback()
		}
	}, [grantorId])

	useEffect(() => {
		if (!grantorId) return
		return onSnapshot(query(collection(db, "scholarshipApplications"), where("grantorId", "==", grantorId)), (snap) => {
			setApplications(
				snap.docs
					.map((row) => normalizeGrantorApplication(row.data() || {}, row.id))
					.filter((row) => isApplicationOwnedByGrantor(row, grantorId))
					.sort((a, b) => (toJsDate(b.appliedAt || b.createdAt)?.getTime() || 0) - (toJsDate(a.appliedAt || a.createdAt)?.getTime() || 0)),
			)
		}, () => setApplications([]))
	}, [grantorId])

	useEffect(() => {
		let cancelled = false
		const studentIds = [...new Set(applications.map((row) => row.studentId).filter(Boolean))]
		if (studentIds.length === 0) {
			setApplicationStudents({})
			setApplicationMaterialRequests({})
			setApplicationSoeDownloads({})
			return () => {
				cancelled = true
			}
		}

		const loadApplicationContext = async () => {
			try {
				const studentRows = await Promise.all(
					studentIds.map(async (studentId) => {
						const studentSnap = await getDoc(doc(db, "students", studentId))
						return studentSnap.exists()
							? [studentId, { id: studentSnap.id, ...(studentSnap.data() || {}) }]
							: [studentId, null]
					}),
				)
				const studentsById = Object.fromEntries(studentRows.filter(([, student]) => Boolean(student)))

				const requestRows = []
				const downloadRows = []
				await Promise.all(
					studentIds.map(async (studentId) => {
						const [requestSnapshot, downloadSnapshot] = await Promise.all([
							getDocs(query(collection(db, "soeRequests"), where("studentId", "==", studentId))),
							getDocs(query(collection(db, "soeDownloads"), where("studentId", "==", studentId))),
						])
						requestRows.push(...requestSnapshot.docs.map((row) => ({ id: row.id, ...(row.data() || {}) })))
						downloadRows.push(...downloadSnapshot.docs.map((row) => ({ id: row.id, ...(row.data() || {}) })))
					}),
				)

				const requestsByApplication = {}
				const downloadsByApplication = {}
				applications.forEach((application) => {
					const key = getApplicationLookupKey(application)
					if (!key) return
					requestsByApplication[key] = pickLatestGrantorRow(requestRows, application)
					downloadsByApplication[key] = pickLatestGrantorRow(downloadRows, application)
				})

				if (!cancelled) {
					setApplicationStudents(studentsById)
					setApplicationMaterialRequests(requestsByApplication)
					setApplicationSoeDownloads(downloadsByApplication)
				}
			} catch (error) {
				console.error(error)
				if (!cancelled) {
					setApplicationStudents({})
					setApplicationMaterialRequests({})
					setApplicationSoeDownloads({})
				}
			}
		}

		loadApplicationContext()
		return () => {
			cancelled = true
		}
	}, [applications])

	useEffect(() => {
		setSelectedScholarId("")
		setSelectedScholarIds([])
	}, [tab])

	useEffect(() => {
		if (!selectedScholar || !showEditModal) return
		setEditForm(scholarToForm(selectedScholar))
	}, [selectedScholar, showEditModal])

	const visibleScholarPool = tab === "archived" ? archivedScholars : tab === "warning" ? warningScholars : activeScholars
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
			const studentRecord = applicationStudents[row.studentId] || null
			const studentScholarship = studentRecord ? findMatchingScholarshipEntry(studentRecord, row) : null
			const documentCheck = studentScholarship
				? validateScholarshipDocuments(studentRecord, studentScholarship.name)
				: null
			const applicationKey = getApplicationLookupKey(row)
			const trackingProgress = studentScholarship
				? getScholarshipTrackingProgress({
						scholarship: studentScholarship,
						isValidated: checkValidated(studentRecord),
						documentCheck,
						latestMaterialRequest: applicationMaterialRequests[applicationKey],
						latestSoeDownload: applicationSoeDownloads[applicationKey],
					})
				: null
			const policy = getScholarshipPolicy(
				row.providerType || row.scholarshipName || studentScholarship?.name || matchedScholar?.scholarshipTitle || grantorName,
			)
			return {
				...row,
				fullName: row.fullName || studentRecord?.fullName || matchedScholar?.fullName || "Applicant",
				email: row.email || studentRecord?.email || matchedScholar?.email || "",
				cpNumber: row.cpNumber || studentRecord?.cpNumber || matchedScholar?.cpNumber || "",
				gwa: firstPresentValue(
					row.gwa ||
					row.currentGwa ||
					row.generalWeightedAverage ||
					studentRecord?.gwa ||
					studentRecord?.currentGwa ||
					studentRecord?.generalWeightedAverage ||
					studentRecord?.schoolInfo?.gwa ||
					matchedScholar?.gwa ||
					matchedScholar?.currentGwa ||
					matchedScholar?.generalWeightedAverage,
				) || "-",
				currentStep: firstPresentValue(
					trackingProgress?.currentStepLabel,
					row.currentStepLabel ||
					row.tracking?.currentStepLabel ||
					row.tracking?.lastCompletedStepLabel ||
					row.status,
				) || "Pending",
				scholarshipName:
					row.scholarshipName || studentScholarship?.name || matchedScholar?.scholarshipTitle || grantorName,
				providerType: row.providerType || studentScholarship?.providerType || matchedScholar?.providerType || policy.providerType,
				providerLabel: row.providerLabel || matchedScholar?.grantorName || grantorName,
			}
		})
	}, [applicationMaterialRequests, applicationSoeDownloads, applicationStudents, applications, grantorName, scholars])

	const isRejectedApplication = (row = {}) => {
		const status = String(row.status || "").toLowerCase()
		return (
			row.archived === true ||
			row.rejected === true ||
			status.includes("reject") ||
			status.includes("archiv")
		)
	}
	const activeApplications = useMemo(
		() => enrichedApplications.filter((row) => !isRejectedApplication(row)),
		[enrichedApplications],
	)
	const rejectedApplications = useMemo(
		() => enrichedApplications.filter((row) => isRejectedApplication(row)),
		[enrichedApplications],
	)
	const applicationRowsForTab = applicationArchiveTab === "rejected" ? rejectedApplications : activeApplications
	const visibleApplications = useMemo(() => {
		const keyword = applicationSearch.trim().toLowerCase()
		return applicationRowsForTab.filter((row) => {
			const matchesStatus = applicationStatusFilter === "All" || String(row.status || "").toLowerCase() === applicationStatusFilter.toLowerCase()
			const matchesSearch = !keyword || [row.studentId, row.fullName, row.gwa, row.currentStep, row.scholarshipName, row.providerLabel, row.status, row.applicationNumber].some((value) => String(value || "").toLowerCase().includes(keyword))
			return matchesStatus && matchesSearch
		})
	}, [applicationRowsForTab, applicationSearch, applicationStatusFilter])

	const applicationStatusOptions = useMemo(
		() => [...new Set(applicationRowsForTab.map((row) => String(row.status || "Pending").trim()).filter(Boolean))].sort(),
		[applicationRowsForTab],
	)
	const applicationInsights = useMemo(() => {
		const statusIncludes = (row, values) => values.some((value) => String(row.status || "").toLowerCase().includes(value))
		return {
			total: activeApplications.length,
			pending: activeApplications.filter((row) => statusIncludes(row, ["pending", "applied", "review"])).length,
			approved: activeApplications.filter((row) => statusIncludes(row, ["approved", "accepted", "complete"])).length,
			rejected: rejectedApplications.length,
		}
	}, [activeApplications, rejectedApplications])

	const announcementCalendarDays = useMemo(() => {
		const year = announcementCalendarMonth.getFullYear()
		const month = announcementCalendarMonth.getMonth()
		const today = new Date()
		today.setHours(0, 0, 0, 0)
		const days = Array.from({ length: new Date(year, month, 1).getDay() }, (_, index) => ({ key: `empty_${index}`, empty: true }))
		const totalDays = new Date(year, month + 1, 0).getDate()
		for (let day = 1; day <= totalDays; day += 1) {
			const date = new Date(year, month, day)
			const iso = toLocalDateString(date)
			days.push({ key: iso, day, iso, empty: false, disabled: date < today, selected: iso === announcementWindowStart || iso === announcementWindowEnd, inRange: Boolean(announcementWindowStart && announcementWindowEnd && iso > announcementWindowStart && iso < announcementWindowEnd) })
		}
		return days
	}, [announcementCalendarMonth, announcementWindowEnd, announcementWindowStart])

	const visibleScholarsPage = useMemo(
		() => paginateRows(visibleScholars, tablePages[`grantor_scholars_${tab}`] || 1, TABLE_PAGE_SIZE),
		[tab, tablePages, visibleScholars],
	)

	const visibleApplicationsPage = useMemo(
		() => paginateRows(visibleApplications, tablePages[`grantor_applications_${applicationArchiveTab}`] || 1, TABLE_PAGE_SIZE),
		[applicationArchiveTab, tablePages, visibleApplications],
	)

	const grantorActionStepLabel = useMemo(
		() => getGrantorCompletableStepLabel(applicationModalState.trackingProgress?.currentStep?.id),
		[applicationModalState.trackingProgress?.currentStep?.id],
	)
	const canCompleteGrantorCurrentStage = Boolean(
		grantorActionStepLabel &&
		applicationModalState.trackingProgress?.canAdminCompleteCurrentStep,
	)
	const pendingApplicationDecision = useMemo(
		() => getPendingApplicationDecisionConfirmation(applicationModalState.application || {}),
		[applicationModalState.application],
	)
	const pendingApplicationDecisionLabel = pendingApplicationDecision
		? formatApplicationDecisionLabel(pendingApplicationDecision.decision)
		: ""
	const pendingApplicationDecisionVerb = pendingApplicationDecision
		? formatApplicationDecisionVerb(pendingApplicationDecision.decision)
		: ""

	const importPreviewPage = useMemo(
		() => paginateRows(importData || [], tablePages.grantor_import_preview || 1, TABLE_PAGE_SIZE),
		[importData, tablePages],
	)
	const visibleImportRowIndexes = useMemo(
		() => importPreviewPage.rows.map((_, rowIndex) => (importPreviewPage.currentPage - 1) * TABLE_PAGE_SIZE + rowIndex),
		[importPreviewPage.currentPage, importPreviewPage.rows],
	)
	const allVisibleImportRowsSelected = visibleImportRowIndexes.length > 0 && visibleImportRowIndexes.every((rowIndex) => selectedImportRowIndexes.includes(rowIndex))
	const importDuplicateCount = Object.keys(importDuplicateMatches).length
	const importBlockedDuplicateCount = Object.values(importDuplicateMatches).filter((duplicate) => duplicate?.sameGrantor).length
	const importWarningDuplicateCount = importDuplicateCount - importBlockedDuplicateCount
	const editCityOptions = useMemo(() => getCitiesByProvince(editForm.province), [editForm.province])

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
				console.error("Failed to load grantor document preview:", error)
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

	useEffect(() => {
		if (!importData?.length || !columnMapping.some(Boolean)) {
			setImportDuplicateMatches({})
			setCheckingImportDuplicates(false)
			return undefined
		}

		let active = true
		const timer = window.setTimeout(async () => {
			setCheckingImportDuplicates(true)
			try {
				const existingScholars = await getAllGrantorScholars(db)
				const acceptedFileRows = []
				const matches = {}
				for (const [rowIndex, row] of importData.entries()) {
					const scholar = buildMappedImportScholar(row, columnMapping, customImportFields, {
						grantorId,
						grantorName,
						providerType: grantorProviderType,
					})
					if (!hasScholarIdentity(scholar)) continue
					const exactConflict = findCurrentGrantorStudentIdConflict(
						scholar,
						existingScholars,
						applications,
						grantorId,
						grantorProviderType,
						acceptedFileRows,
					)
					if (exactConflict) {
						matches[rowIndex] = exactConflict
						continue
					}
					const duplicate = await findScholarDuplicate(scholar, [...existingScholars, ...acceptedFileRows])
					if (duplicate) {
						matches[rowIndex] = {
							...duplicate,
							sameGrantor: isDuplicateOwnedByGrantor(duplicate, grantorId, grantorProviderType),
						}
					}
					else acceptedFileRows.push(scholar)
				}
				if (active) setImportDuplicateMatches(matches)
			} catch (error) {
				console.error("Unable to preflight imported scholar duplicates.", error)
				if (active) setImportDuplicateMatches({})
			} finally {
				if (active) setCheckingImportDuplicates(false)
			}
		}, 250)

		return () => {
			active = false
			window.clearTimeout(timer)
		}
	}, [applications, columnMapping, customImportFields, grantorId, grantorName, grantorProviderType, importData])

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
		setCustomImportFields([])
		setCustomImportDrafts({})
		setCustomImportEditColumn(null)
		setSelectedImportRowIndexes([])
		setImportDuplicateMatches({})
	}

	const closeEditModal = () => {
		setShowEditModal(false)
		setEditForm(SCHOLAR_FORM)
		setEditScholarAccountExists(false)
		setEditScholarLockedProfile(null)
	}

	const openEditModal = async () => {
		if (!selectedScholar) {
			toast.info("Select a scholar row first before editing.")
			return
		}

		setEditForm(scholarToForm(selectedScholar))
		setEditScholarAccountExists(false)
		setEditScholarLockedProfile(null)
		setShowEditModal(true)

		const studentId = String(selectedScholar.studentId || "").trim()
		if (!studentId) return

		try {
			const [studentSnapshot, pendingStudentSnapshot] = await Promise.all([
				getDoc(doc(db, "students", studentId)),
				getDoc(doc(db, "pending_students", studentId)),
			])
			const linkedSnapshot = studentSnapshot.exists() ? studentSnapshot : pendingStudentSnapshot.exists() ? pendingStudentSnapshot : null
			if (linkedSnapshot) {
				const linkedProfile = { id: linkedSnapshot.id, ...(linkedSnapshot.data() || {}) }
				setEditScholarAccountExists(true)
				setEditScholarLockedProfile(linkedProfile)
				setEditForm(scholarToForm(selectedScholar, linkedProfile))
			}
		} catch (error) {
			console.error("Unable to load the linked student profile for editing.", error)
		}
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

	const openRejectModal = () => {
		if (!applicationModalState.application || !applicationModalState.student) {
			toast.info("Open an application first before rejecting it.")
			return
		}
		setRejectReason(APPLICATION_REJECTION_REASONS[0])
		setRejectNotes("")
		setRejectModalOpen(true)
	}

	const closeRejectModal = () => {
		if (busy === "reject_application") return
		setRejectModalOpen(false)
		setRejectReason(APPLICATION_REJECTION_REASONS[0])
		setRejectNotes("")
	}

	const handleConfirmRejectApplication = async (override = {}) => {
		if (!applicationModalState.application || !applicationModalState.student) return
		if (!isApplicationOwnedByGrantor(applicationModalState.application, grantorId)) {
			console.warn("[BulsuScholar] Blocked cross-grantor application rejection.", {
				currentGrantorId: grantorId,
				applicationGrantorId: getApplicationGrantorId(applicationModalState.application),
				applicationId: applicationModalState.application.id,
				studentId: applicationModalState.application.studentId,
			})
			toast.error("You can only reject applications submitted to your grantor account.")
			return
		}
		const effectiveReason = override.reason || rejectReason
		const effectiveNotes = override.notes ?? rejectNotes
		const isConfirmationResolution = override.fromConfirmation === true
		if (!effectiveReason) {
			toast.error("Select a rejection reason first.")
			return
		}

		setBusy("reject_application")
		try {
			const application = applicationModalState.application
			const student = applicationModalState.student
			const targetScholarship =
				applicationModalState.scholarship ||
				findMatchingScholarshipEntry(student, application)
			const nextScholarships = normalizeScholarshipList(student.scholarships || []).filter(
				(item) => {
					if (!targetScholarship) {
						return !(
							item.id === application.scholarshipId ||
							item.id === application.applicationNumber ||
							item.applicationNumber === application.applicationNumber ||
							item.requestNumber === application.requestNumber ||
							item.providerType === application.providerType
						)
					}
					return !(
						item.id === targetScholarship.id ||
						item.applicationNumber === targetScholarship.applicationNumber ||
						item.requestNumber === targetScholarship.requestNumber ||
						item.providerType === targetScholarship.providerType
					)
				},
			)
			const rejectedAt = new Date().toISOString()
			const scholarshipName =
				application.scholarshipName ||
				targetScholarship?.name ||
				application.providerLabel ||
				grantorName ||
				"your scholarship application"
			const rejectionMessage = `${grantorName} rejected your application for ${scholarshipName}. Reason: ${effectiveReason}${effectiveNotes.trim() ? ` - ${effectiveNotes.trim()}` : ""}`

			await adminReviewWorkflow({
				actorType: "grantor",
				actorId: grantorId,
				updates: [
					{
						table: "students",
						id: student.id || application.studentId,
						data: {
							scholarships: nextScholarships,
							updatedAt: serverTimestamp(),
						},
					},
					{
						table: "scholarship_applications",
						id: application.id,
						data: {
							status: "Rejected",
							rejected: true,
							archived: true,
							rejectionReason: effectiveReason,
							rejectionNotes: effectiveNotes.trim(),
							rejectionMessage,
							rejectedAt,
							rejectedBy: grantorId,
							rejectedByName: grantorName,
							rejectedByRole: "grantor",
							decisionConfirmation: null,
							grantorConfirmationPending: false,
							grantorConfirmationDecision: null,
							grantorConfirmationDeadlineAt: null,
							updatedAt: serverTimestamp(),
						},
					},
				],
			})

			try {
				await createStudentNotification({
					studentId: student.id || application.studentId,
					source: "personal",
					type: "application_rejected",
					title: "Scholarship Application Rejected",
					message: rejectionMessage,
					grantorId,
					grantorName,
					applicationNumber: application.applicationNumber || application.requestNumber || application.id || "",
					rejectionReason: effectiveReason,
					rejectionNotes: effectiveNotes.trim(),
					rejectionMessage,
					rejectedBy: grantorId,
					rejectedByName: grantorName,
					rejectedByRole: "grantor",
					authorName: grantorName,
					authorImageUrl: grantorProfileImageUrl,
					read: false,
					createdAt: rejectedAt,
				})
			} catch (notificationError) {
				console.error("Application rejected, but student notification failed.", notificationError)
				toast.warning("Application rejected, but the student inbox notification could not be delivered.")
			}
			if (getPendingApplicationDecisionConfirmation(application)?.requestedBy === "admin") {
				await createAdminNotification({
					type: "application_confirmation_resolved",
					title: "Grantor Confirmed Rejection",
					message: `${grantorName} confirmed the rejection of ${[student.fname, student.mname, student.lname].filter(Boolean).join(" ").trim() || "the student"}'s application for ${scholarshipName}.`,
					grantorId,
					grantorName,
					studentId: student.id || application.studentId,
					studentName: [student.fname, student.mname, student.lname].filter(Boolean).join(" ").trim(),
					applicationNumber: application.applicationNumber || application.requestNumber || application.id || "",
					decision: "reject",
					read: false,
					createdAt: serverTimestamp(),
				}).catch((error) => console.error("Admin notification for grantor rejection confirmation failed.", error))
			}

			setApplicationModalState((prev) => ({
				...prev,
				application: prev.application
					? {
							...prev.application,
							status: "Rejected",
							rejected: true,
							archived: true,
							rejectionReason: effectiveReason,
							rejectionNotes: effectiveNotes.trim(),
							rejectionMessage,
							rejectedAt,
							rejectedBy: grantorId,
							rejectedByName: grantorName,
							rejectedByRole: "grantor",
							decisionConfirmation: null,
							grantorConfirmationPending: false,
							grantorConfirmationDecision: null,
							grantorConfirmationDeadlineAt: null,
						}
					: prev.application,
				student: prev.student ? { ...prev.student, scholarships: nextScholarships } : prev.student,
			}))
			setRejectModalOpen(false)
			closeApplicationModal()
			toast.success(isConfirmationResolution ? "Rejection confirmed and the application was archived." : "Application rejected and moved to archived records.")
		} catch (error) {
			console.error("Unable to reject application.", error)
			toast.error("Unable to reject the application right now.")
		} finally {
			setBusy("")
		}
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
					setSelectedImportRowIndexes([])
					setImportDuplicateMatches({})
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

	const removeSelectedImportRows = () => {
		if (selectedImportRowIndexes.length === 0) return
		const selected = new Set(selectedImportRowIndexes)
		const remainingRows = (importData || []).filter((_, rowIndex) => !selected.has(rowIndex))
		if (remainingRows.length === 0) {
			setImportData(null)
			setUploadFile(null)
			setColumnMapping([])
			setCustomImportFields([])
			setCustomImportDrafts({})
			setCustomImportEditColumn(null)
		} else {
			setImportData(remainingRows)
		}
		setSelectedImportRowIndexes([])
		setImportDuplicateMatches({})
		setTablePage("grantor_import_preview", 1)
		toast.info(`${selected.size} import row${selected.size === 1 ? "" : "s"} removed.`)
	}

	const handleColumnMappingChange = (colIndex, value) => {
		if (value === ADD_CUSTOM_IMPORT_FIELD) {
			setCustomImportEditColumn(colIndex)
			setCustomImportDrafts((prev) => ({ ...prev, [colIndex]: "" }))
			return
		}

		setColumnMapping((prev) => {
			const next = [...prev]
			next[colIndex] = value
			return next
		})
	}

	const cancelCustomImportField = (colIndex) => {
		setCustomImportDrafts((prev) => {
			const next = { ...prev }
			delete next[colIndex]
			return next
		})
		setCustomImportEditColumn(null)
	}

	const commitCustomImportField = (colIndex) => {
		const cleanLabel = String(customImportDrafts[colIndex] || "").trim()
		if (!cleanLabel) {
			cancelCustomImportField(colIndex)
			return
		}

		const customId = toCustomImportFieldId(cleanLabel)
		if (!customId) {
			toast.error("Use letters or numbers for the custom column name.")
			return
		}

		const isBuiltInDuplicate = MAPPABLE_FIELDS.some((field) => {
			return field.id === customId || toCustomImportFieldId(field.label) === customId
		})
		const isCustomDuplicate = customImportFields.some((field) => {
			return field.id === customId || toCustomImportFieldId(field.label) === customId
		})
		if (isBuiltInDuplicate || isCustomDuplicate) {
			toast.error("That column name already exists. Use a different name.")
			return
		}

		const nextValue = `custom:${customId}`
		setCustomImportFields((prev) => {
			return [...prev, { id: customId, label: cleanLabel }]
		})
		setColumnMapping((prev) => {
			const next = [...prev]
			next[colIndex] = nextValue
			return next
		})
		setCustomImportDrafts((prev) => {
			const next = { ...prev }
			delete next[colIndex]
			return next
		})
		setCustomImportEditColumn(null)
	}

	const toggleApplicationsBlocked = async () => {
		if (!grantorId || busy) return
		const nextBlockedState = !applicationsBlocked
		setBusy("portal_toggle")
		try {
			console.log("[BulsuScholar] Grantor application toggle skipped profile inbox notification.", {
				reason: "application toggle is not a profile edit",
				grantorId,
				applicationsBlocked: nextBlockedState,
			})
			await updateGrantorProfileWorkflow({
				grantorId,
				data: {
					grantorId,
					grantorName,
					providerType: grantorProviderType,
					applicationsBlocked: nextBlockedState,
					updatedAt: serverTimestamp(),
				},
				updatePortal: true,
				suppressNotification: true,
				notificationReason: "application_toggle_update",
			})
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
		if (!isApplicationOwnedByGrantor(application, grantorId)) {
			console.warn("[BulsuScholar] Blocked cross-grantor application modal access.", {
				currentGrantorId: grantorId,
				applicationGrantorId: getApplicationGrantorId(application),
				applicationId: application.id,
				studentId: application.studentId,
			})
			toast.error("You can only view applications submitted to your grantor account.")
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
		if (!isApplicationOwnedByGrantor(applicationModalState.application, grantorId)) {
			console.warn("[BulsuScholar] Blocked cross-grantor stage completion.", {
				currentGrantorId: grantorId,
				applicationGrantorId: getApplicationGrantorId(applicationModalState.application),
				applicationId: applicationModalState.application.id,
				studentId: applicationModalState.application.studentId,
			})
			toast.error("You can only update applications submitted to your grantor account.")
			return
		}

		const currentStep = applicationModalState.trackingProgress?.currentStep
		const currentStepLabel = getGrantorCompletableStepLabel(currentStep?.id)
		if (currentStep?.owner === "student") {
			toast.info("This step must be completed by the student.")
			return
		}
		if (!currentStepLabel) {
			toast.info("Grantor actions are limited to document review, interview, application review, and final screening.")
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
			const pendingDecision = getPendingApplicationDecisionConfirmation(applicationModalState.application || {})
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
			const completedFinalScreening = currentStep.id === "final_screening"
			const matchedScholar = completedFinalScreening
				? findExistingScholarForScreening(
						scholars,
						applicationModalState.student,
						nextScholarship,
						applicationModalState.application,
						grantorProviderType,
					)
				: null
			const scholarRecord = completedFinalScreening
				? buildScholarRecordFromScreening(
						applicationModalState.student,
						nextScholarship,
						applicationModalState.application,
						{
							grantorId,
							grantorName,
							providerType: grantorProviderType,
						},
					)
				: null

			await adminReviewWorkflow({
				actorType: "grantor",
				actorId: grantorId,
				updates: [
					{
						table: "students",
						id: applicationModalState.student.id,
						data: {
							scholarships: nextScholarships,
							updatedAt: serverTimestamp(),
						},
					},
					{
						table: "scholarship_applications",
						id: applicationModalState.application.id,
						data: {
							status: nextStatus,
							tracking: nextTracking,
							decisionConfirmation: null,
							grantorConfirmationPending: false,
							grantorConfirmationDecision: null,
							grantorConfirmationDeadlineAt: null,
							updatedAt: serverTimestamp(),
						},
					},
				],
				stageCompletion: {
					studentId: applicationModalState.student.id,
					stepId: currentStep.id,
					stepLabel: currentStepLabel,
					actorName: grantorName,
					grantorId,
					grantorName,
					scholarshipId: nextScholarship.id || "",
					scholarshipName: nextScholarship.name || "your scholarship application",
					applicationNumber:
						applicationModalState.application.applicationNumber ||
						applicationModalState.application.requestNumber ||
						applicationModalState.application.id ||
						"",
					authorImageUrl: grantorProfileImageUrl,
				},
			})

			if (completedFinalScreening && scholarRecord) {
				const scholarDocId =
					matchedScholar?.id ||
					`${grantorId || grantorProviderType || "grantor"}__${applicationModalState.application.id || nextScholarship.id || applicationModalState.student.id}`
				await updateGrantorScholarWorkflow({
					grantorId,
					scholarId: scholarDocId,
					upsert: true,
					data: {
						...scholarRecord,
						createdAt: matchedScholar?.createdAt || serverTimestamp(),
						updatedAt: serverTimestamp(),
					},
				})
			}
			if (pendingDecision?.requestedBy === "admin") {
				await createAdminNotification({
					type: "application_confirmation_resolved",
					title: "Grantor Confirmed Approval",
					message: `${grantorName} confirmed the approval of ${applicationModalState.application.fullName || "the student"}'s application for ${nextScholarship.name || "the scholarship"}.`,
					grantorId,
					grantorName,
					studentId: applicationModalState.student.id,
					studentName: applicationModalState.application.fullName || "",
					applicationNumber:
						applicationModalState.application.applicationNumber ||
						applicationModalState.application.requestNumber ||
						applicationModalState.application.id ||
						"",
					decision: "approve",
					read: false,
					createdAt: serverTimestamp(),
				}).catch((error) => console.error("Admin notification for grantor approval confirmation failed.", error))
			}

			setApplicationModalState((prev) => ({
				...prev,
				application: prev.application
					? {
							...prev.application,
							status: nextStatus,
							tracking: nextTracking,
							decisionConfirmation: null,
							grantorConfirmationPending: false,
							grantorConfirmationDecision: null,
							grantorConfirmationDeadlineAt: null,
						}
					: prev.application,
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

	const handleConfirmPendingApplicationDecision = async (options = {}) => {
		const pendingDecision = getPendingApplicationDecisionConfirmation(applicationModalState.application || {})
		if (!pendingDecision) return
		if (pendingDecision.decision === "reject") {
			await handleConfirmRejectApplication({
				reason: pendingDecision.reason || APPLICATION_REJECTION_REASONS[0],
				notes: pendingDecision.notes || "",
				fromConfirmation: true,
			})
			return
		}
		await handleCompleteGrantorStage()
		if (options.automatic) {
			toast.info(`${formatApplicationDecisionLabel(pendingDecision.decision)} was applied automatically after the 3-day confirmation window.`)
		}
	}

	const handleCancelPendingApplicationDecision = async () => {
		const pendingDecision = getPendingApplicationDecisionConfirmation(applicationModalState.application || {})
		if (!pendingDecision || !applicationModalState.application) return
		setBusy("decision_confirmation")
		try {
			await adminReviewWorkflow({
				actorType: "grantor",
				actorId: grantorId,
				updates: [
					{
						table: "scholarship_applications",
						id: applicationModalState.application.id,
						data: {
							decisionConfirmation: null,
							grantorConfirmationPending: false,
							grantorConfirmationDecision: null,
							grantorConfirmationDeadlineAt: null,
							updatedAt: serverTimestamp(),
						},
					},
				],
			})
			await createAdminNotification({
				type: "application_confirmation_cancelled",
				title: `Grantor Cancelled ${formatApplicationDecisionLabel(pendingDecision.decision)}`,
				message: `${grantorName} cancelled the admin-proposed ${formatApplicationDecisionVerb(pendingDecision.decision)} decision for ${applicationModalState.application.fullName || "the student"}.`,
				grantorId,
				grantorName,
				studentId: applicationModalState.application.studentId || "",
				studentName: applicationModalState.application.fullName || "",
				applicationNumber:
					applicationModalState.application.applicationNumber ||
					applicationModalState.application.requestNumber ||
					applicationModalState.application.id ||
					"",
				decision: pendingDecision.decision,
				read: false,
				createdAt: serverTimestamp(),
			}).catch((error) => console.error("Admin notification for cancelled application confirmation failed.", error))
			setApplicationModalState((prev) => ({
				...prev,
				application: prev.application
					? {
							...prev.application,
							decisionConfirmation: null,
							grantorConfirmationPending: false,
							grantorConfirmationDecision: null,
							grantorConfirmationDeadlineAt: null,
						}
					: prev.application,
			}))
			toast.success(`${formatApplicationDecisionLabel(pendingDecision.decision)} confirmation cancelled.`)
		} catch (error) {
			console.error("Unable to cancel application decision confirmation.", error)
			toast.error("Unable to cancel the confirmation right now.")
		} finally {
			setBusy("")
		}
	}

	useEffect(() => {
		if (!applicationModalState.open || busy) return
		const pendingDecision = getPendingApplicationDecisionConfirmation(applicationModalState.application || {})
		if (!pendingDecision || !isApplicationDecisionConfirmationExpired(pendingDecision)) return
		const key = `${applicationModalState.application?.id || ""}_${pendingDecision.decision}_${pendingDecision.deadlineAt || ""}`
		if (autoConfirmationResolutionRef.current === key) return
		autoConfirmationResolutionRef.current = key
		toast.info(`The 3-day ${formatApplicationDecisionLabel(pendingDecision.decision).toLowerCase()} confirmation window expired. Applying it automatically.`)
		void handleConfirmPendingApplicationDecision({ automatic: true })
		// The confirmation handler intentionally uses the current modal state.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [applicationModalState.open, applicationModalState.application, busy])

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
				const existingScholars = await getAllGrantorScholars(db)
				const studentsSnapshot = await getDocs(collection(db, "students"))
				const existingStudents = studentsSnapshot.docs.map((row) => ({ id: row.id, ...(row.data() || {}) }))
				const acceptedScholars = []
				const blockedRows = []

				for (const [rowIndex, row] of importData.entries()) {
					let scholarObj = {
						...buildMappedImportScholar(row, columnMapping, customImportFields, {
							grantorId,
							grantorName,
							providerType: grantorProviderType,
						}),
						grantorId,
						grantorName,
						providerType: grantorProviderType,
						status: "Active",
						archived: false,
						createdAt: serverTimestamp(),
						updatedAt: serverTimestamp(),
					}

					if (!scholarObj.fullName) {
						scholarObj.fullName = [scholarObj.fname, scholarObj.mname, scholarObj.lname].filter(Boolean).join(" ").trim() || "Scholar"
					}

					const existingStudentDuplicate = await findScholarDuplicate(scholarObj, existingStudents)
					if (existingStudentDuplicate?.record) {
						scholarObj = buildScholarPayloadFromStudentAccount(existingStudentDuplicate.record, scholarObj)
					}

					const exactConflict = findCurrentGrantorStudentIdConflict(
						scholarObj,
						existingScholars,
						applications,
						grantorId,
						grantorProviderType,
						acceptedScholars,
					)
					if (exactConflict) {
						blockedRows.push({ rowNumber: rowIndex + 1, scholar: scholarObj, duplicate: exactConflict })
						continue
					}

					const duplicate = await findScholarDuplicate(
						scholarObj,
						[...existingScholars, ...acceptedScholars],
					)
					if (duplicate) {
						if (isDuplicateOwnedByGrantor(duplicate, grantorId, grantorProviderType)) {
							blockedRows.push({ rowNumber: rowIndex + 1, scholar: scholarObj, duplicate })
							continue
						}
						blockedRows.push({ rowNumber: rowIndex + 1, scholar: scholarObj, duplicate, crossGrantor: true })
						continue
					}
					acceptedScholars.push(scholarObj)
				}

				if (acceptedScholars.length > 0) {
					await createGrantorScholarsWorkflow({
						grantorId,
						scholars: acceptedScholars,
					})
					toast.success(`Successfully imported ${acceptedScholars.length} new scholar${acceptedScholars.length === 1 ? "" : "s"}.`)
				}

				if (blockedRows.length > 0) {
					const examples = blockedRows.slice(0, 2).map(({ rowNumber, scholar, duplicate }) => {
						const matchedName = duplicate.record.fullName || "an existing student"
						const owner = duplicate.record.grantorName || duplicate.record.grantorId || "this grantor"
						return `row ${rowNumber} (${scholar.fullName || "Student"}) matches ${matchedName} under ${owner}`
					}).join("; ")
					toast.warning(`${blockedRows.length} duplicate row${blockedRows.length === 1 ? " was" : "s were"} blocked and not imported. ${examples}`)
					if (blockedRows.some((row) => row.crossGrantor)) {
						await createAdminNotification({
							type: "duplicate_scholarship_prevented",
							title: "Duplicate Scholarship Prevented",
							message: `${grantorName} attempted to import ${blockedRows.filter((row) => row.crossGrantor).length} student${blockedRows.filter((row) => row.crossGrantor).length === 1 ? "" : "s"} already listed under another grantor. The rows were blocked.`,
							grantorId,
							grantorName,
							count: blockedRows.filter((row) => row.crossGrantor).length,
							source: "grantor_import_prevention",
							read: false,
							createdAt: serverTimestamp(),
						}).catch((error) => console.error("Admin duplicate prevention notification failed.", error))
					}
				}

				if (acceptedScholars.length > 0) closeCreateModal()
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
			let payload = scholarPayload(createForm, grantorId, grantorName, grantorProviderType, uploadFile)
			const existingScholars = await getAllGrantorScholars(db)
			const studentsSnapshot = await getDocs(collection(db, "students"))
			const existingStudents = studentsSnapshot.docs.map((row) => ({ id: row.id, ...(row.data() || {}) }))
			const existingStudentDuplicate = await findScholarDuplicate(payload, existingStudents)
			if (existingStudentDuplicate?.record) {
				payload = buildScholarPayloadFromStudentAccount(existingStudentDuplicate.record, payload)
			}
			const exactConflict = findCurrentGrantorStudentIdConflict(
				payload,
				existingScholars,
				applications,
				grantorId,
				grantorProviderType,
			)
			if (exactConflict) {
				const matchedName = exactConflict.record.fullName || exactConflict.record.studentName || "an existing student"
				const source = exactConflict.kind === "application" ? "application list" : "grantor roster"
				toast.warning(`Student not added. Student ID ${payload.studentId} already exists in this grantor's ${source} as ${matchedName}.`)
				return
			}
			const duplicate = await findScholarDuplicate(payload, existingScholars)
			if (duplicate) {
				if (!isDuplicateOwnedByGrantor(duplicate, grantorId, grantorProviderType)) {
					const matchedName = duplicate.record.fullName || "an existing student"
					const owner = duplicate.record.grantorName || duplicate.record.grantorId || "another grantor"
					toast.warning(`Student not added. This student already appears under ${owner} as ${matchedName}.`)
					await createAdminNotification({
						type: "duplicate_scholarship_prevented",
						title: "Duplicate Scholarship Prevented",
						message: `${grantorName} attempted to add ${payload.fullName || "a student"} who already appears under ${owner}. The add was blocked.`,
						grantorId,
						grantorName,
						studentId: payload.studentId,
						studentName: payload.fullName,
						matchedGrantorName: owner,
						source: "grantor_manual_add_prevention",
						read: false,
						createdAt: serverTimestamp(),
					}).catch((error) => console.error("Admin duplicate prevention notification failed.", error))
					return
				} else {
					const matchedName = duplicate.record.fullName || "an existing student"
					const reason = duplicate.reasons.length > 0 ? ` Matching fields: ${duplicate.reasons.join(", ")}.` : ""
					toast.warning(`Duplicate student not added. This student is already in this grantor roster as ${matchedName}.${reason}`)
					return
				}
			}
			await createGrantorScholarsWorkflow({
				grantorId,
				scholars: [{
					...payload,
					createdAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				}],
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
			const lockedStudentId = String(selectedScholar.studentId || "").trim()
			const lockedProfileForm = editScholarAccountExists && editScholarLockedProfile
				? scholarToForm(selectedScholar, editScholarLockedProfile)
				: null
			const saveForm =
				editScholarAccountExists && lockedStudentId
					? {
							...(lockedProfileForm || editForm),
							studentId: lockedStudentId,
							scholarshipTitle: editForm.scholarshipTitle,
							status: editForm.status,
							notes: editForm.notes,
							customColumns: editForm.customColumns,
						}
					: editForm
			const payload = scholarPayload(saveForm, grantorId, grantorName, grantorProviderType)
			const existingScholars = await getAllGrantorScholars(db)
			const duplicate = await findScholarDuplicate(payload, existingScholars, {
				excludeId: selectedScholar.id,
				excludeGrantorId: grantorId,
			})
			if (duplicate) {
				const matchedName = duplicate.record.fullName || "an existing student"
				const owner = duplicate.record.grantorName || duplicate.record.grantorId || "another grantor"
				toast.warning(`Changes not saved because this record matches ${matchedName} under ${owner}.`)
				return
			}
			await updateGrantorScholarWorkflow({
				grantorId,
				scholarId: selectedScholar.id,
				data: {
					...payload,
					updatedAt: serverTimestamp(),
				},
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
			const selectedScholars = scholars.filter((row) => selectedScholarIds.includes(row.id))
			const studentUpdates = []
			const studentNotifications = []
			await Promise.all(
				selectedScholars.map(async (scholar) => {
					const studentId = scholar.studentId || scholar.studentID || scholar.studentNumber || scholar.studentnumber || ""
					if (!studentId) return
					const studentSnapshot = await getDoc(doc(db, "students", studentId))
					if (!studentSnapshot.exists()) return
					const student = { id: studentSnapshot.id, ...(studentSnapshot.data() || {}) }
					const normalizedScholarships = normalizeScholarshipList(student.scholarships || [])
					let changed = false
					const frozenScholarships = normalizedScholarships.map((entry) => {
						const entryName = String(entry.name || entry.provider || "").toLowerCase().trim()
						const scholarName = String(scholar.scholarshipTitle || scholar.grantorName || grantorName || "").toLowerCase().trim()
						const sameGrantor =
							(entry.grantorId && entry.grantorId === grantorId) ||
							(grantorProviderType !== "other" && entry.providerType && entry.providerType === grantorProviderType) ||
							(entryName && scholarName && entryName === scholarName)
						if (!sameGrantor) return entry
						changed = true
						return {
							...entry,
							status: "Archived",
							archived: true,
							frozen: true,
							freezeReason: "Archived by grantor",
							frozenBy: grantorId,
							frozenByName: grantorName,
							frozenAt: serverTimestamp(),
							archivedAt: serverTimestamp(),
							updatedAt: serverTimestamp(),
						}
					})
					if (changed) {
						studentUpdates.push({
							table: "students",
							id: student.id,
							data: {
								scholarships: frozenScholarships,
								updatedAt: serverTimestamp(),
							},
						})
					}
					studentNotifications.push({
						target: "student",
						data: {
							studentId: student.id,
							source: "personal",
							type: "scholarship_archived",
							title: "Scholarship Application Frozen",
							message: `${grantorName} archived your scholar record. Your application or scholarship access is frozen, so you cannot proceed to the next step or request SOE until it is restored.`,
							grantorId,
							grantorName,
							authorName: grantorName,
							authorImageUrl: grantorProfileImageUrl,
							read: false,
							createdAt: serverTimestamp(),
						},
					})
				}),
			)
			await updateGrantorScholarsWorkflow({
				grantorId,
				scholarIds: selectedScholarIds,
				data: {
					archived: true,
					status: "Archived",
					archivedAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				},
			})
			if (studentUpdates.length || studentNotifications.length) {
				const workflowResult = await adminReviewWorkflow({
					updates: studentUpdates,
					notifications: studentNotifications,
				})
				const failedNotifications = (workflowResult?.notifications || []).filter((item) => item?.ok === false)
				if (failedNotifications.length > 0) {
					console.warn("Archive notification delivery failed:", failedNotifications)
					await Promise.all(studentNotifications.map((notification, index) =>
						setDoc(doc(db, "studentWarning", `archive_${notification.data.studentId}_${Date.now()}_${index}`), {
							...(notification.data || {}),
							notificationFallbackTable: "student_warnings",
							updatedAt: serverTimestamp(),
						}, { merge: true }),
					))
					toast.info("Scholar archived. Student inbox notification was saved through the fallback inbox table.")
				}
			}
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
			const selectedScholars = scholars.filter((row) => selectedScholarIds.includes(row.id))
			const studentUpdates = []
			const studentNotifications = []
			await Promise.all(
				selectedScholars.map(async (scholar) => {
					const studentId = scholar.studentId || scholar.studentID || scholar.studentNumber || scholar.studentnumber || ""
					if (!studentId) return
					const studentSnapshot = await getDoc(doc(db, "students", studentId))
					if (!studentSnapshot.exists()) return
					const student = { id: studentSnapshot.id, ...(studentSnapshot.data() || {}) }
					const normalizedScholarships = normalizeScholarshipList(student.scholarships || [])
					let changed = false
					const restoredScholarships = normalizedScholarships.map((entry) => {
						const entryName = String(entry.name || entry.provider || "").toLowerCase().trim()
						const scholarName = String(scholar.scholarshipTitle || scholar.grantorName || grantorName || "").toLowerCase().trim()
						const sameGrantor =
							(entry.grantorId && entry.grantorId === grantorId) ||
							(grantorProviderType !== "other" && entry.providerType && entry.providerType === grantorProviderType) ||
							(entryName && scholarName && entryName === scholarName)
						if (!sameGrantor || (entry.frozen !== true && entry.archived !== true)) return entry
						changed = true
						return {
							...entry,
							status: "Active",
							archived: false,
							frozen: false,
							freezeReason: "",
							frozenBy: "",
							frozenByName: "",
							frozenAt: null,
							archivedAt: null,
							updatedAt: serverTimestamp(),
						}
					})
					if (changed) {
						studentUpdates.push({
							table: "students",
							id: student.id,
							data: {
								scholarships: restoredScholarships,
								updatedAt: serverTimestamp(),
							},
						})
					}
					studentNotifications.push({
						target: "student",
						data: {
							studentId: student.id,
							source: "personal",
							type: "scholarship_restored",
							title: "Scholarship Application Restored",
							message: `${grantorName} restored your scholarship record. You can continue your scholarship steps again.`,
							grantorId,
							grantorName,
							authorName: grantorName,
							authorImageUrl: grantorProfileImageUrl,
							read: false,
							createdAt: serverTimestamp(),
						},
					})
				}),
			)
			await updateGrantorScholarsWorkflow({
				grantorId,
				scholarIds: selectedScholarIds,
				data: {
					archived: false,
					status: "Active",
					archivedAt: null,
					updatedAt: serverTimestamp(),
				},
			})
			if (studentUpdates.length || studentNotifications.length) {
				const workflowResult = await adminReviewWorkflow({
					updates: studentUpdates,
					notifications: studentNotifications,
				})
				const failedNotifications = (workflowResult?.notifications || []).filter((item) => item?.ok === false)
				if (failedNotifications.length > 0) {
					console.warn("Unarchive notification delivery failed:", failedNotifications)
					await Promise.all(studentNotifications.map((notification, index) =>
						setDoc(doc(db, "studentWarning", `unarchive_${notification.data.studentId}_${Date.now()}_${index}`), {
							...(notification.data || {}),
							notificationFallbackTable: "student_warnings",
							updatedAt: serverTimestamp(),
						}, { merge: true }),
					))
					toast.info("Scholar unarchived. Student inbox notification was saved through the fallback inbox table.")
				}
			}
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

	const handleAnnouncementImageSelect = (event) => {
		const selectedFiles = Array.from(event.target.files || [])
		const imageFiles = selectedFiles.filter((file) => file.type?.startsWith("image/"))
		if (selectedFiles.length !== imageFiles.length) {
			toast.warning("Only image files can be attached to announcements.")
		}
		if (imageFiles.length === 0) {
			event.target.value = ""
			return
		}
		const availableSlots = Math.max(0, 5 - announcementImageFiles.length)
		if (availableSlots === 0) {
			toast.warning("You can upload up to 5 announcement images only.")
			event.target.value = ""
			return
		}
		if (imageFiles.length > availableSlots) {
			toast.warning(`Only ${availableSlots} more image${availableSlots === 1 ? "" : "s"} can be added.`)
		}
		setAnnouncementImageFiles((prev) => [...prev, ...imageFiles.slice(0, availableSlots)])
		event.target.value = ""
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

	const addAnnouncementRequirement = () => {
		setAnnouncementForm((prev) => {
			const requirements = Array.isArray(prev.otherRequirements) ? prev.otherRequirements : []
			if (requirements.some((item) => item.confirmed !== true)) return prev
			return {
				...prev,
				otherRequirements: [
					...requirements,
					{ name: "", fileType: "pdf", uploadCount: 1, confirmed: false },
				],
			}
		})
	}

	const updateAnnouncementRequirement = (index, field, value) => {
		setAnnouncementForm((prev) => ({
			...prev,
			otherRequirements: (Array.isArray(prev.otherRequirements) ? prev.otherRequirements : []).map((item, itemIndex) =>
				itemIndex === index ? { ...item, [field]: value, confirmed: false } : item,
			),
		}))
	}

	const confirmAnnouncementRequirement = (index) => {
		const requirement = Array.isArray(announcementForm.otherRequirements)
			? announcementForm.otherRequirements[index]
			: null
		if (!String(requirement?.name || "").trim()) {
			toast.error("Add the other requirement name before confirming it.")
			return
		}
		setAnnouncementForm((prev) => ({
			...prev,
			otherRequirements: (Array.isArray(prev.otherRequirements) ? prev.otherRequirements : []).map((item, itemIndex) =>
				itemIndex === index ? { ...item, confirmed: true } : item,
			),
		}))
	}

	const editAnnouncementRequirement = (index) => {
		setAnnouncementForm((prev) => ({
			...prev,
			otherRequirements: (Array.isArray(prev.otherRequirements) ? prev.otherRequirements : []).map((item, itemIndex) =>
				itemIndex === index ? { ...item, confirmed: false } : item,
			),
		}))
	}

	const removeAnnouncementRequirement = (index) => {
		setAnnouncementForm((prev) => ({
			...prev,
			otherRequirements: (Array.isArray(prev.otherRequirements) ? prev.otherRequirements : []).filter((_, itemIndex) => itemIndex !== index),
		}))
	}

	const closeCreateAnnouncementModal = () => {
		if (busy === "announcement") return
		setShowCreateAnnouncementModal(false)
		setAnnouncementSubmitAttempted(false)
	}

	const handleArchiveAnnouncement = async (announcementId) => {
		if (!grantorId || !announcementId || busy) return
		if (!window.confirm("Archive this announcement?")) return
		setBusy(`archive-announcement-${announcementId}`)
		try {
			await updateGrantorAnnouncementWorkflow({
				grantorId,
				announcementId,
				data: {
					archived: true,
					status: "Archived",
					updatedAt: new Date().toISOString(),
				},
			})
			if (selectedAnnouncement?.id === announcementId) setSelectedAnnouncement(null)
			toast.success("Announcement archived.")
		} catch (error) {
			console.error(error)
			const message = String(error?.message || "")
			toast.error(
				message.includes("missing_supabase_server_config")
					? "Backend Supabase credentials are not configured."
					: "Unable to archive announcement right now.",
			)
		} finally {
			setBusy("")
		}
	}

	const handlePostAnnouncement = async (event) => {
		event.preventDefault()
		if (!grantorId || busy) return
		setAnnouncementSubmitAttempted(true)
		if (
			announcementMissingFields.title ||
			announcementMissingFields.description ||
			announcementMissingFields.applicationWindow ||
			announcementMissingFields.minimumGrade ||
			announcementMissingFields.otherRequirement
		) {
			toast.error(
				announcementMissingFields.otherRequirement
					? "Confirm the other requirement with the check button before posting."
					: "Complete the announcement fields before posting.",
			)
			return
		}
		setBusy("announcement")
		try {
			const uploads = await Promise.all(announcementImageFiles.map((file) => uploadToStorage(file, { folder: `grantor-announcements/${grantorId}` })))
			const imageUrls = uploads.map((item) => item.url).filter(Boolean)
			const announcementResult = await createGrantorAnnouncementWorkflow({
				grantorId,
				announcement: {
					...announcementForm,
					title: announcementForm.title.trim(),
					subtitle: announcementForm.subtitle.trim(),
					description: announcementForm.description.trim(),
					content: announcementForm.description.trim(),
					previewText: announcementForm.description.trim().slice(0, 150),
					applicationEnabled: announcementForm.applicationEnabled === true,
					minimumGrade: announcementForm.applicationEnabled ? Number(announcementForm.minimumGrade) : null,
					minGwa: announcementForm.applicationEnabled ? Number(announcementForm.minimumGrade) : null,
					requiredDocuments: announcementForm.applicationEnabled
						? {
								cog: announcementForm.requiredDocuments?.cog === true,
								cor: announcementForm.requiredDocuments?.cor === true,
								applicationForm: announcementForm.requiredDocuments?.applicationForm === true,
							}
						: {
								cog: false,
								cor: false,
								applicationForm: false,
							},
					otherRequirements: announcementForm.applicationEnabled
						? (Array.isArray(announcementForm.otherRequirements) ? announcementForm.otherRequirements : [])
								.slice(0, 1)
								.map((item) => ({
									name: String(item.name || "").trim(),
									fileType: String(item.fileType || "pdf").toLowerCase() === "png" ? "png" : "pdf",
									uploadCount: Math.max(1, Number.parseInt(item.uploadCount, 10) || 1),
									confirmed: item.confirmed === true,
								}))
								.filter((item) => item.name && item.confirmed)
						: [],
					applicationWindow: announcementForm.applicationEnabled ? announcementForm.applicationWindow.trim() : "",
					startDate: announcementForm.applicationEnabled && announcementWindowStart ? new Date(`${announcementWindowStart}T00:00:00`).toISOString() : null,
					endDate: announcementForm.applicationEnabled && announcementWindowEnd ? new Date(`${announcementWindowEnd}T23:59:59`).toISOString() : null,
					imageUrl: imageUrls[0] || "",
					imageUrls,
					images: uploads.map((item) => ({
						url: item.url || "",
						name: item.name || "",
						type: item.type || "",
						size: item.size || 0,
						path: item.path || "",
					})),
					grantorId,
					grantorName,
					providerType: grantorProviderType,
					providerLabel: grantorName,
					status: "Open",
					createdAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				},
			})
			const announcementId = announcementResult?.id || announcementResult?.result?.data?.[0]?.id || ""
			let notificationFailed = announcementResult?.notification?.ok === false
			const notificationCreatedAt = new Date().toISOString()
			try {
				const studentsSnapshot = await getDocs(collection(db, "students"))
				const studentNotificationResults = await Promise.allSettled(studentsSnapshot.docs.map((studentDoc) =>
					createStudentNotification({
						studentId: studentDoc.id,
						source: "personal",
						type: "announcement",
						title: `New announcement from ${grantorName}`,
						message: announcementForm.description.trim().slice(0, 180) || "A grantor posted a new scholarship announcement.",
						announcementId,
						announcementSource: "grantor",
						grantorId,
						authorName: grantorName,
						authorImageUrl: grantorProfileImageUrl,
						read: false,
						createdAt: notificationCreatedAt,
					}),
				))
				notificationFailed = studentNotificationResults.some((result) => result.status === "rejected")
				if (notificationFailed) {
					console.error("Some student announcement notifications failed.", studentNotificationResults.filter((result) => result.status === "rejected"))
				}
			} catch (notificationError) {
				notificationFailed = true
				console.error("Announcement published, but inbox notifications failed.", notificationError)
			}
			setAnnouncementForm(ANNOUNCEMENT_FORM)
			setAnnouncementSubmitAttempted(false)
			setAnnouncementImageFiles([])
			setAnnouncementWindowStart("")
			setAnnouncementWindowEnd("")
			setShowCreateAnnouncementModal(false)
			if (notificationFailed) {
				toast.warning("Announcement published, but inbox notifications could not be delivered.")
			} else {
				toast.success("Announcement posted for the grantor portal.")
			}
		} catch (error) {
			console.error(error)
			toast.error("Unable to post announcement right now.")
		} finally {
			setBusy("")
		}
	}

	const handleAnnouncementWindowDatePick = (iso, disabled) => {
		if (disabled) return
		if (!announcementWindowStart || announcementWindowEnd) {
			setAnnouncementWindowStart(iso)
			setAnnouncementWindowEnd("")
			setAnnouncementForm((prev) => ({ ...prev, applicationWindow: "" }))
			return
		}
		if (iso < announcementWindowStart) {
			setAnnouncementWindowStart(iso)
			return
		}
		setAnnouncementWindowEnd(iso)
		setAnnouncementForm((prev) => ({ ...prev, applicationWindow: formatAnnouncementWindow(announcementWindowStart, iso) }))
	}

	const renderAnnouncementCard = (item) => {
		const imageUrls = buildAnnouncementImageList(item)
		const archived = isAnnouncementArchived(item)
		return (
			<article key={item.id} className={`grantor-announcement-card ${archived ? "is-archived" : ""}`}>
				<div className="grantor-announcement-card-media">
					{imageUrls[0] ? <img src={imageUrls[0]} alt={item.title || "Announcement"} /> : <span><HiOutlineBell /></span>}
				</div>
				<div className="grantor-announcement-card-body">
					<div className="grantor-announcement-card-top"><span className={`grantor-announcement-status ${archived ? "is-archived" : ""}`}>{archived ? "Archived" : item.status || "Open"}</span><time>{formatRelativeDate(item.createdAt)}</time></div>
					{renderAnnouncementAuthor(item)}
					<h4>{item.title || "Announcement"}</h4>
					<p>{item.subtitle || "Scholarship application notice"}</p>
					<span className="grantor-announcement-card-window"><HiOutlineCalendar /> {item.applicationWindow || "Window not specified"}</span>
				</div>
				<footer className="grantor-announcement-card-actions">
					<button type="button" className="grantor-announcement-view-btn" onClick={() => setSelectedAnnouncement(item)}><HiOutlineEye /> View</button>
					{archived ? <span className="grantor-announcement-archived-note">Archived</span> : <button type="button" className="grantor-announcement-archive-btn" onClick={() => handleArchiveAnnouncement(item.id)} disabled={busy === `archive-announcement-${item.id}`}><HiOutlineTrash /> Archive</button>}
				</footer>
			</article>
		)
	}

	const handleGrantorProfileSave = async (event) => {
		event.preventDefault()
		if (!grantorId || profileSaving) return
		if (!grantorProfileForm.providerName.trim() || !grantorProfileForm.email.trim()) {
			toast.error("Display name and email address are required.")
			return
		}
		const minimumGwaValue = String(grantorProfileForm.minimumGwa || "").trim()
		if (minimumGwaValue && (Number.isNaN(Number(minimumGwaValue)) || Number(minimumGwaValue) < 1 || Number(minimumGwaValue) > 5)) {
			toast.error("Minimum GWA must be between 1.00 and 5.00.")
			return
		}

		setProfileSaving(true)
		try {
			const normalizedMinimumGwa = minimumGwaValue ? Number(minimumGwaValue) : null
			const payload = {
				providerName: grantorProfileForm.providerName.trim(),
				name: grantorProfileForm.providerName.trim(),
				grantorName: grantorProfileForm.providerName.trim(),
				organization: grantorProfileForm.organization.trim(),
				email: grantorProfileForm.email.trim(),
				cpNumber: grantorProfileForm.cpNumber.trim(),
				minimumGwa: normalizedMinimumGwa,
				minGwa: normalizedMinimumGwa,
				province: grantorProfileForm.province,
				city: grantorProfileForm.city,
				street: grantorProfileForm.street.trim(),
				postalCode: grantorProfileForm.postalCode.trim(),
				updatedAt: serverTimestamp(),
			}
			const changedFields = buildGrantorProfileChanges(profile, payload)
			if (changedFields.length === 0) {
				console.log("[BulsuScholar] Grantor profile save skipped because no visible fields changed.", {
					grantorId,
					payload,
				})
				toast.info("No profile changes to save.")
				return
			}
			const changeSummary = changedFields.length > 0
				? `Updated: ${changedFields.map((item) => item.label).join(", ")}.`
				: "No visible profile fields were changed."
			const profileResult = await updateGrantorProfileWorkflow({
				grantorId,
				data: payload,
				updatePortal: true,
				changedFields,
				changeSummary,
				notificationReason: "manual_profile_save",
			})
			console.log("[BulsuScholar] Grantor profile inbox notification created.", {
				reason: "manual profile save",
				grantorId,
				changedFields,
				notification: profileResult?.notification || null,
			})
			if (profileResult?.notification?.ok === false) {
				await setDoc(doc(db, "systemLogs", `profile_updated_${grantorId}_${Date.now()}`), {
					grantorId,
					source: "personal",
					type: "profile_updated",
					title: "Profile Updated",
					message: changeSummary,
					changedFields,
					changeSummary,
					authorName: payload.providerName,
					authorImageUrl: grantorProfileImageUrl,
					notificationFallbackTable: "systemLogs",
					read: false,
					createdAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				}, { merge: true })
			}
			setProfile((prev) => ({ ...(prev || {}), ...payload }))
			toast.success("Grantor profile updated.")
		} catch (error) {
			console.error("Unable to update grantor profile.", error)
			toast.error("Unable to update the profile right now.")
		} finally {
			setProfileSaving(false)
		}
	}

	const handleGrantorPhotoChange = async (event) => {
		const file = event.target.files?.[0]
		event.target.value = ""
		if (!file || !grantorId) return
		if (!String(file.type || "").startsWith("image/")) {
			toast.error("Profile photo must be an image file.")
			return
		}
		if (file.size > 5 * 1024 * 1024) {
			toast.error("Profile photo must be 5 MB or smaller.")
			return
		}

		setProfilePhotoUploading(true)
		try {
			const uploadResult = await uploadToStorage(file, { folder: `grantor-profiles/${grantorId}` })
			const payload = { profileImageUrl: uploadResult.url, updatedAt: serverTimestamp() }
			const changedFields = buildGrantorProfileChanges(profile, payload)
			const changeSummary = changedFields.length > 0
				? `Updated: ${changedFields.map((item) => item.label).join(", ")}.`
				: "No visible profile fields were changed."
			await updateGrantorProfileWorkflow({
				grantorId,
				data: payload,
				updatePortal: true,
				changedFields,
				changeSummary,
				notificationReason: "profile_photo_update",
			})
			console.log("[BulsuScholar] Grantor profile inbox notification created.", {
				reason: "profile photo update",
				grantorId,
				changedFields,
			})
			setProfile((prev) => ({ ...(prev || {}), profileImageUrl: uploadResult.url }))
			toast.success("Profile photo updated.")
		} catch (error) {
			console.error("Unable to upload grantor profile photo.", error)
			toast.error("Unable to upload the profile photo right now.")
		} finally {
			setProfilePhotoUploading(false)
		}
	}

	const passwordChangeRequestStatus = String(profile?.passwordChangeRequestStatus || "").toLowerCase()
	const canChangeGrantorPassword = passwordChangeRequestStatus === "approved"
	const passwordChangeRequestPending = passwordChangeRequestStatus === "pending" || profile?.passwordChangeRequested === true

	const handleGrantorPasswordAction = async () => {
		if (!grantorId || passwordRequestSubmitting || passwordChangeRequestPending) return
		if (canChangeGrantorPassword) {
			sessionStorage.setItem(GRANTOR_PASSWORD_CHANGE_ID_KEY, grantorId)
			navigate("/grantor/change-password")
			return
		}

		setPasswordRequestSubmitting(true)
		try {
			const passwordResult = await requestGrantorPasswordChangeWorkflow({
				grantorId,
				providerUpdate: {
					passwordChangeRequested: true,
					passwordChangeRequestStatus: "pending",
					passwordChangeRequestedAt: serverTimestamp(),
					passwordChangeApprovedAt: null,
					updatedAt: serverTimestamp(),
				},
				notification: {
					grantorId,
					type: "password_change_request",
					title: "Password Change Requested",
					message: "Your request was sent to the administrator and is awaiting approval.",
					authorName: grantorName,
					authorImageUrl: grantorProfileImageUrl,
					read: false,
					createdAt: serverTimestamp(),
				},
			})
			if (passwordResult?.notification?.ok === false) {
				await setDoc(doc(db, "systemLogs", `password_change_request_${grantorId}_${Date.now()}`), {
					grantorId,
					source: "personal",
					type: "password_change_request",
					title: "Password Change Requested",
					message: "Your request was sent to the administrator and is awaiting approval.",
					authorName: grantorName,
					authorImageUrl: grantorProfileImageUrl,
					notificationFallbackTable: "systemLogs",
					read: false,
					createdAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				}, { merge: true })
			}
			toast.success("Password change request sent to the administrator.")
		} catch (error) {
			console.error("Unable to request a password change.", error)
			toast.error("Unable to submit the password change request.")
		} finally {
			setPasswordRequestSubmitting(false)
		}
	}

	const markGrantorNotificationRead = async (notification) => {
		if (!notification?.id || notification.read === true) return
		try {
			const updateData = {
				read: true,
				readAt: serverTimestamp(),
			}
			if (notification.sourceTable === "systemLogs") {
				await setDoc(doc(db, "systemLogs", notification.id), updateData, { merge: true })
			} else {
				await updateGrantorNotification(notification.id, updateData)
			}
		} catch (error) {
			console.error("Unable to mark grantor notification as read.", error)
		}
	}

	const openGrantorNotificationDetail = async (notification) => {
		if (!notification) return
		setSelectedGrantorNotification({ ...notification, read: true })
		await markGrantorNotificationRead(notification)
	}

	const markAllGrantorNotificationsRead = async () => {
		if (unreadPersonalNotifications.length === 0) return
		try {
			await Promise.all(unreadPersonalNotifications.map((notification) =>
				notification.sourceTable === "systemLogs"
					? setDoc(doc(db, "systemLogs", notification.id), {
							read: true,
							readAt: serverTimestamp(),
						}, { merge: true })
					: updateGrantorNotification(notification.id, {
							read: true,
							readAt: serverTimestamp(),
						}),
			))
		} catch (error) {
			console.error("Unable to mark all grantor notifications as read.", error)
			toast.error("Unable to update all inbox messages.")
		}
	}

	const deleteGrantorNotification = async (notification) => {
		if (!notification?.id) return
		try {
			if (notification.sourceTable === "systemLogs") {
				await deleteDoc(doc(db, "systemLogs", notification.id))
			} else {
				await deleteGrantorNotificationRecord(notification.id)
			}
		} catch (error) {
			console.error("Unable to delete grantor notification.", error)
			toast.error("Unable to delete this inbox message.")
		}
	}

	if (!session.isProvider) return null

	return (
		<div className={`grantor-portal ${theme === "dark" ? "grantor-portal--dark" : ""}`}>
			<header className="grantor-topbar">
				<Link to="/provider-dashboard/dashboard" className="grantor-topbar-brand" aria-label="Go to grantor dashboard">
					<img src={logo2} alt="" />
					<div>
						<strong>BulsuScholar</strong>
						<span>Grantor Portal</span>
					</div>
				</Link>
				<div className="grantor-topbar-actions">
					<Link to="/provider-dashboard/inbox" className="grantor-notification-btn" aria-label="Open personal inbox">
						<HiOutlineInbox />
						{unreadPersonalNotifications.length > 0 ? <span>{unreadPersonalNotifications.length > 99 ? "99+" : unreadPersonalNotifications.length}</span> : null}
					</Link>
					<div className="grantor-account" ref={profileMenuRef}>
						<button type="button" className="grantor-account-btn" onClick={() => setProfileMenuOpen((open) => !open)} aria-label="Open grantor account menu" aria-expanded={profileMenuOpen} aria-haspopup="menu">
							<span className="grantor-account-avatar">{grantorProfileImageUrl ? <img src={grantorProfileImageUrl} alt="" /> : grantorInitials}</span>
							<HiOutlineMenu className="grantor-account-menu-icon" aria-hidden="true" />
						</button>
						{profileMenuOpen ? (
							<div className="grantor-account-menu" role="menu">
								<div className="grantor-account-card">
									<span className="grantor-account-avatar grantor-account-avatar--large">{grantorProfileImageUrl ? <img src={grantorProfileImageUrl} alt="" /> : grantorInitials}</span>
									<div><strong>{grantorName}</strong><p>{profile?.email || "Grantor account"}</p></div>
								</div>
								<nav className="grantor-account-links">
									<Link to="/provider-dashboard/profile" onClick={() => setProfileMenuOpen(false)}><HiOutlineUserGroup /> My Profile</Link>
								</nav>
								<div className="grantor-account-theme">
									<span>Theme</span>
									<div>
										<button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}><HiOutlineSun /> Light</button>
										<button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}><HiOutlineMoon /> Dark</button>
									</div>
								</div>
								<button type="button" className="grantor-account-logout" onClick={() => { sessionStorage.removeItem("bulsuscholar_userId"); sessionStorage.removeItem("bulsuscholar_userType"); navigate("/", { replace: true }) }}><HiOutlineLogout /> Logout</button>
							</div>
						) : null}
					</div>
				</div>
			</header>
			<aside className="grantor-sidebar">
				<span className="grantor-sidebar-label">Workspace</span>
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
			</aside>

			<main className={`grantor-workspace ${activeSection === "scholars" ? "grantor-workspace--scholars" : ""} ${activeSection === "profile" ? "grantor-workspace--profile" : ""}`}>
				{activeSection === "profile" ? (
					<section className="grantor-profile-page">
						<header className="grantor-profile-page-head">
							<div><span>Account Settings</span><h2>Grantor Profile</h2><p>Manage your public details, contact information, and account security.</p></div>
						</header>
						<div className="grantor-profile-layout">
							<aside className="grantor-profile-identity">
								<button type="button" className="grantor-profile-photo" onClick={() => profilePhotoInputRef.current?.click()} disabled={profilePhotoUploading} aria-label="Change profile photo">
									{grantorProfileImageUrl ? <img src={grantorProfileImageUrl} alt={`${grantorName} profile`} /> : <span>{grantorInitials}</span>}
									<i><HiOutlineCamera /></i>
								</button>
								<input ref={profilePhotoInputRef} type="file" accept="image/*" onChange={handleGrantorPhotoChange} hidden />
								<h3>{grantorName}</h3>
								<p>{profile?.email || "Grantor account"}</p>
								<div className="grantor-profile-account-meta">
									<div><small>Account ID</small><strong>{grantorId}</strong></div>
									<div className="grantor-profile-apply-control">
										<span><small>Applications</small><strong>{applicationsBlocked ? "Apply Closed" : "Apply Open"}</strong></span>
										<button
											type="button"
											className={`grantor-profile-switch ${applicationsBlocked ? "" : "active"}`}
											role="switch"
											aria-checked={!applicationsBlocked}
											aria-label={applicationsBlocked ? "Open scholarship applications" : "Close scholarship applications"}
											onClick={toggleApplicationsBlocked}
											disabled={busy === "portal_toggle"}
										>
											<i />
										</button>
									</div>
									<button type="button" className="grantor-profile-password-btn" onClick={handleGrantorPasswordAction} disabled={passwordRequestSubmitting || passwordChangeRequestPending}>
										<HiOutlineLockClosed />
										{passwordRequestSubmitting ? "Sending Request..." : passwordChangeRequestPending ? "Request Pending" : canChangeGrantorPassword ? "Reset Password" : "Request to Change Password"}
									</button>
								</div>
							</aside>
							<form className="grantor-profile-form" onSubmit={handleGrantorProfileSave}>
								<section>
									<div className="grantor-profile-section-head"><HiOutlineUserGroup /><div><h3>Organization Details</h3><p>Information shown throughout the grantor portal.</p></div></div>
									<div className="grantor-profile-form-grid">
										<label><span>Display Name</span><input type="text" value={grantorProfileForm.providerName} onChange={(event) => setGrantorProfileForm((prev) => ({ ...prev, providerName: event.target.value }))} placeholder="Grantor or representative name" /></label>
										<label><span>Organization</span><input type="text" value={grantorProfileForm.organization} onChange={(event) => setGrantorProfileForm((prev) => ({ ...prev, organization: event.target.value }))} placeholder="Foundation, office, or organization" /></label>
										<label><span>Email Address</span><input type="email" value={grantorProfileForm.email} onChange={(event) => setGrantorProfileForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="grantor@email.com" /></label>
										<label><span>Contact Number</span><input type="text" value={grantorProfileForm.cpNumber} onChange={(event) => setGrantorProfileForm((prev) => ({ ...prev, cpNumber: event.target.value }))} placeholder="e.g. 0917 123 4567" /></label>
										<label><span>Minimum GWA to Apply</span><input type="number" min="1" max="5" step="0.01" value={grantorProfileForm.minimumGwa} onChange={(event) => setGrantorProfileForm((prev) => ({ ...prev, minimumGwa: event.target.value }))} placeholder="Example: 2.25" /></label>
									</div>
								</section>
								<section>
									<div className="grantor-profile-section-head"><HiOutlineLocationMarker /><div><h3>Address</h3><p>Office or organization mailing address.</p></div></div>
									<div className="grantor-profile-form-grid">
										<label><span>Province</span><select value={grantorProfileForm.province} onChange={(event) => setGrantorProfileForm((prev) => ({ ...prev, province: event.target.value, city: "" }))}><option value="">Select province</option>{grantorProfileForm.province && !PROVINCES.includes(grantorProfileForm.province) ? <option value={grantorProfileForm.province}>{grantorProfileForm.province}</option> : null}{PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}</select></label>
										<label><span>City / Municipality</span><select value={grantorProfileForm.city} disabled={!grantorProfileForm.province} onChange={(event) => setGrantorProfileForm((prev) => ({ ...prev, city: event.target.value }))}><option value="">Select city or municipality</option>{grantorProfileForm.city && !grantorProfileCities.includes(grantorProfileForm.city) ? <option value={grantorProfileForm.city}>{grantorProfileForm.city}</option> : null}{grantorProfileCities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
										<label><span>Street / Subdivision</span><input type="text" value={grantorProfileForm.street} onChange={(event) => setGrantorProfileForm((prev) => ({ ...prev, street: event.target.value }))} placeholder="House number, street, or subdivision" /></label>
										<label><span>Postal Code</span><input type="text" value={grantorProfileForm.postalCode} onChange={(event) => setGrantorProfileForm((prev) => ({ ...prev, postalCode: event.target.value }))} placeholder="e.g. 3000" /></label>
									</div>
								</section>
								<div className="grantor-profile-form-actions"><button type="submit" className="grantor-action-btn grantor-action-btn--primary" disabled={profileSaving}><HiOutlineSave /> {profileSaving ? "Saving..." : "Save Changes"}</button></div>
							</form>
						</div>
					</section>
				) : null}
				{activeSection === "dashboard" ? (
					<section className="grantor-dashboard">
						<div className="grantor-dashboard-head">
							<div>
								<span className="grantor-dashboard-eyebrow">Grantor Overview</span>
								<h2>{grantorName || "Grantor Dashboard"}</h2>
								<p>Track roster activity, application volume, and year-level distribution from one focused workspace.</p>
							</div>
							<div className="grantor-dashboard-summary">
								<span>Provider Type</span>
								<strong>{grantorProviderType ? grantorProviderType.replace(/_/g, " ") : "Grantor"}</strong>
								<p>{dashboardInsights.activeRate}% Active Roster</p>
							</div>
						</div>
						<section className="grantor-quick-strip" aria-label="Grantor workflow highlights">
							<div className="grantor-quick-card grantor-quick-card--status">
								<span>Application Status</span>
								<strong>{applicationsBlocked ? "Apply Closed" : "Apply Open"}</strong>
								<p>{applicationsBlocked ? "Student applications are currently paused." : "Students can submit matched applications."}</p>
							</div>
							<div className="grantor-quick-card grantor-quick-card--review">
								<span>Needs Review</span>
								<strong>{dashboardInsights.pendingApplications}</strong>
								<p>Pending or review-stage applications.</p>
							</div>
							<div className="grantor-quick-card grantor-quick-card--announcement">
								<span>Latest Announcement</span>
								<strong>{dashboardInsights.latestAnnouncement?.title || "No Announcement Yet"}</strong>
								<p>{dashboardInsights.latestAnnouncement ? formatDateTime(dashboardInsights.latestAnnouncement.createdAt) : "Publish an update from the announcements tab."}</p>
							</div>
						</section>
						<section className="grantor-metric-grid">
							{[
								{ id: "active", label: "Active Scholars", value: activeScholars.length, description: "Current roster", icon: HiOutlineUsers },
								{ id: "applications", label: "Applications", value: applications.length, description: "Matched submissions", icon: HiOutlineDocumentText },
								{ id: "archive", label: "Archived Records", value: archivedScholars.length, description: "Historical roster", icon: HiOutlineChartBar },
							].map((card) => {
								const Icon = card.icon
								return (
									<article key={card.label} className={`grantor-metric-card grantor-metric-card--${card.id}`}>
										<div className="grantor-metric-card__icon"><Icon /></div>
										<div>
											<span>{card.label}</span>
											<strong>{card.value}</strong>
											<p>{card.description}</p>
										</div>
									</article>
								)
							})}
						</section>
						<section className="grantor-dashboard-grid">
							<article className="grantor-dashboard-card grantor-dashboard-card--wide">
								<div className="grantor-dashboard-card__head">
									<div>
										<h3>Scholar Movement</h3>
										<p>Roster movement across the selected reporting window.</p>
									</div>
									<div className="grantor-range-control">
										{RANGES.map((item) => (
											<button key={item} type="button" className={range === item ? "active" : ""} onClick={() => setRange(item)}>
												{item[0].toUpperCase() + item.slice(1)}
											</button>
										))}
									</div>
								</div>
								<div className="grantor-chart-insights">
									<span>Latest Point <b>{dashboardInsights.latestTrendValue}</b></span>
									<span>Periods Shown <b>{trendSeries.labels.length}</b></span>
									<span>Total Records <b>{dashboardInsights.totalRecords}</b></span>
								</div>
								<div className="grantor-chart-wrap grantor-chart-wrap--line">
									<Line data={lineData} options={lineOptions} />
								</div>
							</article>
							<article className="grantor-dashboard-card">
								<div className="grantor-dashboard-card__head">
									<div>
										<h3>Year Level Mix</h3>
										<p>Distribution of active scholars by year level.</p>
									</div>
									{dashboardInsights.topYear ? (
										<span className="grantor-card-badge">{dashboardInsights.topYear.label}</span>
									) : null}
								</div>
								<div className="grantor-distribution">
									<div className="grantor-chart-wrap grantor-chart-wrap--donut">
										<Doughnut data={pieData} options={pieOptions} />
										<div className="grantor-distribution-note">
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
												<i style={{ width: `${activeScholars.length > 0 ? Math.max(8, (row.value / activeScholars.length) * 100) : 8}%` }} />
											</p>
										))}
									</div>
								</div>
							</article>
							<article className="grantor-dashboard-card grantor-dashboard-card--note">
								<div className="grantor-dashboard-card__head">
									<div>
										<h3>Workspace Status</h3>
										<p>Current operational summary.</p>
									</div>
								</div>
								<div className="grantor-note-card__body">
									<strong>{activeScholars.length + archivedScholars.length} Total Records</strong>
									<p>Your active roster and archived records are separated for cleaner review, while applications remain visible in their own workflow.</p>
									<div className="grantor-progress-ring" style={{ "--grantor-progress": `${dashboardInsights.activeRate}%` }}>
										<span>{dashboardInsights.activeRate}%</span>
										<p>Active</p>
									</div>
									<div className="grantor-status-list">
										<span><b>{activeScholars.length}</b> Active Scholars</span>
										<span><b>{applications.length}</b> Applications</span>
										<span><b>{announcements.length}</b> Announcements</span>
									</div>
								</div>
							</article>
						</section>
					</section>
				) : null}

				{activeSection === "scholars" ? (
					<section className="admin-management-panel grantor-scholars-panel">
						<div className="admin-panel-head">
							<div className="grantor-panel-heading">
								<div className="grantor-panel-intro">
									<div className="grantor-panel-icon" aria-hidden="true"><HiOutlineUserGroup /></div>
									<div>
										<h2>Scholars</h2>
										<p className="admin-panel-copy">Manage active and archived scholars in this grantor workspace.</p>
									</div>
								</div>
								<div className="grantor-panel-overview" aria-label="Scholar roster overview">
									<div className="grantor-panel-stat">
										<HiOutlineUsers aria-hidden="true" />
										<div><span>Active Scholars</span><strong>{activeScholars.length}</strong></div>
									</div>
									<div className="grantor-panel-stat">
										<HiOutlineChartBar aria-hidden="true" />
										<div><span>Archived Records</span><strong>{archivedScholars.length}</strong></div>
									</div>
									<div className="grantor-panel-stat grantor-panel-stat--progress">
										<HiOutlineDocumentText aria-hidden="true" />
										<div>
											<span>Active Roster</span><strong>{dashboardInsights.activeRate}%</strong>
											<i><b style={{ width: `${dashboardInsights.activeRate}%` }} /></i>
										</div>
									</div>
									<div className="grantor-panel-stat">
										<HiOutlineRefresh aria-hidden="true" />
										<div><span>Latest Scholar Added</span><strong>{formatRelativeDate(latestScholarAddedAt)}</strong></div>
									</div>
								</div>
							</div>
						</div>
						<div className="grantor-scholar-tabs-row">
							<ScholarTabs value={tab} onChange={setTab} />
							<div className="grantor-toolbar-actions">
								<button
									type="button"
									className={`grantor-action-btn ${tab === "archived" ? "grantor-action-btn--primary" : "grantor-action-btn--danger"}`}
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
								<button type="button" className="grantor-action-btn grantor-action-btn--primary" onClick={openEditModal}><HiOutlineRefresh /> Edit</button>
								<button type="button" className="grantor-action-btn grantor-action-btn--primary" onClick={() => setShowCreateModal(true)}><HiOutlineCloudUpload /> Add</button>
							</div>
						</div>
						<div className="admin-filter-bar">
							<label className="grantor-search-field">
								<HiOutlineSearch aria-hidden="true" />
								<input type="text" aria-label="Search scholars" placeholder="Search scholar ID, name, or course" value={scholarSearch} onChange={(event) => setScholarSearch(event.target.value)} />
							</label>
							<select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
								<option value="All">All Year Levels</option>
								{YEAR_LEVELS.map((level) => <option key={level} value={level}>Year {level}</option>)}
							</select>
						</div>
						<div className="admin-table-wrap">
							<table className="admin-management-table admin-management-table--roomy grantor-scholar-table">
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
									<tr key={scholar.id} className={[selectedScholarId === scholar.id ? "grantor-row-selected" : "", scholar.scholarshipConflictWarning || scholar.duplicateScholarshipWarning || scholar.duplicateScholarshipDetected ? "grantor-row-warning" : ""].filter(Boolean).join(" ")} onClick={() => setSelectedScholarId(scholar.id)}>
											<td className="grantor-checkbox-col" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedScholarIds.includes(scholar.id)} onChange={() => setSelectedScholarIds((prev) => prev.includes(scholar.id) ? prev.filter((id) => id !== scholar.id) : [...prev, scholar.id])} /></td>
											<td>{scholar.studentId || "-"}</td><td><span className="grantor-scholar-name">{scholar.fullName}</span>{scholar.addedByAdmin || scholar.addedBy === "admin" ? <small className="grantor-roster-source">Added by admin</small> : null}</td><td>{scholar.course || "-"}</td><td>{scholar.yearLevel || "-"}</td><td><span className={statusClass(scholar.status)}>{scholar.status}</span></td><td>{formatRelativeDate(scholar.updatedAt || scholar.createdAt)}</td>
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
					<section className="grantor-applications-panel">
						<header className="grantor-applications-head">
							<div className="grantor-applications-title"><span><HiOutlineDocumentText /></span><div><h2>Applications</h2><p>Review student submissions and continue scholarship processing.</p></div></div>
							<div className="grantor-applications-availability">
								<div><small>Student Applications</small><strong>{applicationsBlocked ? "Closed" : "Open"}</strong></div>
								<button type="button" className={`grantor-profile-switch ${applicationsBlocked ? "" : "active"}`} role="switch" aria-checked={!applicationsBlocked} onClick={toggleApplicationsBlocked} disabled={busy === "portal_toggle"} aria-label={applicationsBlocked ? "Open applications" : "Close applications"}><i /></button>
							</div>
						</header>
						<div className="grantor-applications-summary">
							<div><HiOutlineDocumentText /><span>Total Applications</span><strong>{applicationInsights.total}</strong></div>
							<div><HiOutlineRefresh /><span>Needs Review</span><strong>{applicationInsights.pending}</strong></div>
							<div><HiCheck /><span>Approved</span><strong>{applicationInsights.approved}</strong></div>
							<div><HiOutlineInbox /><span>Rejected / Archived</span><strong>{applicationInsights.rejected}</strong></div>
						</div>
						<div className="grantor-applications-toolbar">
							<div className="grantor-application-tabs" aria-label="Application record tabs">
								<button type="button" className={applicationArchiveTab === "active" ? "active" : ""} onClick={() => { setApplicationArchiveTab("active"); setApplicationStatusFilter("All") }}>Active <span>{activeApplications.length}</span></button>
								<button type="button" className={applicationArchiveTab === "rejected" ? "active" : ""} onClick={() => { setApplicationArchiveTab("rejected"); setApplicationStatusFilter("All") }}>Rejected <span>{rejectedApplications.length}</span></button>
							</div>
						</div>
						<div className="grantor-applications-filters">
							<label className="grantor-search-field"><HiOutlineSearch /><input type="text" aria-label="Search applications" placeholder="Search applicant, ID, application number, or scholarship" value={applicationSearch} onChange={(event) => setApplicationSearch(event.target.value)} /></label>
							<select aria-label="Filter applications by status" value={applicationStatusFilter} onChange={(event) => setApplicationStatusFilter(event.target.value)}><option value="All">All Statuses</option>{applicationStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select>
						</div>
						<div className="admin-table-wrap grantor-applications-table-wrap">
							<table className="admin-management-table grantor-applications-table">
								<thead><tr><th>Student ID</th><th>Applicant</th><th>Application No.</th><th>GWA</th><th>Current Step</th><th>Status</th><th>Applied On</th><th>Action</th></tr></thead>
								<tbody>
									{visibleApplications.length === 0 ? <EmptyRow colSpan={8} message="No applications matched this grantor profile yet." /> : visibleApplicationsPage.rows.map((row) => (
										<tr key={row.id}>
											<td>{row.studentId || "-"}</td>
											<td>{row.fullName || "Applicant"}</td>
											<td>{row.applicationNumber || row.requestNumber || row.id}</td>
											<td>{row.gwa || "-"}</td>
											<td>{row.currentStep || "-"}</td>
											<td><span className={statusClass(row.status)}>{row.status}</span></td>
											<td>{formatRelativeDate(row.appliedAt || row.createdAt)}</td>
											<td>
												<button
													type="button"
													className="grantor-application-view-btn"
													onClick={() => openApplicationModal(row)}
												>
													<HiOutlineEye /> Review
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
							onPageChange={(page) => setTablePage(`grantor_applications_${applicationArchiveTab}`, page)}
						/>
					</section>
				) : null}

				{activeSection === "announcements" ? (
					<section className="grantor-announcements-panel">
						<header className="grantor-announcements-head">
							<div className="grantor-announcements-title"><span><HiOutlineBell /></span><div><h2>Announcements</h2><p>Publish scholarship notices and application updates for students.</p></div></div>
							<button type="button" className="grantor-create-announcement-btn" onClick={() => setShowCreateAnnouncementModal(true)}><HiOutlineCloudUpload /> Create Announcement</button>
						</header>
						{showAllAnnouncements ? (
							<section className="grantor-announcement-history is-all-view">
								<header>
									<div>
										<h3>All Announcements</h3>
										<p>Review active and archived announcements separately.</p>
									</div>
									<div className="grantor-announcement-history-actions">
										<span>{announcements.length} total</span>
										<button type="button" onClick={() => setShowAllAnnouncements(false)}><HiChevronLeft /> Back</button>
									</div>
								</header>
								<div className="grantor-announcement-tabs">
									<button type="button" className={allAnnouncementTab === "announcements" ? "active" : ""} onClick={() => setAllAnnouncementTab("announcements")}>Announcements <span>{publishedAnnouncements.length}</span></button>
									<button type="button" className={allAnnouncementTab === "archived" ? "active" : ""} onClick={() => setAllAnnouncementTab("archived")}>Archived <span>{archivedAnnouncements.length}</span></button>
								</div>
								<div className="grantor-announcement-card-grid">
									{allAnnouncementRows.length === 0 ? (
										<div className="grantor-announcement-empty"><HiOutlineBell /><strong>No {allAnnouncementTab === "archived" ? "archived" : "active"} announcements yet.</strong><p>Announcements in this tab will appear here.</p></div>
									) : allAnnouncementRows.map(renderAnnouncementCard)}
								</div>
							</section>
						) : (
							<>
								{showCreateAnnouncementModal ? (
									<div className="admin-detail-backdrop grantor-announcement-modal-backdrop" role="presentation" onClick={closeCreateAnnouncementModal}>
								<section className="grantor-announcement-composer grantor-announcement-composer--modal" role="dialog" aria-modal="true" aria-label="Create announcement" onClick={(event) => event.stopPropagation()}>
									<header><div><h3>Create Announcement</h3><p>Share deadlines, requirements, and scholarship availability.</p></div><button type="button" onClick={closeCreateAnnouncementModal} aria-label="Close create announcement"><HiX /></button></header>
									<form className="grantor-announcement-compose-form" onSubmit={handlePostAnnouncement}>
										<div className="grantor-announcement-application-toggle">
											<div>
												<strong>Open for Applications</strong>
												<p>{announcementForm.applicationEnabled ? "Students can apply from this announcement." : "This post is for announcement only."}</p>
											</div>
											<button
												type="button"
												className={`grantor-profile-switch ${announcementForm.applicationEnabled ? "active" : ""}`}
												role="switch"
												aria-checked={announcementForm.applicationEnabled}
												onClick={() => {
													setAnnouncementForm((prev) => ({
														...prev,
														applicationEnabled: !prev.applicationEnabled,
														applicationWindow: prev.applicationEnabled ? "" : prev.applicationWindow,
														minimumGrade: prev.applicationEnabled
															? ""
															: prev.minimumGrade || grantorProfileForm.minimumGwa || profile?.minimumGwa || profile?.minGwa || "",
													}))
													if (announcementForm.applicationEnabled) {
														setAnnouncementWindowStart("")
														setAnnouncementWindowEnd("")
													}
												}}
											>
												<i />
											</button>
										</div>
										<div className="grantor-announcement-compose-grid">
											<label><span>Announcement Title</span><input type="text" className={announcementSubmitAttempted && announcementMissingFields.title ? "is-missing" : ""} placeholder="Enter announcement title" value={announcementForm.title} onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, title: event.target.value }))} /></label>
											<label><span>Subtitle</span><input type="text" placeholder="Add a short supporting line" value={announcementForm.subtitle} onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, subtitle: event.target.value }))} /></label>
											{announcementForm.applicationEnabled ? (
												<>
													<label><span>Application Window</span><button type="button" className={`grantor-announcement-calendar-btn ${announcementWindowStart ? "has-value" : ""} ${announcementSubmitAttempted && announcementMissingFields.applicationWindow ? "is-missing" : ""}`.trim()} onClick={() => setShowApplicationWindowCalendar(true)}><HiOutlineCalendar /> <span>{formatAnnouncementWindow(announcementWindowStart, announcementWindowEnd)}</span></button></label>
													<label><span>Minimum Grade / GWA</span><input type="number" min="1" max="5" step="0.01" className={announcementSubmitAttempted && announcementMissingFields.minimumGrade ? "is-missing" : ""} placeholder="Example: 2.25" value={announcementForm.minimumGrade} onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, minimumGrade: event.target.value }))} /></label>
													<div className="grantor-announcement-requirements">
														<span>Required Documents</span>
														<div>
															<label><input type="checkbox" checked={announcementForm.requiredDocuments?.cog === true} onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, requiredDocuments: { ...(prev.requiredDocuments || {}), cog: event.target.checked } }))} /> <span>COG</span></label>
															<label><input type="checkbox" checked={announcementForm.requiredDocuments?.cor === true} onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, requiredDocuments: { ...(prev.requiredDocuments || {}), cor: event.target.checked } }))} /> <span>COR</span></label>
															<label><input type="checkbox" checked={announcementForm.requiredDocuments?.applicationForm === true} onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, requiredDocuments: { ...(prev.requiredDocuments || {}), applicationForm: event.target.checked } }))} /> <span>Application Form</span></label>
														</div>
													</div>
													<div className="grantor-announcement-other-requirements">
														<button type="button" className="grantor-announcement-other-add" onClick={addAnnouncementRequirement} disabled={Array.isArray(announcementForm.otherRequirements) && announcementForm.otherRequirements.some((item) => item.confirmed !== true)}>Other Requirement</button>
														{Array.isArray(announcementForm.otherRequirements) && announcementForm.otherRequirements.length > 0 ? (
															<div className="grantor-announcement-other-list">
																{announcementForm.otherRequirements.map((requirement, index) =>
																	requirement.confirmed === true ? (
																		<div className="grantor-announcement-other-confirmed-row" key={`other_requirement_${index}`}>
																			<div>
																				<strong>{index + 1}: {String(requirement.name || "").trim()}</strong>
																				<span>{String(requirement.fileType || "pdf").toUpperCase()} | {Number(requirement.uploadCount || 1)} upload{Number(requirement.uploadCount || 1) === 1 ? "" : "s"} needed</span>
																			</div>
																			<button type="button" onClick={() => editAnnouncementRequirement(index)} aria-label={`Edit ${requirement.name || "other requirement"}`} title="Edit">
																				<HiOutlinePencil />
																			</button>
																			<button type="button" onClick={() => removeAnnouncementRequirement(index)} aria-label={`Delete ${requirement.name || "other requirement"}`} title="Delete">
																				<HiOutlineTrash />
																			</button>
																		</div>
																	) : (
																		<div className="grantor-announcement-other-row" key={`other_requirement_${index}`}>
																			<label><span>Requirement Name</span><input type="text" className={announcementSubmitAttempted && (!String(requirement.name || "").trim() || requirement.confirmed !== true) ? "is-missing" : ""} value={requirement.name || ""} onChange={(event) => updateAnnouncementRequirement(index, "name", event.target.value)} placeholder="Example: Barangay Clearance" /></label>
																			<label><span>Type</span><select value={requirement.fileType || "pdf"} onChange={(event) => updateAnnouncementRequirement(index, "fileType", event.target.value)}><option value="pdf">PDF</option><option value="png">PNG</option></select></label>
																			<label><span>Uploads Needed</span><input type="number" min="1" step="1" value={requirement.uploadCount || 1} onChange={(event) => updateAnnouncementRequirement(index, "uploadCount", event.target.value)} /></label>
																			<button type="button" className="grantor-announcement-other-confirm" onClick={() => confirmAnnouncementRequirement(index)} aria-label="Confirm other requirement" title="Confirm"><HiCheck /></button>
																			<button type="button" onClick={() => removeAnnouncementRequirement(index)} aria-label="Delete other requirement" title="Delete"><HiOutlineTrash /></button>
																		</div>
																	),
																)}
															</div>
														) : null}
													</div>
												</>
											) : null}
										</div>
										<label className="grantor-announcement-message"><span>Message</span><textarea className={announcementSubmitAttempted && announcementMissingFields.description ? "is-missing" : ""} placeholder="Describe the scholarship opening, deadlines, requirements, and next steps." value={announcementForm.description} onChange={(event) => setAnnouncementForm((prev) => ({ ...prev, description: event.target.value }))} /></label>
										<div className="grantor-announcement-images">
											<input id="grantor-announcement-images" type="file" accept="image/*" multiple onChange={handleAnnouncementImageSelect} disabled={announcementImageFiles.length >= 5 || busy === "announcement"} />
											<label htmlFor="grantor-announcement-images" className={announcementImageFiles.length >= 5 ? "is-disabled" : ""}>
												<HiOutlineCamera />
												<span>Add Images</span>
												<small>{announcementImageFiles.length}/5 selected</small>
											</label>
											{announcementImagePreviews.length > 0 ? (
												<div className="grantor-announcement-preview-grid">
													{announcementImagePreviews.map((item, index) => (
														<article key={`${item.name}_${index}`} className="grantor-announcement-preview-card">
															<button type="button" className="grantor-announcement-preview-open" onClick={() => openAnnouncementImagePreview(item.url)} aria-label={`Preview ${item.name || "announcement image"}`}>
																<img src={item.url} alt={item.name || "Announcement preview"} />
															</button>
															<button type="button" className="grantor-announcement-preview-remove" onClick={() => removeAnnouncementImage(index)} aria-label={`Remove ${item.name || "image"}`}>
																<HiX />
															</button>
														</article>
													))}
												</div>
											) : null}
										</div>
										<div className="grantor-announcement-compose-actions"><small>{announcementForm.applicationEnabled ? "Students can apply from this announcement." : "This announcement will be visible to students only as a notice."}</small><button type="submit" disabled={busy === "announcement"}><HiOutlineCloudUpload /> {busy === "announcement" ? "Publishing..." : "Publish Announcement"}</button></div>
									</form>
								</section>
									</div>
								) : null}
								<section className="grantor-announcement-history">
									<header>
										<div>
											<h3>Published Announcements</h3>
											<p>Showing the latest 6 published announcements.</p>
										</div>
										<div className="grantor-announcement-history-actions">
											<span>{publishedAnnouncements.length} total</span>
											{shouldShowAllAnnouncementsButton ? <button type="button" onClick={() => { setAllAnnouncementTab("announcements"); setShowAllAnnouncements(true) }}>See all Announcements</button> : null}
										</div>
									</header>
									<div className="grantor-announcement-card-grid">
										{compactAnnouncements.length === 0 ? (
											<div className="grantor-announcement-empty"><HiOutlineBell /><strong>No announcements published yet.</strong><p>Your published notices will appear here.</p></div>
										) : compactAnnouncements.map(renderAnnouncementCard)}
									</div>
								</section>
							</>
						)}
					</section>
				) : null}

				{activeSection === "inbox" ? (
					<section className="grantor-inbox-panel">
						<header className="grantor-inbox-head">
							<div className="grantor-inbox-title"><h2>Messages</h2>{unreadPersonalNotifications.length > 0 ? <span>{unreadPersonalNotifications.length}</span> : null}</div>
							<div className="grantor-inbox-actions">
								<button type="button" className="grantor-inbox-tab active"><HiOutlineInbox /> Notifications</button>
								<button type="button" className="grantor-inbox-mark-read" onClick={markAllGrantorNotificationsRead} disabled={unreadPersonalNotifications.length === 0}>Mark all read</button>
							</div>
						</header>
						<div className="grantor-inbox-list">
							{personalNotifications.length === 0 ? (
								<div className="admin-empty-state-card"><HiOutlineInbox /><strong>Your inbox is empty.</strong></div>
							) : groupedPersonalNotifications.map((group) => (
								<section key={group.category} className="grantor-inbox-group">
									<header><span><HiOutlineCheckCircle />{group.category}</span><small>{group.items.length} {group.items.length === 1 ? "notification" : "notifications"}</small></header>
									{group.items.map((notification) => (
										<article key={notification.id} className={`grantor-inbox-item ${notification.read === true ? "" : "unread"}`}>
											<button type="button" className="grantor-inbox-item-main" onClick={() => openGrantorNotificationDetail(notification)}>
												<span className="grantor-inbox-item-icon"><HiOutlineLockClosed /></span>
												<span className="grantor-inbox-item-copy"><strong>{notification.title || "Account Update"}</strong><small>{notification.message || "You have a new account notification."}</small></span>
											</button>
											<div className="grantor-inbox-item-actions"><time>{formatRelativeDate(notification.createdAt)}</time><button type="button" onClick={() => deleteGrantorNotification(notification)} aria-label="Delete notification"><HiOutlineTrash /></button>{notification.read !== true ? <i aria-label="Unread" /> : <HiCheck className="grantor-inbox-read-check" aria-label="Read" />}</div>
										</article>
									))}
								</section>
							))}
						</div>
					</section>
				) : null}
			</main>
			{selectedGrantorNotification ? (
				<div className="grantor-inbox-detail-backdrop" role="presentation" onClick={() => setSelectedGrantorNotification(null)}>
					<section className="grantor-inbox-detail-modal" role="dialog" aria-modal="true" aria-label="Inbox message details" onClick={(event) => event.stopPropagation()}>
						<header className="grantor-inbox-detail-head">
							<div className="grantor-inbox-detail-title">
								<span className="grantor-inbox-detail-icon"><HiOutlineInbox /></span>
								<div>
									<span>{getGrantorNotificationCategory(selectedGrantorNotification)}</span>
									<h3>{selectedGrantorNotification.title || "Inbox Message"}</h3>
								</div>
							</div>
							<button type="button" onClick={() => setSelectedGrantorNotification(null)} aria-label="Close inbox message"><HiX /></button>
						</header>
						<div className="grantor-inbox-detail-meta">
							<p><span>Received</span><strong>{formatDateTime(selectedGrantorNotification.createdAt || selectedGrantorNotification.created_at)}</strong></p>
							<p><span>Status</span><strong>{selectedGrantorNotification.read === true ? "Read" : "Unread"}</strong></p>
							{selectedGrantorNotification.readAt || selectedGrantorNotification.read_at ? (
								<p><span>Read At</span><strong>{formatDateTime(selectedGrantorNotification.readAt || selectedGrantorNotification.read_at)}</strong></p>
							) : null}
							<p><span>Type</span><strong>{formatNotificationDetailLabel(selectedGrantorNotification.type || "Notification")}</strong></p>
						</div>
						<div className="grantor-inbox-detail-message">
							<span>Full Message</span>
							<p>{selectedGrantorNotification.message || "No message content was provided for this inbox item."}</p>
						</div>
						{Array.isArray(selectedGrantorNotification.changedFields) && selectedGrantorNotification.changedFields.length > 0 ? (
							<div className="grantor-inbox-change-list">
								<span>Changes Made</span>
								{selectedGrantorNotification.changedFields.map((change, index) => (
									<article key={`${change.field || change.label || "change"}_${index}`}>
										<strong>{change.label || formatNotificationDetailLabel(change.field || `Change ${index + 1}`)}</strong>
										<p><span>From</span><b>{formatNotificationDetailValue(change.from)}</b></p>
										<p><span>To</span><b>{formatNotificationDetailValue(change.to)}</b></p>
									</article>
								))}
							</div>
						) : null}
						{selectedGrantorNotificationDetails.length > 0 ? (
							<div className="grantor-inbox-detail-grid">
								{selectedGrantorNotificationDetails.map((item) => (
									<p key={item.label}>
										<span>{item.label}</span>
										<strong>{item.value}</strong>
									</p>
								))}
							</div>
						) : null}
						<footer className="grantor-inbox-detail-actions">
							<button type="button" className="grantor-inbox-detail-delete" onClick={async () => { await deleteGrantorNotification(selectedGrantorNotification); setSelectedGrantorNotification(null) }}>
								<HiOutlineTrash /> Delete Message
							</button>
							<button type="button" className="grantor-inbox-detail-close" onClick={() => setSelectedGrantorNotification(null)}>
								Close
							</button>
						</footer>
					</section>
				</div>
			) : null}
			{selectedAnnouncement ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={() => setSelectedAnnouncement(null)}>
					<section className="grantor-announcement-view-modal" role="dialog" aria-modal="true" aria-label="Announcement details" onClick={(event) => event.stopPropagation()}>
						<header>
							<div>
								<span className={`grantor-announcement-status ${isAnnouncementArchived(selectedAnnouncement) ? "is-archived" : ""}`}>
									{isAnnouncementArchived(selectedAnnouncement) ? "Archived" : selectedAnnouncement.status || "Open"}
								</span>
								<h3>{selectedAnnouncement.title || "Announcement"}</h3>
								<p>{selectedAnnouncement.subtitle || "Scholarship application notice"}</p>
							</div>
							<button type="button" onClick={() => setSelectedAnnouncement(null)} aria-label="Close announcement preview"><HiX /></button>
						</header>
						{buildAnnouncementImageList(selectedAnnouncement).length > 0 ? (
							<div className="grantor-announcement-view-gallery">
								{buildAnnouncementImageList(selectedAnnouncement).map((url) => (
									<button key={`${selectedAnnouncement.id}_${url}`} type="button" onClick={() => openAnnouncementImagePreview(url)} aria-label={`Preview ${selectedAnnouncement.title || "announcement"} image`}>
										<img src={url} alt={selectedAnnouncement.title || "Announcement"} />
									</button>
								))}
							</div>
						) : null}
						<p className="grantor-announcement-view-message">{selectedAnnouncement.description || selectedAnnouncement.content || "-"}</p>
						<footer>
							<span><HiOutlineCalendar /> {selectedAnnouncement.applicationWindow || "Window not specified"}</span>
							{isAnnouncementArchived(selectedAnnouncement) ? (
								<i className="grantor-announcement-archived-note">Archived</i>
							) : (
								<button type="button" onClick={() => handleArchiveAnnouncement(selectedAnnouncement.id)} disabled={busy === `archive-announcement-${selectedAnnouncement.id}`}><HiOutlineTrash /> Archive</button>
							)}
						</footer>
					</section>
				</div>
			) : null}
			{announcementImagePreview ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={closeAnnouncementImagePreview}>
					<div className="grantor-image-lightbox" role="dialog" aria-modal="true" aria-label="Announcement image preview" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="grantor-image-lightbox-close" onClick={closeAnnouncementImagePreview} aria-label="Close image preview">
							<HiX />
						</button>
						<div className="grantor-image-lightbox-toolbar" aria-label="Image zoom controls">
							<button type="button" onClick={() => adjustAnnouncementImageZoom(-0.2)} disabled={announcementImageZoom <= 0.5}>-</button>
							<span>{Math.round(announcementImageZoom * 100)}%</span>
							<button type="button" onClick={() => adjustAnnouncementImageZoom(0.2)} disabled={announcementImageZoom >= 3}>+</button>
							<button type="button" onClick={() => setAnnouncementImageZoom(1)}>Reset</button>
						</div>
						<div className="grantor-image-lightbox-stage" onWheel={handleAnnouncementImageZoom}>
							<img src={announcementImagePreview} alt="Announcement preview" style={{ width: `${Math.round(announcementImageZoom * 100)}%` }} />
						</div>
						<p className="grantor-image-lightbox-hint">Scroll or use the touchpad over the image to zoom.</p>
					</div>
				</div>
			) : null}
			{showApplicationWindowCalendar ? (
				<div className="admin-detail-backdrop grantor-calendar-backdrop" role="presentation" onClick={() => setShowApplicationWindowCalendar(false)}>
					<div className="grantor-calendar-modal" role="dialog" aria-modal="true" aria-label="Select application window" onClick={(event) => event.stopPropagation()}>
						<header><div><h3>Application Window</h3><p>Select the opening date, then the closing date.</p></div><button type="button" onClick={() => setShowApplicationWindowCalendar(false)} aria-label="Close calendar"><HiX /></button></header>
						<div className="grantor-calendar-selection"><span>Start<strong>{announcementWindowStart ? formatAnnouncementWindow(announcementWindowStart, "").split(" - ")[0] : "Not selected"}</strong></span><i /><span>End<strong>{announcementWindowEnd ? new Date(`${announcementWindowEnd}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "Not selected"}</strong></span></div>
						<div className="grantor-calendar-nav"><button type="button" onClick={() => setAnnouncementCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}><HiChevronLeft /></button><strong>{announcementCalendarMonth.toLocaleString("en-PH", { month: "long", year: "numeric" })}</strong><button type="button" onClick={() => setAnnouncementCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}><HiChevronRight /></button></div>
						<div className="grantor-calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
						<div className="grantor-calendar-grid">{announcementCalendarDays.map((cell) => cell.empty ? <span key={cell.key} /> : <button key={cell.key} type="button" disabled={cell.disabled} className={`${cell.selected ? "selected" : ""} ${cell.inRange ? "in-range" : ""}`} onClick={() => handleAnnouncementWindowDatePick(cell.iso, cell.disabled)}>{cell.day}</button>)}</div>
						<footer><button type="button" className="grantor-calendar-clear" onClick={() => { setAnnouncementWindowStart(""); setAnnouncementWindowEnd(""); setAnnouncementForm((prev) => ({ ...prev, applicationWindow: "" })) }}>Clear</button><button type="button" className="grantor-calendar-done" disabled={!announcementWindowStart || !announcementWindowEnd} onClick={() => setShowApplicationWindowCalendar(false)}><HiCheck /> Apply Dates</button></footer>
					</div>
				</div>
			) : null}
			{applicationModalState.open ? (
				<div className="admin-detail-backdrop" role="presentation" onClick={closeApplicationModal}>
					<div className="admin-detail-shell admin-detail-shell--student" onClick={(event) => event.stopPropagation()}>
						<div className="admin-detail-modal admin-detail-modal--student grantor-modal" role="dialog" aria-modal="true" aria-label="Applicant information">
							<div className="admin-detail-info">
								<div className="admin-detail-header">
									<div className="grantor-modal-applicant">
										<img
											src={applicationModalState.student?.profileImageUrl || applicationModalState.student?.imageUrl || logo2}
											alt={applicationModalState.application?.fullName || "Applicant"}
											className="admin-detail-avatar"
										/>
										<div>
											<h3>{applicationModalState.application?.fullName || "Applicant Information"}</h3>
											<p className="admin-detail-meta">
												Application No. {applicationModalState.application?.applicationNumber || applicationModalState.application?.requestNumber || "-"}
											</p>
										</div>
									</div>
									<button type="button" className="grantor-modal-close" onClick={closeApplicationModal} aria-label="Close application review"><HiX /></button>
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

										<div className="grantor-application-section-stack">
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
														applicationModalState.student?.street,
														applicationModalState.student?.barangay,
														applicationModalState.student?.city,
														applicationModalState.student?.province,
														applicationModalState.student?.postalCode,
													].filter(Boolean).join(", ") || "-"}</strong></p>
													<p><span>Applied On</span><strong>{formatDateTime(applicationModalState.application?.appliedAt || applicationModalState.application?.createdAt)}</strong></p>
												</div>
											</section>

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
																		<span className={trackingBadgeClass(stepBadgeLabel)}>
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

											<section className="grantor-application-card grantor-application-card--documents">
												<h4>Documents</h4>
												<div className="grantor-document-links">
													{[
														{ id: "cor", label: "COR" },
														{ id: "cog", label: "COG" },
														{ id: "schoolId", label: "School ID" },
														{ id: "applicationForm", label: "Application Form" },
													].map((document) => {
														const url = applicationModalState.documentUrls?.[document.id] || ""
														return (
															<button
																key={document.id}
																type="button"
																className={`grantor-document-link ${url ? "" : "is-disabled"}`.trim()}
																onClick={() => openDocumentPreview(document.label, url)}
																disabled={!url}
															>
																<HiOutlineEye />
																<span>
																	{url ? `View ${document.label}` : `View ${document.label} Unavailable`}
																</span>
															</button>
														)
													})}
												</div>
												{(() => {
													const otherDocuments = collectOtherRequirementDocuments(
														applicationModalState.scholarship || {},
													)
													if (otherDocuments.length === 0) return null
													return (
														<div className="grantor-other-documents">
															<strong>Other documents</strong>
															<div className="grantor-other-documents-list">
																{otherDocuments.map((document, index) => (
																	<button
																		key={`${document.requirementId}_${document.url}_${index}`}
																		type="button"
																		className="grantor-document-link"
																		onClick={() => openDocumentPreview(document.requirementName, document.url)}
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
											</section>
										</div>

										{pendingApplicationDecision ? (
											<div className={`grantor-decision-confirmation grantor-decision-confirmation--${pendingApplicationDecision.decision}`.trim()}>
												<div>
													<span>Admin decision needs grantor confirmation</span>
													<strong>
														This student has been {pendingApplicationDecision.decision === "reject" ? "rejected" : "approved"}. Confirm to {pendingApplicationDecisionVerb} the application of {applicationModalState.application?.fullName || "this student"}.
													</strong>
													<p>
														Deadline: {formatConfirmationDeadline(pendingApplicationDecision)}. If no action is taken, this {pendingApplicationDecisionLabel.toLowerCase()} will apply automatically after 3 days.
													</p>
												</div>
											</div>
										) : null}

										<div className="grantor-application-actions">
											{pendingApplicationDecision ? (
												<>
													<button
														type="button"
														className={`admin-export-btn ${pendingApplicationDecision.decision === "reject" ? "grantor-reject-application-btn" : ""}`.trim()}
														onClick={handleConfirmPendingApplicationDecision}
														disabled={busy === "grantor_tracking" || busy === "reject_application" || busy === "decision_confirmation"}
													>
														{pendingApplicationDecision.decision === "reject" ? <HiOutlineBan /> : <HiCheck />}
														Confirm {pendingApplicationDecisionLabel}
													</button>
													<button
														type="button"
														className="admin-export-btn grantor-cancel-confirmation-btn"
														onClick={handleCancelPendingApplicationDecision}
														disabled={busy === "grantor_tracking" || busy === "reject_application" || busy === "decision_confirmation"}
													>
														<HiX /> Cancel {pendingApplicationDecisionLabel}
													</button>
												</>
											) : (
												<>
													<button
														type="button"
														className="admin-export-btn grantor-reject-application-btn"
														onClick={openRejectModal}
														disabled={
															busy === "grantor_tracking" ||
															busy === "reject_application" ||
															isRejectedApplication(applicationModalState.application || {})
														}
													>
														<HiOutlineBan /> Reject Application
													</button>
													<button
														type="button"
														className="admin-export-btn"
														onClick={handleCompleteGrantorStage}
														disabled={
															busy === "grantor_tracking" ||
															!canCompleteGrantorCurrentStage
														}
													>
														{busy === "grantor_tracking"
															? "Completing..."
															: canCompleteGrantorCurrentStage
																? <><HiCheck /> Complete Current Stage</>
																: <><HiOutlineBan /> Complete Current Stage</>}
													</button>
												</>
											)}
										</div>
									</>
								)}
							</div>
						</div>
					</div>
				</div>
			) : null}
			{previewDocument ? (
				<div
					className="grantor-document-preview-backdrop"
					role="dialog"
					aria-modal="true"
					aria-label={`${previewDocument.title} preview`}
					onClick={closeDocumentPreview}
				>
					<div
						className="grantor-document-preview-modal"
						onClick={(event) => event.stopPropagation()}
					>
						<header className="grantor-document-preview-head">
							<div>
								<span>Document Preview</span>
								<h3>{previewDocument.title}</h3>
							</div>
							<div className="grantor-document-preview-actions">
								<button
									type="button"
									className="grantor-document-preview-download"
									onClick={downloadPreviewDocument}
								>
									<HiOutlineDownload /> Download
								</button>
								<button
									type="button"
									className="grantor-document-preview-close"
									onClick={closeDocumentPreview}
									aria-label="Close document preview"
								>
									<HiX />
								</button>
							</div>
						</header>
						<div className="grantor-document-preview-body">
							{isPreviewLoading ? (
								<div className="grantor-document-preview-state">
									<HiOutlineDocumentText />
									<span>Loading preview...</span>
								</div>
							) : !previewBlobUrl ? (
								<div className="grantor-document-preview-state">
									<HiOutlineDocumentText />
									<span>Preview is unavailable.</span>
								</div>
							) : (
								<img
									src={previewBlobUrl}
									alt={`${previewDocument.title} preview`}
									className="grantor-document-preview-image"
								/>
							)}
						</div>
					</div>
				</div>
			) : null}
			{rejectModalOpen ? (
				<div
					className="grantor-reject-modal-backdrop"
					role="presentation"
					onClick={closeRejectModal}
				>
					<div
						className="grantor-reject-modal"
						role="dialog"
						aria-modal="true"
						aria-label="Reject scholarship application"
						onClick={(event) => event.stopPropagation()}
					>
						<header className="grantor-reject-modal-head">
							<div className="grantor-reject-modal-icon" aria-hidden="true">
								<HiOutlineBan />
							</div>
							<div>
								<span>Application Decision</span>
								<h3>Reject Application</h3>
								<p>
									This will archive the application, notify the student, and remove this
									scholarship from their active applications so they can apply elsewhere.
								</p>
							</div>
							<button type="button" onClick={closeRejectModal} aria-label="Close reject application modal">
								<HiX />
							</button>
						</header>
						<div className="grantor-reject-modal-body">
							<div className="grantor-reject-summary-grid">
								<p><span>Applicant</span><strong>{applicationModalState.student?.fullName || applicationModalState.application?.fullName || applicationModalState.application?.applicantName || "Student"}</strong></p>
								<p><span>Application No.</span><strong>{applicationModalState.application?.applicationNumber || applicationModalState.application?.requestNumber || applicationModalState.application?.id || "-"}</strong></p>
								<p><span>Scholarship</span><strong>{applicationModalState.application?.scholarshipName || applicationModalState.scholarship?.name || grantorName}</strong></p>
								<p><span>Rejected By</span><strong>{grantorName || "Grantor"}</strong></p>
							</div>
							<label>
								Reason
								<select value={rejectReason} onChange={(event) => setRejectReason(event.target.value)}>
									{APPLICATION_REJECTION_REASONS.map((reason) => (
										<option key={reason} value={reason}>{reason}</option>
									))}
								</select>
							</label>
							<label>
								Message / Notes
								<textarea
									value={rejectNotes}
									onChange={(event) => setRejectNotes(event.target.value)}
									placeholder="Add a clear message for the student, such as which document or requirement caused the rejection."
									rows={4}
								/>
							</label>
						</div>
						<footer className="grantor-reject-modal-actions">
							<button type="button" className="grantor-reject-cancel-btn" onClick={closeRejectModal} disabled={busy === "reject_application"}>
								Cancel
							</button>
							<button type="button" className="grantor-reject-confirm-btn" onClick={handleConfirmRejectApplication} disabled={busy === "reject_application"}>
								<HiOutlineBan /> {busy === "reject_application" ? "Rejecting..." : "Confirm Reject Application"}
							</button>
						</footer>
					</div>
				</div>
			) : null}
			{showCreateModal ? (
				<div className="grantor-scholar-modal-backdrop" role="presentation" onClick={closeCreateModal}>
					<div className="grantor-scholar-modal-shell" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="grantor-scholar-modal-close" onClick={closeCreateModal}><HiX /></button>
						<div className="grantor-scholar-modal grantor-scholar-modal--create" role="dialog" aria-modal="true" aria-label="Add scholar">
							<div className="admin-detail-info">
								<header className="grantor-import-modal-head">
									<div className="grantor-import-modal-icon" aria-hidden="true"><HiOutlineCloudUpload /></div>
									<div>
										<h3>{importData ? "Import Scholars" : "Add Scholars"}</h3>
										<p>{importData ? "Review the mapped records before importing them into the grantor roster." : "Upload a spreadsheet or enter scholar information manually."}</p>
									</div>
									{importData ? <span className="grantor-import-modal-count">{importData.length} Rows</span> : null}
								</header>
								{importData ? (
									<div className="grantor-import-preview">
										<div className="grantor-import-info">
											<div>
												<strong>{importData.length}</strong> rows detected from <em>{uploadFile?.name}</em>
												<p className="grantor-import-sub">Select the corresponding system field for each column below.</p>
											</div>
											<div className="grantor-import-actions">
												<button type="button" className="grantor-action-btn grantor-action-btn--danger" onClick={removeSelectedImportRows} disabled={selectedImportRowIndexes.length === 0}><HiOutlineTrash /> Remove Selected</button>
												<button type="button" className="grantor-action-btn grantor-action-btn--primary" onClick={() => { setImportData(null); setUploadFile(null); setColumnMapping([]); setCustomImportFields([]); setCustomImportDrafts({}); setCustomImportEditColumn(null); setSelectedImportRowIndexes([]); setImportDuplicateMatches({}); }}>Clear & Restart</button>
											</div>
										</div>
										<div className={`grantor-duplicate-policy-note ${importDuplicateCount > 0 ? "is-warning" : ""}`} role="note">
											<HiOutlineExclamationCircle aria-hidden="true" />
											<span>{checkingImportDuplicates ? "Checking mapped rows for duplicates..." : importDuplicateCount > 0 ? `${importBlockedDuplicateCount} same-roster duplicate${importBlockedDuplicateCount === 1 ? "" : "s"} and ${importWarningDuplicateCount} cross-grantor match${importWarningDuplicateCount === 1 ? "" : "es"} will not be imported.` : "Duplicate prevention is active. Same-roster and cross-grantor duplicate scholarships are blocked."}</span>
										</div>
										<div className="grantor-import-table-wrap">
											<table className="grantor-import-table">
												<thead>
													<tr>
														<th className="grantor-import-checkbox-col">
															<input type="checkbox" aria-label="Select all visible import rows" checked={allVisibleImportRowsSelected} onChange={() => setSelectedImportRowIndexes((prev) => allVisibleImportRowsSelected ? prev.filter((rowIndex) => !visibleImportRowIndexes.includes(rowIndex)) : Array.from(new Set([...prev, ...visibleImportRowIndexes])))} />
														</th>
														{importData[0].map((_, colIndex) => (
															<th key={colIndex}>
																{customImportEditColumn === colIndex ? (
																	<div className="grantor-import-custom-field">
																		<input
																			type="text"
																			className="grantor-import-custom-input"
																			value={customImportDrafts[colIndex] || ""}
																			onChange={(event) => setCustomImportDrafts((prev) => ({ ...prev, [colIndex]: event.target.value }))}
																			onKeyDown={(event) => {
																				if (event.key === "Enter") {
																					event.preventDefault()
																					commitCustomImportField(colIndex)
																				}
																				if (event.key === "Escape") {
																					cancelCustomImportField(colIndex)
																				}
																			}}
																			placeholder="Column name"
																			autoFocus
																		/>
																		<button
																			type="button"
																			className="grantor-import-custom-submit"
																			onClick={() => commitCustomImportField(colIndex)}
																			aria-label="Add custom column"
																		>
																			<HiCheck />
																		</button>
																		<button
																			type="button"
																			className="grantor-import-custom-cancel"
																			onClick={() => cancelCustomImportField(colIndex)}
																			aria-label="Cancel custom column"
																		>
																			<HiX />
																		</button>
																	</div>
																) : (
																	<select
																		className="grantor-import-select"
																		value={columnMapping[colIndex] || ""}
																		onChange={(event) => handleColumnMappingChange(colIndex, event.target.value)}
																	>
																		<option value="">Ignore Column</option>
																		{MAPPABLE_FIELDS.map(field => (
																			<option key={field.id} value={field.id}>{field.label}</option>
																		))}
																		{customImportFields.map((field) => (
																			<option key={`custom:${field.id}`} value={`custom:${field.id}`}>{field.label}</option>
																		))}
																		<option value={ADD_CUSTOM_IMPORT_FIELD}>Add...</option>
																	</select>
																)}
															</th>
														))}
													</tr>
												</thead>
												<tbody>
													{importPreviewPage.rows.map((row, rowIndex) => {
														const absoluteRowIndex = (importPreviewPage.currentPage - 1) * TABLE_PAGE_SIZE + rowIndex
														const duplicate = importDuplicateMatches[absoluteRowIndex]
														const duplicateTitle = duplicate
															? duplicate.sameGrantor
																? `Already in this grantor roster as ${duplicate.record.fullName || "an existing student"}`
																: `Cross-grantor match: ${duplicate.record.fullName || "an existing student"} under ${duplicate.record.grantorName || duplicate.record.grantorId || "another grantor"}`
															: undefined
														return <tr key={absoluteRowIndex} className={duplicate ? duplicate.sameGrantor ? "grantor-import-row--duplicate" : "grantor-import-row--warning" : ""} title={duplicateTitle}>
															<td className="grantor-import-checkbox-col"><input type="checkbox" aria-label={`Select import row ${absoluteRowIndex + 1}`} checked={selectedImportRowIndexes.includes(absoluteRowIndex)} onChange={() => setSelectedImportRowIndexes((prev) => prev.includes(absoluteRowIndex) ? prev.filter((item) => item !== absoluteRowIndex) : [...prev, absoluteRowIndex])} /></td>
															{row.map((cell, cellIndex) => (
																<td key={cellIndex}>{cell}</td>
															))}
														</tr>
													})}
													{importData.length > TABLE_PAGE_SIZE && (
														<tr>
															<td colSpan={importData[0].length + 1} className="grantor-import-more">
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
											<input type="text" placeholder="First Name" value={createForm.fname} onChange={(event) => setCreateForm((prev) => ({ ...prev, fname: event.target.value }))} />
											<input type="text" placeholder="Middle Name" value={createForm.mname} onChange={(event) => setCreateForm((prev) => ({ ...prev, mname: event.target.value }))} />
											<input type="text" placeholder="Last Name" value={createForm.lname} onChange={(event) => setCreateForm((prev) => ({ ...prev, lname: event.target.value }))} />
											<input type="text" placeholder="Street" value={createForm.street} onChange={(event) => setCreateForm((prev) => ({ ...prev, street: event.target.value }))} />
											<input type="text" placeholder="Barangay" value={createForm.barangay} onChange={(event) => setCreateForm((prev) => ({ ...prev, barangay: event.target.value }))} />
											<input type="text" placeholder="City" value={createForm.city} onChange={(event) => setCreateForm((prev) => ({ ...prev, city: event.target.value }))} />
											<input type="text" placeholder="Province" value={createForm.province} onChange={(event) => setCreateForm((prev) => ({ ...prev, province: event.target.value }))} />
											<input type="text" placeholder="Postal Code" value={createForm.postalCode} onChange={(event) => setCreateForm((prev) => ({ ...prev, postalCode: event.target.value }))} />
											<input type="text" placeholder="Course" value={createForm.course} onChange={(event) => setCreateForm((prev) => ({ ...prev, course: event.target.value }))} />
											<select value={createForm.yearLevel} onChange={(event) => setCreateForm((prev) => ({ ...prev, yearLevel: event.target.value }))}>{YEAR_LEVELS.map((level) => <option key={level} value={level}>Year {level}</option>)}</select>
											<input type="text" placeholder="Scholarship Title" value={createForm.scholarshipTitle} onChange={(event) => setCreateForm((prev) => ({ ...prev, scholarshipTitle: event.target.value }))} />
											<input type="text" placeholder="Status" value={createForm.status} onChange={(event) => setCreateForm((prev) => ({ ...prev, status: event.target.value }))} />
											<textarea placeholder="Notes" value={createForm.notes} onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))} />
										</div>
									</>
								)}
								<div className="grantor-modal-actions grantor-import-modal-actions">
									<button type="button" className="grantor-action-btn grantor-action-btn--danger" onClick={closeCreateModal}><HiX /> Cancel</button>
									<button type="button" className="grantor-action-btn grantor-action-btn--primary" onClick={handleCreateScholar} disabled={busy === "create"}>
										{busy === "create" ? <><HiOutlineRefresh /> Processing...</> : importData ? <><HiOutlineCloudUpload /> Import {importData.length} Scholars</> : <><HiCheck /> Save Scholar</>}
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			) : null}
			{showEditModal && selectedScholar ? (
				<div className="grantor-scholar-modal-backdrop" role="presentation" onClick={closeEditModal}>
					<div className="grantor-scholar-modal-shell" onClick={(event) => event.stopPropagation()}>
						<button type="button" className="grantor-scholar-modal-close" onClick={closeEditModal}><HiX /></button>
						<div className="grantor-scholar-modal grantor-scholar-modal--edit" role="dialog" aria-modal="true" aria-labelledby="grantor-edit-scholar-title">
							<header className="grantor-edit-modal-head">
								<div className="grantor-edit-modal-icon" aria-hidden="true"><HiOutlineUserGroup /></div>
								<div>
									<h3 id="grantor-edit-scholar-title">Edit Scholar</h3>
									<p>Update this scholar's profile and academic information.</p>
								</div>
								<span className="grantor-edit-modal-status">{editForm.status || "No Status"}</span>
							</header>
							<div className="grantor-edit-modal-summary" aria-label="Selected scholar summary">
								<span><HiOutlinePhone aria-hidden="true" /> {editForm.cpNumber || "Contact Number Not Set"}</span>
								<span><HiOutlineMail aria-hidden="true" /> {editForm.email || "Email Not Set"}</span>
							</div>
							<div className="grantor-edit-modal-body">
								<section className="grantor-edit-form-section">
									<div className="grantor-edit-section-head"><h4><HiOutlineIdentification /> Personal Information</h4><span>Identity and contact details</span></div>
									<div className="grantor-form-grid grantor-form-grid--edit">
										<label>
											<span>Student ID</span>
											<input
												type="text"
												placeholder="e.g. 2021100063"
												value={editForm.studentId}
												readOnly={editScholarAccountExists}
												aria-readonly={editScholarAccountExists}
												title={editScholarAccountExists ? "Student ID is locked because this student already created an account." : ""}
												onChange={(event) => {
													if (editScholarAccountExists) return
													setEditForm((prev) => ({ ...prev, studentId: event.target.value }))
												}}
											/>
											{editScholarAccountExists ? <small className="grantor-edit-field-note">Locked because the student account already exists.</small> : null}
										</label>
										<label><span>First Name</span><input type="text" placeholder="Enter first name" value={editForm.fname} readOnly={editScholarAccountExists} onChange={(event) => { if (!editScholarAccountExists) setEditForm((prev) => ({ ...prev, fname: event.target.value })) }} /></label>
										<label><span>Middle Name</span><input type="text" placeholder="Enter middle name" value={editForm.mname} readOnly={editScholarAccountExists} onChange={(event) => { if (!editScholarAccountExists) setEditForm((prev) => ({ ...prev, mname: event.target.value })) }} /></label>
										<label><span>Last Name</span><input type="text" placeholder="Enter last name" value={editForm.lname} readOnly={editScholarAccountExists} onChange={(event) => { if (!editScholarAccountExists) setEditForm((prev) => ({ ...prev, lname: event.target.value })) }} /></label>
										<label><span><HiOutlineMail /> Email Address</span><input type="email" placeholder="student@email.com" value={editForm.email} readOnly={editScholarAccountExists} onChange={(event) => { if (!editScholarAccountExists) setEditForm((prev) => ({ ...prev, email: event.target.value })) }} /></label>
										<label><span>Contact Number</span><input type="text" placeholder="e.g. 0917 123 4567" value={editForm.cpNumber} readOnly={editScholarAccountExists} onChange={(event) => { if (!editScholarAccountExists) setEditForm((prev) => ({ ...prev, cpNumber: event.target.value })) }} /></label>
									</div>
								</section>
								<section className="grantor-edit-form-section">
									<div className="grantor-edit-section-head"><h4><HiOutlineLocationMarker /> Address</h4><span>Current residential information</span></div>
									<div className="grantor-form-grid grantor-form-grid--edit">
										<label><span>Province</span><select value={editForm.province} disabled={editScholarAccountExists} onChange={(event) => setEditForm((prev) => ({ ...prev, province: event.target.value, city: "" }))}><option value="">Select province</option>{editForm.province && !PROVINCES.includes(editForm.province) ? <option value={editForm.province}>{editForm.province}</option> : null}{PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}</select></label>
										<label><span>City / Municipality</span><select value={editForm.city} disabled={editScholarAccountExists || !editForm.province} onChange={(event) => setEditForm((prev) => ({ ...prev, city: event.target.value }))}><option value="">Select city or municipality</option>{editForm.city && !editCityOptions.includes(editForm.city) ? <option value={editForm.city}>{editForm.city}</option> : null}{editCityOptions.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
										<label><span>Barangay</span><input type="text" placeholder="Barangay" value={editForm.barangay} readOnly={editScholarAccountExists} onChange={(event) => { if (!editScholarAccountExists) setEditForm((prev) => ({ ...prev, barangay: event.target.value })) }} /></label>
										<label><span>Street / Subdivision</span><input type="text" placeholder="House number, street, or subdivision" value={editForm.street} readOnly={editScholarAccountExists} onChange={(event) => { if (!editScholarAccountExists) setEditForm((prev) => ({ ...prev, street: event.target.value })) }} /></label>
										<label><span>Postal Code</span><input type="text" placeholder="e.g. 3000" value={editForm.postalCode} readOnly={editScholarAccountExists} onChange={(event) => { if (!editScholarAccountExists) setEditForm((prev) => ({ ...prev, postalCode: event.target.value })) }} /></label>
									</div>
								</section>
								<section className="grantor-edit-form-section grantor-edit-form-section--academic">
									<div className="grantor-edit-section-head"><h4><HiOutlineAcademicCap /> Academic Record</h4><span>Scholarship and enrollment details</span></div>
									<div className="grantor-form-grid grantor-form-grid--edit">
										<label><span>Course</span><select value={editForm.course} disabled={editScholarAccountExists} onChange={(event) => setEditForm((prev) => ({ ...prev, course: event.target.value }))}><option value="">Select course</option>{editForm.course && !COURSE_OPTIONS.includes(editForm.course) ? <option value={editForm.course}>{editForm.course}</option> : null}{COURSE_OPTIONS.map((course) => <option key={course} value={course}>{course}</option>)}</select></label>
										<label><span>Year Level</span><select value={editForm.yearLevel} disabled={editScholarAccountExists} onChange={(event) => setEditForm((prev) => ({ ...prev, yearLevel: event.target.value }))}>{YEAR_LEVELS.map((level) => <option key={level} value={level}>Year {level}</option>)}</select></label>
										<label className="grantor-edit-field--wide"><span>Notes</span><textarea placeholder="Add notes about this scholar" value={editForm.notes} onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))} /></label>
									</div>
								</section>
								{Object.keys(editForm.customColumns || {}).length > 0 ? (
									<section className="grantor-edit-form-section">
										<div className="grantor-edit-section-head"><h4><HiOutlineDocumentText /> Additional Information</h4><span>Imported custom fields</span></div>
										<div className="grantor-form-grid grantor-form-grid--edit">
											{Object.entries(editForm.customColumns || {}).map(([label, value]) => (
												<label key={label}>
													<span>{label}</span>
													<input
														type="text"
														placeholder={`Enter ${label}`}
														value={String(value ?? "")}
														onChange={(event) => setEditForm((prev) => ({
															...prev,
															customColumns: { ...prev.customColumns, [label]: event.target.value },
														}))}
													/>
												</label>
											))}
										</div>
									</section>
								) : null}
								</div>
								<div className="grantor-modal-actions grantor-modal-actions--split">
									<button type="button" className="grantor-action-btn grantor-action-btn--danger" onClick={closeEditModal}><HiX /> Cancel</button>
									<button type="button" className="grantor-action-btn grantor-action-btn--primary" onClick={handleSaveScholar} disabled={busy === "edit"}><HiCheck /> {busy === "edit" ? "Saving..." : "Save Changes"}</button>
								</div>
							</div>
						</div>
					</div>
			) : null}
		</div>
	)
}
