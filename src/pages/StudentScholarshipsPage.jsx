/**
 * Student Scholarships Page - Apply-only scholarship flow with gated material requests.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
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
import { toast } from "react-toastify"
import {
	HiOutlineAcademicCap,
	HiOutlineCheckCircle,
	HiOutlineCloudUpload,
	HiOutlineDocumentText,
	HiOutlineExclamation,
	HiOutlineExternalLink,
	HiX,
} from "react-icons/hi"
import { db } from "../services/supabaseDataService"
import StudentTopbar from "../components/StudentTopbar"
import "../css/StudentDashboard.css"
import "../css/StudentPortalRefresh.css"
import useThemeMode from "../hooks/useThemeMode"
import useArchivedGrantorIds from "../hooks/useArchivedGrantorIds"
import {
	buildScholarshipRecord,
	getCurrentAcademicYear,
	getCurrentSemesterTag,
	getDocumentUrlsForStudent,
	getScholarshipCatalog,
	normalizeScholarshipList,
	shouldWarnMultipleScholarships,
	shouldWarnZeroScholarships,
	toScholarshipProviderType,
	validateScholarshipDocuments,
	withCurrentSemesterTag,
} from "../services/scholarshipService"
import {
	getPortalAccessBlockMessage,
	getScholarshipActionBlockMessage,
	getStudentBlockedBannerMessage,
	getStudentAccessState,
} from "../services/studentAccessService"
import {
	getMaterialEntry,
	getMaterialRequestDocumentId,
	getMaterialRequestState,
	getMaterialRequestType,
	normalizeMaterialRequest,
	toMaterialLabel,
} from "../services/materialRequestService"
import { downloadSoePdfBytes, exportSoePdfDocument } from "../services/soeService"
import { downloadStudentApplicationProfile, getApplicationFormSource } from "../services/applicationFormService"
import { resolveSoeRequestNumber } from "../services/soeRequestNumberService"
import {
	completeScholarshipTrackingStep,
	getScholarshipTrackingProgress,
	getScholarshipTrackingStepBadgeLabel,
} from "../services/scholarshipTrackingService"
import {
	GRANTOR_SUBCOLLECTIONS,
	GRANTOR_PORTAL_COLLECTION,
	normalizeGrantorPortalSettings,
} from "../services/grantorService"
import { applyScholarshipWorkflow, materialRequestWorkflow } from "../services/workflowService"
import { syncStudentGrantorRosterMatches } from "../services/studentGrantorMatchService"
import {
	buildRecommendationApplyPayload,
	loadRecommendedScholarships,
} from "../services/recommendedScholarshipService"
import { createStudentNotification } from "../services/notificationService"
import { uploadToStorage } from "../services/storageService"
import {
	getOtherRequirementUploadEntry,
	normalizeOtherRequirements,
	toRequirementKey,
} from "../services/otherRequirementService"

const SOE_EXPORT_LOCK_MONTHS = 6
const REJECTION_REAPPLY_COOLDOWN_MS = 24 * 60 * 60 * 1000

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

function isOlderThanSevenDays(value) {
	if (!value) return false
	const date = value?.toDate ? value.toDate() : new Date(value)
	if (Number.isNaN(date.getTime())) return false
	const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
	return Date.now() - date.getTime() > sevenDaysMs
}

function isScholarshipFrozen(entry = {}) {
	const status = String(entry?.status || "").toLowerCase()
	return (
		entry?.frozen === true ||
		entry?.archived === true ||
		status.includes("archived") ||
		status.includes("frozen")
	)
}

function isScholarshipActiveOrPending(status = "") {
	const normalized = String(status).toLowerCase()
	if (!normalized) return true
	return ![
		"finalized",
		"rejected",
		"denied",
		"cancelled",
		"canceled",
		"withdrawn",
		"resolved",
		"completed",
		"expired",
	].some((keyword) => normalized.includes(keyword))
}

function isScholarshipRejected(entry = {}) {
	const normalized = String(entry?.status || entry?.reviewStatus || "").toLowerCase()
	return (
		entry?.rejected === true ||
		["rejected", "denied", "declined"].some((keyword) => normalized.includes(keyword))
	)
}

function getRejectionTimestamp(entry = {}) {
	return (
		toJsDate(
			entry?.rejectedAt ||
				entry?.archivedAt ||
				entry?.updatedAt ||
				entry?.applicationDate ||
				entry?.appliedAt ||
				entry?.createdAt,
		)?.getTime() || 0
	)
}

function getRejectionCooldown(entry = {}) {
	const rejectedAt = getRejectionTimestamp(entry)
	if (!rejectedAt) {
		return { active: false, remainingMs: 0, readyAt: null }
	}
	const readyAtMs = rejectedAt + REJECTION_REAPPLY_COOLDOWN_MS
	return {
		active: Date.now() < readyAtMs,
		remainingMs: Math.max(0, readyAtMs - Date.now()),
		readyAt: new Date(readyAtMs),
	}
}

function formatCooldownDuration(ms = 0) {
	const totalMinutes = Math.ceil(ms / (60 * 1000))
	if (totalMinutes <= 0) return "now"
	const hours = Math.floor(totalMinutes / 60)
	const minutes = totalMinutes % 60
	if (hours <= 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`
	if (minutes <= 0) return `${hours} hour${hours === 1 ? "" : "s"}`
	return `${hours}h ${minutes}m`
}

function getRejectionReason(entry = {}) {
	return (
		entry?.rejectionMessage ||
		[
			entry?.rejectionReason || entry?.archiveReason,
			entry?.rejectionNotes || entry?.archiveNotes,
		]
			.filter(Boolean)
			.join(" - ") ||
		"No reason was provided."
	)
}

function getRejectionProviderLabel(entry = {}) {
	return (
		entry?.grantorName ||
		entry?.providerLabel ||
		entry?.provider ||
		entry?.scholarshipName ||
		entry?.name ||
		"this scholarship"
	)
}

function isPlaceholderDisplayLabel(value = "") {
	const compact = String(value || "").trim().replace(/\s+/g, "")
	if (!compact) return true
	if (/^(.)\1{5,}$/i.test(compact)) return true
	return false
}

function getFirstUsableDisplayLabel(values = [], fallback = "Scholarship") {
	const match = values.find((value) => !isPlaceholderDisplayLabel(value))
	return String(match || fallback).trim()
}

function getScholarshipGrantorDisplayLabel(entry = {}, catalogItem = {}, grantorLabelLookup = {}) {
	const providerType = String(entry?.providerType || "").trim()
	const grantorId = String(entry?.grantorId || entry?.providerId || "").trim()

	return getFirstUsableDisplayLabel(
		[
			entry?.grantorName,
			entry?.matchedGrantorName,
			entry?.providerName,
			entry?.providerLabel,
			entry?.provider,
			providerType ? grantorLabelLookup[`providerType:${providerType}`] : "",
			grantorId ? grantorLabelLookup[`grantorId:${grantorId}`] : "",
			catalogItem?.grantorName,
			catalogItem?.providerName,
			catalogItem?.providerLabel,
			catalogItem?.provider,
			catalogItem?.name,
			entry?.scholarshipName,
			entry?.name,
		],
		"Scholarship",
	)
}

function matchesScholarshipTarget(rejectedEntry = {}, target = {}) {
	const rejectedKeys = [
		rejectedEntry.grantorId,
		rejectedEntry.providerType,
		rejectedEntry.scholarshipId,
		rejectedEntry.applicationNumber,
		rejectedEntry.requestNumber,
		rejectedEntry.scholarshipName,
		rejectedEntry.name,
	]
		.filter(Boolean)
		.map((value) => String(value).trim().toLowerCase())
	const targetKeys = [
		target.grantorId,
		target.providerType,
		target.id,
		target.scholarshipId,
		target.applicationNumber,
		target.requestNumber,
		target.scholarshipName,
		target.name,
		target.providerLabel,
		target.grantorName,
	]
		.filter(Boolean)
		.map((value) => String(value).trim().toLowerCase())

	if (rejectedKeys.length === 0 || targetKeys.length === 0) return false
	return rejectedKeys.some((key) => targetKeys.includes(key))
}

function matchesArchivedGrantorTarget(entry = {}, target = {}) {
	const status = String(entry?.status || "").toLowerCase()
	const isArchived =
		entry?.archived === true ||
		entry?.frozen === true ||
		status.includes("archived") ||
		status.includes("frozen") ||
		status.includes("previous")
	if (!isArchived) return false
	const entryKeys = [
		entry?.blockedGrantorId,
		entry?.archivedBy,
		entry?.grantorId,
		entry?.providerId,
		entry?.providerType,
	]
		.filter(Boolean)
		.map((value) => String(value).trim().toLowerCase())
	const targetKeys = [
		target?.grantorId,
		target?.providerId,
		target?.providerType,
		target?.id,
	]
		.filter(Boolean)
		.map((value) => String(value).trim().toLowerCase())
	return entryKeys.length > 0 && targetKeys.length > 0 && entryKeys.some((key) => targetKeys.includes(key))
}

function formatApplicationStatus(status = "") {
	const normalized = String(status || "").toLowerCase()
	if (["rejected", "denied", "declined", "cancelled", "canceled", "withdrawn"].some((keyword) => normalized.includes(keyword))) {
		return "Rejected"
	}
	if (["complete", "completed", "approved", "accepted", "finalized", "released", "paid"].some((keyword) => normalized.includes(keyword))) {
		return "Complete"
	}
	return "Pending"
}

function toJsDate(value) {
	if (!value) return null
	if (value?.toDate) return value.toDate()
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
}

function getStudentFullName(userData = {}) {
	return (
		userData.fullName ||
		userData.name ||
		[userData.fname || userData.firstName, userData.mname || userData.middleName, userData.lname || userData.lastName]
			.filter(Boolean)
			.join(" ")
			.trim() ||
		userData.studentName ||
		userData.studentnumber ||
		userData.studentId ||
		"Student"
	)
}

function addMonths(date, months) {
	const next = new Date(date)
	next.setMonth(next.getMonth() + months)
	return next
}

function toStudentMaterialRequestLabel(materialKey = "", state = "none") {
	const config = getMaterialRequestType(materialKey)
	if (state === "approved") return config.approvedLabel
	if (state === "rejected") return `${config.label} Rejected`
	if (state === "pending") return "Pending Admin Approval"
	return `${config.label} Not Requested`
}

function getMultipleScholarshipBannerCopy(user, scholarships) {
	if (user?.scholarshipConflictMessage) return user.scholarshipConflictMessage
	if (Array.isArray(scholarships) && scholarships.length > 1) {
		return "Your scholarship eligibility is temporarily on hold. Choose one scholarship only to comply with the one scholarship per student policy."
	}
	return "Your scholarship eligibility is temporarily on hold until you choose one scholarship only."
}

function buildDocumentRequirementCopy(documentCheck) {
	if (documentCheck?.ok) {
		return `COR and ROG are ready for ${documentCheck?.semesterTag || "the current semester"}.`
	}

	const notes = []
	if (Array.isArray(documentCheck?.missing) && documentCheck.missing.length > 0) {
		notes.push(`Missing: ${documentCheck.missing.join(", ")}`)
	}
	if (Array.isArray(documentCheck?.expired) && documentCheck.expired.length > 0) {
		notes.push(`Update needed: ${documentCheck.expired.join(", ")}`)
	}
	return notes.join(" | ") || "Upload the required COR and ROG."
}

function buildDocumentRequirementPrompt(documentCheck, scholarshipName = "this scholarship") {
	if (!documentCheck) {
		return `Upload the required COR and ROG for ${scholarshipName} before requesting materials.`
	}

	const notes = []
	if (Array.isArray(documentCheck.missing) && documentCheck.missing.length > 0) {
		notes.push(`Missing: ${documentCheck.missing.join(", ")}`)
	}
	if (Array.isArray(documentCheck.expired) && documentCheck.expired.length > 0) {
		notes.push(
			`Update needed for ${documentCheck.semesterTag || "the current semester"}: ${documentCheck.expired.join(", ")}`,
		)
	}

	return (
		`Upload the required COR and ROG for ${scholarshipName} before requesting materials.` +
		(notes.length > 0 ? ` ${notes.join(" | ")}` : "")
	)
}

function formatDisplayText(value, fallback = "") {
	const text = String(value ?? "").trim()
	if (!text) return fallback
	if (text.includes("@")) return text.toLowerCase()
	if (/^[\d\s+()./-]+$/.test(text)) return text
	return text
		.toLowerCase()
		.replace(/\b([a-z])([a-z]*)/g, (_, first, rest) => `${first.toUpperCase()}${rest}`)
}

function normalizeStudentScholarshipNotice(row = {}, id = "", sourceTable = "studentNotifications") {
	return {
		id,
		sourceTable,
		...row,
		type: row.type || row.notificationType || "",
		title: row.title || row.subject || "",
		message: row.message || row.body || "",
		studentId: row.studentId || row.studentID || row.studentNumber || "",
		grantorId: row.grantorId || row.providerId || "",
		grantorName: row.grantorName || row.providerLabel || row.authorName || "",
		scholarshipName: row.scholarshipName || row.announcementTitle || row.providerLabel || "",
		announcementId: row.announcementId || "",
		createdAt: row.createdAt || row.timestamp || row.date || null,
	}
}

function isMultipleScholarshipWarning(row = {}) {
	const type = String(row.warningType || row.type || row.notificationType || "").toLowerCase()
	const reason = String(row.scholarshipRestrictionReason || row.reason || row.source || "").toLowerCase()
	return (
		type.includes("multiple_scholarship") ||
		type.includes("duplicate_scholarship") ||
		reason.includes("multiple_scholarship") ||
		reason.includes("duplicate_scholarship")
	)
}

function recommendationKey(item = {}) {
	return [
		item.announcementId || "",
		item.grantorId || item.providerType || item.id || "",
		item.scholarshipName || item.announcementTitle || item.providerLabel || item.grantorName || "",
	]
		.filter(Boolean)
		.join("::")
}

export default function StudentScholarshipsPage() {
	const archivedGrantorIds = useArchivedGrantorIds()
	const location = useLocation()
	const navigate = useNavigate()
	const [user, setUser] = useState(null)
	const [userLoaded, setUserLoaded] = useState(false)
	const [userId, setUserId] = useState("")
	const [grantorPortals, setGrantorPortals] = useState([])
	const [userMenuOpen, setUserMenuOpen] = useState(false)
	const [isMutating, setIsMutating] = useState(false)
	const [confirmTarget, setConfirmTarget] = useState(null)
	const [documentUploadPrompt, setDocumentUploadPrompt] = useState(null)
	const [expenseModalTarget, setExpenseModalTarget] = useState(null)
	const [studentApplications, setStudentApplications] = useState([])
	const [studentSoeRequests, setStudentSoeRequests] = useState([])
	const [studentSoeDownloads, setStudentSoeDownloads] = useState([])
	const [studentScholarshipNotices, setStudentScholarshipNotices] = useState([])
	const [studentWarningNotices, setStudentWarningNotices] = useState([])
	const [recommendedScholarships, setRecommendedScholarships] = useState([])
	const [recommendationsLoading, setRecommendationsLoading] = useState(false)
	const [recommendationAlgorithm, setRecommendationAlgorithm] = useState("")
	const [applyingRecommendationId, setApplyingRecommendationId] = useState("")
	const [invitationDecision, setInvitationDecision] = useState(null)
	const [invitationRejectReason, setInvitationRejectReason] = useState("Not interested")
	const [invitationRejectNotes, setInvitationRejectNotes] = useState("")
	const [soeExpenses, setSoeExpenses] = useState([{ label: "", amount: "" }])
	const [isExportingSoe, setIsExportingSoe] = useState(false)
	const [isDownloadingSoe, setIsDownloadingSoe] = useState(false)
	const [isDownloadingApplicationForm, setIsDownloadingApplicationForm] = useState(false)
	const [isSavingExpensePreset, setIsSavingExpensePreset] = useState(false)
	const [isSoePreviewOpen, setIsSoePreviewOpen] = useState(false)
	const [soePreviewTargetId, setSoePreviewTargetId] = useState("")
	const [soePreviewUrl, setSoePreviewUrl] = useState("")
	const [soePreviewBytes, setSoePreviewBytes] = useState(null)
	const [soePreviewRequestNumber, setSoePreviewRequestNumber] = useState("")
	const [otherRequirementUploadBusy, setOtherRequirementUploadBusy] = useState("")
	const { theme, setTheme } = useThemeMode()
	const userMenuRef = useRef(null)
	const forcedLogoutRef = useRef(false)
	const availableProgramsRef = useRef(null)
	const rosterSyncRef = useRef("")
	const recommendationRequestKeyRef = useRef("")

	const scholarshipCatalog = useMemo(() => getScholarshipCatalog(), [])
	const scholarships = useMemo(
		() => normalizeScholarshipList(user?.scholarships || []),
		[user?.scholarships],
	)
	const scholarshipChoices = useMemo(
		() => scholarships.filter((item) => !isScholarshipRejected(item)),
		[scholarships],
	)
	const hasMultipleScholarshipChoices = scholarshipChoices.length >= 2
	const hasLockedScholarship = scholarships.some((item) => item.isLocked && !isScholarshipRejected(item))
	const lockedScholarship = scholarships.find((item) => item.isLocked && !isScholarshipRejected(item)) || null
	const activeOrPendingScholarships = scholarships.filter((item) =>
		!item.isLocked && !isScholarshipRejected(item) && isScholarshipActiveOrPending(item.status),
	)
	const hasActiveOrPendingScholarship = activeOrPendingScholarships.length > 0
	const activeOrPendingProviderTypes = useMemo(
		() => new Set(activeOrPendingScholarships.map((item) => item.providerType)),
		[activeOrPendingScholarships],
	)
	const rejectedApplications = useMemo(() => {
		return [
			...studentApplications.map((item) => ({
				...item,
				name: item.name || item.scholarshipName || item.providerLabel || item.grantorName,
			})),
			...scholarships.map((item) => ({
				...item,
				scholarshipName: item.scholarshipName || item.name,
			})),
		]
			.filter(isScholarshipRejected)
			.sort((left, right) => getRejectionTimestamp(right) - getRejectionTimestamp(left))
	}, [scholarships, studentApplications])
	const latestRejectedApplication = rejectedApplications[0] || null
	const latestRejectedCooldown = useMemo(
		() => getRejectionCooldown(latestRejectedApplication || {}),
		[latestRejectedApplication],
	)
	useEffect(() => {
		if (!user || !userId || scholarships.length === 0) return
		const expiredRejected = scholarships.filter((entry) => isScholarshipRejected(entry) && !getRejectionCooldown(entry).active)
		if (expiredRejected.length === 0) return

		let cancelled = false
		const cleanupExpiredRejections = async () => {
			try {
				const retainedScholarships = scholarships.filter((entry) => !(isScholarshipRejected(entry) && !getRejectionCooldown(entry).active))
				const previousEntries = expiredRejected.map((entry) => ({
					...entry,
					status: "Previous Scholar",
					previousScholar: true,
					movedToPreviousAt: serverTimestamp(),
				}))
				await setDoc(
					doc(db, "students", userId),
					{
						scholarships: retainedScholarships,
						previousScholars: [...(Array.isArray(user.previousScholars) ? user.previousScholars : []), ...previousEntries],
						updatedAt: serverTimestamp(),
					},
					{ merge: true },
				)

				await Promise.all(expiredRejected.map(async (entry) => {
					const grantorId = entry.grantorId || entry.providerId
					if (!grantorId) return
					const scholarSnap = await getDocs(collection(doc(db, "grantorPortals", grantorId), GRANTOR_SUBCOLLECTIONS.scholars))
					const matchingRows = scholarSnap.docs
						.map((item) => ({ id: item.id, ...(item.data() || {}) }))
						.filter((row) => {
							const rowStudentId = row.studentId || row.studentID || row.studentNumber || row.studentnumber
							return String(rowStudentId || "") === String(userId)
						})
					await Promise.all(matchingRows.map((row) =>
						setDoc(
							doc(collection(doc(db, "grantorPortals", grantorId), GRANTOR_SUBCOLLECTIONS.scholars), row.id),
							{
								archived: true,
								status: "Archived",
								archivedAt: serverTimestamp(),
								archivedBy: "system",
								archivedByName: "BulsuScholar",
								archiveReason: entry.rejectionReason || "Rejected application cooldown completed",
								archiveNotes: entry.rejectionNotes || "Moved from rejected application to previous scholar history after the 24-hour cooldown.",
								rejectionReason: entry.rejectionReason || "",
								rejectionNotes: entry.rejectionNotes || "",
								updatedAt: serverTimestamp(),
							},
							{ merge: true },
						),
					))
				}))

				if (!cancelled) {
					setUser((prev) => ({
						...(prev || {}),
						scholarships: retainedScholarships,
						previousScholars: [...(Array.isArray(prev?.previousScholars) ? prev.previousScholars : []), ...previousEntries],
					}))
				}
			} catch (error) {
				console.error("Failed to clean up expired rejected scholarship cooldown.", error)
			}
		}
		void cleanupExpiredRejections()
		return () => {
			cancelled = true
		}
	}, [scholarships, user, userId])
	const getRejectedCooldownForTarget = useCallback(
		(target = {}) => {
			const rejected = rejectedApplications.find((item) => matchesScholarshipTarget(item, target))
			if (!rejected) return null
			return {
				record: rejected,
				cooldown: getRejectionCooldown(rejected),
			}
		},
		[rejectedApplications],
	)
	const archivedGrantorBlocks = useMemo(() => {
		return [
			...(Array.isArray(user?.scholarships) ? user.scholarships : []),
			...(Array.isArray(user?.previousScholars) ? user.previousScholars : []),
		].filter((entry) => {
			const status = String(entry?.status || "").toLowerCase()
			return entry?.archived === true || entry?.frozen === true || status.includes("archived") || status.includes("frozen") || status.includes("previous")
		})
	}, [user?.previousScholars, user?.scholarships])
	const getArchivedGrantorBlockForTarget = useCallback(
		(target = {}) => archivedGrantorBlocks.find((entry) => matchesArchivedGrantorTarget(entry, target)) || null,
		[archivedGrantorBlocks],
	)
	const pendingScholarshipInvitations = useMemo(
		() => (Array.isArray(user?.scholarshipInvitations) ? user.scholarshipInvitations : [])
			.filter((item) => item?.type === "grantor_unarchive_invitation" && String(item.status || "").toLowerCase() === "pending"),
		[user?.scholarshipInvitations],
	)
	const adminScholarshipRecommendations = useMemo(
		() => studentScholarshipNotices
			.filter((item) => String(item.type || "").toLowerCase() === "admin_scholarship_recommendation")
			.sort((left, right) => (toJsDate(right.createdAt)?.getTime() || 0) - (toJsDate(left.createdAt)?.getTime() || 0)),
		[studentScholarshipNotices],
	)
	const hasMultipleScholarshipConflict =
		user?.scholarshipConflictWarning === true ||
		(user?.scholarshipRestrictionReason === "multiple_scholarships" && scholarships.length > 1)
	const warningRecommendationBlock = useMemo(
		() => studentWarningNotices.some(isMultipleScholarshipWarning) || hasMultipleScholarshipConflict,
		[hasMultipleScholarshipConflict, studentWarningNotices],
	)
	const matchedGrantorScope = useMemo(() => {
		if (scholarships.length > 0) return []
		return (Array.isArray(user?.grantorMatches) ? user.grantorMatches : [])
			.map((item) => String(item.grantorId || item.id || "").trim())
			.filter(Boolean)
	}, [scholarships.length, user?.grantorMatches])
	const hasMatchedGrantorScope = matchedGrantorScope.length > 0
	const applicationLockTooltip =
		"You already have an existing scholarship application. You cannot apply for another until the current one is resolved."
	const isValidated = checkValidated(user)
	const _avatarUrl = user?.profileImageUrl || ""
	const _studentNumber = userId
	const studentAccessState = useMemo(() => getStudentAccessState(user || {}), [user])
	const hasComplianceBlock = studentAccessState.soeComplianceBlocked
	const hasScholarshipActionBlock = studentAccessState.isScholarshipActionBlocked
	const scholarshipActionBlockMessage = getScholarshipActionBlockMessage(user || {})
	const portalAccessBlockMessage = getPortalAccessBlockMessage(user || {})
	const hasBlockedScholarshipBanner =
		studentAccessState.scholarshipEligibilityBlocked || studentAccessState.soeComplianceBlocked
	const blockedScholarshipBannerCopy = getStudentBlockedBannerMessage(user || {})
	const multipleScholarshipBannerCopy = getMultipleScholarshipBannerCopy(user, scholarships)
	const canResolveMultipleScholarshipConflict =
		hasMultipleScholarshipConflict &&
		!studentAccessState.isPortalAccessBlocked &&
		!studentAccessState.soeComplianceBlocked
	const blockedGrantorPortals = useMemo(
		() => grantorPortals.filter((item) => item.applicationsBlocked === true),
		[grantorPortals],
	)
	const blockedProviderTypes = useMemo(
		() => new Set(blockedGrantorPortals.map((item) => item.providerType)),
		[blockedGrantorPortals],
	)
	const blockedProviderLabels = useMemo(() => {
		return blockedGrantorPortals.reduce((lookup, item) => {
			if (!item.providerType || lookup[item.providerType]) return lookup
			lookup[item.providerType] = item.grantorName || item.grantorId || "This grantor"
			return lookup
		}, {})
	}, [blockedGrantorPortals])
	const grantorDisplayLabels = useMemo(() => {
		return grantorPortals.reduce((lookup, item) => {
			const label = item.grantorName || item.providerLabel || item.providerName || item.grantorId || ""
			if (item.providerType && label) lookup[`providerType:${item.providerType}`] = label
			if (item.grantorId && label) lookup[`grantorId:${item.grantorId}`] = label
			return lookup
		}, {})
	}, [grantorPortals])
	const _announcementFocusProviderType = useMemo(
		() => String(location.state?.focusProviderType || "").trim(),
		[location.state],
	)

	const _getUserInitials = () => {
		const f = user?.fname?.[0]?.toUpperCase() || ""
		const l = user?.lname?.[0]?.toUpperCase() || ""
		return f + l || "ST"
	}

	const isScholarshipActionBlocked = useCallback(
		(options = {}) => {
			const { allowConflictResolution = false } = options
			if (studentAccessState.isPortalAccessBlocked) {
				toast.error(portalAccessBlockMessage || scholarshipActionBlockMessage)
				return true
			}
			if (studentAccessState.soeComplianceBlocked) {
				toast.error(scholarshipActionBlockMessage)
				return true
			}
			if (
				studentAccessState.scholarshipEligibilityBlocked &&
				!(allowConflictResolution && canResolveMultipleScholarshipConflict)
			) {
				toast.error(scholarshipActionBlockMessage)
				return true
			}
			return false
		},
		[
			canResolveMultipleScholarshipConflict,
			portalAccessBlockMessage,
			scholarshipActionBlockMessage,
			studentAccessState.isPortalAccessBlocked,
			studentAccessState.scholarshipEligibilityBlocked,
			studentAccessState.soeComplianceBlocked,
		],
	)

	useEffect(() => {
		function handleClickOutside(e) {
			if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
				setUserMenuOpen(false)
			}
		}
		if (userMenuOpen) {
			document.addEventListener("mousedown", handleClickOutside)
			return () => document.removeEventListener("mousedown", handleClickOutside)
		}
	}, [userMenuOpen])

	useEffect(() => {
		const storedUserId = sessionStorage.getItem("bulsuscholar_userId")
		const storedType = sessionStorage.getItem("bulsuscholar_userType")

		if (!storedUserId || storedType !== "student") {
			setUserLoaded(true)
			return
		}

		setUserId(storedUserId)
		return onSnapshot(
			doc(db, "students", storedUserId),
			(snap) => {
				if (!snap.exists()) {
					setUser(null)
					setUserLoaded(true)
					return
				}

				const data = snap.data() || {}
				const normalized = normalizeScholarshipList(data.scholarships || [])
				const corFile = withCurrentSemesterTag(data.corFile)
				const cogFile = withCurrentSemesterTag(data.cogFile)
				const shouldSyncScholarships = (data.scholarships || []).some(
					(item) => !item?.id || !item?.status || !item?.providerType,
				)
				const shouldSyncDocs =
					Boolean(data.corFile?.url && !data.corFile?.semesterTag) ||
					Boolean(data.cogFile?.url && !data.cogFile?.semesterTag)
				const nextUser = {
					...data,
					scholarships: normalized,
					corFile,
					cogFile,
				}

				if (shouldSyncScholarships || shouldSyncDocs) {
					void materialRequestWorkflow({
						updates: [
							{
								table: "students",
								id: storedUserId,
								data: {
									scholarships: normalized,
									corFile,
									cogFile,
									updatedAt: serverTimestamp(),
								},
							},
						],
					}).catch(() => {})
				}

				setUser(nextUser)
				setUserLoaded(true)

				const accessState = getStudentAccessState(nextUser)
				if (accessState.isPortalAccessBlocked && !forcedLogoutRef.current) {
					forcedLogoutRef.current = true
					sessionStorage.removeItem("bulsuscholar_userId")
					sessionStorage.removeItem("bulsuscholar_userType")
					toast.error(getPortalAccessBlockMessage(nextUser))
					navigate("/", { replace: true })
				}
			},
			() => setUserLoaded(true),
		)
	}, [navigate])

	useEffect(() => {
		if (!userLoaded || !user || !userId) return
		if (scholarships.length > 0) return
		const syncKey = `${userId}:${user.updatedAt || user.createdAt || "empty"}`
		if (rosterSyncRef.current === syncKey) return
		rosterSyncRef.current = syncKey
		syncStudentGrantorRosterMatches(user, userId)
			.then((result) => {
				if (!result.synced) return
				console.info("StudentScholarshipsPage: synced grantor roster scholarship match.", {
					count: result.matches.length,
					matches: result.matches,
				})
				setUser((current) => current ? { ...current, scholarships: result.scholarships } : current)
			})
			.catch((error) => console.error("StudentScholarshipsPage: grantor roster sync failed:", error))
	}, [scholarships.length, user, userId, userLoaded])

	useEffect(() => {
		if (userLoaded && (!user || !userId)) {
			navigate("/", { replace: true })
		}
	}, [userLoaded, user, userId, navigate])

	useEffect(() => {
		return onSnapshot(
			collection(db, GRANTOR_PORTAL_COLLECTION),
			(snap) => {
				setGrantorPortals(
					snap.docs.map((row) =>
						normalizeGrantorPortalSettings(row.data() || {}, row.id),
					),
				)
			},
			() => setGrantorPortals([]),
		)
	}, [])

	useEffect(() => {
		if (!userLoaded || !user || !userId) return
		if (hasActiveOrPendingScholarship || latestRejectedCooldown?.active || warningRecommendationBlock) {
			recommendationRequestKeyRef.current = ""
			setRecommendedScholarships([])
			setRecommendationAlgorithm("")
			setRecommendationsLoading(false)
			return
		}
		const recommendationRequestKey = JSON.stringify([
			userId,
			user.gwa || user.currentGwa || user.generalWeightedAverage || "",
			user.course || "",
			user.year || user.yearLevel || "",
			user.province || "",
			user.city || user.municipality || "",
			user.barangay || "",
			[...archivedGrantorIds].sort(),
		])
		if (recommendationRequestKeyRef.current === recommendationRequestKey) return
		recommendationRequestKeyRef.current = recommendationRequestKey

		setRecommendationsLoading(true)
		loadRecommendedScholarships({
			...user,
			id: userId,
			studentId: user.studentId || user.studentnumber || userId,
		})
			.then((result) => {
				if (recommendationRequestKeyRef.current !== recommendationRequestKey) return
				setRecommendedScholarships(
					(result.recommendations || []).filter(
						(item) => !archivedGrantorIds.has(String(item.grantorId || item.providerId || "")),
					),
				)
				setRecommendationAlgorithm(result.algorithm || "")
			})
			.catch((error) => {
				if (recommendationRequestKeyRef.current !== recommendationRequestKey) return
				console.error("StudentScholarshipsPage: recommendation loading failed:", error)
				setRecommendedScholarships([])
				setRecommendationAlgorithm("")
			})
			.finally(() => {
				if (recommendationRequestKeyRef.current === recommendationRequestKey) setRecommendationsLoading(false)
			})
	}, [archivedGrantorIds, hasActiveOrPendingScholarship, latestRejectedCooldown?.active, user, userId, userLoaded, warningRecommendationBlock])

	useEffect(() => {
		if (location.state?.fromAnnouncement !== true) return
		if (!availableProgramsRef.current) return

		availableProgramsRef.current.scrollIntoView({
			behavior: "smooth",
			block: "start",
		})
	}, [location.state])

	useEffect(() => {
		if (!userId) {
			setStudentSoeRequests([])
			return undefined
		}

		const soeRequestQuery = query(collection(db, "soeRequests"), where("studentId", "==", userId))
		return onSnapshot(
			soeRequestQuery,
			(snap) => {
				setStudentSoeRequests(snap.docs.map((row) => ({ id: row.id, ...(row.data() || {}) })))
			},
			() => {
				setStudentSoeRequests([])
			},
		)
	}, [userId])

	useEffect(() => {
		if (!userId) {
			setStudentApplications([])
			return undefined
		}

		const applicationsQuery = query(
			collection(db, "scholarshipApplications"),
			where("studentId", "==", userId),
		)
		return onSnapshot(
			applicationsQuery,
			(snap) => {
				setStudentApplications(snap.docs.map((row) => ({ id: row.id, ...(row.data() || {}) })))
			},
			(error) => {
				console.error("StudentScholarshipsPage: failed to load scholarship applications.", error)
				setStudentApplications([])
			},
		)
	}, [userId])

	useEffect(() => {
		if (!userId) {
			setStudentScholarshipNotices([])
			setStudentWarningNotices([])
			return undefined
		}

		const unsubscribeNotifications = onSnapshot(
			query(collection(db, "studentNotifications"), where("studentId", "==", userId)),
			(snap) => {
				setStudentScholarshipNotices(
					snap.docs.map((row) => normalizeStudentScholarshipNotice(row.data() || {}, row.id, "studentNotifications")),
				)
			},
			() => setStudentScholarshipNotices([]),
		)
		const unsubscribeWarnings = onSnapshot(
			query(collection(db, "studentWarning"), where("studentId", "==", userId)),
			(snap) => {
				setStudentWarningNotices(
					snap.docs.map((row) => normalizeStudentScholarshipNotice(row.data() || {}, row.id, "studentWarning")),
				)
			},
			() => setStudentWarningNotices([]),
		)

		return () => {
			unsubscribeNotifications()
			unsubscribeWarnings()
		}
	}, [userId])

	useEffect(() => {
		if (!userId) {
			setStudentSoeDownloads([])
			return undefined
		}

		const soeDownloadsQuery = query(collection(db, "soeDownloads"), where("studentId", "==", userId))
		return onSnapshot(
			soeDownloadsQuery,
			(snap) => {
				setStudentSoeDownloads(snap.docs.map((row) => ({ id: row.id, ...(row.data() || {}) })))
			},
			() => {
				setStudentSoeDownloads([])
			},
		)
	}, [userId])

	useEffect(() => {
		return () => {
			if (soePreviewUrl) {
				URL.revokeObjectURL(soePreviewUrl)
			}
		}
	}, [soePreviewUrl])

	const syncWarnings = useCallback(
		async (scholarshipList) => {
			if (!userId || !user) return

			const warningsRef = collection(db, "studentWarning")
			const basePayload = {
				studentId: userId,
				studentName: [user.fname, user.mname, user.lname].filter(Boolean).join(" ") || "Student",
				savedScholarshipsCount: scholarshipList.length,
				lastActive: serverTimestamp(),
			}

			const zeroId = `${userId}_zero_scholarships`
			if (shouldWarnZeroScholarships(scholarshipList)) {
				await setDoc(doc(warningsRef, zeroId), {
					...basePayload,
					warningType: "zero_scholarships",
				})
			} else {
				await deleteDoc(doc(warningsRef, zeroId)).catch(() => {})
			}

			const multipleId = `${userId}_multiple_scholarships`
			if (shouldWarnMultipleScholarships(scholarshipList)) {
				await setDoc(doc(warningsRef, multipleId), {
					...basePayload,
					warningType: "multiple_scholarships",
				})
			} else {
				await deleteDoc(doc(warningsRef, multipleId)).catch(() => {})
			}

			const delayedId = `${userId}_delayed_kuya_win`
			const pendingRequests = await getDocs(
				query(collection(db, "soeRequests"), where("studentId", "==", userId)),
			)
			const hasDelayedPendingKuya = pendingRequests.docs.some((requestDoc) => {
				const request = normalizeMaterialRequest(requestDoc.data() || {})
				const requestProviderType = toScholarshipProviderType(
					request.providerType || request.scholarshipName || "",
				)
				return (
					request.pendingMaterialKeys.length > 0 &&
					requestProviderType === "kuya_win" &&
					isOlderThanSevenDays(request.timestamp || getMaterialEntry(request, "soe").requestedAt)
				)
			})

			if (hasDelayedPendingKuya) {
				await setDoc(doc(warningsRef, delayedId), {
					...basePayload,
					warningType: "delayed_kuya_win",
					status: "Delayed Document Submission",
				})
			} else {
				await deleteDoc(doc(warningsRef, delayedId)).catch(() => {})
			}
		},
		[user, userId],
	)

	useEffect(() => {
		if (!userLoaded || !user || !userId) return
		syncWarnings(scholarships).catch(() => {})
	}, [userLoaded, user, userId, scholarships, syncWarnings])

	const latestMaterialRequestsByScholarship = useMemo(() => {
		const latestRequests = new Map()
		studentSoeRequests
			.slice()
			.sort((a, b) => {
				const aDate = toJsDate(a.timestamp || a.createdAt || a.dateRequested || a.updatedAt)?.getTime() || 0
				const bDate = toJsDate(b.timestamp || b.createdAt || b.dateRequested || b.updatedAt)?.getTime() || 0
				return bDate - aDate
			})
			.forEach((request) => {
				const normalizedRequest = normalizeMaterialRequest(request)
				const keys = [
					normalizedRequest.scholarshipId,
					normalizedRequest.applicationNumber,
					normalizedRequest.requestNumber,
				]
					.filter(Boolean)
					.map((value) => String(value))
				keys.forEach((key) => {
					if (!key || latestRequests.has(key)) return
					latestRequests.set(key, normalizedRequest)
				})
			})
		return latestRequests
	}, [studentSoeRequests])

	const getLatestMaterialRequest = useCallback(
		(scholarshipId = "") => latestMaterialRequestsByScholarship.get(scholarshipId) || null,
		[latestMaterialRequestsByScholarship],
	)

	const getMaterialLabelForScholarship = useCallback(
		(entry, materialKey) => {
			const latestRequest = getLatestMaterialRequest(entry?.id)
			const approvalState = latestRequest
				? getMaterialRequestState(latestRequest, materialKey)
				: "none"
			return toStudentMaterialRequestLabel(materialKey, approvalState)
		},
		[getLatestMaterialRequest],
	)

	const getMaterialStateForScholarship = useCallback(
		(entry, materialKey) => {
			const latestRequest = getLatestMaterialRequest(entry?.id)
			return latestRequest
				? getMaterialRequestState(latestRequest, materialKey)
				: "none"
		},
		[getLatestMaterialRequest],
	)

	const getMaterialRequestButtonState = useCallback(
		(entry, materialKey) => {
			const config = getMaterialRequestType(materialKey)
			if (isScholarshipFrozen(entry)) {
				return { disabled: true, label: "Frozen" }
			}
			const requestState = getMaterialStateForScholarship(entry, materialKey)
			if (requestState === "approved") {
				return { disabled: true, label: "Approved" }
			}
			if (requestState === "pending") {
				return { disabled: true, label: "Requested" }
			}
			if (requestState === "rejected") {
				return { disabled: false, label: config.requestAgainLabel }
			}
			return { disabled: false, label: config.requestLabel }
		},
		[getMaterialStateForScholarship],
	)

	const getMaterialDownloadGate = useCallback(
		(entry = null, materialKey = "soe") => {
			const config = getMaterialRequestType(materialKey)
			if (isScholarshipFrozen(entry)) {
				return {
					canDownload: false,
					label: "Frozen",
					reason: "This scholarship record was archived by the grantor. You cannot download or request SOE until it is restored.",
				}
			}
			const latestRequest = getLatestMaterialRequest(entry?.id || "")
			const approvalState = latestRequest
				? getMaterialRequestState(latestRequest, materialKey)
				: "none"

			if (approvalState === "approved") {
				const materialEntry = latestRequest ? getMaterialEntry(latestRequest, materialKey) : null
				return {
					canDownload: true,
					label: materialEntry?.downloadedAt ? config.downloadedLabel : config.downloadLabel,
					reason: "",
				}
			}

			if (approvalState === "rejected") {
				return {
					canDownload: false,
					label: `${config.label} Rejected`,
					reason: `Your latest ${config.label.toLowerCase()} request was not approved. Please coordinate with the scholarship office first.`,
				}
			}

			if (approvalState === "pending") {
				return {
					canDownload: false,
					label: "Pending Approval",
					reason: `Your ${config.label.toLowerCase()} request is still waiting for admin approval.`,
				}
			}

			return {
				canDownload: false,
				label: `${config.label} Not Requested`,
				reason: `Request ${config.label.toLowerCase()} first before downloading the form.`,
			}
		},
		[getLatestMaterialRequest],
	)

	const getLatestSoeDownloadForScholarship = useCallback(
		(entry = null, latestRequest = null) => {
			if (!entry) return null

			const trackedProviderType = entry.providerType || ""
			const requestKeys = new Set(
				[
					entry.id,
					entry.applicationNumber,
					entry.requestNumber,
					latestRequest?.scholarshipId,
					latestRequest?.applicationNumber,
					latestRequest?.requestNumber,
				]
					.filter(Boolean)
					.map((value) => String(value)),
			)

			return (
				studentSoeDownloads
					.filter((download) => {
						const providerType = toScholarshipProviderType(
							download.providerType || download.scholarshipName || "",
						)
						if (trackedProviderType && providerType !== trackedProviderType) return false

						if (requestKeys.size === 0) return true

						return [
							download.scholarshipId,
							download.applicationNumber,
							download.requestNumber,
							download.soeSnapshot?.requestNumber,
						]
							.filter(Boolean)
							.map((value) => String(value))
							.some((value) => requestKeys.has(value))
					})
					.sort((left, right) => {
						const leftDate =
							toJsDate(left.updatedAt || left.downloadedAt || left.createdAt)?.getTime() || 0
						const rightDate =
							toJsDate(right.updatedAt || right.downloadedAt || right.createdAt)?.getTime() || 0
						return rightDate - leftDate
					})[0] || null
			)
		},
		[studentSoeDownloads],
	)

	const kwspEntry = useMemo(() => {
		if (lockedScholarship) return lockedScholarship

		const activeKwspScholarship =
			scholarships.find(
				(item) =>
					item.providerType === "kuya_win" && isScholarshipActiveOrPending(item.status),
			) || null
		if (activeKwspScholarship) return activeKwspScholarship

		const activeScholarship =
			scholarships.find((item) => isScholarshipActiveOrPending(item.status)) || null
		if (activeScholarship) return activeScholarship

		return (
			scholarships.find((item) => {
				const status = String(item?.status || "").toLowerCase().trim()
				return Boolean(status) && status !== "saved" && !isScholarshipRejected(item)
			}) || null
		)
	}, [lockedScholarship, scholarships])

	const kwspCatalogItem = useMemo(() => {
		const trackedProviderType = kwspEntry?.providerType || "kuya_win"
		return scholarshipCatalog.find((item) => item.providerType === trackedProviderType) || null
	}, [scholarshipCatalog, kwspEntry])

	const kwspDocumentCheck = useMemo(
		() => validateScholarshipDocuments(user || {}, kwspCatalogItem?.name || "Kuya Win Scholarship Program"),
		[kwspCatalogItem, user],
	)

	const getTrackingProgressForScholarship = useCallback(
		(entry = null) => {
			if (!entry) {
				return getScholarshipTrackingProgress()
			}

			const latestRequest = getLatestMaterialRequest(entry.id)
			const latestDownload = getLatestSoeDownloadForScholarship(entry, latestRequest)
			const documentCheck = validateScholarshipDocuments(
				user || {},
				entry.name || entry.provider || "Scholarship",
			)

			return getScholarshipTrackingProgress({
				scholarship: entry,
				isValidated,
				documentCheck,
				latestMaterialRequest: latestRequest,
				latestSoeDownload: latestDownload,
			})
		},
		[getLatestMaterialRequest, getLatestSoeDownloadForScholarship, isValidated, user],
	)

	const kwspTracking = useMemo(() => {
		const trackedScholarshipLabel = getScholarshipGrantorDisplayLabel(
			kwspEntry || {},
			kwspCatalogItem || {},
			grantorDisplayLabels,
		)
		const isKwspFlow = kwspEntry?.providerType === "kuya_win"
		const isMorissonFlow = kwspEntry?.providerType === "morisson"
		const trackerCopy = "Track your application stage and the next action required for this scholarship."
		const trackerAriaLabel = isKwspFlow
			? "KWSP application tracking"
			: `${trackedScholarshipLabel} application tracking`
		const hasKwspApplication = Boolean(kwspEntry)
		const documentCopy = buildDocumentRequirementCopy(kwspDocumentCheck)
		const trackingProgress = getTrackingProgressForScholarship(kwspEntry)

		let nextActionTitle = "Application for KWSP"
		let nextActionCopy = "Your account is ready. Start your KWSP application from the available programs list."
		let nextActionHelp = ""
		let summaryTone = "current"
		let nextPanelTone = "default"

		if (studentAccessState.isPortalAccessBlocked) {
			nextActionTitle = "Portal access is blocked"
			nextActionCopy = portalAccessBlockMessage || scholarshipActionBlockMessage
			summaryTone = "attention"
		} else if (hasScholarshipActionBlock) {
			nextActionTitle = "Resolve scholarship access restrictions"
			nextActionCopy = scholarshipActionBlockMessage
			summaryTone = "attention"
		} else if (!hasKwspApplication) {
			if (
				isKwspFlow &&
				hasActiveOrPendingScholarship &&
				!activeOrPendingProviderTypes.has("kuya_win")
			) {
				nextActionTitle = "Resolve your current scholarship first"
				nextActionCopy = applicationLockTooltip
				summaryTone = "attention"
			} else {
				nextActionTitle = isKwspFlow
					? "Application for KWSP"
					: `Application for ${trackedScholarshipLabel}`
				nextActionCopy = isKwspFlow
					? "Submit your KWSP application from the available programs section. You can complete the required documents in the next stage."
					: `Submit your ${trackedScholarshipLabel} application from the available programs section. You can complete the required documents in the next stage.`
				summaryTone = "current"
			}
		} else if (trackingProgress.currentStep?.id === "document_uploading") {
			nextActionTitle = isKwspFlow
				? "Uploading of Document"
				: `Uploading of Document`
			nextActionCopy = kwspDocumentCheck.ok
				? "Your uploads are complete. Wait for the scholarship office to continue with admin review."
				: documentCopy
			nextActionHelp = kwspDocumentCheck.ok
				? "No upload action is needed right now. Wait for the scholarship office to review your submitted documents."
				: "Go to Profile, open your document uploads, then update the missing COR or ROG."
			summaryTone = kwspDocumentCheck.ok ? "current" : "attention"
			nextPanelTone = kwspDocumentCheck.ok ? "default" : "missing"
		} else if (trackingProgress.currentStep?.id === "application_form") {
			nextActionTitle = "Student Application Profile"
			nextActionCopy = "Your COR and ROG are complete. Complete and upload the required Student Application Profile before review continues."
			nextActionHelp = "Go to Profile, open your document uploads, then add your Student Application Profile."
			summaryTone = "current"
			nextPanelTone = "pending"
		} else if (trackingProgress.currentStep?.id === "document_review") {
			nextActionTitle = "Document Review"
			nextActionCopy = "Your submitted documents are ready for review by the scholarship office and your assigned grantor."
			nextActionHelp = "No upload action is needed right now. Wait for document review to be completed before the next stage."
			summaryTone = "current"
			nextPanelTone = "pending"
		} else if (trackingProgress.currentStep?.id === "admin_review") {
			nextActionTitle = "Wait for admin review"
			nextActionCopy = "Your application is now under scholarship office review."
			summaryTone = "current"
		} else if (trackingProgress.currentStep?.id === "interview") {
			nextActionTitle = "Prepare for your interview"
			nextActionCopy = isKwspFlow
				? "Wait for the scholarship office to complete or schedule your KWSP interview stage."
				: `Wait for the scholarship office to complete the interview stage for ${trackedScholarshipLabel}.`
			summaryTone = "current"
		} else if (trackingProgress.currentStep?.id === "application_review") {
			nextActionTitle = "Wait for application review"
			nextActionCopy = isKwspFlow
				? "Your KWSP application is in application review."
				: `Your ${trackedScholarshipLabel} application is in application review.`
			summaryTone = "current"
		} else if (trackingProgress.currentStep?.id === "final_screening") {
			nextActionTitle = "Wait for final screening"
			nextActionCopy = isKwspFlow
				? "Your KWSP application is in final screening."
				: `Your ${trackedScholarshipLabel} application is in final screening.`
			summaryTone = "current"
		} else if (trackingProgress.currentStep?.id === "request_materials") {
			nextActionTitle = "Requesting of Materials"
			nextActionCopy = isMorissonFlow
				? "Your Student Application Profile is confidential. Get it directly from the scholarship office, then request your SOE here if you still need it."
				: isKwspFlow
					? "Your KWSP application is approved. Request your SOE if you still need it."
					: `Request your SOE for ${trackedScholarshipLabel} if you still need it.`
			nextActionHelp = "Use the My Scholarship Applications section below to request your SOE or continue your material request."
			summaryTone = "current"
		} else if (trackingProgress.currentStep?.id === "download_materials") {
			nextActionTitle = trackingProgress.hasApprovedMaterials
				? "Downloading of Materials"
				: "Wait for material approval"
			nextActionCopy = trackingProgress.hasApprovedMaterials
				? isKwspFlow
					? "Your material request is approved. Download the available files from your KWSP card."
					: "Your material request is approved. Download the available files from your scholarship card."
				: "Your requested materials are still pending admin approval."
			nextActionHelp = trackingProgress.hasApprovedMaterials
				? "Use the material download button in your scholarship card below to download the approved file."
				: "Wait for admin approval. Once approved, the material download button will become available below."
			summaryTone = "current"
			nextPanelTone = trackingProgress.hasApprovedMaterials ? "default" : "pending"
		} else if (trackingProgress.signingAttention) {
			nextActionTitle = "Download SOE again"
			nextActionCopy = "Your downloaded SOE was rejected during signing. Download a new SOE and submit it again."
			nextActionHelp = "Use the SOE download button below, then bring the fresh copy to the scholarship office for signing."
			summaryTone = "attention"
		} else if (trackingProgress.currentStep?.id === "signing_materials") {
			nextActionTitle = "Go to admin for the signature"
			nextActionCopy = "Your downloaded SOE is ready for scholarship office checking and signature."
			nextActionHelp = "Bring the downloaded SOE to the scholarship office or assigned admin for signature."
			summaryTone = "current"
		} else if (trackingProgress.signingComplete) {
			nextActionTitle = isKwspFlow
				? "KWSP tracking completed"
				: `${trackedScholarshipLabel} tracking completed`
			nextActionCopy = isKwspFlow
				? "All tracked KWSP stages are complete for this scholarship cycle."
				: `All tracked ${trackedScholarshipLabel} stages are complete for this scholarship cycle.`
			summaryTone = "complete"
		}

		return {
			entry: kwspEntry,
			steps: trackingProgress.steps,
			currentStep: trackingProgress.currentStep,
			nextActionTitle,
			nextActionCopy,
			nextActionHelp,
			summaryTone,
			nextPanelTone,
			currentStageLabel: trackingProgress.currentStepLabel || `${trackedScholarshipLabel} Tracking`,
			highlightedStepId: trackingProgress.highlightedStepId || "",
			trackedScholarshipLabel,
			trackerCopy,
			trackerAriaLabel,
			applicationStatus: formatApplicationStatus(kwspEntry?.status),
			applicationNumber:
				kwspEntry?.applicationNumber || kwspEntry?.requestNumber || kwspEntry?.id || "-",
			isMorissonFlow,
			materialStatus:
				trackingProgress.hasDownloadedMaterials
					? "Downloaded"
					: trackingProgress.hasApprovedMaterials
						? "Approved"
						: trackingProgress.hasPendingMaterialApproval
							? "Pending Approval"
							: trackingProgress.hasRequestedMaterials
								? "Requested"
								: "Not Requested",
			applicationFormDownloadedAt: kwspEntry?.applicationFormDownloadedAt || null,
			canRequestMaterials: trackingProgress.canRequestMaterials,
			hasApprovedMaterials: trackingProgress.hasApprovedMaterials,
			hasPendingMaterialApproval: trackingProgress.hasPendingMaterialApproval,
			hasDownloadedMaterials: trackingProgress.hasDownloadedMaterials,
			signingAttention: trackingProgress.signingAttention,
			signingComplete: trackingProgress.signingComplete,
		}
	}, [
		activeOrPendingProviderTypes,
		applicationLockTooltip,
		hasActiveOrPendingScholarship,
		hasScholarshipActionBlock,
		grantorDisplayLabels,
		kwspCatalogItem,
		kwspDocumentCheck,
		kwspEntry,
		portalAccessBlockMessage,
		scholarshipActionBlockMessage,
		studentAccessState.isPortalAccessBlocked,
		getTrackingProgressForScholarship,
	])
	const shouldShowScholarshipWorkspace =
		!kwspEntry ||
		hasMultipleScholarshipChoices

	const persistScholarships = async (nextScholarships, message = "") => {
		await materialRequestWorkflow({
			updates: [
				{
					table: "students",
					id: userId,
					data: {
						scholarships: nextScholarships,
						updatedAt: serverTimestamp(),
					},
				},
			],
		})
		setUser((prev) => ({ ...(prev || {}), scholarships: nextScholarships }))
		await syncWarnings(nextScholarships)
		if (message) {
			toast.success(message)
		}
	}

	const validateOtherRequirementFiles = (files = [], requirement = {}) => {
		const expectedType = String(requirement.fileType || "PDF").toUpperCase()
		return files.every((file) => {
			const name = String(file?.name || "").toLowerCase()
			const type = String(file?.type || "").toLowerCase()
			if (expectedType === "PNG") {
				return type === "image/png" || name.endsWith(".png")
			}
			if (expectedType === "PDF") {
				return type === "application/pdf" || name.endsWith(".pdf")
			}
			if (expectedType === "BOTH") {
				return type === "application/pdf" || type === "image/png" || name.endsWith(".pdf") || name.endsWith(".png")
			}
			return false
		})
	}

	const handleOtherRequirementUpload = async (target, requirement, index, fileList) => {
		if (!user || !userId || isMutating || !target || !requirement) return
		const selected = scholarships.find((item) => item.id === target.id)
		if (!selected) {
			toast.error("Scholarship record not found.")
			return
		}

		const files = Array.from(fileList || []).filter(Boolean)
		if (files.length === 0) return
		if (!validateOtherRequirementFiles(files, requirement)) {
			toast.error(`Invalid ${requirement.name}. Upload ${requirement.fileType || "PDF"} file${requirement.uploadCount > 1 ? "s" : ""} only.`)
			return
		}

		const requirementKey = toRequirementKey(requirement, index)
		const existingEntry = getOtherRequirementUploadEntry(selected, requirement, index)
		const existingFiles = Array.isArray(existingEntry.files) ? existingEntry.files : []
		const uploadLimit = Number(requirement.uploadCount || 1)
		const remainingSlots = Math.max(uploadLimit - existingFiles.length, 0)
		if (remainingSlots <= 0) {
			toast.info(`${requirement.name} already has the required ${uploadLimit} upload${uploadLimit > 1 ? "s" : ""}.`)
			return
		}

		const filesToUpload = files.slice(0, remainingSlots)
		const busyKey = `${selected.id}_${requirementKey}`
		setOtherRequirementUploadBusy(busyKey)
		try {
			const uploads = await Promise.all(
				filesToUpload.map((file) =>
					uploadToStorage(file, {
						folder: `students/${userId}/other-requirements/${selected.id || selected.requestNumber || "scholarship"}`,
					}),
				),
			)
			const preparedUploads = uploads.map((upload, uploadIndex) => ({
				url: upload.url,
				name: upload.name || filesToUpload[uploadIndex]?.name || requirement.name,
				type: upload.type || filesToUpload[uploadIndex]?.type || requirement.fileType,
				size: upload.size || filesToUpload[uploadIndex]?.size || 0,
				path: upload.path || upload.publicId || "",
				uploadedAt: new Date().toISOString(),
			}))
			const nextEntry = {
				requirementId: requirementKey,
				name: requirement.name,
				fileType: requirement.fileType || "PDF",
				uploadCount: uploadLimit,
				files: [...existingFiles, ...preparedUploads].slice(0, uploadLimit),
				updatedAt: new Date().toISOString(),
			}
			const nextScholarships = scholarships.map((item) =>
				item.id === selected.id
					? {
							...item,
							otherRequirementUploads: {
								...(item.otherRequirementUploads || {}),
								[requirementKey]: nextEntry,
							},
							updatedAt: serverTimestamp(),
						}
					: item,
			)
			await persistScholarships(nextScholarships, `${requirement.name} uploaded.`)
		} catch (error) {
			console.error("Failed to upload other requirement:", error)
			toast.error(`Failed to upload ${requirement.name}. Please try again.`)
		} finally {
			setOtherRequirementUploadBusy("")
		}
	}

	const renderOtherRequirementUploads = (entry) => {
		const requirements = normalizeOtherRequirements(entry?.otherRequirements || [])
		if (requirements.length === 0) return null
		const entryFrozen = isScholarshipFrozen(entry)
		const entryRejected = isScholarshipRejected(entry)
		const disabledByState =
			isMutating ||
			entryFrozen ||
			entryRejected ||
			entry?.adminBlocked === true ||
			hasScholarshipActionBlock

		return (
			<div className="student-other-requirements-box">
				<div className="student-other-requirements-head">
					<span>Other Requirements</span>
					<strong>Upload added requirements from your grantor.</strong>
				</div>
				<div className="student-other-requirement-list">
					{requirements.map((requirement, index) => {
						const uploadEntry = getOtherRequirementUploadEntry(entry, requirement, index)
						const uploadedFiles = Array.isArray(uploadEntry.files) ? uploadEntry.files : []
						const uploadLimit = Number(requirement.uploadCount || 1)
						const complete = uploadedFiles.length >= uploadLimit
						const busyKey = `${entry.id}_${toRequirementKey(requirement, index)}`
						const isBusy = otherRequirementUploadBusy === busyKey
						const accept = requirement.fileType === "PNG"
							? ".png,image/png"
							: requirement.fileType === "BOTH"
								? ".pdf,.png,application/pdf,image/png"
								: ".pdf,application/pdf"
						return (
							<div className="student-other-requirement-card" key={`${entry.id}_${requirement.id}`}>
								<div>
									<span>{complete ? "Submitted" : `Upload ${requirement.name}`}</span>
									<strong>{requirement.name}</strong>
									<p>
										{uploadedFiles.length}/{uploadLimit} {requirement.fileType} file{uploadLimit > 1 ? "s" : ""} uploaded
									</p>
									{uploadedFiles.length > 0 ? (
										<ul className="student-other-file-list">
											{uploadedFiles.map((file, fileIndex) => (
												<li key={`${file.url || file.name}_${fileIndex}`}>
													<HiOutlineDocumentText aria-hidden />
													<span>{file.name || `${requirement.name} ${fileIndex + 1}`}</span>
												</li>
											))}
										</ul>
									) : null}
								</div>
								<label className={`student-other-upload-button ${disabledByState || complete || isBusy ? "is-disabled" : ""}`.trim()}>
									<HiOutlineCloudUpload aria-hidden />
									<span>{isBusy ? "Uploading..." : complete ? "Complete" : `Upload ${requirement.name}`}</span>
									<input
										type="file"
										accept={accept}
										multiple={uploadLimit > 1}
										disabled={disabledByState || complete || isBusy}
										onChange={(event) => {
											handleOtherRequirementUpload(entry, requirement, index, event.target.files)
											event.target.value = ""
										}}
									/>
								</label>
							</div>
						)
					})}
				</div>
			</div>
		)
	}

	const applyRecommendedScholarship = async (recommendation) => {
		if (!user || !userId || isMutating || applyingRecommendationId) return
		if (archivedGrantorIds.has(String(recommendation.grantorId || recommendation.providerId || ""))) {
			toast.error("This grantor is archived and is not accepting scholarship applications.")
			return
		}
		if (isScholarshipActionBlocked()) return
		if (latestRejectedCooldown?.active) {
			toast.info(
				`You can apply again after ${formatCooldownDuration(latestRejectedCooldown.remainingMs)}. Your previous application was rejected and is still under the 24-hour cooldown.`,
			)
			return
		}
		if (hasLockedScholarship || hasActiveOrPendingScholarship) {
			toast.info(applicationLockTooltip)
			return
		}

		const recommendationId = recommendationKey(recommendation) || recommendation.grantorId || recommendation.id
		const rejectedMatch = getRejectedCooldownForTarget(recommendation)
		if (rejectedMatch?.cooldown?.active) {
			toast.info(
				`You can re-apply to ${getRejectionProviderLabel(rejectedMatch.record)} after ${formatCooldownDuration(rejectedMatch.cooldown.remainingMs)}.`,
			)
			return
		}
		const archivedBlock = getArchivedGrantorBlockForTarget(recommendation)
		if (archivedBlock) {
			toast.info(`You cannot apply to ${recommendation.grantorName || "this grantor"} again unless they invite you back.`)
			return
		}

		setIsMutating(true)
		setApplyingRecommendationId(recommendationId)
		try {
			const reapplyScholarships = scholarships.filter(
				(item) => !isScholarshipRejected(item) || !matchesScholarshipTarget(item, recommendation),
			)
			const { workflowPayload } = buildRecommendationApplyPayload(
				{ ...user, scholarships: reapplyScholarships },
				userId,
				recommendation,
			)
			await applyScholarshipWorkflow(workflowPayload)
			setUser((prev) => ({
				...(prev || {}),
				scholarships: workflowPayload.studentUpdate.scholarships,
				updatedAt: serverTimestamp(),
			}))
			await syncWarnings(workflowPayload.studentUpdate.scholarships)
			toast.success(`Application sent to ${recommendation.grantorName || "the grantor"}. Upload the required documents next to continue.`)
		} catch (error) {
			console.error("Failed to apply recommended scholarship:", error)
			toast.error(
				String(error?.message || "").toLowerCase().includes("grantor is archived")
					? error.message
					: "Failed to apply recommended scholarship. Please try again.",
			)
		} finally {
			setApplyingRecommendationId("")
			setIsMutating(false)
		}
	}

	const _applyScholarship = async (catalogItem) => {
		if (!user || !userId || isMutating) return
		if (isScholarshipActionBlocked()) return
		if (latestRejectedCooldown?.active) {
			toast.info(
				`You can apply again after ${formatCooldownDuration(latestRejectedCooldown.remainingMs)}. Your previous application was rejected and is still under the 24-hour cooldown.`,
			)
			return
		}
		const rejectedMatch = getRejectedCooldownForTarget(catalogItem)
		if (rejectedMatch?.cooldown?.active) {
			toast.info(
				`You can re-apply to ${getRejectionProviderLabel(rejectedMatch.record)} after ${formatCooldownDuration(rejectedMatch.cooldown.remainingMs)}.`,
			)
			return
		}
		const archivedBlock = getArchivedGrantorBlockForTarget(catalogItem)
		if (archivedBlock) {
			toast.info(`You cannot apply to ${catalogItem.name || "this grantor"} again unless they invite you back.`)
			return
		}
		if (blockedProviderTypes.has(catalogItem.providerType)) {
			toast.info(
				`Applications for ${
					blockedProviderLabels[catalogItem.providerType] || catalogItem.name
				} are currently closed.`,
			)
			return
		}
		if (hasLockedScholarship) {
			toast.info("Your scholarship selection is already locked for this semester.")
			return
		}
		if (
			scholarships.some(
				(item) =>
					item.providerType === catalogItem.providerType &&
					isScholarshipActiveOrPending(item.status),
			)
		) {
			toast.info("You already have an active application for this scholarship.")
			return
		}
		if (hasActiveOrPendingScholarship) {
			toast.info(applicationLockTooltip)
			return
		}

		setIsMutating(true)
		try {
			const nextRecord = buildScholarshipRecord({
				name: catalogItem.name,
				provider: catalogItem.name,
				studentId: userId,
				type: "Scholarship",
				mode: "applied",
				documentUrls: getDocumentUrlsForStudent(user),
				semesterTag: getCurrentSemesterTag(),
			})
			const reapplyScholarships = scholarships.filter(
				(item) => !isScholarshipRejected(item) || !matchesScholarshipTarget(item, catalogItem),
			)
			const nextScholarships = [...reapplyScholarships, nextRecord]

			await applyScholarshipWorkflow({
				studentId: userId,
				studentUpdate: {
					scholarships: nextScholarships,
					updatedAt: serverTimestamp(),
				},
				application: {
				studentId: userId,
				fname: user?.fname || "",
				mname: user?.mname || "",
				lname: user?.lname || "",
				fullName:
					[user?.fname, user?.mname, user?.lname].filter(Boolean).join(" ").trim() ||
					"Applicant",
				email: user?.email || "",
				cpNumber: user?.cpNumber || "",
				scholarshipId: nextRecord.id,
				applicationNumber:
					nextRecord.applicationNumber || nextRecord.requestNumber || nextRecord.id,
				scholarshipName: nextRecord.name,
				providerType: nextRecord.providerType,
				providerLabel: nextRecord.provider || nextRecord.name,
				status: nextRecord.status,
				tracking: nextRecord.tracking,
				applicationDate: serverTimestamp(),
				semesterTag: nextRecord.semesterTag,
				documentUrls: nextRecord.documentUrls,
				academicYear: getCurrentAcademicYear(),
				},
			})
			setUser((prev) => ({ ...(prev || {}), scholarships: nextScholarships }))
			await syncWarnings(nextScholarships)
			toast.success(`${catalogItem.name} application recorded. Upload the required documents next to continue.`)
		} catch (error) {
			console.error("Failed to apply scholarship:", error)
			toast.error("Failed to apply scholarship. Please try again.")
		} finally {
			setIsMutating(false)
		}
	}

	const acceptScholarshipInvitation = async (invitation = {}) => {
		if (!user || !userId || isMutating || !invitation?.id) return
		if (isScholarshipActionBlocked()) return
		if (latestRejectedCooldown?.active) {
			toast.info(
				`You can apply again after ${formatCooldownDuration(latestRejectedCooldown.remainingMs)}. Your previous application was rejected and is still under the 24-hour cooldown.`,
			)
			return
		}
		if (hasLockedScholarship || hasActiveOrPendingScholarship) {
			toast.info(applicationLockTooltip)
			return
		}

		const invitationTarget = {
			id: invitation.id,
			grantorId: invitation.grantorId || "",
			grantorName: invitation.grantorName || "Grantor",
			providerLabel: invitation.scholarshipName || invitation.grantorName || "Scholarship",
			announcementTitle: invitation.scholarshipName || invitation.grantorName || "Scholarship",
			providerType: invitation.providerType || toScholarshipProviderType(invitation.grantorName || invitation.scholarshipName || "Scholarship"),
			minimumGwa: invitation.minimumGwa || invitation.minGwa || "",
			requiredDocuments: invitation.requiredDocuments || {},
			otherRequirements: invitation.otherRequirements || [],
		}
		const retainedScholarships = scholarships.filter((item) => !matchesArchivedGrantorTarget(item, invitationTarget))
		const nextInvitations = (Array.isArray(user?.scholarshipInvitations) ? user.scholarshipInvitations : []).map((item) =>
			item.id === invitation.id
				? {
						...item,
						status: "Accepted",
						acceptedAt: serverTimestamp(),
						updatedAt: serverTimestamp(),
					}
				: item,
		)

		setIsMutating(true)
		try {
			const { workflowPayload } = buildRecommendationApplyPayload(
				{
					...user,
					scholarships: retainedScholarships,
				},
				userId,
				invitationTarget,
			)
			await applyScholarshipWorkflow({
				...workflowPayload,
				allowArchivedGrantorReapply: true,
				studentUpdate: {
					...workflowPayload.studentUpdate,
					scholarshipInvitations: nextInvitations,
				},
			})
			if (invitation.grantorId && invitation.scholarId) {
				await setDoc(
					doc(db, GRANTOR_PORTAL_COLLECTION, invitation.grantorId, GRANTOR_SUBCOLLECTIONS.scholars, invitation.scholarId),
					{
						status: "Pending",
						archived: false,
						frozen: false,
						unarchiveInvitationPending: false,
						invitationAcceptedAt: serverTimestamp(),
						scholarshipTitle: invitation.scholarshipName || invitationTarget.providerLabel,
						updatedAt: serverTimestamp(),
					},
					{ merge: true },
				)
			}
			setUser((prev) => ({
				...(prev || {}),
				scholarships: workflowPayload.studentUpdate.scholarships,
				scholarshipInvitations: nextInvitations,
				updatedAt: serverTimestamp(),
			}))
			await syncWarnings(workflowPayload.studentUpdate.scholarships)
			toast.success(`Invitation accepted. Your application for ${invitationTarget.providerLabel} was submitted.`)
		} catch (error) {
			console.error("Failed to accept scholarship invitation:", error)
			toast.error("Failed to accept the scholarship invitation. Please try again.")
		} finally {
			setIsMutating(false)
		}
	}

	const rejectScholarshipInvitation = async () => {
		const invitation = invitationDecision
		if (!user || !userId || isMutating || !invitation?.id) return
		const reason = invitationRejectReason === "Other"
			? invitationRejectNotes.trim() || "Other reason"
			: invitationRejectReason
		const nextInvitations = (Array.isArray(user?.scholarshipInvitations) ? user.scholarshipInvitations : []).map((item) =>
			item.id === invitation.id
				? {
						...item,
						status: "Rejected",
						rejectedAt: serverTimestamp(),
						rejectionReason: reason,
						rejectionNotes: invitationRejectNotes.trim(),
						updatedAt: serverTimestamp(),
					}
				: item,
		)

		setIsMutating(true)
		try {
			await setDoc(
				doc(db, "students", userId),
				{
					scholarshipInvitations: nextInvitations,
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)
			if (invitation.grantorId && invitation.scholarId) {
				await setDoc(
					doc(db, GRANTOR_PORTAL_COLLECTION, invitation.grantorId, GRANTOR_SUBCOLLECTIONS.scholars, invitation.scholarId),
					{
						status: "Archived",
						archived: true,
						frozen: true,
						unarchiveInvitationPending: false,
						invitationRejectedAt: serverTimestamp(),
						invitationRejectionReason: reason,
						invitationRejectionNotes: invitationRejectNotes.trim(),
						updatedAt: serverTimestamp(),
					},
					{ merge: true },
				)
			}
			await createStudentNotification({
				studentId: userId,
				source: "personal",
				type: "scholarship_invitation_rejected",
				title: "Scholarship Invitation Rejected",
				message: `You rejected the invitation from ${invitation.grantorName || "the grantor"} for ${invitation.scholarshipName || "their scholarship"}. Reason: ${reason}${invitationRejectNotes.trim() ? ` - ${invitationRejectNotes.trim()}` : ""}`,
				grantorId: invitation.grantorId || "",
				authorName: invitation.grantorName || "Grantor",
				read: false,
				createdAt: serverTimestamp(),
			}).catch((error) => console.warn("Student invitation rejection inbox notification failed:", error))
			setUser((prev) => ({
				...(prev || {}),
				scholarshipInvitations: nextInvitations,
				updatedAt: serverTimestamp(),
			}))
			toast.info("Scholarship invitation rejected.")
		} catch (error) {
			console.error("Failed to reject scholarship invitation:", error)
			toast.error("Failed to reject the scholarship invitation. Please try again.")
		} finally {
			setIsMutating(false)
			setInvitationDecision(null)
			setInvitationRejectReason("Not interested")
			setInvitationRejectNotes("")
		}
	}

	const chooseScholarship = async (target) => {
		if (!user || !userId || isMutating || !target) return
		if (isScholarshipActionBlocked({ allowConflictResolution: true })) return

		setIsMutating(true)
		try {
			const selected = scholarships.find((item) => item.id === target.id)
			if (!selected) {
				toast.error("Scholarship record not found.")
				return
			}
			const isResolvingMultipleScholarshipConflict =
				user?.scholarshipRestrictionReason === "multiple_scholarships" ||
				user?.scholarshipConflictWarning === true
			if (selected.adminBlocked === true && !isResolvingMultipleScholarshipConflict) {
				toast.warning(
					"This scholarship is blocked by the scholarship office. Please visit the office for unblocking.",
				)
				return
			}

			const nextScholarships = [
				{
					...selected,
					adminBlocked: false,
					adminBlockedAt: null,
				},
			]
			const shouldClearConflictRestriction = isResolvingMultipleScholarshipConflict
			const nextRestrictions = shouldClearConflictRestriction
				? {
						...(user.restrictions || {}),
						scholarshipEligibility: user?.soeComplianceBlocked === true,
						complianceHold: user?.soeComplianceBlocked === true,
					}
				: user?.restrictions
			await materialRequestWorkflow({
				updates: [
					{
						table: "students",
						id: userId,
						data: {
							scholarships: nextScholarships,
							scholarshipConflictWarning: shouldClearConflictRestriction ? false : user?.scholarshipConflictWarning === true,
							scholarshipConflictMessage: shouldClearConflictRestriction ? "" : user?.scholarshipConflictMessage || "",
							scholarshipRestrictionReason: shouldClearConflictRestriction ? null : user?.scholarshipRestrictionReason || null,
							...(nextRestrictions ? { restrictions: nextRestrictions } : {}),
							updatedAt: serverTimestamp(),
						},
					},
				],
			})

			setUser((prev) => ({
				...(prev || {}),
				scholarships: nextScholarships,
				scholarshipConflictWarning: shouldClearConflictRestriction ? false : prev?.scholarshipConflictWarning === true,
				scholarshipConflictMessage: shouldClearConflictRestriction ? "" : prev?.scholarshipConflictMessage || "",
				scholarshipRestrictionReason: shouldClearConflictRestriction ? null : prev?.scholarshipRestrictionReason || null,
				...(nextRestrictions ? { restrictions: nextRestrictions } : {}),
			}))
			await syncWarnings(nextScholarships)
			const selectedDocumentCheck = validateScholarshipDocuments(user, selected.name)
			toast.success(
				shouldClearConflictRestriction
					? selectedDocumentCheck.ok
						? `${selected.name} selected. Your multiple scholarship warning has been cleared. You can now request your scholarship materials.`
						: `${selected.name} selected. Your multiple scholarship warning has been cleared. Upload the required documents before requesting materials.`
					: selectedDocumentCheck.ok
						? `${selected.name} selected. You can now request your scholarship materials.`
						: `${selected.name} selected. Upload the required documents before requesting materials.`,
			)
		} catch (error) {
			console.error("Failed to choose scholarship:", error)
			toast.error("Failed to save your scholarship choice. Please try again.")
		} finally {
			setIsMutating(false)
			setConfirmTarget(null)
		}
	}

	const requestMaterial = async (target, materialKey) => {
		if (!user || !userId || isMutating || !target) return
		if (isScholarshipActionBlocked()) return
		const materialConfig = getMaterialRequestType(materialKey)
		setIsMutating(true)
		try {
			const selected = scholarships.find((item) => item.id === target.id)
			if (!selected) {
				toast.error("Scholarship record not found.")
				return
			}
			if (isScholarshipFrozen(selected)) {
				toast.warning("This scholarship was archived by the grantor. Your application is frozen and cannot proceed until it is restored.")
				return
			}
			const selectedDocumentCheck = validateScholarshipDocuments(user, selected.name)
			const selectedTrackingProgress = getTrackingProgressForScholarship(selected)
			if (!selectedTrackingProgress.canRequestMaterials) {
				toast.info(
					`The current step is ${selectedTrackingProgress.currentStepLabel}. Complete this stage first before requesting ${materialConfig.label.toLowerCase()}.`,
				)
				return
			}
			if (!selectedDocumentCheck.ok) {
				setDocumentUploadPrompt({
					target: selected,
					materialKey,
					documentCheck: selectedDocumentCheck,
				})
				return
			}

			const latestRequest = getLatestMaterialRequest(selected.id)
			const currentRequestState = latestRequest
				? getMaterialRequestState(latestRequest, materialKey)
				: "none"
			if (currentRequestState === "pending") {
				toast.info(`Your ${materialConfig.label.toLowerCase()} request is already pending admin approval.`)
				return
			}
			if (currentRequestState === "approved") {
				toast.info(`This ${materialConfig.label.toLowerCase()} request is already approved. You can download it now.`)
				return
			}
			if (selected.adminBlocked === true) {
				toast.warning(
					"This scholarship is blocked by the scholarship office. Please visit the office for unblocking.",
				)
				return
			}

			const requestedAt = new Date().toISOString()
			const requestDocId = getMaterialRequestDocumentId(userId, selected.id)
			const normalizedExistingRequest = latestRequest
				? normalizeMaterialRequest(latestRequest)
				: null
			const existingSoeEntry = getMaterialEntry(normalizedExistingRequest || {}, "soe")
			const existingApplicationFormEntry = getMaterialEntry(
				normalizedExistingRequest || {},
				"application_form",
			)
			const finalizedRecord = {
				...selected,
				isLocked: true,
				status: "Finalized",
				finalizedState: "Pending Approval",
				requestedSoeAt:
					materialKey === "soe"
						? requestedAt
						: selected.requestedSoeAt || normalizedExistingRequest?.materials?.soe?.requestedAt || null,
				requestedApplicationFormAt:
					materialKey === "application_form"
						? requestedAt
						: selected.requestedApplicationFormAt ||
						  normalizedExistingRequest?.materials?.application_form?.requestedAt ||
						  null,
			}

			const shouldCollapse = scholarships.length >= 2
			const nextScholarships = shouldCollapse
				? [finalizedRecord]
				: scholarships.map((item) =>
						item.id === selected.id ? finalizedRecord : item,
					)

			await materialRequestWorkflow({
				updates: [
					{
						table: "students",
						id: userId,
						data: {
							scholarships: nextScholarships,
							updatedAt: serverTimestamp(),
							lastSoeStatus: materialKey === "soe" ? "Pending" : user?.lastSoeStatus || "",
						},
					},
					{
						table: "soe_requests",
						id: requestDocId,
						upsert: true,
						data: {
							requestNumber: selected.requestNumber || selected.id,
							applicationNumber:
								selected.applicationNumber || selected.requestNumber || selected.id,
							studentId: userId,
							studentName: getStudentFullName(user),
							fullName: getStudentFullName(user),
							scholarshipId: selected.id,
							scholarshipName: selected.name,
							grantorId: selected.grantorId || selected.matchedGrantorId || "",
							grantorName: selected.grantorName || selected.matchedGrantorName || selected.provider || "",
							providerType: selected.providerType,
							materialKey,
							materialLabel: materialConfig.label,
							requestType: materialConfig.label,
							timestamp: serverTimestamp(),
							status: "Pending",
							reviewState: "incoming",
							requestedMaterials: {
								soe:
									materialKey === "soe"
										? true
										: normalizedExistingRequest?.materials?.soe?.requested === true,
								application_form:
									materialKey === "application_form"
										? true
										: normalizedExistingRequest?.materials?.application_form?.requested === true,
							},
							materials: {
								soe:
									materialKey === "soe"
										? {
												requested: true,
												status: "pending",
												requestedAt: serverTimestamp(),
												approvedAt: null,
												rejectedAt: null,
												downloadedAt: existingSoeEntry.downloadedAt || null,
											}
										: existingSoeEntry.requested
											? {
													requested: true,
													status: existingSoeEntry.status,
													requestedAt: existingSoeEntry.requestedAt || null,
													approvedAt: existingSoeEntry.approvedAt || null,
													rejectedAt: existingSoeEntry.rejectedAt || null,
													downloadedAt: existingSoeEntry.downloadedAt || null,
												}
											: {
													requested: false,
													status: "none",
													requestedAt: null,
													approvedAt: null,
													rejectedAt: null,
													downloadedAt: null,
												},
								application_form:
									materialKey === "application_form"
										? {
												requested: true,
												status: "pending",
												requestedAt: serverTimestamp(),
												approvedAt: null,
												rejectedAt: null,
												downloadedAt: existingApplicationFormEntry.downloadedAt || null,
											}
										: existingApplicationFormEntry.requested
											? {
													requested: true,
													status: existingApplicationFormEntry.status,
													requestedAt: existingApplicationFormEntry.requestedAt || null,
													approvedAt: existingApplicationFormEntry.approvedAt || null,
													rejectedAt: existingApplicationFormEntry.rejectedAt || null,
													downloadedAt: existingApplicationFormEntry.downloadedAt || null,
												}
											: {
													requested: false,
													status: "none",
													requestedAt: null,
													approvedAt: null,
													rejectedAt: null,
													downloadedAt: null,
												},
							},
							academicYear: getCurrentAcademicYear(),
							semesterTag: selected.semesterTag || getCurrentSemesterTag(),
							updatedAt: serverTimestamp(),
							createdAt: normalizedExistingRequest?.createdAt || serverTimestamp(),
						},
					},
				],
			})

			setStudentSoeRequests((prev) => [
				normalizeMaterialRequest({
					id: requestDocId,
					requestNumber: selected.requestNumber || selected.id,
					applicationNumber:
						selected.applicationNumber || selected.requestNumber || selected.id,
					studentId: userId,
					scholarshipId: selected.id,
					scholarshipName: selected.name,
					providerType: selected.providerType,
					timestamp: requestedAt,
					status: "Pending",
					reviewState: "incoming",
					academicYear: getCurrentAcademicYear(),
					semesterTag: selected.semesterTag || getCurrentSemesterTag(),
					materials: {
						soe:
							materialKey === "soe"
								? {
										requested: true,
										status: "pending",
										requestedAt,
										approvedAt: null,
										rejectedAt: null,
										downloadedAt: existingSoeEntry.downloadedAt || null,
									}
								: existingSoeEntry,
						application_form:
							materialKey === "application_form"
								? {
										requested: true,
										status: "pending",
										requestedAt,
										approvedAt: null,
										rejectedAt: null,
										downloadedAt: existingApplicationFormEntry.downloadedAt || null,
									}
								: existingApplicationFormEntry,
					},
				}),
				...prev.filter(
					(request) =>
						(request.scholarshipId || request.requestNumber) !==
						(selected.id || selected.requestNumber),
				),
			])
			setUser((prev) => ({ ...(prev || {}), scholarships: nextScholarships }))
			await syncWarnings(nextScholarships)

			toast.success(
				`${materialConfig.label} request submitted. Wait for admin approval before downloading.`,
			)
		} catch (error) {
			console.error(`Failed to request ${materialKey}:`, error)
			toast.error(`${materialConfig?.label || "Material"} request failed. Please try again.`)
		} finally {
			setIsMutating(false)
			setConfirmTarget(null)
		}
	}

	const handleRequestMaterial = (target, materialKey) => {
		if (!target) return
		if (isScholarshipActionBlocked()) return
		if (materialKey === "application_form") {
			handleDownloadApplicationForm(target)
			return
		}
		if (hasMultipleScholarshipChoices) {
			toast.info(`Choose one scholarship first before requesting ${toMaterialLabel(materialKey).toLowerCase()}.`)
			return
		}
		const selectedDocumentCheck = validateScholarshipDocuments(user, target.name)
		const selectedTrackingProgress = getTrackingProgressForScholarship(target)
		if (!selectedTrackingProgress.canRequestMaterials) {
			toast.info(
				`The current step is ${selectedTrackingProgress.currentStepLabel}. Complete this stage first before requesting ${toMaterialLabel(materialKey).toLowerCase()}.`,
			)
			return
		}
		if (!selectedDocumentCheck.ok) {
			setDocumentUploadPrompt({
				target,
				materialKey,
				documentCheck: selectedDocumentCheck,
			})
			return
		}
		const currentRequestState = getMaterialStateForScholarship(target, materialKey)
		if (currentRequestState === "pending") {
			toast.info(`Your ${toMaterialLabel(materialKey).toLowerCase()} request is already pending admin approval.`)
			return
		}
		if (currentRequestState === "approved") {
			toast.info(`This ${toMaterialLabel(materialKey).toLowerCase()} request is already approved. You can download it now.`)
			return
		}
		if (target.adminBlocked === true) {
			toast.warning(
				"This scholarship is blocked by the scholarship office. Please visit the office for unblocking.",
			)
			return
		}
		if (scholarships.length >= 2) {
			setConfirmTarget(target)
			return
		}
		requestMaterial(target, materialKey)
	}

	const getExportWindow = () => {
		const signedSoeDownload = [...studentSoeDownloads]
			.filter((download) => {
				const state = String(download.reviewState || download.status || "").toLowerCase()
				return state === "signed"
			})
			.sort((a, b) => {
				const left = toJsDate(a.signedAt || a.checkedAt || a.updatedAt || a.downloadedAt)?.getTime() || 0
				const right = toJsDate(b.signedAt || b.checkedAt || b.updatedAt || b.downloadedAt)?.getTime() || 0
				return right - left
			})[0]
		const lastExportDate = toJsDate(
			signedSoeDownload?.signedAt ||
				signedSoeDownload?.checkedAt ||
				signedSoeDownload?.updatedAt ||
				(studentSoeDownloads.length === 0 ? user?.soeLastExportAt : null),
		)
		if (!lastExportDate) {
			return {
				locked: false,
				lastExportDate: null,
				nextAllowedDate: null,
			}
		}
		const nextAllowedDate = addMonths(lastExportDate, SOE_EXPORT_LOCK_MONTHS)
		return {
			locked: Date.now() < nextAllowedDate.getTime(),
			lastExportDate,
			nextAllowedDate,
		}
	}

	const requireExportWindowOpen = () => {
		const { locked, nextAllowedDate } = getExportWindow()
		if (!locked) return true
		toast.warning(
			`SOE export is limited to once every ${SOE_EXPORT_LOCK_MONTHS} months. Next export: ${nextAllowedDate.toLocaleDateString("en-PH", {
				month: "long",
				day: "numeric",
				year: "numeric",
			})}.`,
		)
		return false
	}

	const handleDownloadSoe = (target) => {
		if (!target) return
		if (isScholarshipActionBlocked()) return
		if (isScholarshipFrozen(target)) {
			toast.warning("This scholarship was archived by the grantor. SOE download is unavailable until it is restored.")
			return
		}
		if (hasMultipleScholarshipChoices) {
			toast.info("Choose one scholarship first before downloading SOE.")
			return
		}
		const downloadGate = getMaterialDownloadGate(target, "soe")
		if (!downloadGate.canDownload) {
			toast.warning(downloadGate.reason)
			return
		}
		if (!requireExportWindowOpen()) return
		setExpenseModalTarget(target)
		const savedExpenses =
			Array.isArray(user?.soeExpenseItems) && user.soeExpenseItems.length > 0
				? user.soeExpenseItems.map((item) => ({
						label: item?.label || "",
						amount: item?.amount != null ? String(item.amount) : "",
					}))
				: [{ label: "", amount: "" }]
		setSoeExpenses(savedExpenses)
	}

	const handleExpenseRowChange = (index, field, value) => {
		setSoeExpenses((prev) =>
			prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row)),
		)
	}

	const handleAddExpenseRow = () => {
		setSoeExpenses((prev) => [...prev, { label: "", amount: "" }])
	}

	const handleRemoveExpenseRow = (index) => {
		setSoeExpenses((prev) => {
			if (prev.length <= 1) return prev
			return prev.filter((_, idx) => idx !== index)
		})
	}

	const closeExpenseModal = () => {
		setExpenseModalTarget(null)
		setSoeExpenses([{ label: "", amount: "" }])
	}

	const closeSoePreview = () => {
		setIsSoePreviewOpen(false)
		setSoePreviewRequestNumber("")
		setSoePreviewTargetId("")
		setSoePreviewBytes(null)
		if (soePreviewUrl) {
			URL.revokeObjectURL(soePreviewUrl)
		}
		setSoePreviewUrl("")
	}

	const handleExportSoeWithExpenses = async () => {
		if (!expenseModalTarget || isExportingSoe) return
		if (isScholarshipActionBlocked()) return
		if (!requireExportWindowOpen()) return

		const hasPartialRow = soeExpenses.some((row) => {
			const hasLabel = Boolean(row.label?.trim())
			const hasAmount = String(row.amount ?? "").trim() !== ""
			return (hasLabel && !hasAmount) || (!hasLabel && hasAmount)
		})
		if (hasPartialRow) {
			toast.error("Complete both Expense and Amount for each filled row.")
			return
		}

		const preparedExpenses = soeExpenses
			.map((row) => ({
				label: row.label.trim(),
				amount: Number(row.amount),
			}))
			.filter(
				(row) => row.label && Number.isFinite(row.amount) && row.amount > 0,
			)

		if (preparedExpenses.length === 0) {
			toast.error("Please add at least one expense item.")
			return
		}

		setIsExportingSoe(true)
		try {
			const { requestNumber, pdfBytes } = await exportSoePdfDocument({
				student: user || {},
				studentId: userId,
				expenses: preparedExpenses,
				autoDownload: false,
				requestNumber: "",
			})

			const previewBlob = new Blob([pdfBytes], { type: "application/pdf" })
			const nextUrl = URL.createObjectURL(previewBlob)
			if (soePreviewUrl) {
				URL.revokeObjectURL(soePreviewUrl)
			}

			setSoePreviewBytes(pdfBytes)
			setSoePreviewRequestNumber(requestNumber)
			setSoePreviewTargetId(expenseModalTarget.id || "")
			setSoePreviewUrl(nextUrl)
			setIsSoePreviewOpen(true)
			setExpenseModalTarget(null)
		} catch (error) {
			console.error("Failed to export SOE:", error)
			toast.error("Unable to export SOE PDF. Please try again.")
		} finally {
			setIsExportingSoe(false)
		}
	}

	const handleDownloadApplicationForm = async (target) => {
		if (!target || !userId || isDownloadingApplicationForm) return
		if (isScholarshipActionBlocked()) return
		if (hasMultipleScholarshipChoices) {
			toast.info("Choose one scholarship first before downloading the student application profile.")
			return
		}

		setIsDownloadingApplicationForm(true)
		try {
			await downloadStudentApplicationProfile({
				student: user || {},
				studentId: userId,
				scholarship: target,
			})

			const downloadedAt = new Date().toISOString()
			const nextScholarships = scholarships.map((entry) =>
				entry.id === target.id
					? {
							...entry,
							applicationFormDownloadedAt: downloadedAt,
						}
					: entry,
			)

			await materialRequestWorkflow({
				updates: [
					{
						table: "students",
						id: userId,
						data: {
							scholarships: nextScholarships,
							updatedAt: serverTimestamp(),
						},
					},
				],
			})
			setUser((prev) => ({ ...(prev || {}), scholarships: nextScholarships }))

			toast.success("Student application profile downloaded.")
		} catch (error) {
			console.error("Failed to download student application profile:", error)
			toast.error("Unable to download the student application profile. Please try again.")
		} finally {
			setIsDownloadingApplicationForm(false)
		}
	}

	const handleConfirmDownloadSoe = async () => {
		if (!soePreviewBytes || !userId || isDownloadingSoe) return
		if (isScholarshipActionBlocked()) return

		const latestStudentSnap = await getDoc(doc(db, "students", userId))
		if (!latestStudentSnap.exists()) {
			toast.error("Student record not found. Please log in again.")
			closeSoePreview()
			return
		}
		const latestStudentData = latestStudentSnap.data() || {}
		const latestStudent = {
			...latestStudentData,
			scholarships: normalizeScholarshipList(latestStudentData.scholarships || []),
			corFile: withCurrentSemesterTag(latestStudentData.corFile),
			cogFile: withCurrentSemesterTag(latestStudentData.cogFile),
		}
		const latestAccessState = getStudentAccessState(latestStudent)
		if (latestAccessState.isPortalAccessBlocked) {
			sessionStorage.removeItem("bulsuscholar_userId")
			sessionStorage.removeItem("bulsuscholar_userType")
			setUser(latestStudent)
			toast.error(getPortalAccessBlockMessage(latestStudent))
			closeSoePreview()
			navigate("/", { replace: true })
			return
		}
		if (latestAccessState.isScholarshipActionBlocked) {
			setUser(latestStudent)
			toast.error(getScholarshipActionBlockMessage(latestStudent))
			closeSoePreview()
			return
		}
		const previewTarget = latestStudent.scholarships.find((entry) => entry.id === soePreviewTargetId) || null
		const downloadGate = getMaterialDownloadGate(previewTarget, "soe")
		if (!downloadGate.canDownload) {
			toast.warning(downloadGate.reason)
			closeSoePreview()
			return
		}
		if (!requireExportWindowOpen()) {
			closeSoePreview()
			return
		}

		setIsDownloadingSoe(true)
		try {
			const approvedRequest = previewTarget ? getLatestMaterialRequest(previewTarget.id) : null
			const applicationNumber =
				previewTarget?.applicationNumber ||
				approvedRequest?.applicationNumber ||
				previewTarget?.requestNumber ||
				approvedRequest?.requestNumber ||
				previewTarget?.id ||
				""
			const soeRequestNumber = resolveSoeRequestNumber(soePreviewRequestNumber, userId)
			downloadSoePdfBytes(
				soePreviewBytes,
				`SOE_${userId}.pdf`,
			)

			if (approvedRequest?.id) {
				await materialRequestWorkflow({
					updates: [
						{
							table: "soe_requests",
							id: approvedRequest.id,
							data: {
								"materials.soe.requested": true,
								"materials.soe.status": "approved",
								"materials.soe.downloadedAt": serverTimestamp(),
								downloadStatus: "Downloaded",
								downloadedAt: serverTimestamp(),
								updatedAt: serverTimestamp(),
							},
						},
					],
				})
				setStudentSoeRequests((prev) =>
					prev.map((request) =>
						request.id === approvedRequest.id
							? normalizeMaterialRequest({
									...request,
									downloadStatus: "Downloaded",
									downloadedAt: new Date().toISOString(),
									materials: {
										...(request.materials || normalizeMaterialRequest(request).materials),
										soe: {
											...getMaterialEntry(request, "soe"),
											requested: true,
											status: "approved",
											downloadedAt: new Date().toISOString(),
										},
									},
								})
							: request,
					),
				)
			}
			const downloadedAtIso = new Date().toISOString()
			const nextDownloadRow = {
				requestRecordId: approvedRequest?.id || "",
				applicationNumber,
				requestNumber: soeRequestNumber,
				studentId: userId,
				studentNumber: userId,
				studentName:
					[latestStudent.fname, latestStudent.mname, latestStudent.lname]
						.filter(Boolean)
						.join(" ")
						.trim() || "Student",
				scholarshipId: previewTarget?.id || approvedRequest?.scholarshipId || "",
				scholarshipName:
					previewTarget?.name ||
					approvedRequest?.scholarshipName ||
					"SCHOLARSHIP",
				providerType:
					previewTarget?.providerType ||
					approvedRequest?.providerType ||
					"",
				status: "Pending",
				reviewState: "incoming",
				downloadedAt: serverTimestamp(),
				createdAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
				studentSnapshot: {
					studentId: userId,
					studentNumber: userId,
					fullName:
						[latestStudent.fname, latestStudent.mname, latestStudent.lname]
							.filter(Boolean)
							.join(" ")
							.trim() || "Student",
					fname: latestStudent.fname || "",
					mname: latestStudent.mname || "",
					lname: latestStudent.lname || "",
					email: latestStudent.email || "",
					course: latestStudent.course || "",
					year: latestStudent.year || "",
					section: latestStudent.section || "",
				},
				soeSnapshot: {
					applicationNumber,
					requestNumber: soeRequestNumber,
					semesterTag: previewTarget?.semesterTag || "",
					academicYear: approvedRequest?.academicYear || "",
					expenseItems: Array.isArray(latestStudent.soeExpenseItems)
						? latestStudent.soeExpenseItems
						: [],
				},
			}
			const nextLatestScholarships = latestStudent.scholarships.map((entry) => {
				const isTarget =
					entry.id === previewTarget?.id ||
					entry.requestNumber === previewTarget?.requestNumber ||
					entry.applicationNumber === applicationNumber
				if (!isTarget) return entry
				const withRequestCompleted = completeScholarshipTrackingStep(entry.tracking, {
					providerType: entry.providerType || entry.provider || entry.name,
					scholarshipName: entry.name || entry.provider || "Scholarship",
					stepId: "request_materials",
					completedBy: "student",
				})
				return {
					...entry,
					tracking: completeScholarshipTrackingStep(withRequestCompleted, {
						providerType: entry.providerType || entry.provider || entry.name,
						scholarshipName: entry.name || entry.provider || "Scholarship",
						stepId: "download_materials",
						completedBy: "student",
					}),
					soeDownloadedAt: downloadedAtIso,
				}
			})
			await materialRequestWorkflow({
				inserts: [
					{
						table: "soe_downloads",
						data: nextDownloadRow,
					},
				],
			})
			setStudentSoeDownloads((prev) => [
				{
					...nextDownloadRow,
					downloadedAt: downloadedAtIso,
					createdAt: downloadedAtIso,
					updatedAt: downloadedAtIso,
				},
				...prev,
			])
			await materialRequestWorkflow({
				updates: [
					{
						table: "students",
						id: userId,
						data: {
							scholarships: nextLatestScholarships,
							updatedAt: serverTimestamp(),
						},
					},
				],
			})
			setUser((prev) => ({
				...(prev || {}),
				scholarships: nextLatestScholarships,
			}))
			toast.success(
				`SOE downloaded. SOE Request Number: ${soeRequestNumber}. Bring it to the scholarship office for signing.`,
			)
			closeSoePreview()
		} catch (error) {
			console.error("Failed to finalize SOE download:", error)
			toast.error("Failed to finalize SOE download. Please try again.")
		} finally {
			setIsDownloadingSoe(false)
		}
	}

	const handleSaveExpensePreset = async () => {
		if (!userId || isSavingExpensePreset) return
		if (isScholarshipActionBlocked()) return

		const hasPartialRow = soeExpenses.some((row) => {
			const hasLabel = Boolean(row.label?.trim())
			const hasAmount = String(row.amount ?? "").trim() !== ""
			return (hasLabel && !hasAmount) || (!hasLabel && hasAmount)
		})
		if (hasPartialRow) {
			toast.error("Complete both Expense and Amount for each filled row before saving.")
			return
		}

		const preparedExpenses = soeExpenses
			.map((row) => ({
				label: row.label.trim(),
				amount: Number(row.amount),
			}))
			.filter(
				(row) => row.label && Number.isFinite(row.amount) && row.amount > 0,
			)

		if (preparedExpenses.length === 0) {
			toast.error("Please add at least one expense item to save.")
			return
		}

		setIsSavingExpensePreset(true)
		try {
			await materialRequestWorkflow({
				updates: [
					{
						table: "students",
						id: userId,
						data: {
							soeExpenseItems: preparedExpenses,
							updatedAt: serverTimestamp(),
						},
					},
				],
			})
			setUser((prev) => ({ ...(prev || {}), soeExpenseItems: preparedExpenses }))
			toast.success("SOE expenses saved. They will auto-load next time.")
		} catch (error) {
			console.error("Failed to save SOE expenses:", error)
			toast.error("Failed to save expenses. Please try again.")
		} finally {
			setIsSavingExpensePreset(false)
		}
	}

	const modalExpenseTotal = soeExpenses.reduce((sum, row) => {
		const label = row.label?.trim()
		const amount = Number(row.amount)
		if (!label || !Number.isFinite(amount) || amount <= 0) return sum
		return sum + amount
	}, 0)
	const recommendationDisplayItems = useMemo(() => {
		if (warningRecommendationBlock) return []
		const adminRecommendedGrantors = new Set(
			adminScholarshipRecommendations
				.map((item) => String(item.grantorId || "").trim().toLowerCase())
				.filter(Boolean),
		)
		const allowedGrantors = adminRecommendedGrantors.size > 0
			? adminRecommendedGrantors
			: new Set(matchedGrantorScope.map((item) => String(item).toLowerCase()))
		const isAllowed = (item = {}) => {
			if (!allowedGrantors.size) return true
			const grantorId = String(item.grantorId || item.providerId || item.id || "").toLowerCase()
			return grantorId && allowedGrantors.has(grantorId)
		}
		const byKey = new Map()
		const pushRecommendation = (item = {}, { bypassGrantorScope = false } = {}) => {
			if (!item || (!bypassGrantorScope && !isAllowed(item))) return
			if (archivedGrantorIds.has(String(item.grantorId || item.providerId || ""))) return
			const key = recommendationKey(item)
			if (!key || byKey.has(key)) return
			byKey.set(key, item)
		}

		pendingScholarshipInvitations.forEach((invitation) => {
			pushRecommendation({
				...invitation,
				recommendationSource: "grantor_invitation",
				recommendationPriority: 1,
				label: "Apply again",
				announcementTitle: invitation.scholarshipName || invitation.announcementTitle || "Scholarship Invitation",
				providerLabel: invitation.scholarshipName || invitation.grantorName || "Scholarship",
				reasons: [
					`You are being invited to apply again in your previous scholarship ${invitation.scholarshipName || "scholarship"}.`,
					`Sent by ${invitation.grantorName || "Grantor"}.`,
				],
			}, { bypassGrantorScope: true })
		})

		if (latestRejectedApplication && !latestRejectedCooldown.active) {
			const matchingRecommendation = recommendedScholarships.find((item) => matchesScholarshipTarget(latestRejectedApplication, item))
			if (matchingRecommendation) {
				pushRecommendation({
					...matchingRecommendation,
					recommendationSource: "reapply_after_rejection",
					recommendationPriority: 1,
					label: "Try to apply again in this scholarship",
					reasons: [getRejectionReason(latestRejectedApplication), "The 24-hour cooldown is complete."],
				}, { bypassGrantorScope: true })
			}
		}

		adminScholarshipRecommendations.forEach((notice) => {
			const matchingRecommendation = recommendedScholarships.find((item) =>
				(notice.announcementId && item.announcementId === notice.announcementId) ||
				(notice.grantorId && item.grantorId === notice.grantorId),
			)
			pushRecommendation({
				...(matchingRecommendation || {}),
				grantorId: notice.grantorId || matchingRecommendation?.grantorId || "",
				grantorName: notice.grantorName || matchingRecommendation?.grantorName || "Grantor",
				providerLabel: notice.scholarshipName || matchingRecommendation?.providerLabel || notice.grantorName || "Scholarship",
				announcementId: notice.announcementId || matchingRecommendation?.announcementId || "",
				announcementTitle: notice.scholarshipName || matchingRecommendation?.announcementTitle || "Recommended Scholarship",
				minimumGwa: notice.minimumGwa || matchingRecommendation?.minimumGwa || matchingRecommendation?.minGwa || "",
				score: notice.score || matchingRecommendation?.score || "",
				recommendationSource: "admin_recommendation",
				recommendationPriority: 2,
				label: "Recommended by the Admin",
				reasons: Array.isArray(notice.reasons) && notice.reasons.length
					? notice.reasons
					: [notice.message || "BulsuScholar Admin recommended this scholarship based on your profile."],
			}, { bypassGrantorScope: true })
		})

		recommendedScholarships.forEach((recommendation) => {
			pushRecommendation({
				...recommendation,
				recommendationSource: hasMatchedGrantorScope ? "roster_scoped_recommendation" : "algorithm_recommendation",
				recommendationPriority: hasMatchedGrantorScope ? 2 : 3,
				label: hasMatchedGrantorScope
					? "Roster-matched scholarship option"
					: recommendation.label || "This scholarship is best for you",
			})
		})

		return [...byKey.values()]
			.sort((left, right) => {
				const priorityDiff = (left.recommendationPriority || 9) - (right.recommendationPriority || 9)
				if (priorityDiff !== 0) return priorityDiff
				return Number(right.score || 0) - Number(left.score || 0)
			})
	}, [
		adminScholarshipRecommendations,
		archivedGrantorIds,
		hasMatchedGrantorScope,
		latestRejectedApplication,
		latestRejectedCooldown.active,
		matchedGrantorScope,
		pendingScholarshipInvitations,
		recommendedScholarships,
		warningRecommendationBlock,
	])
	const recommendationDisplayPreview = useMemo(
		() => recommendationDisplayItems.slice(0, 3),
		[recommendationDisplayItems],
	)
	const scholarshipControlStats = [
		{
			label: scholarships.length > 0 ? "Applying To" : "Available Programs",
			value: kwspEntry?.name || scholarships[0]?.name || scholarshipCatalog.length,
			icon: HiOutlineAcademicCap,
		},
		{
			label: "Application Status",
			value: kwspTracking.applicationStatus || "Pending",
			icon: HiOutlineCheckCircle,
		},
		{
			label: "Materials",
			value: kwspTracking.materialStatus || "Not Requested",
			icon: HiOutlineDocumentText,
		},
	]

	if (!userLoaded) {
		return (
			<div className={`student-portal student-dashboard student-portal-view student-portal-view--scholarships ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
				<main className="student-shell">
					<div className="student-shell-content">
						<div className="student-loading-panel student-dashboard-loading-panel">
							<p className="dashboard-placeholder">Loading scholarships...</p>
						</div>
					</div>
				</main>
			</div>
		)
	}

	return (
		<div className={`student-portal student-dashboard student-portal-view student-portal-view--scholarships ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
			<StudentTopbar user={user} theme={theme} setTheme={setTheme} />

			<main className="student-shell">
				<div className="student-shell-content">
					<section className="student-scholarship-control-hero">
						<div className="student-scholarship-control-copy">
							<span className="student-scholarship-control-kicker">Scholarship Control Center</span>
							<h2>Manage your scholarship application</h2>
							<p>
								Track your current application, request approved materials, and review available scholarship programs in one place.
							</p>
						</div>
					</section>

					{hasBlockedScholarshipBanner ? (
						<div className="student-block-banner" role="alert">
							<HiOutlineExclamation className="student-block-icon" aria-hidden />
							<div className="student-block-copy">
								<p className="student-block-title">You have been blocked from scholarship actions</p>
								<p className="student-block-desc">{blockedScholarshipBannerCopy}</p>
							</div>
						</div>
					) : null}

					{!hasBlockedScholarshipBanner && hasMultipleScholarshipConflict ? (
						<div className="student-compliance-banner" role="alert">
							<HiOutlineExclamation className="student-compliance-icon" aria-hidden />
							<div className="student-compliance-copy">
								<p className="student-compliance-title">Scholarship compliance required</p>
								<p className="student-compliance-desc">{multipleScholarshipBannerCopy}</p>
							</div>
						</div>
					) : null}

					{lockedScholarship && (
						<div className="student-lock-banner">
							<HiOutlineCheckCircle aria-hidden />
							<div>
								<p className="student-lock-banner-title">Scholarship selection finalized</p>
								<p className="student-lock-banner-sub">
									{lockedScholarship.name} is locked for {lockedScholarship.semesterTag || getCurrentSemesterTag()}.
								</p>
							</div>
						</div>
					)}

					{latestRejectedApplication ? (
						<section className="student-rejection-panel" role="status">
							<div className="student-rejection-panel-icon">
								<HiOutlineExclamation aria-hidden />
							</div>
							<div className="student-rejection-panel-copy">
								<span>Application Rejected</span>
								<h3>{getRejectionProviderLabel(latestRejectedApplication)}</h3>
								<p>{getRejectionReason(latestRejectedApplication)}</p>
								<strong>
									{latestRejectedCooldown.active
										? `You can re-apply to this scholarship after ${formatCooldownDuration(latestRejectedCooldown.remainingMs)}.`
										: "The 24-hour cooldown is complete. You can re-apply to this scholarship if applications are still open."}
								</strong>
							</div>
						</section>
					) : null}

					{kwspEntry && !hasMultipleScholarshipChoices ? (
						<section
							className="student-kwsp-tracker-shell"
							aria-label={kwspTracking.trackerAriaLabel}
						>
							<div className="student-scholarship-board student-kwsp-tracker-board">
								<div className="student-kwsp-tracker-head">
									<div>
										<p className="student-kwsp-tracker-eyebrow">Student Tracking</p>
										<h3 className="student-kwsp-tracker-title">
											<span>Applying for: </span>
											<strong>{kwspTracking.trackedScholarshipLabel}</strong>
										</h3>
										<p className="student-kwsp-tracker-copy">{kwspTracking.trackerCopy}</p>
									</div>
									<span
										className={`student-kwsp-tracker-badge student-kwsp-tracker-badge--${kwspTracking.summaryTone}`}
									>
										{kwspTracking.currentStageLabel}
									</span>
								</div>
								<div className="student-kwsp-tracker-grid">
									<section className={`student-kwsp-next-panel student-kwsp-next-panel--${kwspTracking.nextPanelTone}`}>
										<span className="student-kwsp-next-kicker">What You Need To Do Next</span>
										<h4>{kwspTracking.nextActionTitle}</h4>
										<p>{kwspTracking.nextActionCopy}</p>
										{kwspTracking.nextActionHelp ? (
											<p className="student-kwsp-next-help">{kwspTracking.nextActionHelp}</p>
										) : null}
										<div className="student-kwsp-next-meta">
											{scholarshipControlStats.map((item) => {
												const Icon = item.icon
												return (
													<div className="student-kwsp-next-meta-card" key={item.label}>
														<Icon aria-hidden />
														<div>
															<span>{item.label}</span>
															<strong>{item.value}</strong>
														</div>
													</div>
												)
											})}
											<div className="student-kwsp-next-meta-card">
												<HiOutlineDocumentText aria-hidden />
												<div>
													<span>Application Number</span>
													<strong>{kwspTracking.applicationNumber}</strong>
												</div>
											</div>
										</div>
										{kwspEntry ? (() => {
											const entry = kwspEntry
											const entryFrozen = isScholarshipFrozen(entry)
											const entryRejected = isScholarshipRejected(entry)
											const entryTrackingProgress = getTrackingProgressForScholarship(entry)
											const soeRequestLabel = getMaterialLabelForScholarship(entry, "soe")
											const soeRequestButtonState = getMaterialRequestButtonState(entry, "soe")
											const soeDownloadGate = getMaterialDownloadGate(entry, "soe")

											return (
												<div className="student-kwsp-soe-box">
													<div className="student-kwsp-soe-copy">
														<span>SOE Request</span>
														<strong>{soeRequestLabel}</strong>
														<p>
															{entryFrozen
																? "This scholarship was archived by the grantor. You cannot proceed to the next step or request SOE until it is restored."
																: entryTrackingProgress.canRequestMaterials
																? "Request or download your SOE once the scholarship office approves the material stage."
																: `Current step: ${entryTrackingProgress.currentStepLabel}. Finish this stage before requesting SOE.`}
														</p>
													</div>
													<div className="student-kwsp-soe-actions">
														<button
															type="button"
															className="student-scholarship-request-soe student-mini-btn student-mini-btn--primary"
															disabled={
																isMutating ||
																entryRejected ||
																entryFrozen ||
																entry.adminBlocked === true ||
																hasScholarshipActionBlock ||
																!entryTrackingProgress.canRequestMaterials ||
																soeRequestButtonState.disabled
															}
															onClick={() => handleRequestMaterial(entry, "soe")}
														>
															<HiOutlineDocumentText />
															{studentAccessState.isPortalAccessBlocked
																? "Access Blocked"
																: entryFrozen
																	? "Frozen"
																: entryRejected
																	? "Rejected"
																: hasComplianceBlock
																	? "Compliance Hold"
																	: entry.adminBlocked === true
																		? "Blocked by Office"
																		: soeRequestButtonState.label}
														</button>
														<button
															type="button"
															className="student-scholarship-download-soe student-mini-btn student-mini-btn--secondary"
															disabled={
																hasScholarshipActionBlock ||
																entryRejected ||
																entryFrozen ||
																isExportingSoe ||
																isDownloadingSoe ||
																!soeDownloadGate.canDownload
															}
															title={
																soeDownloadGate.canDownload
																	? "Download your approved SOE"
																	: soeDownloadGate.reason
															}
															onClick={() => handleDownloadSoe(entry)}
														>
															<HiOutlineDocumentText />
															{studentAccessState.isPortalAccessBlocked
																? "Access Blocked"
																: entryFrozen
																	? "Frozen"
																: entryRejected
																	? "Rejected"
																: hasComplianceBlock
																	? "Compliance Hold"
																	: isExportingSoe || isDownloadingSoe
																		? "Processing..."
																		: soeDownloadGate.label}
														</button>
													</div>
													{renderOtherRequirementUploads(entry)}
												</div>
											)
										})() : null}
									</section>
									<section className="student-kwsp-step-list">
										{kwspTracking.steps.map((step, index) => (
											<article
												key={step.id}
												className={`student-kwsp-step student-kwsp-step--${step.state} ${
													kwspTracking.highlightedStepId === step.id
														? "student-kwsp-step--focus"
														: ""
												}`.trim()}
											>
												<div className="student-kwsp-step-marker" aria-hidden="true">
													<span>{String(index + 1).padStart(2, "0")}</span>
												</div>
												<div className="student-kwsp-step-content">
													<div className="student-kwsp-step-head">
														<h4>{step.label}</h4>
													{getScholarshipTrackingStepBadgeLabel(step, kwspTracking.steps) ? (
														<span
															className={`student-kwsp-step-state student-kwsp-step-state--${step.state}`}
														>
															{getScholarshipTrackingStepBadgeLabel(step, kwspTracking.steps)}
														</span>
													) : null}
													</div>
													<p>{step.detail}</p>
												</div>
											</article>
										))}
									</section>
								</div>
							</div>
						</section>
					) : null}

					{shouldShowScholarshipWorkspace ? (
						<section className="student-scholarship-workspace">
						<div className="student-scholarship-board">
							<div className="student-scholarship-board-head">
								<div>
									<span>Current Records</span>
									<h3>My Scholarship Applications</h3>
								</div>
								<strong>{scholarships.length} total</strong>
							</div>
							{hasMultipleScholarshipChoices ? (
								<p className="dashboard-placeholder">
									One scholarship per student policy: choose one scholarship first before SOE and Student Application Profile actions become available.
								</p>
							) : null}
							{scholarships.length === 0 ? (
								<p className="dashboard-placeholder">
									No scholarship application yet. Apply from the available programs below.
								</p>
							) : (
								<div className="student-scholarship-cards">
									{scholarships.map((entry) => {
										const entryFrozen = isScholarshipFrozen(entry)
										const entryRejected = isScholarshipRejected(entry)
										const entryRejectedMatch = entryRejected
											? { record: entry, cooldown: getRejectionCooldown(entry) }
											: getRejectedCooldownForTarget(entry)
										const entryTrackingProgress = getTrackingProgressForScholarship(entry)
										const soeRequestLabel = getMaterialLabelForScholarship(entry, "soe")
										const soeRequestButtonState = getMaterialRequestButtonState(entry, "soe")
										const soeDownloadGate = getMaterialDownloadGate(entry, "soe")

										return (
											<article
												key={entry.id}
												className={`student-scholarship-card ${
													entry.adminBlocked === true || hasScholarshipActionBlock
													|| entryFrozen || entryRejected
														? "student-scholarship-card--blocked"
														: ""
												}`.trim()}
											>
											<div className="student-scholarship-card-left">
												<HiOutlineAcademicCap className="student-scholarship-card-icon" aria-hidden />
											</div>
											<div className="student-scholarship-card-info">
												<h3 className="student-scholarship-card-name">{entry.name}</h3>
												<p className="student-scholarship-card-provider">
													{entry.status}
													{entry.finalizedState ? ` • ${entry.finalizedState}` : ""}
												</p>
												<p className="student-scholarship-card-provider">
													Semester: {entry.semesterTag}
												</p>
												{entry.matchSource === "grantor_roster" ? (
													<p className="student-scholarship-card-note">
												Matched grantor: {entry.matchedGrantorName || entry.name}. Upload the required COR and ROG before completing the form stage.
													</p>
												) : null}
												{entryFrozen ? (
													<p className="student-scholarship-card-note student-scholarship-card-note--warning">
														<HiOutlineExclamation aria-hidden /> Archived by grantor. Your application is frozen and cannot proceed until it is restored.
													</p>
												) : null}
												{entryRejected ? (
													<>
														<p className="student-scholarship-card-note student-scholarship-card-note--warning">
															<HiOutlineExclamation aria-hidden /> Rejected: {getRejectionReason(entry)}
														</p>
														<p className="student-scholarship-card-note student-scholarship-card-note--warning">
															{entryRejectedMatch?.cooldown?.active
																? `Re-apply cooldown: ${formatCooldownDuration(entryRejectedMatch.cooldown.remainingMs)} remaining.`
																: "Cooldown complete. You can re-apply if this scholarship is still open."}
														</p>
													</>
												) : !hasMultipleScholarshipChoices && !entryTrackingProgress.canRequestMaterials ? (
													<p className="student-scholarship-card-note">
														Current step: {entryTrackingProgress.currentStepLabel}. Finish this stage before requesting materials.
													</p>
												) : null}
												{entryRejected ? null : (
													<p className="student-scholarship-card-note">
														SOE: {hasMultipleScholarshipChoices ? "Choose one scholarship first" : soeRequestLabel}
													</p>
												)}
												{entry.providerType === "morisson" ? (
													<p className="student-scholarship-card-note">
														Application form: Get it directly from the scholarship office because Morisson forms are confidential.
													</p>
												) : null}
												<p className="student-scholarship-card-note">
													Application form: {getApplicationFormSource(entry).label}
												</p>
											</div>
											<div className="student-scholarship-card-action">
												<div className="student-scholarship-card-action-buttons">
													{hasMultipleScholarshipChoices ? (
														<button
															type="button"
															className="student-scholarship-request-soe student-mini-btn student-mini-btn--primary"
															disabled={
																isMutating ||
																entryFrozen ||
																studentAccessState.isPortalAccessBlocked ||
																studentAccessState.soeComplianceBlocked ||
																(entry.adminBlocked === true && !canResolveMultipleScholarshipConflict)
															}
															onClick={() => setConfirmTarget(entry)}
														>
															<HiOutlineCheckCircle />
															{studentAccessState.isPortalAccessBlocked
																? "Access Blocked"
																: entryFrozen
																? "Frozen"
																: entryRejected
																? "Rejected"
																: hasComplianceBlock
																? "Compliance Hold"
																: entry.adminBlocked === true && !canResolveMultipleScholarshipConflict
																? "Blocked by Office"
																: "Choose Scholarship"}
														</button>
													) : (
														<>
															<button
																type="button"
																className="student-scholarship-request-soe student-mini-btn student-mini-btn--primary"
																disabled={
																	isMutating ||
																	entryRejected ||
																	entryFrozen ||
																	entry.adminBlocked === true ||
																	hasScholarshipActionBlock ||
																	!entryTrackingProgress.canRequestMaterials ||
																	soeRequestButtonState.disabled
																}
																onClick={() => handleRequestMaterial(entry, "soe")}
															>
																<HiOutlineDocumentText />
																{studentAccessState.isPortalAccessBlocked
																	? "Access Blocked"
																	: entryFrozen
																		? "Frozen"
																	: entryRejected
																		? "Rejected"
																	: hasComplianceBlock
																		? "Compliance Hold"
																		: entry.adminBlocked === true
																			? "Blocked by Office"
																			: soeRequestButtonState.label}
															</button>
															<button
																type="button"
																className="student-scholarship-download-soe student-mini-btn student-mini-btn--secondary"
																disabled={
																	hasScholarshipActionBlock ||
																	entryRejected ||
																	entryFrozen ||
																	isExportingSoe ||
																	isDownloadingSoe ||
																	!soeDownloadGate.canDownload
																}
																title={
																	soeDownloadGate.canDownload
																		? "Download your approved SOE"
																		: soeDownloadGate.reason
																}
																onClick={() => handleDownloadSoe(entry)}
															>
																<HiOutlineDocumentText />
																{studentAccessState.isPortalAccessBlocked
																	? "Access Blocked"
																	: entryFrozen
																		? "Frozen"
																	: entryRejected
																		? "Rejected"
																	: hasComplianceBlock
																		? "Compliance Hold"
																		: isExportingSoe || isDownloadingSoe
																			? "Processing..."
																			: soeDownloadGate.label}
															</button>
														</>
													)}
												</div>
												{!hasMultipleScholarshipChoices ? renderOtherRequirementUploads(entry) : null}
											</div>
											</article>
										)
									})}
								</div>
							)}
						</div>

						{!hasActiveOrPendingScholarship && !latestRejectedCooldown?.active ? (
							<div className="student-scholarship-board" ref={availableProgramsRef}>
								<div className="student-scholarship-board-head">
									<div>
										<span>Recommendation Center</span>
										<h3>
											{warningRecommendationBlock
												? "Scholarship Review Required"
												: hasMatchedGrantorScope
													? "Choose a Scholarship"
													: "Recommended Scholarships"}
										</h3>
									</div>
									<div className="student-scholarship-board-actions">
										<strong>
											{warningRecommendationBlock ? "Review needed" : `${recommendationDisplayItems.length} matched`}
										</strong>
										<button
											type="button"
											className="student-mini-btn student-mini-btn--secondary"
											onClick={() => navigate("/student-dashboard/recommended-scholarships")}
											disabled={warningRecommendationBlock}
										>
											See all
											<HiOutlineExternalLink aria-hidden />
										</button>
									</div>
								</div>
								{warningRecommendationBlock ? (
									<div className="student-modern-recommended-empty student-modern-recommended-empty--warning">
										<HiOutlineExclamation />
										<strong>Multiple scholarships detected.</strong>
										<p>
											The system detected your student record in multiple scholarship rosters. Choose one grantor from the warning notice, visit the Office of the Scholarship, or submit a ticket in the Help Center.
										</p>
									</div>
								) : recommendationsLoading ? (
									<div className="student-modern-recommended-empty">
										<HiOutlineAcademicCap />
										<strong>Finding recommended scholarships...</strong>
										<p>Checking open grantors, minimum GWA, roster strength, and location fit.</p>
									</div>
								) : recommendationDisplayPreview.length === 0 ? (
									<div className="student-modern-recommended-empty">
										<HiOutlineAcademicCap />
										<strong>No recommended scholarship yet.</strong>
										<p>
											{hasMatchedGrantorScope
												? "Your matched grantor has no open scholarship option for your profile yet."
												: "No open grantor currently matches your GWA and profile."}
										</p>
									</div>
								) : (
									<div className="student-modern-recommendation-grid">
										{recommendationDisplayPreview.map((recommendation) => {
											const recommendationId = recommendationKey(recommendation) || recommendation.grantorId || recommendation.id
											const grantorInitials = String(recommendation.grantorName || "GR").trim().slice(0, 2).toUpperCase()
											const rejectedMatch = getRejectedCooldownForTarget(recommendation)
											const hasActiveCooldown = rejectedMatch?.cooldown?.active === true
											const archivedBlock = getArchivedGrantorBlockForTarget(recommendation)
											const isInvitation = recommendation.recommendationSource === "grantor_invitation"
											const isApplying = applyingRecommendationId === recommendationId
											return (
											<article
												key={recommendationId}
												className={`student-modern-recommendation-card student-modern-recommendation-card--${recommendation.recommendationSource || "algorithm"}`}
											>
												<div className="student-modern-recommendation-media">
													{recommendation.profileImageUrl || recommendation.authorImageUrl ? (
														<img src={recommendation.profileImageUrl || recommendation.authorImageUrl} alt={`${recommendation.grantorName || "Grantor"} profile`} />
													) : <span>{grantorInitials}</span>}
												</div>
												<div className="student-modern-recommendation-top">
														<span className="student-modern-recommendation-avatar">
															{recommendation.profileImageUrl || recommendation.authorImageUrl ? (
																<img src={recommendation.profileImageUrl || recommendation.authorImageUrl} alt="" />
															) : grantorInitials}
														</span>
														<div>
															<strong>{formatDisplayText(recommendation.grantorName, "Grantor")}</strong>
															<small>Minimum GWA {recommendation.minimumGwa || recommendation.minGwa || "Not set"}</small>
														</div>
													</div>
													<div className="student-modern-recommendation-body">
														<span>{recommendation.label || "This scholarship is best for you"}</span>
														<h4>{formatDisplayText(recommendation.announcementTitle || recommendation.providerLabel || recommendation.grantorName, "Scholarship")}</h4>
														<p>{(recommendation.reasons || []).slice(0, 2).join(" | ") || recommendationAlgorithm || "Open application that matches your student profile."}</p>
														{hasActiveCooldown ? (
															<p className="student-modern-recommendation-warning">
																Re-apply after {formatCooldownDuration(rejectedMatch.cooldown.remainingMs)}.
															</p>
														) : null}
													</div>
													<button
														type="button"
														onClick={() => (isInvitation ? acceptScholarshipInvitation(recommendation) : applyRecommendedScholarship(recommendation))}
														disabled={Boolean(applyingRecommendationId) || isMutating || hasScholarshipActionBlock || hasActiveCooldown || Boolean(archivedBlock)}
													>
														{isInvitation ? <HiOutlineCheckCircle /> : <HiOutlineAcademicCap />}
														{archivedBlock
															? "Unavailable"
															: isApplying
																? "Applying..."
																: isInvitation
																	? "Accept Invitation"
																	: "Apply"}
													</button>
													{isInvitation ? (
														<button
															type="button"
															className="student-modern-recommendation-link"
															onClick={() => setInvitationDecision(recommendation)}
															disabled={isMutating}
														>
															Reject invitation
														</button>
													) : null}
												</article>
											)
										})}
									</div>
								)}
							</div>
						) : null}
						</section>
					) : null}

					<footer className="student-footer">
						<div className="student-footer-grid">
							<div className="student-footer-brand">
								<h3>BulsuScholar</h3>
								<p>
									Institutional Student Programs and Services scholarship portal.
									Track and manage your scholarship declarations and requests.
								</p>
							</div>
							<div className="student-footer-col">
								<h4>Support</h4>
								<p>Office of Scholarships</p>
								<p>Email: scholarships@bulsu.edu.ph</p>
								<p>Mon-Fri, 8:00 AM - 5:00 PM</p>
							</div>
							<div className="student-footer-col">
								<h4>Quick Links</h4>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard")}
								>
									Dashboard Home
								</button>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard/announcements")}
								>
									Announcements
								</button>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard/inbox")}
								>
									Inbox
								</button>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard/scholarships")}
								>
									My Scholarships
								</button>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard/profile")}
								>
									My Profile
								</button>
							</div>
						</div>
						<p className="student-footer-bottom">
							(c) {new Date().getFullYear()} BulsuScholar. All rights reserved.
						</p>
					</footer>
				</div>
			</main>

			{documentUploadPrompt ? (
				<div className="student-soe-modal-backdrop" role="presentation">
					<div
						className="student-soe-modal"
						role="dialog"
						aria-modal="true"
						aria-label="Required document upload"
					>
						<button
							type="button"
							className="student-soe-modal-close"
							onClick={() => setDocumentUploadPrompt(null)}
						>
							<HiX aria-hidden />
						</button>
						<h3>Upload Required Documents</h3>
						<p>
							{buildDocumentRequirementPrompt(
								documentUploadPrompt.documentCheck,
								documentUploadPrompt.target?.name || "this scholarship",
							)}
						</p>
						<p>
							You need to upload these documents first before requesting{" "}
							{toMaterialLabel(documentUploadPrompt.materialKey).toLowerCase()}.
						</p>
						<div className="student-soe-modal-actions">
							<button
								type="button"
								className="student-program-apply-btn student-mini-btn student-mini-btn--primary"
								onClick={() => {
									setDocumentUploadPrompt(null)
									navigate("/student-dashboard/profile")
								}}
							>
								Go to Profile Uploads
							</button>
						</div>
					</div>
				</div>
			) : null}

			{confirmTarget && (
				<div className="student-soe-modal-backdrop" role="presentation">
					<div
						className="student-soe-modal"
						role="dialog"
						aria-modal="true"
						aria-label="Scholarship selection confirmation"
					>
						<button
							type="button"
							className="student-soe-modal-close"
							onClick={() => setConfirmTarget(null)}
						>
							<HiX aria-hidden />
						</button>
						<h3>Choose Scholarship</h3>
						<p>
							Choosing [{confirmTarget.name}] will keep only this scholarship in your list and remove the others, based on the one scholarship per student policy. {hasMultipleScholarshipConflict ? "This will also clear your current multiple scholarship warning. " : ""}Do you want to continue?
						</p>
						<div className="student-soe-modal-actions">
							<button
								type="button"
								className="student-program-apply-btn student-mini-btn student-mini-btn--primary"
								onClick={() => chooseScholarship(confirmTarget)}
								disabled={isMutating}
							>
								Confirm Choice
							</button>
						</div>
					</div>
				</div>
			)}

			{invitationDecision ? (
				<div className="student-soe-modal-backdrop" role="presentation">
					<div
						className="student-soe-modal"
						role="dialog"
						aria-modal="true"
						aria-label="Reject scholarship invitation"
					>
						<button
							type="button"
							className="student-soe-modal-close"
							onClick={() => {
								setInvitationDecision(null)
								setInvitationRejectReason("Not interested")
								setInvitationRejectNotes("")
							}}
						>
							<HiX aria-hidden />
						</button>
						<h3>Reject Invitation</h3>
						<p>
							Tell the grantor why you are not accepting the invitation for{" "}
							<strong>{invitationDecision.scholarshipName || "this scholarship"}</strong>.
						</p>
						<div className="student-invitation-reject-form">
							<label>
								<span>Reason</span>
								<select
									value={invitationRejectReason}
									onChange={(event) => setInvitationRejectReason(event.target.value)}
								>
									<option>Not interested</option>
									<option>Already applying elsewhere</option>
									<option>Need more time</option>
									<option>Other</option>
								</select>
							</label>
							<label>
								<span>Notes</span>
								<textarea
									value={invitationRejectNotes}
									onChange={(event) => setInvitationRejectNotes(event.target.value)}
									placeholder="Add more details for the grantor."
									rows={4}
								/>
							</label>
						</div>
						<div className="student-soe-modal-actions">
							<button
								type="button"
								className="student-program-apply-btn student-mini-btn student-mini-btn--danger"
								onClick={rejectScholarshipInvitation}
								disabled={isMutating}
							>
								<HiX aria-hidden />
								{isMutating ? "Rejecting..." : "Reject Invitation"}
							</button>
						</div>
					</div>
				</div>
			) : null}

			{expenseModalTarget && (
				<div className="student-soe-modal-backdrop" role="presentation">
					<div
						className="student-soe-modal student-soe-expense-modal"
						role="dialog"
						aria-modal="true"
						aria-label="SOE expense entry"
					>
						<button
							type="button"
							className="student-soe-modal-close"
							onClick={closeExpenseModal}
						>
							<HiX aria-hidden />
						</button>
						<h3>SOE Expenses</h3>
						<p>
							Add the expenses and corresponding amounts to include in your SOE export.
						</p>

						<div className="student-soe-expense-rows">
							{soeExpenses.map((row, index) => (
								<div key={`expense-row-${index}`} className="student-soe-expense-row">
									<input
										type="text"
										className="student-soe-expense-input"
										placeholder="Expense (e.g. Food Allowance)"
										value={row.label}
										onChange={(e) =>
											handleExpenseRowChange(index, "label", e.target.value)
										}
									/>
									<input
										type="number"
										className="student-soe-expense-input"
										placeholder="Amount"
										min="0"
										step="0.01"
										value={row.amount}
										onChange={(e) =>
											handleExpenseRowChange(index, "amount", e.target.value)
										}
									/>
									<button
										type="button"
										className="student-soe-expense-remove student-mini-btn student-mini-btn--danger"
										onClick={() => handleRemoveExpenseRow(index)}
										disabled={soeExpenses.length <= 1}
									>
										Remove
									</button>
								</div>
							))}
						</div>

						<div className="student-soe-expense-tools">
							<button
								type="button"
								className="student-program-save-btn student-mini-btn student-mini-btn--secondary"
								onClick={handleAddExpenseRow}
							>
								Add Expense
							</button>
							<button
								type="button"
								className="student-program-save-btn student-mini-btn student-mini-btn--secondary"
								onClick={handleSaveExpensePreset}
								disabled={isSavingExpensePreset}
							>
								{isSavingExpensePreset ? "Saving..." : "Save Expenses"}
							</button>
						</div>
						<p className="student-soe-expense-total">
							Total:{" "}
							{new Intl.NumberFormat("en-PH", {
								style: "currency",
								currency: "PHP",
								minimumFractionDigits: 2,
							}).format(modalExpenseTotal)}
						</p>
						<p className="student-soe-export-warning">
							Warning: After final download, you can export SOE again only after{" "}
							{SOE_EXPORT_LOCK_MONTHS} months. Double-check all expenses and amounts.
						</p>

						<div className="student-soe-modal-actions">
							<button
								type="button"
								className="student-program-apply-btn student-mini-btn student-mini-btn--primary"
								onClick={handleExportSoeWithExpenses}
								disabled={isExportingSoe}
							>
								{isExportingSoe ? "Preparing..." : "Save & Preview SOE"}
							</button>
						</div>
					</div>
				</div>
			)}

			{isSoePreviewOpen && soePreviewUrl && (
				<div className="student-soe-preview-backdrop" role="presentation">
					<div className="student-soe-preview-modal" role="dialog" aria-modal="true" aria-label="SOE preview">
						<button type="button" className="student-soe-modal-close" onClick={closeSoePreview}>
							<HiX aria-hidden />
						</button>
						<h3>SOE Preview</h3>
						<p className="student-soe-export-warning">
							Final warning: Once downloaded, your next SOE export is available after{" "}
							{SOE_EXPORT_LOCK_MONTHS} months. Confirm that all expenses and amounts are correct.
						</p>
						<div className="student-soe-preview-frame-wrap">
							<iframe
								src={soePreviewUrl}
								title="SOE PDF Preview"
								className="student-soe-preview-frame"
							/>
						</div>
						<div className="student-soe-modal-actions">
							<button
								type="button"
								className="student-program-apply-btn student-mini-btn student-mini-btn--primary"
								onClick={handleConfirmDownloadSoe}
								disabled={isDownloadingSoe}
							>
								{isDownloadingSoe ? "Downloading..." : "Download Final SOE"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
