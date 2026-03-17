/**
 * Student Scholarships Page - Apply-only scholarship flow with gated material requests.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	serverTimestamp,
	setDoc,
	updateDoc,
	where,
} from "firebase/firestore"
import { toast } from "react-toastify"
import {
	HiMenu,
	HiOutlineAcademicCap,
	HiOutlineCheckCircle,
	HiOutlineClock,
	HiOutlineDocumentText,
	HiOutlineExclamation,
	HiOutlineLogout,
	HiOutlineMoon,
	HiOutlineSun,
	HiOutlineUserCircle,
	HiX,
} from "react-icons/hi"
import { db } from "../../firebase"
import logo2 from "../assets/logo2.png"
import "../css/StudentDashboard.css"
import useThemeMode from "../hooks/useThemeMode"
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
import {
	downloadApplicationFormPdfBytes,
	exportApplicationFormPdfDocument,
} from "../services/applicationFormService"
import { downloadSoePdfBytes, exportSoePdfDocument } from "../services/soeService"
import { resolveSoeRequestNumber } from "../services/soeRequestNumberService"
import {
	getScholarshipTrackingProgress,
	getScholarshipTrackingStepBadgeLabel,
} from "../services/scholarshipTrackingService"
import {
	GRANTOR_PORTAL_COLLECTION,
	normalizeGrantorPortalSettings,
} from "../services/grantorService"

const SOE_EXPORT_LOCK_MONTHS = 6

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

function toJsDate(value) {
	if (!value) return null
	if (value?.toDate) return value.toDate()
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? null : date
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
		return `All KWSP requirements are ready for ${documentCheck?.semesterTag || "the current semester"}.`
	}

	const notes = []
	if (Array.isArray(documentCheck?.missing) && documentCheck.missing.length > 0) {
		notes.push(`Missing: ${documentCheck.missing.join(", ")}`)
	}
	if (Array.isArray(documentCheck?.expired) && documentCheck.expired.length > 0) {
		notes.push(`Update needed: ${documentCheck.expired.join(", ")}`)
	}
	return notes.join(" | ") || "Upload the required KWSP documents."
}

function buildDocumentRequirementPrompt(documentCheck, scholarshipName = "this scholarship") {
	if (!documentCheck) {
		return `Upload the required documents for ${scholarshipName} before requesting materials.`
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
		`Upload the required documents for ${scholarshipName} before requesting materials.` +
		(notes.length > 0 ? ` ${notes.join(" | ")}` : "")
	)
}

export default function StudentScholarshipsPage() {
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
	const [studentSoeRequests, setStudentSoeRequests] = useState([])
	const [studentSoeDownloads, setStudentSoeDownloads] = useState([])
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
	const { theme, setTheme } = useThemeMode()
	const userMenuRef = useRef(null)
	const forcedLogoutRef = useRef(false)
	const availableProgramsRef = useRef(null)

	const scholarshipCatalog = useMemo(() => getScholarshipCatalog(), [])
	const scholarships = useMemo(
		() => normalizeScholarshipList(user?.scholarships || []),
		[user?.scholarships],
	)
	const hasMultipleScholarshipChoices = scholarships.length >= 2
	const hasLockedScholarship = scholarships.some((item) => item.isLocked)
	const lockedScholarship = scholarships.find((item) => item.isLocked) || null
	const activeOrPendingScholarships = scholarships.filter((item) =>
		!item.isLocked && isScholarshipActiveOrPending(item.status),
	)
	const hasActiveOrPendingScholarship = activeOrPendingScholarships.length > 0
	const activeOrPendingProviderTypes = useMemo(
		() => new Set(activeOrPendingScholarships.map((item) => item.providerType)),
		[activeOrPendingScholarships],
	)
	const applicationLockTooltip =
		"You already have an existing scholarship application. You cannot apply for another until the current one is resolved."
	const isValidated = checkValidated(user)
	const avatarUrl = user?.profileImageUrl || ""
	const studentNumber = userId
	const studentAccessState = useMemo(() => getStudentAccessState(user || {}), [user])
	const hasComplianceBlock = studentAccessState.soeComplianceBlocked
	const hasScholarshipActionBlock = studentAccessState.isScholarshipActionBlocked
	const scholarshipActionBlockMessage = getScholarshipActionBlockMessage(user || {})
	const portalAccessBlockMessage = getPortalAccessBlockMessage(user || {})
	const hasBlockedScholarshipBanner =
		studentAccessState.scholarshipEligibilityBlocked || studentAccessState.soeComplianceBlocked
	const blockedScholarshipBannerCopy = getStudentBlockedBannerMessage(user || {})
	const hasMultipleScholarshipConflict =
		user?.scholarshipConflictWarning === true ||
		(user?.scholarshipRestrictionReason === "multiple_scholarships" && scholarships.length > 1)
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
	const announcementFocusProviderType = useMemo(
		() => String(location.state?.focusProviderType || "").trim(),
		[location.state],
	)

	const getUserInitials = () => {
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
			studentAccessState.accountAccessBlocked,
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
					void setDoc(
						doc(db, "students", storedUserId),
						{
							scholarships: normalized,
							corFile,
							cogFile,
							updatedAt: serverTimestamp(),
						},
						{ merge: true },
					).catch(() => {})
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
				return Boolean(status) && status !== "saved"
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
		const trackedScholarshipLabel = kwspEntry?.name || kwspCatalogItem?.name || "Scholarship"
		const isKwspFlow = kwspEntry?.providerType === "kuya_win"
		const isMorissonFlow = kwspEntry?.providerType === "morisson"
		const trackerTitle = isKwspFlow
			? "Kuya Win Scholarship Progress"
			: `${trackedScholarshipLabel} Progress`
		const trackerCopy = isKwspFlow
			? "Track each KWSP stage and see what you need to do next."
			: `Track your ${trackedScholarshipLabel} progress and see what you need to do next.`
		const trackerAriaLabel = isKwspFlow
			? "KWSP application tracking"
			: `${trackedScholarshipLabel} application tracking`
		const hasKwspApplication = Boolean(kwspEntry)
		const documentCopy = buildDocumentRequirementCopy(kwspDocumentCheck)
		const trackingProgress = getTrackingProgressForScholarship(kwspEntry)

		let nextActionTitle = "Application for KWSP"
		let nextActionCopy = "Your account is ready. Start your KWSP application from the available programs list."
		let summaryTone = "current"

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
			summaryTone = kwspDocumentCheck.ok ? "current" : "attention"
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
				? "Your Morisson application form is confidential. Get the application form directly from the scholarship office, then request your SOE here if you still need it."
				: isKwspFlow
					? "Your KWSP application is approved. Request your SOE if you still need it."
					: `Request your SOE for ${trackedScholarshipLabel} if you still need it.`
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
			summaryTone = "current"
		} else if (trackingProgress.signingAttention) {
			nextActionTitle = "Resolve SOE checking issue"
			nextActionCopy = "Your downloaded SOE was marked non-compliant. Coordinate with the scholarship office before proceeding."
			summaryTone = "attention"
		} else if (trackingProgress.currentStep?.id === "signing_materials") {
			nextActionTitle = "Wait for signing of materials"
			nextActionCopy = "Your downloaded SOE is now waiting for scholarship office checking and signing."
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
			summaryTone,
			currentStageLabel: trackingProgress.currentStepLabel || `${trackedScholarshipLabel} Tracking`,
			highlightedStepId: trackingProgress.highlightedStepId || "",
			trackerTitle,
			trackerCopy,
			trackerAriaLabel,
			applicationStatus: kwspEntry?.status || "Not started",
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
		hasMultipleScholarshipChoices ||
		["request_materials", "download_materials", "signing_materials"].includes(
			kwspTracking.highlightedStepId,
		)

	const persistScholarships = async (nextScholarships, message = "") => {
		await setDoc(
			doc(db, "students", userId),
			{
				scholarships: nextScholarships,
				updatedAt: serverTimestamp(),
			},
			{ merge: true },
		)
		setUser((prev) => ({ ...(prev || {}), scholarships: nextScholarships }))
		await syncWarnings(nextScholarships)
		if (message) {
			toast.success(message)
		}
	}

	const applyScholarship = async (catalogItem) => {
		if (!user || !userId || isMutating) return
		if (isScholarshipActionBlocked()) return
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
			const nextScholarships = [...scholarships, nextRecord]

			await persistScholarships(
				nextScholarships,
				`${catalogItem.name} application recorded. Upload the required documents next to continue.`,
			)

			await addDoc(collection(db, "scholarshipApplications"), {
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
			})
		} catch (error) {
			console.error("Failed to apply scholarship:", error)
			toast.error("Failed to apply scholarship. Please try again.")
		} finally {
			setIsMutating(false)
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
			await setDoc(
				doc(db, "students", userId),
				{
					scholarships: nextScholarships,
					scholarshipConflictWarning: shouldClearConflictRestriction ? false : user?.scholarshipConflictWarning === true,
					scholarshipConflictMessage: shouldClearConflictRestriction ? "" : user?.scholarshipConflictMessage || "",
					scholarshipRestrictionReason: shouldClearConflictRestriction ? null : user?.scholarshipRestrictionReason || null,
					...(nextRestrictions ? { restrictions: nextRestrictions } : {}),
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)

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

			await setDoc(
				doc(db, "students", userId),
				{
					scholarships: nextScholarships,
					updatedAt: serverTimestamp(),
					lastSoeStatus: materialKey === "soe" ? "Pending" : user?.lastSoeStatus || "",
				},
				{ merge: true },
			)

			await setDoc(
				doc(db, "soeRequests", requestDocId),
				{
					requestNumber: selected.requestNumber || selected.id,
					applicationNumber:
						selected.applicationNumber || selected.requestNumber || selected.id,
					studentId: userId,
					scholarshipId: selected.id,
					scholarshipName: selected.name,
					providerType: selected.providerType,
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
				{ merge: true },
			)

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
		const lastExportDate = toJsDate(user?.soeLastExportAt)
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
			toast.info("Choose one scholarship first before downloading the application form.")
			return
		}

		setIsDownloadingApplicationForm(true)
		try {
			const { pdfBytes } = await exportApplicationFormPdfDocument({
				student: user || {},
				studentId: userId,
				scholarship: target,
				autoDownload: false,
			})

			downloadApplicationFormPdfBytes(
				pdfBytes,
				`Application_Form_${userId}_${target.applicationNumber || target.requestNumber || target.id}.pdf`,
			)
			const downloadedAt = new Date().toISOString()
			const nextScholarships = scholarships.map((entry) =>
				entry.id === target.id
					? {
							...entry,
							applicationFormDownloadedAt: downloadedAt,
						}
					: entry,
			)

			await setDoc(
				doc(db, "students", userId),
				{
					scholarships: nextScholarships,
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)
			setUser((prev) => ({ ...(prev || {}), scholarships: nextScholarships }))

			toast.success("Application form downloaded.")
		} catch (error) {
			console.error("Failed to download application form:", error)
			toast.error("Unable to download the application form. Please try again.")
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
				await updateDoc(doc(db, "soeRequests", approvedRequest.id), {
					"materials.soe.requested": true,
					"materials.soe.status": "approved",
					"materials.soe.downloadedAt": serverTimestamp(),
					downloadStatus: "Downloaded",
					downloadedAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
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
			await addDoc(collection(db, "soeDownloads"), nextDownloadRow)
			setStudentSoeDownloads((prev) => [
				{
					...nextDownloadRow,
					downloadedAt: downloadedAtIso,
					createdAt: downloadedAtIso,
					updatedAt: downloadedAtIso,
				},
				...prev,
			])
			await setDoc(
				doc(db, "students", userId),
				{
					soeLastExportAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)
			setUser((prev) => ({
				...(prev || {}),
				soeLastExportAt: new Date().toISOString(),
			}))
			const nextAllowedDate = addMonths(new Date(), SOE_EXPORT_LOCK_MONTHS)
			toast.success(
				`SOE downloaded. SOE Request Number: ${soeRequestNumber}. Next export available after ${
					nextAllowedDate
						? nextAllowedDate.toLocaleDateString("en-PH", {
								month: "long",
								day: "numeric",
								year: "numeric",
							})
						: "6 months"
				}.`,
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
			await setDoc(
				doc(db, "students", userId),
				{
					soeExpenseItems: preparedExpenses,
					updatedAt: serverTimestamp(),
				},
				{ merge: true },
			)
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

	if (!userLoaded) {
		return (
			<div className={`student-portal student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
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
		<div className={`student-portal student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
			<header className="student-header">
				<div className="student-header-top-stripe"></div>
				<div className="student-header-content">
					<div className="student-header-left">
						<Link to="/student-dashboard" className="student-header-home-link" aria-label="Go to dashboard">
							<img src={logo2} alt="BulsuScholar" className="student-header-logo" />
							<h1 className="student-header-brand">BulsuScholar</h1>
						</Link>
					</div>
					<div className="student-header-right">
						<div className="student-header-verified-wrap">
							<button
								type="button"
								className={`student-header-verified-btn ${isValidated ? "student-header-verified-btn--verified" : "student-header-verified-btn--pending"}`}
								aria-label={isValidated ? "Verified" : "Pending verification"}
								title={isValidated ? "Verified" : "Pending"}
							>
								{isValidated ? (
									<HiOutlineCheckCircle
										className="student-header-verified-icon"
										aria-hidden
									/>
								) : (
									<HiOutlineClock
										className="student-header-verified-icon"
										aria-hidden
									/>
								)}
								<span className="student-header-verified-tooltip-below">
									{isValidated ? "Verified" : "Pending"}
								</span>
							</button>
						</div>
						<div className="student-header-user-wrap" ref={userMenuRef}>
							<button
								type="button"
								className="student-header-user-btn"
								onClick={() => setUserMenuOpen((open) => !open)}
								aria-label="User menu"
								aria-expanded={userMenuOpen}
							>
								<HiMenu className="student-header-menu-icon" aria-hidden />
								<div className="student-header-avatar">
									{avatarUrl ? (
										<img
											src={avatarUrl}
											alt="Profile"
											className="student-header-avatar-image-mini"
										/>
									) : (
										getUserInitials()
									)}
								</div>
							</button>
							{userMenuOpen && (
								<div className="student-verified-dropdown">
									<div className="student-verified-dropdown-user">
										<div className="student-verified-dropdown-avatar">
											{avatarUrl ? (
												<img
													src={avatarUrl}
													alt="Profile"
													className="student-header-avatar-image-mini"
												/>
											) : (
												getUserInitials()
											)}
										</div>
										<div className="student-verified-dropdown-user-info">
											<p className="student-verified-dropdown-name">
												{[user?.fname, user?.mname, user?.lname]
													.filter(Boolean)
													.join(" ") || "Student"}
											</p>
											<p className="student-verified-dropdown-email">
												{studentNumber || "-"}
											</p>
										</div>
									</div>
									<nav className="student-verified-dropdown-nav">
										<button
											type="button"
											className="student-verified-dropdown-item"
											onClick={() => {
												setUserMenuOpen(false)
												navigate("/student-dashboard/profile", { state: { user } })
											}}
										>
											<HiOutlineUserCircle
												className="student-verified-dropdown-item-icon"
												aria-hidden
											/>
											My Profile
										</button>
										<button
											type="button"
											className="student-verified-dropdown-item"
											onClick={() => {
												setUserMenuOpen(false)
												navigate("/student-dashboard")
											}}
										>
											<HiOutlineAcademicCap
												className="student-verified-dropdown-item-icon"
												aria-hidden
											/>
											Dashboard
										</button>
									</nav>
									<div className="student-verified-dropdown-theme">
										<span className="student-verified-dropdown-theme-label">THEME</span>
										<div className="student-verified-dropdown-theme-btns">
											<button
												type="button"
												className={`student-verified-dropdown-theme-btn ${theme === "light" ? "active" : ""}`}
												onClick={() => setTheme("light")}
											>
												<HiOutlineSun aria-hidden />
												Light
											</button>
											<button
												type="button"
												className={`student-verified-dropdown-theme-btn ${theme === "dark" ? "active" : ""}`}
												onClick={() => setTheme("dark")}
											>
												<HiOutlineMoon aria-hidden />
												Dark
											</button>
										</div>
									</div>
									<button
										type="button"
										className="student-verified-dropdown-logout"
										onClick={() => {
											sessionStorage.removeItem("bulsuscholar_userId")
											sessionStorage.removeItem("bulsuscholar_userType")
											setUserMenuOpen(false)
											navigate("/", { replace: true })
										}}
									>
										<HiOutlineLogout
											className="student-verified-dropdown-logout-icon"
											aria-hidden
										/>
										Logout
									</button>
								</div>
							)}
						</div>
					</div>
				</div>
			</header>

			<main className="student-shell">
				<div className="student-shell-content">
					<div className="student-page-title">
						<h2 className="student-page-heading">Scholarship Control Center</h2>
						<p className="student-page-sub">
							Submit one active scholarship application at a time. Apply locks out other programs until resolved.
						</p>
					</div>

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

					{kwspEntry && !hasMultipleScholarshipChoices ? (
						<section
							className="student-kwsp-tracker-shell"
							aria-label={kwspTracking.trackerAriaLabel}
						>
							<div className="student-scholarship-board student-kwsp-tracker-board">
								<div className="student-kwsp-tracker-head">
									<div>
										<p className="student-kwsp-tracker-eyebrow">Student Tracking</p>
										<h3>{kwspTracking.trackerTitle}</h3>
										<p className="student-kwsp-tracker-copy">{kwspTracking.trackerCopy}</p>
									</div>
									<span
										className={`student-kwsp-tracker-badge student-kwsp-tracker-badge--${kwspTracking.summaryTone}`}
									>
										{kwspTracking.currentStageLabel}
									</span>
								</div>
								<div className="student-kwsp-tracker-grid">
									<section className="student-kwsp-next-panel">
										<span className="student-kwsp-next-kicker">What You Need To Do Next</span>
										<h4>{kwspTracking.nextActionTitle}</h4>
										<p>{kwspTracking.nextActionCopy}</p>
										<div className="student-kwsp-next-meta">
											<div className="student-kwsp-next-meta-card">
												<span>Application Status</span>
												<strong>{kwspTracking.applicationStatus}</strong>
											</div>
											<div className="student-kwsp-next-meta-card">
												<span>Application Number</span>
												<strong>{kwspTracking.applicationNumber}</strong>
											</div>
											<div className="student-kwsp-next-meta-card">
												<span>Materials</span>
												<strong>{kwspTracking.materialStatus}</strong>
											</div>
										</div>
										<div className="student-kwsp-next-actions">
											{kwspTracking.isMorissonFlow ? (
												<p className="student-scholarship-card-note">
													Morisson application forms are confidential. Get your application form at the scholarship office.
												</p>
											) : (
												<button
													type="button"
													className="student-mini-btn student-mini-btn--secondary"
													disabled={
														isDownloadingApplicationForm ||
														hasScholarshipActionBlock ||
														kwspTracking.entry?.adminBlocked === true
													}
													title={
														studentAccessState.isPortalAccessBlocked
															? "Portal access is blocked."
															: hasComplianceBlock
																? "Your scholarship actions are currently on hold."
																: kwspTracking.entry?.adminBlocked === true
																	? "This scholarship is blocked by the scholarship office."
																	: "Download your application form"
													}
													onClick={() => handleDownloadApplicationForm(kwspTracking.entry)}
												>
													<HiOutlineDocumentText />
													{studentAccessState.isPortalAccessBlocked
														? "Access Blocked"
														: hasComplianceBlock
															? "Compliance Hold"
															: kwspTracking.entry?.adminBlocked === true
																? "Blocked by Office"
																: isDownloadingApplicationForm
																	? "Preparing..."
																	: kwspTracking.applicationFormDownloadedAt
																		? "Download Application Form Again"
																		: "Download Application Form"}
												</button>
											)}
										</div>
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
							<h3>My Scholarship Applications</h3>
							{hasMultipleScholarshipChoices ? (
								<p className="dashboard-placeholder">
									One scholarship per student policy: choose one scholarship first before SOE and application form actions become available.
								</p>
							) : null}
							{scholarships.length === 0 ? (
								<p className="dashboard-placeholder">
									No scholarship application yet. Apply from the available programs below.
								</p>
							) : (
								<div className="student-scholarship-cards">
									{scholarships.map((entry) => {
										const entryTrackingProgress = getTrackingProgressForScholarship(entry)
										const soeRequestLabel = getMaterialLabelForScholarship(entry, "soe")
										const soeRequestButtonState = getMaterialRequestButtonState(entry, "soe")
										const soeDownloadGate = getMaterialDownloadGate(entry, "soe")

										return (
											<article
												key={entry.id}
												className={`student-scholarship-card ${
													entry.adminBlocked === true || hasScholarshipActionBlock
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
														Matched grantor: {entry.matchedGrantorName || entry.name}. Upload the required documents before requesting materials.
													</p>
												) : null}
												{!hasMultipleScholarshipChoices && !entryTrackingProgress.canRequestMaterials ? (
													<p className="student-scholarship-card-note">
														Current step: {entryTrackingProgress.currentStepLabel}. Finish this stage before requesting materials.
													</p>
												) : null}
												<p className="student-scholarship-card-note">
													SOE: {hasMultipleScholarshipChoices ? "Choose one scholarship first" : soeRequestLabel}
												</p>
												{entry.providerType === "morisson" ? (
													<p className="student-scholarship-card-note">
														Application form: Get it directly from the scholarship office because Morisson forms are confidential.
													</p>
												) : null}
											</div>
											<div className="student-scholarship-card-action">
												<div className="student-scholarship-card-action-buttons">
													{hasMultipleScholarshipChoices ? (
														<button
															type="button"
															className="student-scholarship-request-soe student-mini-btn student-mini-btn--primary"
															disabled={
																isMutating ||
																studentAccessState.isPortalAccessBlocked ||
																studentAccessState.soeComplianceBlocked ||
																(entry.adminBlocked === true && !canResolveMultipleScholarshipConflict)
															}
															onClick={() => setConfirmTarget(entry)}
														>
															<HiOutlineCheckCircle />
															{studentAccessState.isPortalAccessBlocked
																? "Access Blocked"
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
																	: hasComplianceBlock
																		? "Compliance Hold"
																		: isExportingSoe || isDownloadingSoe
																			? "Processing..."
																			: soeDownloadGate.label}
															</button>
														</>
													)}
												</div>
											</div>
											</article>
										)
									})}
								</div>
							)}
						</div>

						<div className="student-scholarship-board" ref={availableProgramsRef}>
							<h3>Available Programs</h3>
							<div className="student-program-grid">
								{scholarshipCatalog.map((catalogItem) => {
									const hasThisActiveApplication = scholarships.some(
										(item) =>
											item.providerType === catalogItem.providerType &&
											isScholarshipActiveOrPending(item.status),
									)
									const blockedByGrantor = blockedProviderTypes.has(
										catalogItem.providerType,
									)
									const blockedByExclusivity =
										hasActiveOrPendingScholarship &&
										!activeOrPendingProviderTypes.has(catalogItem.providerType)
									const applyDisabled =
										blockedByGrantor ||
										hasLockedScholarship ||
										hasThisActiveApplication ||
										blockedByExclusivity ||
										hasScholarshipActionBlock ||
										isMutating
									const tooltip = hasScholarshipActionBlock
										? scholarshipActionBlockMessage
										: blockedByGrantor
											? `Applications for ${
													blockedProviderLabels[catalogItem.providerType] || catalogItem.name
											  } are currently closed.`
										: blockedByExclusivity
											? applicationLockTooltip
											: hasThisActiveApplication
												? "Application already submitted for this scholarship."
												: ""
									const isAnnouncementFocused =
										announcementFocusProviderType === catalogItem.providerType

									return (
										<article
											key={catalogItem.providerType}
											className={`student-program-card ${
												isAnnouncementFocused ? "student-program-card--highlight" : ""
											}`.trim()}
										>
											<h4>{catalogItem.name}</h4>
											<p>
												{catalogItem.requiresFullDocs
													? "Requires COR, COG, School ID"
													: "Requires COR"}
											</p>
											<div className="student-program-actions">
												<button
													type="button"
													className="student-program-apply-btn student-mini-btn student-mini-btn--primary"
													disabled={applyDisabled}
													title={tooltip}
													onClick={() => applyScholarship(catalogItem)}
												>
													{hasScholarshipActionBlock
														? "Blocked"
														: blockedByGrantor
															? "Apply Closed"
														: hasLockedScholarship
															? "Finalized"
															: "Apply"}
												</button>
											</div>
											{tooltip && <span className="student-program-tooltip">{tooltip}</span>}
										</article>
									)
								})}
							</div>
						</div>
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
									onClick={() => navigate("/student-dashboard/profile", { state: { user } })}
								>
									My Profile
								</button>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard", { state: { user } })}
								>
									Dashboard Home
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
									navigate("/student-dashboard/profile", { state: { user } })
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
