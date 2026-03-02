/**
 * Student Scholarships Page - View declared scholarships or apply.
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

export default function StudentScholarshipsPage() {
	const navigate = useNavigate()
	const location = useLocation()
	const [user, setUser] = useState(location.state?.user ?? null)
	const [userLoaded, setUserLoaded] = useState(!!location.state?.user)
	const [userMenuOpen, setUserMenuOpen] = useState(false)
	const [theme, setTheme] = useState("light")
	const userMenuRef = useRef(null)

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

	const isValidated = checkValidated(user)
	const scholarships = Array.isArray(user?.scholarships)
		? user.scholarships
		: []

	const getUserInitials = () => {
		if (!user) return "ST"
		const f = user.fname?.[0]?.toUpperCase() || ""
		const l = user.lname?.[0]?.toUpperCase() || ""
		return f + l || "ST"
	}

	const studentNumber =
		location.state?.userId ??
		sessionStorage.getItem("bulsuscholar_userId") ??
		""

	return (
		<div className="admin-dashboard student-dashboard">
			<header className="dashboard-header student-header">
				<div className="student-header-top-stripe"></div>
				<div className="student-header-content">
					<div className="student-header-left">
						<img
							src={logo2}
							alt="BulsuScholar"
							className="student-header-logo"
						/>
						<h1 className="student-header-brand">BulsuScholar</h1>
					</div>
					<div className="student-header-right">
						<button
							type="button"
							className="student-header-notification-btn"
							aria-label="Messages"
						>
							<HiOutlineMail
								className="student-header-notification-icon"
								aria-hidden
							/>
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
								onClick={() => setUserMenuOpen((o) => !o)}
								aria-label="User menu"
								aria-expanded={userMenuOpen}
							>
								<HiMenu className="student-header-menu-icon" aria-hidden />
								<div className="student-header-avatar">{getUserInitials()}</div>
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
										<button
											type="button"
											className="student-verified-dropdown-item"
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
												navigate("/student-dashboard/scholarships", {
													state: { user },
												})
											}}
										>
											<HiOutlineAcademicCap
												className="student-verified-dropdown-item-icon"
												aria-hidden
											/>
											Scholarship
										</button>
										<button
											type="button"
											className="student-verified-dropdown-item"
										>
											<HiOutlineCog
												className="student-verified-dropdown-item-icon"
												aria-hidden
											/>
											Settings
										</button>
									</nav>
									<div className="student-verified-dropdown-theme">
										<span className="student-verified-dropdown-theme-label">
											THEME
										</span>
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

			<main className="dashboard-main">
				<div className="dashboard-content">
					<div className="dashboard-page-title">
						<h2 className="dashboard-page-heading">My Scholarships</h2>
						<p className="dashboard-page-sub">
							{scholarships.length > 0
								? "Scholarships you declared during registration"
								: "Apply for a scholarship or view your applications"}
						</p>
					</div>

					{!userLoaded ? (
						<div className="dashboard-panel student-empty">
							<p className="dashboard-placeholder">Loading…</p>
						</div>
					) : scholarships.length > 0 ? (
						<div className="student-scholarship-cards">
							{scholarships.map((s, i) => (
								<article key={i} className="student-scholarship-card">
									<div className="student-scholarship-card-header">
										<HiOutlineAcademicCap
											className="student-scholarship-card-icon"
											aria-hidden
										/>
									</div>
									<h3 className="student-scholarship-card-name">
										{s.name || "Scholarship"}
									</h3>
									<p className="student-scholarship-card-provider">
										{s.provider || "—"}
									</p>
									<div className="student-scholarship-card-meta">
										{s.date && (
											<>
												<span className="student-scholarship-card-sep">·</span>
												<span>
													{new Date(s.date).toLocaleDateString("en-PH", {
														month: "short",
														day: "numeric",
														year: "numeric",
													})}
												</span>
											</>
										)}
									</div>
									<div className="student-scholarship-card-action">
										<button
											type="button"
											className="student-scholarship-request-soe"
										>
											<HiOutlineDocumentText />
											Request SOE
										</button>
									</div>
								</article>
							))}
						</div>
					) : (
						<div className="dashboard-panel student-empty student-scholarships-empty">
							<HiOutlineAcademicCap
								className="student-scholarships-empty-icon"
								aria-hidden
							/>
							<p className="dashboard-placeholder">
								You have no scholarships yet. Apply through the scholarship
								office to get started.
							</p>
							<button
								type="button"
								className="student-scholarships-apply-btn"
								onClick={() => {
									// Placeholder: could navigate to application form or open modal
								}}
							>
								Apply for scholarship
							</button>
						</div>
					)}
				</div>
			</main>
		</div>
	)
}
