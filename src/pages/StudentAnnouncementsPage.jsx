import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { collection, collectionGroup, doc, onSnapshot } from "../services/supabaseDataService"
import {
	HiOutlineAcademicCap,
	HiOutlineArrowLeft,
	HiOutlineCalendar,
	HiOutlineClock,
	HiOutlineExclamation,
	HiOutlineInbox,
	HiOutlineSearch,
	HiOutlineXCircle,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { db } from "../services/supabaseDataService"
import "../css/StudentDashboard.css"
import useThemeMode from "../hooks/useThemeMode"
import StudentTopbar from "../components/StudentTopbar"
import {
	isPreviousStudentAnnouncement,
	normalizeStudentAnnouncement,
	sortStudentAnnouncements,
} from "../services/announcementService"
import { GRANTOR_SUBCOLLECTIONS } from "../services/grantorService"
import {
	getPortalAccessBlockMessage,
	getStudentAccessState,
	getStudentBlockedBannerMessage,
} from "../services/studentAccessService"
import { getAnnouncementApplyAvailability } from "../services/announcementApplyEligibilityService"

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

function buildAnnouncementImageList(item = {}) {
	const imageUrls = Array.isArray(item.imageUrls) ? item.imageUrls : []
	const imageObjects = Array.isArray(item.images) ? item.images.map((image) => image?.url).filter(Boolean) : []
	return [...new Set([item.imageUrl, ...imageUrls, ...imageObjects].filter(Boolean))]
}

export default function StudentAnnouncementsPage() {
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
	const [announcementQuery, setAnnouncementQuery] = useState("")
	const [announcementFilter, setAnnouncementFilter] = useState("all")
	const { theme, setTheme } = useThemeMode()
	const forcedLogoutRef = useRef(false)

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
	}, [navigate, user, userLoaded])

	useEffect(() => {
		let adminRows = []
		let grantorRows = []

		const updateAnnouncements = () => {
			setAnnouncements(sortStudentAnnouncements([...adminRows, ...grantorRows]))
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

	const studentAccessState = useMemo(() => getStudentAccessState(user || {}), [user])
	const hasBlockedScholarshipBanner =
		studentAccessState.scholarshipEligibilityBlocked || studentAccessState.soeComplianceBlocked
	const blockedScholarshipBannerCopy = getStudentBlockedBannerMessage(user || {})

	const currentAnnouncements = useMemo(
		() => announcements.filter((item) => !isPreviousStudentAnnouncement(item)),
		[announcements],
	)
	const previousAnnouncements = useMemo(
		() => announcements.filter((item) => isPreviousStudentAnnouncement(item)),
		[announcements],
	)
	const filteredAnnouncements = useMemo(() => {
		const query = announcementQuery.trim().toLowerCase()
		return announcements.filter((item) => {
			const isPrevious = isPreviousStudentAnnouncement(item)
			const matchesFilter =
				announcementFilter === "all" ||
				(announcementFilter === "current" && !isPrevious) ||
				(announcementFilter === "previous" && isPrevious)
			if (!matchesFilter) return false
			if (!query) return true

			return [
				item.title,
				item.subtitle,
				item.previewText,
				item.content,
				item.description,
				item.sourceLabel,
				item.providerType,
			]
				.filter(Boolean)
				.some((value) => String(value).toLowerCase().includes(query))
		})
	}, [announcementFilter, announcementQuery, announcements])
	const visibleCurrentAnnouncements = useMemo(
		() => filteredAnnouncements.filter((item) => !isPreviousStudentAnnouncement(item)),
		[filteredAnnouncements],
	)
	const visiblePreviousAnnouncements = useMemo(
		() => filteredAnnouncements.filter((item) => isPreviousStudentAnnouncement(item)),
		[filteredAnnouncements],
	)
	const announcementProviderCount = useMemo(
		() => new Set(announcements.map((item) => item.sourceLabel || item.source || "Scholarship Office")).size,
		[announcements],
	)
	const renderAnnouncementCard = (announcement, variant = "current") => (
		(() => {
			const imageUrls = buildAnnouncementImageList(announcement)
			const isUnavailable = variant === "previous" || isPreviousStudentAnnouncement(announcement)
			const applyAvailability = getAnnouncementApplyAvailability({
				announcement,
				user,
				studentAccessState,
				isPreviousAnnouncement: isUnavailable,
			})
			const isApplyBlocked =
				!isUnavailable &&
				announcement.applicationEnabled === true &&
				!applyAvailability.canApply
			return (
				<button
					key={announcement.id}
					type="button"
					className={`student-announcement-card student-announcement-card--action student-announcement-page-card ${variant === "previous" ? "student-announcement-page-card--previous" : ""}`}
					onClick={() => handleAnnouncementRedirect(announcement)}
				>
					<div className="student-announcement-card-media">
						{imageUrls[0] ? <img src={imageUrls[0]} alt={announcement.title || "Announcement"} /> : <HiOutlineInbox />}
					</div>
					<div className="student-announcement-card-head">
						<span className="student-announcement-author-badge">{announcement.source === "grantor" ? "G" : "SO"}</span>
						<div>
							<strong>{announcement.sourceLabel || "Scholarship Office"}</strong>
						</div>
						<i>{formatRelativeDate(announcement.createdAt || announcement.date)}</i>
					</div>
					<div className="student-announcement-content">
						<h4>{announcement.title || "Announcement"}</h4>
						<p>
							{announcement.previewText ||
								announcement.content ||
								announcement.description ||
								"No preview text provided."}
							</p>
					</div>
					<span className={`student-announcement-card-action ${isUnavailable ? "student-announcement-card-action--unavailable" : ""} ${isApplyBlocked ? "student-announcement-card-action--blocked" : ""}`}>
						{isUnavailable ? (
							<>
								<HiOutlineXCircle aria-hidden />
								Not Available
							</>
						) : (
							announcement.applicationEnabled ? "Apply Now" : "View Announcement"
						)}
					</span>
				</button>
			)
		})()
	)

	const handleAnnouncementRedirect = useCallback(
		(announcement) => {
			const source = announcement?.source || "admin"
			const announcementId = encodeURIComponent(announcement?.id || "")
			if (!announcementId) return

			navigate(`/student-dashboard/announcements/${source}/${announcementId}`)
		},
		[navigate],
	)

	if (!userLoaded) {
		return (
			<div className={`student-portal student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}>
				<main className="student-shell">
					<div className="student-shell-content student-dashboard-surface">
						<div className="student-loading-panel">
							<p className="dashboard-placeholder">Loading announcements...</p>
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
								<p className="student-block-title">Scholarship actions are currently limited</p>
								<p className="student-block-desc">{blockedScholarshipBannerCopy}</p>
							</div>
						</div>
					) : null}

					<section className="student-announcement-page-hero">
						<div className="student-page-title">
							<p className="student-bento-eyebrow">Announcement Board</p>
							<h2 className="student-page-heading">Scholarship Updates</h2>
							<p className="student-page-sub">
								Review current scholarship notices, application windows, and previous updates from the scholarship office and grantors.
							</p>
						</div>
						<div className="student-announcement-page-actions">
							<button
								type="button"
								className="student-mini-btn student-mini-btn--primary"
								onClick={() => navigate("/student-dashboard/scholarships")}
							>
								<HiOutlineAcademicCap aria-hidden />
								Open Scholarships
							</button>
							<button
								type="button"
								className="student-mini-btn student-mini-btn--secondary"
								onClick={() => navigate("/student-dashboard")}
							>
								<HiOutlineArrowLeft aria-hidden />
								Back to Dashboard
							</button>
						</div>
					</section>

					<section className="student-announcement-insights" aria-label="Announcement summary">
						<div className="student-announcement-insight-card">
							<span><HiOutlineInbox aria-hidden /></span>
							<div>
								<strong>{currentAnnouncements.length}</strong>
								<small>Current Updates</small>
							</div>
						</div>
						<div className="student-announcement-insight-card">
							<span><HiOutlineClock aria-hidden /></span>
							<div>
								<strong>{previousAnnouncements.length}</strong>
								<small>Previous Updates</small>
							</div>
						</div>
						<div className="student-announcement-insight-card">
							<span><HiOutlineAcademicCap aria-hidden /></span>
							<div>
								<strong>{announcementProviderCount}</strong>
								<small>Announcement Sources</small>
							</div>
						</div>
					</section>

					<section className="student-announcement-tools" aria-label="Announcement filters">
						<label className="student-announcement-search">
							<HiOutlineSearch aria-hidden />
							<input
								type="search"
								value={announcementQuery}
								onChange={(event) => setAnnouncementQuery(event.target.value)}
								placeholder="Search announcement, provider, or scholarship"
							/>
						</label>
						<div className="student-announcement-filter-pills" role="group" aria-label="Filter announcements">
							{[
								["all", "All"],
								["current", "Current"],
								["previous", "Previous"],
							].map(([value, label]) => (
								<button
									key={value}
									type="button"
									className={announcementFilter === value ? "active" : ""}
									onClick={() => setAnnouncementFilter(value)}
								>
									{label}
								</button>
							))}
						</div>
					</section>

					<section className="student-announcement-page-section">
						<div className="student-announcement-page-section__head">
							<div>
								<h3>Current Announcements</h3>
								<p>{visibleCurrentAnnouncements.length} active updates ready for student action.</p>
							</div>
							<span className="student-announcement-section-chip">
								<HiOutlineCalendar aria-hidden />
								Open Window
							</span>
						</div>
						{visibleCurrentAnnouncements.length === 0 ? (
							<div className="student-loading-panel">
								<p className="dashboard-placeholder">No current announcements matched your filters.</p>
							</div>
						) : (
							<div className="student-announcement-page-grid">
								{visibleCurrentAnnouncements.map((announcement) => renderAnnouncementCard(announcement))}
							</div>
						)}
					</section>

					<section className="student-announcement-page-section">
						<div className="student-announcement-page-section__head student-announcement-page-section__head--previous">
							<div>
								<h3>Previous Announcements</h3>
								<p>Keep track of archived or expired scholarship updates.</p>
							</div>
							<span className="student-announcement-section-chip student-announcement-section-chip--muted">
								<HiOutlineClock aria-hidden />
								History
							</span>
						</div>
						{visiblePreviousAnnouncements.length === 0 ? (
							<div className="student-loading-panel">
								<p className="dashboard-placeholder">No previous announcements matched your filters.</p>
							</div>
						) : (
							<div className="student-announcement-page-grid">
								{visiblePreviousAnnouncements.map((announcement) => renderAnnouncementCard(announcement, "previous"))}
							</div>
						)}
					</section>
				</div>
			</main>
		</div>
	)
}
