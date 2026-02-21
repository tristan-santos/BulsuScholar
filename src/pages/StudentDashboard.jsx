/**
 * Student Dashboard - Scholarship system overview for students.
 */
import { useState, useEffect, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { doc, getDoc } from "firebase/firestore"
import { db } from "../../firebase"
import {
	HiOutlineUserCircle,
	HiOutlineAcademicCap,
	HiOutlineCheckCircle,
	HiOutlineClock,
	HiOutlineDocumentText,
	HiOutlineBadgeCheck,
	HiOutlineMail,
	HiOutlineCog,
	HiOutlineSun,
	HiOutlineMoon,
	HiOutlineLogout,
	HiMenu,
} from "react-icons/hi"
import logo2 from "../assets/logo2.png"
import "../css/AdminDashboard.css"
import "../css/StudentDashboard.css"

/* Mock stats when no user data - replace with Firestore when wired */
const DEFAULT_STATS = {
	total: 0,
	pending: 0,
	approved: 0,
}

const statusClass = (status) => {
	const s = (status || "").toLowerCase()
	if (s === "approved") return "status-approved"
	if (s === "rejected") return "status-rejected"
	if (s === "under review") return "status-review"
	return "status-pending"
}

const statusLabel = (status) => {
	const s = (status || "").toLowerCase()
	if (s === "approved") return "Approved"
	if (s === "rejected") return "Rejected"
	if (s === "under review") return "Under Review"
	return "Pending"
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

export default function StudentDashboard() {
	const navigate = useNavigate()
	const location = useLocation()
	const [user, setUser] = useState(location.state?.user ?? null)
	const [userLoaded, setUserLoaded] = useState(!!location.state?.user)

	useEffect(() => {
		if (user != null) {
			setUserLoaded(true)
			return
		}
		const storedUserId = sessionStorage.getItem("bulsuscholar_userId")
		const storedType = sessionStorage.getItem("bulsuscholar_userType")
		if (storedUserId && storedType === "student") {
			getDoc(doc(db, "students", storedUserId))
				.then((snap) => {
					if (snap.exists()) setUser(snap.data())
					setUserLoaded(true)
				})
				.catch(() => setUserLoaded(true))
		} else {
			setUserLoaded(true)
		}
	}, [])

	const isValidated = checkValidated(user)
	const scholarships = Array.isArray(user?.scholarships) ? user.scholarships : []
	const [userMenuOpen, setUserMenuOpen] = useState(false)
	const [theme, setTheme] = useState("light")
	const userMenuRef = useRef(null)

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
	const stats = {
		...DEFAULT_STATS,
		total: scholarships.length,
		pending: scholarships.filter((s) => {
			const st = (s.status || "").toLowerCase()
			return st === "pending" || st === "under review" || st === "declared" || !st
		}).length,
		approved: scholarships.filter((s) => (s.status || "").toLowerCase() === "approved").length,
		validated: isValidated,
	}

	// Get user initials for avatar
	const getUserInitials = () => {
		if (!user) return "ST"
		const f = user.fname?.[0]?.toUpperCase() || ""
		const l = user.lname?.[0]?.toUpperCase() || ""
		return (f + l) || "ST"
	}

	// Student number (document id / login id)
	const studentNumber = location.state?.userId ?? sessionStorage.getItem("bulsuscholar_userId") ?? ""

	return (
		<div className="admin-dashboard student-dashboard">
			<header className="dashboard-header student-header">
				<div className="student-header-top-stripe"></div>
				<div className="student-header-content">
					<div className="student-header-left">
						<img src={logo2} alt="BulsuScholar" className="student-header-logo" />
						<h1 className="student-header-brand">BulsuScholar</h1>
					</div>
					<div className="student-header-right">
						<button
							type="button"
							className="student-header-notification-btn"
							aria-label="Messages"
						>
							<HiOutlineMail className="student-header-notification-icon" aria-hidden />
							<span className="student-header-badge">3</span>
						</button>
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
						<div className="student-header-user-wrap" ref={userMenuRef}>
							<button
								type="button"
								className="student-header-user-btn"
								onClick={() => setUserMenuOpen((o) => !o)}
								aria-label="User menu"
								aria-expanded={userMenuOpen}
							>
								<HiMenu className="student-header-menu-icon" aria-hidden />
								<div className="student-header-avatar">
									{getUserInitials()}
								</div>
							</button>
							{userMenuOpen && (
								<div className="student-verified-dropdown">
									<div className="student-verified-dropdown-user">
										<div className="student-verified-dropdown-avatar">
											{getUserInitials()}
										</div>
										<div className="student-verified-dropdown-user-info">
											<p className="student-verified-dropdown-name">
												{user?.fname && user?.lname
													? `${user.fname} ${user.mname || ""} ${user.lname}`.trim()
													: "Student"}
											</p>
											<p className="student-verified-dropdown-email">
												{studentNumber || "—"}
											</p>
										</div>
									</div>
									<nav className="student-verified-dropdown-nav">
										<button type="button" className="student-verified-dropdown-item">
											<HiOutlineUserCircle className="student-verified-dropdown-item-icon" aria-hidden />
											My Profile
										</button>
										<button
											type="button"
											className="student-verified-dropdown-item"
											onClick={() => {
												setUserMenuOpen(false)
												navigate("/student-dashboard/scholarships", { state: { user } })
											}}
										>
											<HiOutlineAcademicCap className="student-verified-dropdown-item-icon" aria-hidden />
											Scholarship
										</button>
										<button type="button" className="student-verified-dropdown-item">
											<HiOutlineCog className="student-verified-dropdown-item-icon" aria-hidden />
											Settings
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
										<HiOutlineLogout className="student-verified-dropdown-logout-icon" aria-hidden />
										Logout
									</button>
								</div>
							)}
						</div>
					</div>
				</div>
			</header>

			<main className="dashboard-main">
				<div className="dashboard-content">
					{/* Welcome banner */}
					<div className="student-welcome">
						<div className="student-welcome-text">
							<h2 className="student-welcome-title">
								Welcome back{user?.fname ? `, ${user.fname}` : ""}
							</h2>
							<p className="student-welcome-sub">
								Track your scholarships and application status in one place.
							</p>
						</div>
						<div className="student-welcome-icon">
							<HiOutlineAcademicCap aria-hidden />
						</div>
					</div>

					{/* Account validation status - only show when loaded and not validated */}
					{userLoaded && !stats.validated && (
						<div className="student-validation-banner">
							<HiOutlineClock className="student-validation-icon" aria-hidden />
							<div>
								<p className="student-validation-title">Account pending verification</p>
								<p className="student-validation-desc">
									Your registration is under review. This usually takes 1–3 business days.
								</p>
							</div>
						</div>
					)}

					{/* Stat cards */}
					<div className="dashboard-stats-grid student-stats-grid">
						<div className="dashboard-stat-card dashboard-stat-card--teal">
							<div className="dashboard-stat-card-header">
								<span className="dashboard-stat-label">My Scholarships</span>
								<div className="dashboard-stat-icon-wrap">
									<HiOutlineDocumentText className="dashboard-stat-icon" aria-hidden />
								</div>
							</div>
							<div className="dashboard-stat-value">{stats.total}</div>
							<div className="dashboard-stat-trend">Total applications</div>
						</div>
						<div className="dashboard-stat-card dashboard-stat-card--orange">
							<div className="dashboard-stat-card-header">
								<span className="dashboard-stat-label">Pending</span>
								<div className="dashboard-stat-icon-wrap">
									<HiOutlineClock className="dashboard-stat-icon" aria-hidden />
								</div>
							</div>
							<div className="dashboard-stat-value">{stats.pending}</div>
							<div className="dashboard-stat-trend">Under review</div>
						</div>
						<div className="dashboard-stat-card">
							<div className="dashboard-stat-card-header">
								<span className="dashboard-stat-label">Approved</span>
								<div className="dashboard-stat-icon-wrap">
									<HiOutlineCheckCircle className="dashboard-stat-icon" aria-hidden />
								</div>
							</div>
							<div className="dashboard-stat-value">{stats.approved}</div>
							<div className="dashboard-stat-trend dashboard-stat-trend--up">Active</div>
						</div>
						<div className="dashboard-stat-card dashboard-stat-card--purple">
							<div className="dashboard-stat-card-header">
								<span className="dashboard-stat-label">Validation</span>
								<div className="dashboard-stat-icon-wrap">
									<HiOutlineBadgeCheck className="dashboard-stat-icon" aria-hidden />
								</div>
							</div>
							<div className="dashboard-stat-value">
								{stats.validated ? "Verified" : "Pending"}
							</div>
							<div className="dashboard-stat-trend">
								{stats.validated ? "Account verified" : "1–3 business days"}
							</div>
						</div>
					</div>

					{/* My Scholarships section */}
					<div className="dashboard-page-title">
						<h2 className="dashboard-page-heading">My Scholarships</h2>
						<p className="dashboard-page-sub">
							Your scholarship applications and their status
						</p>
					</div>

					{scholarships.length === 0 ? (
						<div className="dashboard-panel student-empty student-dashboard-empty-scholarships">
							<HiOutlineAcademicCap className="student-dashboard-empty-scholarships-icon" aria-hidden />
							<p className="dashboard-placeholder student-dashboard-empty-scholarships-text">
								You have no scholarships listed yet. Declare existing scholarships during registration or apply through the scholarship office.
							</p>
							<p className="student-dashboard-empty-scholarships-hint">
								Go to <strong>Scholarship</strong> in the menu to view your applications or apply.
							</p>
							<button
								type="button"
								className="student-dashboard-empty-scholarships-btn"
								onClick={() => navigate("/student-dashboard/scholarships", { state: { user } })}
							>
								View scholarships
							</button>
						</div>
					) : (
						<div className="student-scholarship-cards">
							{scholarships.map((s, i) => (
								<article key={s.id ?? i} className="student-scholarship-card">
									<div className="student-scholarship-card-header">
										<HiOutlineAcademicCap className="student-scholarship-card-icon" aria-hidden />
										<span className={`student-scholarship-status ${statusClass(s.status)}`}>
											{statusLabel(s.status) || "Declared"}
										</span>
									</div>
									<h3 className="student-scholarship-card-name">{s.name || "Scholarship"}</h3>
									<p className="student-scholarship-card-provider">{s.provider || "—"}</p>
									<div className="student-scholarship-card-meta">
										<span>{s.type || "—"}</span>
										{(s.amount || s.date) && <span className="student-scholarship-card-sep">·</span>}
										{s.amount && <span>{s.amount}</span>}
										{s.amount && s.date && <span className="student-scholarship-card-sep">·</span>}
										{s.date && (
											<span>
												{new Date(s.date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
											</span>
										)}
									</div>
								</article>
							))}
						</div>
					)}

					{/* Quick info */}
					<div className="student-info-cards">
						<div className="student-info-card">
							<h3 className="student-info-card-title">Need help?</h3>
							<p className="student-info-card-desc">
								Contact the Office of the Scholarships for application support or questions about your status.
							</p>
						</div>
						<div className="student-info-card">
							<h3 className="student-info-card-title">COR & Registration</h3>
							<p className="student-info-card-desc">
								Keep your Certificate of Registration and registration number updated for scholarship validation.
							</p>
						</div>
					</div>
				</div>
			</main>
		</div>
	)
}
