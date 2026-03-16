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
} from "firebase/firestore"
import {
	HiOutlineAcademicCap,
	HiOutlineCheckCircle,
	HiOutlineClock,
	HiOutlineExclamation,
	HiOutlineMoon,
	HiOutlineSun,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { db } from "../../firebase"
import useThemeMode from "../hooks/useThemeMode"
import { normalizeScholarshipList } from "../services/scholarshipService"
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
import logo2 from "../assets/logo2.png"
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
	}, [userLoaded, user, navigate])

	useEffect(() => {
		let adminRows = []
		let grantorRows = []

		const updateAnnouncements = () => {
			const merged = sortStudentAnnouncements([
				...adminRows,
				...grantorRows,
			]).filter((item) => !isPreviousStudentAnnouncement(item))
			setAnnouncements(merged.slice(0, 8))
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
	const scholarships = useMemo(
		() => normalizeScholarshipList(user?.scholarships || []),
		[user?.scholarships],
	)
	const scholarshipPreview = scholarships.slice(0, 6)
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

	const fullName =
		[user?.fname, user?.mname, user?.lname].filter(Boolean).join(" ") || "Student"

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
								Welcome back{user?.fname ? `, ${user.fname}` : ""}
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
								onClick={() => navigate("/student-dashboard/announcements", { state: { user } })}
							>
								View All
							</button>
						</div>
						{announcements.length === 0 ? (
							<p className="dashboard-placeholder">No announcements published yet.</p>
						) : (
							<div className="student-announcement-feed">
								{announcements.map((announcement) => (
									<button
										key={announcement.id}
										type="button"
										className="student-announcement-card student-announcement-card--action"
										onClick={() => handleAnnouncementRedirect(announcement)}
									>
										<div className="student-announcement-type">
											{announcement.source === "grantor"
												? "Grantor"
												: iconForAnnouncement(announcement.type || "")}
										</div>
										<div className="student-announcement-content">
											<h4>{announcement.title || "Announcement"}</h4>
											<p className="student-announcement-content__meta">
												<span>{announcement.sourceLabel || "Scholarship Office"}</span>
												<span>
													{formatAnnouncementDate(
														announcement.date || announcement.createdAt,
													) || "Date unavailable"}
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
								onClick={() => navigate("/student-dashboard/scholarships", { state: { user } })}
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
											<h4>{entry.name}</h4>
											<p>{entry.status || "Applied"}</p>
											<p>Application No. {entry.applicationNumber || entry.requestNumber || entry.id}</p>
										</div>
										<span className="student-dashboard-scholarship-preview-term">
											{entry.semesterTag || "Current Semester"}
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
								onClick={() => navigate("/student-dashboard/scholarships", { state: { user } })}
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
								onClick={() => navigate("/student-dashboard/profile", { state: { user } })}
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
								<p className="student-block-title">You have been blocked from scholarship actions</p>
								<p className="student-block-desc">{blockedScholarshipBannerCopy}</p>
							</div>
							{hasMultipleScholarshipConflict ? (
								<button
									type="button"
									className="student-mini-btn student-mini-btn--primary student-compliance-action"
									onClick={() => navigate("/student-dashboard/scholarships", { state: { user } })}
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
								onClick={() => navigate("/student-dashboard/scholarships", { state: { user } })}
							>
								Choose Scholarship
							</button>
						</div>
					) : null}
					<section className="student-dashboard-layout" aria-label="Student dashboard overview">
						{bentoItems.map((item) => (
							<article
								key={item.id}
								className={`student-dashboard-card ${item.className || ""}`}
							>
								{item.render()}
							</article>
						))}
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
									onClick={() => navigate("/student-dashboard/profile", { state: { user } })}
								>
									My Profile
								</button>
								<button
									type="button"
									className="student-footer-link"
									onClick={() => navigate("/student-dashboard/scholarships", { state: { user } })}
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
