/**
 * Student Dashboard - Professional bento-style scholarship portal.
 */
import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
	collection,
	doc,
	getDoc,
	getDocs,
	limit,
	orderBy,
	query,
} from "firebase/firestore"
import {
	HiOutlineAcademicCap,
	HiOutlineCheckCircle,
	HiOutlineClock,
	HiOutlineMoon,
	HiOutlineSun,
} from "react-icons/hi"
import { db } from "../../firebase"
import useThemeMode from "../hooks/useThemeMode"
import { normalizeScholarshipList } from "../services/scholarshipService"
import MagicBento from "../components/MagicBento"
import logo2 from "../assets/logo2.png"
import "../css/AdminDashboard.css"
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

export default function StudentDashboard() {
	const navigate = useNavigate()
	const [user, setUser] = useState(null)
	const [userLoaded, setUserLoaded] = useState(false)
	const [announcements, setAnnouncements] = useState([])
	const { theme, setTheme } = useThemeMode()

	useEffect(() => {
		const storedUserId = sessionStorage.getItem("bulsuscholar_userId")
		const storedType = sessionStorage.getItem("bulsuscholar_userType")

		if (!storedUserId || storedType !== "student") {
			setUserLoaded(true)
			return
		}

		getDoc(doc(db, "students", storedUserId))
			.then((snap) => {
				if (snap.exists()) {
					setUser(snap.data())
				}
				setUserLoaded(true)
			})
			.catch(() => setUserLoaded(true))
	}, [])

	useEffect(() => {
		if (userLoaded && !user) {
			navigate("/", { replace: true })
		}
	}, [userLoaded, user, navigate])

	useEffect(() => {
		let isMounted = true
		const run = async () => {
			try {
				const ordered = await getDocs(
					query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(8)),
				)
				if (!isMounted) return
				setAnnouncements(
					ordered.docs.map((item) => ({ id: item.id, ...(item.data() || {}) })),
				)
			} catch {
				const fallback = await getDocs(collection(db, "announcements"))
				if (!isMounted) return
				const sorted = fallback.docs
					.map((item) => ({ id: item.id, ...(item.data() || {}) }))
					.sort((a, b) => {
						const aDate = a.createdAt?.toDate
							? a.createdAt.toDate().getTime()
							: new Date(a.createdAt || a.date || 0).getTime()
						const bDate = b.createdAt?.toDate
							? b.createdAt.toDate().getTime()
							: new Date(b.createdAt || b.date || 0).getTime()
						return bDate - aDate
					})
					.slice(0, 8)
				setAnnouncements(sorted)
			}
		}

		run().catch(() => {})
		return () => {
			isMounted = false
		}
	}, [])

	const isValidated = checkValidated(user)
	const scholarships = useMemo(
		() => normalizeScholarshipList(user?.scholarships || []),
		[user?.scholarships],
	)
	const scholarshipPreview = scholarships.slice(0, 6)
	const avatarUrl = user?.profileImageUrl || ""

	const getUserInitials = () => {
		const f = user?.fname?.[0]?.toUpperCase() || ""
		const l = user?.lname?.[0]?.toUpperCase() || ""
		return f + l || "ST"
	}

	const handleContactSupport = () => {
		window.location.href =
			"mailto:scholarships@bulsu.edu.ph?subject=BulsuScholar%20Student%20Support"
	}

	const handleLogout = () => {
		sessionStorage.removeItem("bulsuscholar_userId")
		sessionStorage.removeItem("bulsuscholar_userType")
		navigate("/", { replace: true })
	}

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
								<span>{getUserInitials()}</span>
							)}
						</div>
						<div>
							<p className="student-bento-eyebrow">Student Workspace</p>
							<h2 className="student-welcome-title">
								Welcome back{user?.fname ? `, ${user.fname}` : ""}
							</h2>
							<p className="student-welcome-user-name">{fullName}</p>
							<p className="student-welcome-sub">
								Track applications, request SOE, and keep your scholarship profile up to date.
							</p>
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
							<span>{announcements.length} items</span>
						</div>
						{announcements.length === 0 ? (
							<p className="dashboard-placeholder">No announcements published yet.</p>
						) : (
							<div className="student-announcement-feed">
								{announcements.map((announcement) => (
									<article key={announcement.id} className="student-announcement-card">
										<div className="student-announcement-type">
											{iconForAnnouncement(announcement.type || "")}
										</div>
										<div className="student-announcement-content">
											<h4>{announcement.title || "Announcement"}</h4>
											<p>
												{formatAnnouncementDate(
													announcement.date || announcement.createdAt,
												) || "Date unavailable"}
											</p>
											<p>
												{announcement.previewText ||
													announcement.content ||
													announcement.description ||
													"No preview text provided."}
											</p>
										</div>
									</article>
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
								onClick={() =>
									navigate("/student-dashboard/scholarships", { state: { user } })
								}
							>
								Open Scholarships
							</button>
						</div>
						{scholarshipPreview.length === 0 ? (
							<p className="dashboard-placeholder">No scholarship records yet.</p>
						) : (
							<div className="student-dashboard-scholarship-preview-list">
								{scholarshipPreview.map((entry) => (
									<article key={entry.id} className="student-dashboard-scholarship-preview-item">
										<HiOutlineAcademicCap
											className="student-dashboard-scholarship-preview-icon"
											aria-hidden
										/>
										<div className="student-dashboard-scholarship-preview-meta">
											<h4>{entry.name}</h4>
											<p>{entry.status || "Applied"}</p>
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
								className="student-action-card"
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
								className="student-action-card"
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
							<button type="button" className="student-action-card" onClick={handleContactSupport}>
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
								className="student-action-card student-action-card--logout"
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
			handleContactSupport,
			handleLogout,
			getUserInitials,
			navigate,
			scholarshipPreview,
			theme,
			user,
			fullName,
		],
	)

	if (!userLoaded) {
		return (
			<div
				className={`admin-dashboard student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}
			>
				<main className="dashboard-main">
					<div className="dashboard-content student-dashboard-surface">
						<div className="dashboard-panel student-dashboard-loading-panel">
							<p className="dashboard-placeholder">Loading student dashboard...</p>
						</div>
					</div>
				</main>
			</div>
		)
	}

	return (
		<div
			className={`admin-dashboard student-dashboard ${theme === "dark" ? "student-dashboard--dark" : ""}`}
		>
			<header className="dashboard-header student-header">
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

			<main className="dashboard-main">
				<div className="dashboard-content student-dashboard-surface">
					<MagicBento
						items={bentoItems}
						className="student-dashboard-magic"
						enableStars={true}
						enableSpotlight={true}
						enableBorderGlow={true}
						enableTilt={false}
						enableMagnetism={false}
						clickEffect={false}
						glowColor={theme === "dark" ? "16, 185, 129" : "0, 99, 60"}
						spotlightRadius={340}
					/>

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
						<p className="student-footer-bottom">(c) {new Date().getFullYear()} BulsuScholar. All rights reserved.</p>
					</footer>
				</div>
			</main>
		</div>
	)
}
