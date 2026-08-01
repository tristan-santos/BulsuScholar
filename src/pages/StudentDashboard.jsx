/**
 * Student Dashboard - Professional bento-style scholarship portal.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
	collection,
	collectionGroup,
	doc,
	onSnapshot,
	query,
	serverTimestamp,
	where,
} from "../services/supabaseDataService"
import {
	HiOutlineAcademicCap,
	HiOutlineBell,
	HiOutlineCheckCircle,
	HiOutlineDocumentText,
	HiOutlineExclamation,
	HiOutlineExternalLink,
	HiOutlineInbox,
	HiOutlineLogout,
	HiOutlineMail,
	HiOutlineMenu,
	HiOutlineMoon,
	HiOutlineSun,
	HiOutlineUser,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { db } from "../services/supabaseDataService"
import useThemeMode from "../hooks/useThemeMode"
import { getCurrentSemesterTag, normalizeScholarshipList } from "../services/scholarshipService"
import {
	isPreviousStudentAnnouncement,
	normalizeStudentAnnouncement,
	sortStudentAnnouncements,
} from "../services/announcementService"
import { GRANTOR_SUBCOLLECTIONS } from "../services/grantorService"
import { syncStudentGrantorRosterMatches } from "../services/studentGrantorMatchService"
import {
	getPortalAccessBlockMessage,
	getStudentAccessState,
	getStudentBlockedBannerMessage,
} from "../services/studentAccessService"
import {
	buildRecommendationApplyPayload,
	loadRecommendedScholarships,
} from "../services/recommendedScholarshipService"
import { getAnnouncementApplyAvailability } from "../services/announcementApplyEligibilityService"
import { applyScholarshipWorkflow } from "../services/workflowService"
import StudentTopbar from "../components/StudentTopbar"
import "../css/StudentDashboard.css"

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

function formatAnnouncementDate(value) {
	if (!value) return ""
	const date = value?.toDate ? value.toDate() : new Date(value)
	if (Number.isNaN(date.getTime())) return ""
	return date.toLocaleDateString("en-PH", {
		month: "short",
		day: "numeric",
		year: "numeric",
	})
}

function formatRelativeDate(value) {
	const date = value?.toDate ? value.toDate() : new Date(value)
	if (!value || Number.isNaN(date.getTime())) return "Date unavailable"
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

function iconForAnnouncement(type = "") {
	const normalized = type.toLowerCase()
	if (normalized.includes("deadline")) return "Deadline"
	if (normalized.includes("event")) return "Event"
	if (normalized.includes("policy")) return "Policy"
	return "Update"
}

function getMultipleScholarshipBannerCopy(user, scholarships) {
	if (user?.scholarshipConflictMessage) return user.scholarshipConflictMessage
	if (Array.isArray(scholarships) && scholarships.length > 1) {
		return "Your scholarship eligibility is temporarily on hold. Choose one scholarship only to comply with the one scholarship per student policy."
	}
	return "Your scholarship eligibility is temporarily on hold until you choose one scholarship only."
}

function buildAnnouncementImageList(item = {}) {
	const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls : []
	const imageObjects = Array.isArray(item.images) ? item.images.map((image) => image?.url).filter(Boolean) : []
	return [...new Set([item.imageUrl, ...imageUrls, ...imageObjects].filter(Boolean))]
}

function getReadAnnouncementStorageKey(studentId = "") {
	return `bulsuscholar_student_read_announcements_${studentId || "guest"}`
}

function loadReadAnnouncementIds(studentId = "") {
	try {
		const raw = localStorage.getItem(getReadAnnouncementStorageKey(studentId))
		const parsed = JSON.parse(raw || "[]")
		return Array.isArray(parsed) ? parsed.map(String) : []
	} catch {
		return []
	}
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

export default function StudentDashboard() {
	const navigate = useNavigate()
	const [sessionState] = useState(() => {
		const storedUserId = sessionStorage.getItem("bulsuscholar_userId")
		const storedType = sessionStorage.getItem("bulsuscholar_userType")
		return {
			storedUserId,
			isStudent: Boolean(storedUserId) && storedType === "student",
		}
	})
	const [user, setUser] = useState(null)
	const [userLoaded, setUserLoaded] = useState(() => !sessionState.isStudent)
	const [announcements, setAnnouncements] = useState([])
	const [studentNotifications, setStudentNotifications] = useState([])
	const [recommendedScholarships, setRecommendedScholarships] = useState([])
	const [recommendationAlgorithm, setRecommendationAlgorithm] = useState("")
	const [recommendationsLoading, setRecommendationsLoading] = useState(false)
	const [applyingRecommendationId, setApplyingRecommendationId] = useState("")
	const [readAnnouncementIds, setReadAnnouncementIds] = useState(() =>
		loadReadAnnouncementIds(sessionStorage.getItem("bulsuscholar_userId")),
	)
	const [profileMenuOpen, setProfileMenuOpen] = useState(false)
	const { theme, setTheme } = useThemeMode()
	const forcedLogoutRef = useRef(false)
	const profileMenuRef = useRef(null)
	const rosterSyncRef = useRef("")

	useEffect(() => {
		if (!sessionState.isStudent || !sessionState.storedUserId) {
			return
		}

		return onSnapshot(
			doc(db, "students", sessionState.storedUserId),
			(snap) => {
				if (!snap.exists()) {
					setUser(null)
					setUserLoaded(true)
					return
				}

				const nextUser = snap.data() || {}
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
	}, [navigate, sessionState.isStudent, sessionState.storedUserId])

	useEffect(() => {
		if (userLoaded && !user) {
			navigate("/", { replace: true })
		}
	}, [userLoaded, user, navigate])

	useEffect(() => {
		if (!userLoaded || !user || !sessionState.storedUserId) return
		const currentScholarships = normalizeScholarshipList(user.scholarships || [])
		if (currentScholarships.length > 0) return
		const syncKey = `${sessionState.storedUserId}:${user.updatedAt || user.createdAt || "empty"}`
		if (rosterSyncRef.current === syncKey) return
		rosterSyncRef.current = syncKey
		syncStudentGrantorRosterMatches(user, sessionState.storedUserId)
			.then((result) => {
				if (result.synced) {
					console.info("StudentDashboard: synced grantor roster scholarship match.", {
						count: result.matches.length,
						matches: result.matches,
					})
				}
			})
			.catch((error) => console.error("StudentDashboard: grantor roster sync failed:", error))
	}, [sessionState.storedUserId, user, userLoaded])

	useEffect(() => {
		let adminRows = []
		let grantorRows = []

		const updateAnnouncements = () => {
			const merged = sortStudentAnnouncements([
				...adminRows,
				...grantorRows,
			]).filter((item) => !isPreviousStudentAnnouncement(item))
			setAnnouncements(merged)
		}

		const unsubscribeAdminAnnouncements = onSnapshot(
			collection(db, "announcements"),
			(snap) => {
				adminRows = snap.docs.map((item) =>
					normalizeStudentAnnouncement(item.data() || {}, item.id, "admin"),
				)
				updateAnnouncements()
			},
			() => {
				adminRows = []
				updateAnnouncements()
			},
		)

		const unsubscribeGrantorAnnouncements = onSnapshot(
			collectionGroup(db, GRANTOR_SUBCOLLECTIONS.announcements),
			(snap) => {
				grantorRows = snap.docs.map((item) =>
					normalizeStudentAnnouncement(item.data() || {}, item.id, "grantor"),
				)
				updateAnnouncements()
			},
			() => {
				grantorRows = []
				updateAnnouncements()
			},
		)

		return () => {
			unsubscribeAdminAnnouncements()
			unsubscribeGrantorAnnouncements()
		}
	}, [])

	useEffect(() => {
		if (!sessionState.storedUserId) return undefined
		setReadAnnouncementIds(loadReadAnnouncementIds(sessionState.storedUserId))
		let notificationRows = []
		let warningRows = []
		const updateStudentNotificationRows = () => {
			setStudentNotifications(
				[...notificationRows, ...warningRows].sort(
					(a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0),
				),
			)
		}
		const unsubscribeNotifications = onSnapshot(
			query(collection(db, "studentNotifications"), where("studentId", "==", sessionState.storedUserId)),
			(snap) => {
				notificationRows = snap.docs.map((item) => ({ id: item.id, sourceTable: "studentNotifications", ...(item.data() || {}) }))
				updateStudentNotificationRows()
			},
			() => {
				notificationRows = []
				updateStudentNotificationRows()
			},
		)
		const unsubscribeWarnings = onSnapshot(
			query(collection(db, "studentWarning"), where("studentId", "==", sessionState.storedUserId)),
			(snap) => {
				warningRows = snap.docs
					.map((item) => ({ id: item.id, sourceTable: "studentWarning", ...(item.data() || {}) }))
					.filter((item) => item.source === "personal" || item.notificationFallbackTable === "student_warnings")
				updateStudentNotificationRows()
			},
			() => {
				warningRows = []
				updateStudentNotificationRows()
			},
		)
		return () => {
			unsubscribeNotifications()
			unsubscribeWarnings()
		}
	}, [sessionState.storedUserId])

	useEffect(() => {
		const handleStorage = (event) => {
			if (event.key === getReadAnnouncementStorageKey(sessionState.storedUserId)) {
				setReadAnnouncementIds(loadReadAnnouncementIds(sessionState.storedUserId))
			}
		}
		window.addEventListener("storage", handleStorage)
		return () => window.removeEventListener("storage", handleStorage)
	}, [sessionState.storedUserId])

	useEffect(() => {
		if (!profileMenuOpen) return undefined
		const handlePointerDown = (event) => {
			if (!profileMenuRef.current?.contains(event.target)) {
				setProfileMenuOpen(false)
			}
		}
		document.addEventListener("mousedown", handlePointerDown)
		return () => document.removeEventListener("mousedown", handlePointerDown)
	}, [profileMenuOpen])

	const isValidated = checkValidated(user)
	const scholarships = useMemo(
		() => normalizeScholarshipList(user?.scholarships || []),
		[user?.scholarships],
	)
	const scholarshipPreview = scholarships.slice(0, 6)
	const latestAnnouncements = useMemo(() => announcements.slice(0, 3), [announcements])
	const recommendationPreview = useMemo(
		() => recommendedScholarships.slice(0, 3),
		[recommendedScholarships],
	)
	const unreadStudentNotifications = useMemo(
		() => studentNotifications.filter((item) => item.read !== true),
		[studentNotifications],
	)
	const unreadAnnouncementCount = useMemo(
		() => announcements.filter((item) => !readAnnouncementIds.includes(String(item.id || ""))).length,
		[announcements, readAnnouncementIds],
	)
	const inboxBadgeCount = studentNotifications.length > 0 ? unreadStudentNotifications.length : unreadAnnouncementCount
	const avatarUrl = user?.profileImageUrl || ""
	const studentAccessState = useMemo(() => getStudentAccessState(user || {}), [user])
	const hasComplianceWarning = user?.soeComplianceWarning === true
	const hasComplianceBlock = studentAccessState.soeComplianceBlocked
	const hasMultipleScholarshipConflict =
		user?.scholarshipConflictWarning === true ||
		(user?.scholarshipRestrictionReason === "multiple_scholarships" && scholarships.length > 1)
	const multipleScholarshipBannerCopy = getMultipleScholarshipBannerCopy(user, scholarships)
	const hasBlockedScholarshipBanner =
		studentAccessState.scholarshipEligibilityBlocked || studentAccessState.soeComplianceBlocked
	const blockedScholarshipBannerCopy = getStudentBlockedBannerMessage(user || {})
	const currentSemesterTag = getCurrentSemesterTag()
	const needsDocumentRenewal = useMemo(() => {
		if (scholarships.length === 0) return false
		const watchedFiles = [user?.corFile, user?.cogFile, user?.schoolIdFile, user?.scholarshipApplicationFile]
		return watchedFiles.some((file) => !file?.url || (file?.semesterTag && file.semesterTag !== currentSemesterTag))
	}, [currentSemesterTag, scholarships.length, user?.cogFile, user?.corFile, user?.schoolIdFile, user?.scholarshipApplicationFile])
	const studentContactNumber = user?.cpNumber || user?.contactNumber || user?.phoneNumber || "Not set"
	const studentIdNumber = user?.studentId || user?.studentNumber || sessionState.storedUserId || "Not set"
	const currentGwa = user?.gwa || user?.currentGwa || user?.generalWeightedAverage || "Not set"
	const activeScholarshipName =
		scholarships.find((item) => String(item?.status || "").toLowerCase() !== "saved")?.name ||
		scholarships[0]?.name ||
		scholarships[0]?.providerLabel ||
		scholarships[0]?.provider ||
		""

	useEffect(() => {
		if (!userLoaded || !user) return
		if (scholarships.length > 0) {
			setRecommendedScholarships([])
			setRecommendationAlgorithm("")
			return
		}

		let cancelled = false
		setRecommendationsLoading(true)
		loadRecommendedScholarships({
			...user,
			id: sessionState.storedUserId,
			studentId: user.studentId || user.studentnumber || sessionState.storedUserId,
		})
			.then((result) => {
				if (cancelled) return
				setRecommendedScholarships(result.recommendations || [])
				setRecommendationAlgorithm(result.algorithm || "")
			})
			.catch((error) => {
				if (cancelled) return
				console.error("StudentDashboard: recommendation loading failed:", error)
				setRecommendedScholarships([])
				setRecommendationAlgorithm("")
			})
			.finally(() => {
				if (!cancelled) setRecommendationsLoading(false)
			})

		return () => {
			cancelled = true
		}
	}, [scholarships.length, sessionState.storedUserId, user, userLoaded])

	const userInitials = `${user?.fname?.[0]?.toUpperCase() || ""}${user?.lname?.[0]?.toUpperCase() || ""}` || "ST"

	const handleContactSupport = useCallback(() => {
		window.location.href =
			"mailto:scholarships@bulsu.edu.ph?subject=BulsuScholar%20Student%20Support"
	}, [])

	const handleLogout = useCallback(() => {
		sessionStorage.removeItem("bulsuscholar_userId")
		sessionStorage.removeItem("bulsuscholar_userType")
		navigate("/", { replace: true })
	}, [navigate])

	const handleAnnouncementRedirect = useCallback(
		(announcement) => {
			const announcementId = encodeURIComponent(announcement?.id || "")
			const source = announcement?.source || "admin"
			if (!announcementId) return

			navigate(`/student-dashboard/announcements/${source}/${announcementId}`)
		},
		[navigate],
	)

	const applyRecommendedScholarship = useCallback(
		async (recommendation) => {
			if (!user || !sessionState.storedUserId || applyingRecommendationId) return
			if (studentAccessState.isScholarshipActionBlocked) {
				toast.error(getStudentBlockedBannerMessage(user || {}))
				return
			}
			if (scholarships.length > 0) {
				toast.info("You already have an existing scholarship application.")
				return
			}

			setApplyingRecommendationId(recommendation.grantorId || recommendation.id)
			try {
				const { workflowPayload } = buildRecommendationApplyPayload(
					user,
					sessionState.storedUserId,
					recommendation,
				)
				await applyScholarshipWorkflow(workflowPayload)
				setUser((prev) => ({
					...(prev || {}),
					scholarships: workflowPayload.studentUpdate.scholarships,
					updatedAt: serverTimestamp(),
				}))
				toast.success(`Application sent to ${recommendation.grantorName || "the grantor"}.`)
				navigate("/student-dashboard/scholarships")
			} catch (error) {
				console.error("StudentDashboard: recommended scholarship apply failed:", error)
				toast.error("Failed to apply for this recommendation. Please try again.")
			} finally {
				setApplyingRecommendationId("")
			}
		},
		[
			applyingRecommendationId,
			navigate,
			scholarships.length,
			sessionState.storedUserId,
			studentAccessState.isScholarshipActionBlocked,
			user,
		],
	)

	const fullName = formatDisplayText(
		[user?.fname, user?.mname, user?.lname].filter(Boolean).join(" "),
		"Student",
	)
	const firstName = formatDisplayText(user?.fname)
	const studentEmail = user?.email ? String(user.email).trim().toLowerCase() : "Not set"

	const bentoItems = useMemo(
		() => [
			{
				id: "workspace",
				label: "Student Workspace",
				className: "student-magic-card student-magic-card--workspace",
				color: theme === "dark" ? "rgba(6, 78, 59, 0.82)" : "rgba(255, 255, 255, 0.92)",
				render: () => (
					<div className="student-workspace-hero">
						<div className="student-workspace-avatar">
							{avatarUrl ? (
								<img
									src={avatarUrl}
									alt="Profile"
									className="student-header-avatar-image-mini"
								/>
							) : (
								<span>{userInitials}</span>
							)}
						</div>
						<div>
							<p className="student-bento-eyebrow">Student Workspace</p>
							<h2 className="student-welcome-title">
								Welcome back{firstName ? `, ${firstName}` : ""}
							</h2>
							<p className="student-welcome-user-name">{fullName}</p>
							<p className="student-welcome-sub">
								Track applications, request SOE, and keep your scholarship profile up to
								date.
							</p>
							{hasComplianceWarning ? (
								<p className="student-bento-note">
									{hasComplianceBlock
										? "Scholarship blocking alert is active. SOE changes are temporarily restricted."
										: "Your latest SOE submission is under scholarship office review."}
								</p>
							) : null}
						</div>
					</div>
				),
			},
			{
				id: "announcements",
				label: "Announcements",
				className: "student-magic-card student-magic-card--announcements",
				color: theme === "dark" ? "rgba(6, 78, 59, 0.82)" : "rgba(255, 255, 255, 0.92)",
				render: () => (
					<>
						<div className="student-bento-headline-row">
							<h3 className="student-bento-title">Announcements</h3>
							<button
								type="button"
								className="student-bento-inline-link"
								onClick={() => navigate("/student-dashboard/announcements")}
							>
								View All
							</button>
						</div>
						{announcements.length === 0 ? (
							<p className="dashboard-placeholder">No announcements published yet.</p>
						) : (
							<div className="student-announcement-feed">
								<button
									type="button"
									className="student-announcement-card student-announcement-card--action"
									onClick={() => handleAnnouncementRedirect(announcements[0])}
								>
									<div className="student-announcement-type">
										{announcements[0].source === "grantor"
											? "Grantor"
											: iconForAnnouncement(announcements[0].type || "")}
									</div>
									<div className="student-announcement-content">
										<h4>{announcements[0].title || "Announcement"}</h4>
										<p className="student-announcement-content__meta">
											<span>{announcements[0].sourceLabel || "Scholarship Office"}</span>
											<span>
												{formatAnnouncementDate(
													announcements[0].date || announcements[0].createdAt,
												) || "Date unavailable"}
											</span>
										</p>
										<p>
											{announcements[0].previewText ||
												announcements[0].content ||
												announcements[0].description ||
												"No preview text provided."}
										</p>
									</div>
								</button>
							</div>
						)}
					</>
				),
			},
			{
				id: "scholarships-preview",
				label: "Scholarships Preview",
				className: "student-magic-card student-magic-card--scholarships",
				color: theme === "dark" ? "rgba(6, 78, 59, 0.82)" : "rgba(255, 255, 255, 0.92)",
				render: () => (
					<>
						<div className="student-bento-headline-row">
							<h3 className="student-bento-title">Scholarships Preview</h3>
							<button
								type="button"
								className="student-bento-inline-link"
								onClick={() => navigate("/student-dashboard/scholarships")}
							>
								Open Scholarships
							</button>
						</div>
						{scholarshipPreview.length === 0 ? (
							<p className="dashboard-placeholder">No scholarship records yet.</p>
						) : (
							<div className="student-dashboard-scholarship-preview-list">
								{scholarshipPreview.map((entry) => (
									<article
										key={entry.id}
										className={`student-dashboard-scholarship-preview-item ${
											entry.adminBlocked === true || hasBlockedScholarshipBanner
												? "student-dashboard-scholarship-preview-item--blocked"
												: ""
										}`.trim()}
									>
										<HiOutlineAcademicCap
											className="student-dashboard-scholarship-preview-icon"
											aria-hidden
										/>
										<div className="student-dashboard-scholarship-preview-meta">
											<h4>{formatDisplayText(entry.name, "Scholarship")}</h4>
											<p>{formatDisplayText(entry.status, "Applied")}</p>
											<p>Application No. {entry.applicationNumber || entry.requestNumber || entry.id}</p>
										</div>
										<span className="student-dashboard-scholarship-preview-term">
											{formatDisplayText(entry.semesterTag, "Current Semester")}
										</span>
									</article>
								))}
							</div>
						)}
					</>
				),
			},
			{
				id: "quick-actions",
				label: "Quick Actions",
				className: "student-magic-card student-magic-card--actions",
				color: theme === "dark" ? "rgba(6, 78, 59, 0.82)" : "rgba(255, 255, 255, 0.92)",
				render: () => (
					<>
						<h3 className="student-bento-title">Quick Actions</h3>
						<div className="student-action-grid">
							<button
								type="button"
								className="student-action-card student-mini-btn student-mini-btn--primary"
								onClick={() => navigate("/student-dashboard/scholarships")}
							>
								<svg viewBox="0 0 24 24" className="student-action-icon" aria-hidden="true">
									<path
										d="M3 6.5 12 2l9 4.5-9 4.5L3 6.5Zm2 4.5v4.7L12 20l7-4.3V11"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.7"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
								<span>Scholarships</span>
							</button>
							<button
								type="button"
								className="student-action-card student-mini-btn student-mini-btn--secondary"
								onClick={() => navigate("/student-dashboard/profile")}
							>
								<svg viewBox="0 0 24 24" className="student-action-icon" aria-hidden="true">
									<circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
									<path
										d="M5 19c1.6-3 4.1-4.5 7-4.5s5.4 1.5 7 4.5"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.7"
										strokeLinecap="round"
									/>
								</svg>
								<span>My Profile</span>
							</button>
							<button
								type="button"
								className="student-action-card student-mini-btn student-mini-btn--secondary"
								onClick={handleContactSupport}
							>
								<svg viewBox="0 0 24 24" className="student-action-icon" aria-hidden="true">
									<path
										d="M4 6h16v12H4zM4 7l8 6 8-6"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.7"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
								<span>Contact Support</span>
							</button>
							<button
								type="button"
								className="student-action-card student-action-card--logout student-mini-btn student-mini-btn--danger"
								onClick={handleLogout}
							>
								<svg viewBox="0 0 24 24" className="student-action-icon" aria-hidden="true">
									<path
										d="M9 4h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9M14 12H4m0 0 3-3m-3 3 3 3"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.7"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
								<span>Logout</span>
							</button>
						</div>
					</>
				),
			},
		],
		[
			announcements,
			avatarUrl,
			fullName,
			handleContactSupport,
			handleAnnouncementRedirect,
			handleLogout,
			hasBlockedScholarshipBanner,
			hasComplianceBlock,
			hasComplianceWarning,
			navigate,
			scholarshipPreview,
			theme,
			user,
			userInitials,
		],
	)

	if (!userLoaded) {
		return (
			<div className={`student-portal student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
				<main className="student-shell">
					<div className="student-shell-content student-dashboard-surface">
						<div className="student-loading-panel student-dashboard-loading-panel">
							<p className="dashboard-placeholder">Loading student dashboard...</p>
						</div>
					</div>
				</main>
			</div>
		)
	}

	return (
		<div className={`student-portal student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
			<StudentTopbar user={user} theme={theme} setTheme={setTheme} />

			<main className="student-shell">
				<div className="student-shell-content student-dashboard-surface">
					{hasBlockedScholarshipBanner ? (
						<div className="student-block-banner" role="alert">
							<HiOutlineExclamation className="student-block-icon" aria-hidden />
							<div className="student-block-copy">
								<p className="student-block-title">You have been blocked from scholarship actions</p>
								<p className="student-block-desc">{blockedScholarshipBannerCopy}</p>
							</div>
							{hasMultipleScholarshipConflict ? (
								<button
									type="button"
									className="student-mini-btn student-mini-btn--primary student-compliance-action"
									onClick={() => navigate("/student-dashboard/scholarships")}
								>
									Choose Scholarship
								</button>
							) : null}
						</div>
					) : null}
					{!hasBlockedScholarshipBanner && hasMultipleScholarshipConflict ? (
						<div className="student-compliance-banner" role="alert">
							<HiOutlineExclamation className="student-compliance-icon" aria-hidden />
							<div className="student-compliance-copy">
								<p className="student-compliance-title">Choose one scholarship to restore eligibility</p>
								<p className="student-compliance-desc">{multipleScholarshipBannerCopy}</p>
							</div>
							<button
								type="button"
								className="student-mini-btn student-mini-btn--primary student-compliance-action"
								onClick={() => navigate("/student-dashboard/scholarships")}
							>
								Choose Scholarship
							</button>
						</div>
					) : null}
					<section className="student-dashboard-modern" aria-label="Student dashboard overview">
						<section className="student-modern-welcome">
							<header className="student-detail-head">
								<h2>Student Details</h2>
								<span>{currentSemesterTag}</span>
							</header>
							<div className="student-detail-profile">
								<span className="student-detail-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : userInitials}</span>
								<div className="student-detail-name">
									<h3>Welcome Back!!</h3>
									<p>Welcome back{firstName ? `, ${firstName}` : ""}. Keep your scholarship profile and documents updated.</p>
								</div>
								<div className="student-detail-field"><span>Name</span><strong className="student-detail-name-value">{fullName}{isValidated ? <HiOutlineCheckCircle className="student-detail-verified-icon" aria-label="Verified student" /> : null}</strong></div>
								<div className="student-detail-field"><span>ID</span><strong>{studentIdNumber}</strong></div>
								<div className="student-detail-field"><span>Number</span><strong>{studentContactNumber}</strong></div>
								<div className="student-detail-field"><span>Email</span><strong>{studentEmail}</strong></div>
							</div>
							<div className="student-detail-metrics">
								<article><span><HiOutlineAcademicCap /></span><div><strong className={scholarships.length > 0 ? "student-detail-scholarship-value" : ""}>{scholarships.length > 0 ? activeScholarshipName : recommendedScholarships.length}</strong><p>{scholarships.length > 0 ? "Active Scholar" : "Recommended Scholarships"}</p></div></article>
								<article><span><HiOutlineCheckCircle /></span><div><strong>{currentGwa}</strong><p>Current GWA</p></div></article>
								<article><span><HiOutlineDocumentText /></span><div><strong>{needsDocumentRenewal ? "Not Complied Yet" : "Complied"}</strong><p>Document Status</p></div></article>
							</div>
						</section>

						<section className="student-modern-section">
							<header className="student-modern-section-head">
								<div><h3>Announcements</h3><p>Available and latest scholarship announcements.</p></div>
								<button type="button" onClick={() => navigate("/student-dashboard/announcements")}>See all <HiOutlineExternalLink /></button>
							</header>
							<div className="student-modern-announcement-grid">
								{latestAnnouncements.length === 0 ? (
									<div className="student-modern-empty"><HiOutlineBell /><strong>No announcements available.</strong><p>Latest notices will appear here.</p></div>
								) : latestAnnouncements.map((announcement) => {
									const imageUrls = buildAnnouncementImageList(announcement)
									const authorName = formatDisplayText(announcement.sourceLabel || (announcement.source === "grantor" ? "Grantor" : "Scholarship Office"))
									const authorInitials = String(authorName || "SO").trim().slice(0, 2).toUpperCase()
									const authorImage = announcement.profileImageUrl || announcement.authorImageUrl || ""
									const applyAvailability = getAnnouncementApplyAvailability({
										announcement,
										user,
										studentAccessState,
									})
									const isApplyBlocked =
										announcement.applicationEnabled === true &&
										!applyAvailability.canApply
									return (
										<article key={announcement.id} className="student-modern-announcement-card">
											<div className="student-modern-announcement-media">{imageUrls[0] ? <img src={imageUrls[0]} alt={formatDisplayText(announcement.title, "Announcement")} /> : <HiOutlineBell />}</div>
											<div className="student-modern-announcement-body">
												<div className="student-modern-announcement-author">
													<span>{authorImage ? <img src={authorImage} alt="" /> : authorInitials}</span>
													<div><strong>{authorName}</strong><small>{formatRelativeDate(announcement.date || announcement.createdAt)}</small></div>
												</div>
												<h4>{formatDisplayText(announcement.title, "Announcement")}</h4>
												<p>{formatDisplayText(announcement.previewText || announcement.content || announcement.description, "No Preview Text Provided.")}</p>
												<button
													type="button"
													className={isApplyBlocked ? "student-modern-announcement-apply--blocked" : ""}
													onClick={() => handleAnnouncementRedirect(announcement)}
												>
													{announcement.applicationEnabled ? "Apply Now" : "View Announcement"}
												</button>
											</div>
										</article>
									)
								})}
							</div>
						</section>

						<section className="student-modern-section">
							<header className="student-modern-section-head">
								<div>
									<h3>Recommended Scholarships</h3>
									<p>{recommendationAlgorithm || "Ranked by GWA, roster strength, and location fit."}</p>
								</div>
								{recommendedScholarships.length > 3 ? (
									<button type="button" onClick={() => navigate("/student-dashboard/recommended-scholarships")}>
										Show all recommended scholarships <HiOutlineExternalLink />
									</button>
								) : null}
							</header>
							{scholarships.length > 0 ? (
								<div className="student-modern-recommended-empty">
									<HiOutlineAcademicCap />
									<strong>You already have a scholarship application.</strong>
									<p>New recommendations are hidden until your current application is resolved.</p>
								</div>
							) : recommendationsLoading ? (
								<div className="student-modern-recommended-empty">
									<HiOutlineAcademicCap />
									<strong>Finding your best scholarship matches...</strong>
									<p>Checking open grantors, GWA requirements, roster strength, and location.</p>
								</div>
							) : recommendationPreview.length === 0 ? (
								<div className="student-modern-recommended-empty">
									<HiOutlineAcademicCap />
									<strong>No recommended scholarship yet.</strong>
									<p>No open grantor currently matches your GWA and profile.</p>
								</div>
							) : (
								<div className="student-modern-recommendation-grid">
									{recommendationPreview.map((recommendation) => {
										const grantorInitials = String(recommendation.grantorName || "GR").trim().slice(0, 2).toUpperCase()
										const applyingId = recommendation.grantorId || recommendation.id
										return (
											<article key={applyingId} className="student-modern-recommendation-card">
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
													<p>{(recommendation.reasons || []).slice(0, 2).join(" | ") || "Open application that matches your student profile."}</p>
												</div>
												<button
													type="button"
													onClick={() => applyRecommendedScholarship(recommendation)}
													disabled={Boolean(applyingRecommendationId)}
												>
													<HiOutlineAcademicCap />
													{applyingRecommendationId === applyingId ? "Applying..." : "Apply"}
												</button>
											</article>
										)
									})}
								</div>
							)}
						</section>

						<section className="student-modern-section">
							<header className="student-modern-section-head">
								<div><h3>Scholarship Preview</h3><p>Your current scholarship records and renewal reminders.</p></div>
								<button type="button" onClick={() => navigate("/student-dashboard/scholarships")}>Open Scholarships <HiOutlineExternalLink /></button>
							</header>
							{needsDocumentRenewal ? (
								<div className="student-modern-renewal">
									<HiOutlineDocumentText />
									<div><strong>Document renewal reminder</strong><p>The current cycle is active. Review your COR, COG, ID, and application documents for {currentSemesterTag}.</p></div>
								</div>
							) : null}
							{scholarshipPreview.length === 0 ? (
								<div className="student-modern-empty"><HiOutlineAcademicCap /><strong>No scholarship records yet.</strong><p>Your active scholarship preview will appear here.</p></div>
							) : (
								<div className="student-modern-scholarship-list">
									{scholarshipPreview.map((entry) => (
										<article key={entry.id} className={`student-modern-scholarship-item ${entry.adminBlocked === true || hasBlockedScholarshipBanner ? "is-blocked" : ""}`}>
											<span><HiOutlineAcademicCap /></span>
											<div><h4>{formatDisplayText(entry.name, "Scholarship")}</h4><p>{formatDisplayText(entry.status, "Applied")} · Application No. {entry.applicationNumber || entry.requestNumber || entry.id}</p></div>
											<small>{formatDisplayText(entry.semesterTag, "Current Semester")}</small>
										</article>
									))}
								</div>
							)}
						</section>

						<section className="student-modern-section">
							<header className="student-modern-section-head">
								<div><h3>Quick Actions</h3><p>Common student tasks and shortcuts.</p></div>
							</header>
							<div className="student-modern-action-grid">
								<button type="button" onClick={() => navigate("/student-dashboard/scholarships")}><HiOutlineAcademicCap /><span>Scholarships</span><small>View records and applications</small></button>
								<button type="button" onClick={() => navigate("/student-dashboard/profile")}><HiOutlineUser /><span>My Profile</span><small>Update personal details</small></button>
								<button type="button" onClick={() => navigate("/student-dashboard/announcements")}><HiOutlineBell /><span>Announcements</span><small>Read latest notices</small></button>
								<button type="button" onClick={handleContactSupport}><HiOutlineMail /><span>Support</span><small>Contact scholarship office</small></button>
							</div>
						</section>
					</section>

					<footer className="student-footer">
						<div className="student-footer-grid">
							<div className="student-footer-brand">
								<h3>BulsuScholar</h3>
								<p>
									Institutional Student Programs and Services scholarship portal.
									Manage your records, documents, and application updates in one place.
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
									onClick={() => navigate("/student-dashboard/profile")}
								>
									My Profile
								</button>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard/scholarships")}
								>
									My Scholarships
								</button>
							</div>
						</div>
						<p className="student-footer-bottom">
							(c) {new Date().getFullYear()} BulsuScholar. All rights reserved.
						</p>
					</footer>
				</div>
			</main>
		</div>
	)
}
