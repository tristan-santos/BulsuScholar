import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { collection, collectionGroup, doc, onSnapshot } from "firebase/firestore"
import {
	HiOutlineBell,
	HiOutlineCheckCircle,
	HiOutlineClock,
	HiOutlineExclamation,
	HiOutlineMoon,
	HiOutlineSun,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { db } from "../../firebase"
import logo2 from "../assets/logo2.png"
import "../css/StudentDashboard.css"
import useThemeMode from "../hooks/useThemeMode"
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

function resolveAnnouncementStatus(item = {}) {
	if (item.archived === true) return "Archived"
	return isPreviousStudentAnnouncement(item) ? "Previous" : "Current"
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

	const isValidated = checkValidated(user)
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

	const handleAnnouncementRedirect = useCallback(
		(announcement) => {
			navigate("/student-dashboard/scholarships", {
				state: {
					user,
					fromAnnouncement: true,
					focusProviderType: announcement?.providerType || "",
					focusSection: "available-programs",
				},
			})
		},
		[navigate, user],
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
									<HiOutlineCheckCircle className="student-header-verified-icon" aria-hidden />
								) : (
									<HiOutlineClock className="student-header-verified-icon" aria-hidden />
								)}
								<span className="student-header-verified-tooltip-below">
									{isValidated ? "Verified" : "Pending"}
								</span>
							</button>
						</div>
						<div className="student-header-theme-switch" role="group" aria-label="Theme switcher">
							<button
								type="button"
								className={`student-header-theme-btn ${theme === "light" ? "active" : ""}`}
								onClick={() => setTheme("light")}
							>
								<HiOutlineSun aria-hidden />
								Light
							</button>
							<button
								type="button"
								className={`student-header-theme-btn ${theme === "dark" ? "active" : ""}`}
								onClick={() => setTheme("dark")}
							>
								<HiOutlineMoon aria-hidden />
								Dark
							</button>
						</div>
					</div>
				</div>
			</header>

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
							<p className="student-bento-eyebrow">Student Announcement Board</p>
							<h2 className="student-page-heading">Scholarship announcements from admin and grantors</h2>
							<p className="student-page-sub">
								Click any announcement to go straight to the scholarship section and continue your application flow.
							</p>
						</div>
						<div className="student-announcement-page-actions">
							<button
								type="button"
								className="student-mini-btn student-mini-btn--primary"
								onClick={() => navigate("/student-dashboard/scholarships", { state: { user } })}
							>
								Open Scholarships
							</button>
							<button
								type="button"
								className="student-mini-btn student-mini-btn--secondary"
								onClick={() => navigate("/student-dashboard", { state: { user } })}
							>
								Back to Dashboard
							</button>
						</div>
					</section>

					<section className="student-announcement-page-section">
						<div className="student-announcement-page-section__head">
							<div>
								<h3>Current Announcements</h3>
								<p>{currentAnnouncements.length} active updates ready for student action.</p>
							</div>
						</div>
						{currentAnnouncements.length === 0 ? (
							<div className="student-loading-panel">
								<p className="dashboard-placeholder">No active announcements right now.</p>
							</div>
						) : (
							<div className="student-announcement-page-grid">
								{currentAnnouncements.map((announcement) => (
									<button
										key={announcement.id}
										type="button"
										className="student-announcement-card student-announcement-card--action student-announcement-page-card"
										onClick={() => handleAnnouncementRedirect(announcement)}
									>
										<div className="student-announcement-type">
											{announcement.source === "grantor" ? "Grantor" : "Update"}
										</div>
										<div className="student-announcement-content">
											<h4>{announcement.title || "Announcement"}</h4>
											<p className="student-announcement-content__meta">
												<span>{announcement.sourceLabel || "Scholarship Office"}</span>
												<span>
													{formatAnnouncementDate(announcement.createdAt) || "Date unavailable"}
												</span>
											</p>
											<p>
												{announcement.previewText ||
													announcement.content ||
													announcement.description ||
													"No preview text provided."}
											</p>
										</div>
									</button>
								))}
							</div>
						)}
					</section>

					<section className="student-announcement-page-section">
						<div className="student-announcement-page-section__head">
							<div>
								<h3>Previous Announcements</h3>
								<p>Keep track of archived or expired scholarship updates.</p>
							</div>
						</div>
						{previousAnnouncements.length === 0 ? (
							<div className="student-loading-panel">
								<p className="dashboard-placeholder">No previous announcements yet.</p>
							</div>
						) : (
							<div className="student-announcement-page-grid">
								{previousAnnouncements.map((announcement) => (
									<button
										key={announcement.id}
										type="button"
										className="student-announcement-card student-announcement-card--action student-announcement-page-card student-announcement-page-card--previous"
										onClick={() => handleAnnouncementRedirect(announcement)}
									>
										<div className="student-announcement-type">
											{resolveAnnouncementStatus(announcement)}
										</div>
										<div className="student-announcement-content">
											<h4>{announcement.title || "Announcement"}</h4>
											<p className="student-announcement-content__meta">
												<span>{announcement.sourceLabel || "Scholarship Office"}</span>
												<span>
													{formatAnnouncementDate(announcement.createdAt) || "Date unavailable"}
												</span>
											</p>
											<p>
												{announcement.previewText ||
													announcement.content ||
													announcement.description ||
													"No preview text provided."}
											</p>
										</div>
									</button>
								))}
							</div>
						)}
					</section>
				</div>
			</main>
		</div>
	)
}
