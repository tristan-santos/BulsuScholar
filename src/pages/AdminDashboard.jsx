/**
 * Admin Dashboard - Manage scholarship applications and approvals.
 */
import { useState, useEffect, useRef } from "react"
import {
	Chart as ChartJS,
	CategoryScale,
	LinearScale,
	LineController,
	BarController,
	LineElement,
	BarElement,
	PointElement,
	Filler,
	DoughnutController,
	ArcElement,
	Title,
	Tooltip,
	Legend,
} from "chart.js"
import { Line, Doughnut, Bar } from "react-chartjs-2"
import { FaGraduationCap } from "react-icons/fa"
import {
	HiOutlineDocumentText,
	HiOutlineUserGroup,
	HiOutlineCheckCircle,
	HiOutlineClock,
	HiOutlineXCircle,
	HiOutlineCurrencyDollar,
	HiOutlineDotsVertical,
	HiOutlineUserCircle,
	HiMenu,
	HiX,
	HiOutlineMail,
	HiOutlineSun,
	HiOutlineMoon,
	HiOutlineLogout,
	HiOutlineAcademicCap,
	HiOutlineCog,
} from "react-icons/hi"
import {
	collection,
	getDocs,
	doc,
	setDoc,
	deleteDoc,
	serverTimestamp,
	query,
	where,
	onSnapshot,
} from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import { db, auth } from "../../firebase"
import useThemeMode from "../hooks/useThemeMode"
import "../css/AdminDashboard.css"
import logo from "../assets/logo.png"
import logo2 from "../assets/logo2.png"

ChartJS.register(
	CategoryScale,
	LinearScale,
	LineController,
	BarController,
	LineElement,
	BarElement,
	PointElement,
	Filler,
	DoughnutController,
	ArcElement,
	Title,
	Tooltip,
	Legend,
)

/* ----- College Applications Overview (area/line chart) ----- */
const APPLICATIONS_TREND = {
	labels: [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	],
	datasets: [
		{
			label: "Approved",
			data: [65, 78, 82, 85, 88, 92, 95, 98, 102, 105, 108, 112],
			borderColor: "#16a34a",
			backgroundColor: "rgba(22, 163, 74, 0.35)",
			fill: true,
			tension: 0.3,
		},
		{
			label: "Total Applications",
			data: [95, 110, 125, 140, 155, 170, 165, 180, 195, 200, 190, 210],
			borderColor: "#22c55e",
			backgroundColor: "rgba(34, 197, 94, 0.3)",
			fill: true,
			tension: 0.3,
		},
	],
}

const lineChartOptions = {
	responsive: true,
	maintainAspectRatio: false,
	plugins: { legend: { position: "bottom" } },
	scales: { y: { beginAtZero: true } },
}

const doughnutOptions = {
	responsive: true,
	maintainAspectRatio: false,
	plugins: { legend: { display: false } },
}

const statusClass = (status) => {
	const s = (status || "").toLowerCase()
	if (s === "approved") return "status-approved"
	if (s === "rejected") return "status-rejected"
	if (s === "under review") return "status-review"
	return "status-pending"
}

export default function AdminDashboard() {
	const [activeTab, setActiveTab] = useState("Overview")
	const [sidebarOpen, setSidebarOpen] = useState(false)
	const [userMenuOpen, setUserMenuOpen] = useState(false)
	const { theme, setTheme } = useThemeMode()
	const [adminUser, setAdminUser] = useState(null)
	const userMenuRef = useRef(null)

	// State for applications data from Firestore
	const [applications, setApplications] = useState([])
	const [isLoadingApplications, setIsLoadingApplications] = useState(false)
	const [overviewStats, setOverviewStats] = useState([])
	const [scholarshipDistribution, setScholarshipDistribution] = useState({
		labels: [],
		datasets: [{ data: [], backgroundColor: [], borderWidth: 0 }],
	})

	// Filters for Overview
	const [overviewStatusFilter, setOverviewStatusFilter] = useState("All")
	const [chartTimePeriod, setChartTimePeriod] = useState("Monthly")

	// Students for approvals tab (pending, approved, rejected)
	const [pendingStudents, setPendingStudents] = useState([])
	const [approvedStudents, setApprovedStudents] = useState([])
	const [rejectedStudents, setRejectedStudents] = useState([])
	const [isLoadingPending, setIsLoadingPending] = useState(false)
	const [approvalStatusFilter, setApprovalStatusFilter] = useState("Pending")
	const [previewFile, setPreviewFile] = useState(null)
	const [previewImgError, setPreviewImgError] = useState(false)

	// Handle click outside user menu
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

	// Listen for auth state changes
	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, (user) => {
			if (user) {
				setAdminUser({
					name: user.displayName || "Administrator",
					uid: user.uid,
					email: user.email,
				})
			} else {
				setAdminUser(null)
			}
		})
		return unsubscribe
	}, [])

	// Fetch applications from Firestore (from multiple collections) - Real-time
	useEffect(() => {
		// Use refs to store current data from each listener
		const pendingRef = { current: [] }
		const approvedRef = { current: [] }
		const rejectedRef = { current: [] }

		// Helper to combine all data and update state
		const updateCombinedApps = () => {
			setApplications([
				...pendingRef.current,
				...approvedRef.current,
				...rejectedRef.current,
			])
			// Also update the individual arrays for the Registrations tab
			setPendingStudents([...pendingRef.current])
			setApprovedStudents([...approvedRef.current])
			setRejectedStudents([...rejectedRef.current])
		}

		// Real-time listener for pending applications
		const unsubscribePendingApps = onSnapshot(
			collection(db, "pendingStudent"),
			(snapshot) => {
				const pendingApps = []
				snapshot.forEach((d) => {
					const data = d.data() || {}
					if (
						data.isPending === true ||
						data.isValidated === false ||
						data.isValidated === "false"
					) {
						pendingApps.push({
							id: d.id,
							status: "pending",
							studentName: [data.fname, data.mname, data.lname]
								.filter(Boolean)
								.join(" "),
							createdAt: data.createdAt || data.timestamp || new Date(),
							...data,
						})
					}
				})
				pendingRef.current = pendingApps
				updateCombinedApps()
			},
			(error) => console.error("Error fetching pending apps:", error),
		)

		// Real-time listener for approved applications
		const unsubscribeApprovedApps = onSnapshot(
			collection(db, "students"),
			(snapshot) => {
				const approvedApps = []
				snapshot.forEach((d) => {
					const data = d.data() || {}
					// Only include students where isValidated is true
					if (data.isValidated === true || data.isValidated === "true") {
						approvedApps.push({
							id: d.id,
							status: "approved",
							studentName: [data.fname, data.mname, data.lname]
								.filter(Boolean)
								.join(" "),
							createdAt: data.createdAt || data.timestamp || new Date(),
							...data,
						})
					}
				})
				approvedRef.current = approvedApps
				updateCombinedApps()
			},
			(error) => console.error("Error fetching approved apps:", error),
		)

		// Real-time listener for rejected applications
		const unsubscribeRejectedApps = onSnapshot(
			collection(db, "rejected"),
			(snapshot) => {
				const rejectedApps = []
				snapshot.forEach((d) => {
					const data = d.data() || {}
					rejectedApps.push({
						id: d.id,
						status: "rejected",
						studentName: [data.fname, data.mname, data.lname]
							.filter(Boolean)
							.join(" "),
						createdAt: data.createdAt || data.timestamp || new Date(),
						...data,
					})
				})
				rejectedRef.current = rejectedApps
				updateCombinedApps()
			},
			(error) => console.error("Error fetching rejected apps:", error),
		)

		// Cleanup listeners
		return () => {
			unsubscribePendingApps()
			unsubscribeApprovedApps()
			unsubscribeRejectedApps()
		}
	}, [])

	// Recalculate stats and scholarship distribution when applications change (real-time)
	useEffect(() => {
		// Always calculate stats regardless of array length
		calculateStats(applications)
		updateScholarshipDistribution(applications)
	}, [applications])

	// Calculate overview stats from applications
	const calculateStats = (appData) => {
		const stats = [
			{
				label: "Total Applications",
				value: appData.length.toString(),
				trend: "All applications in system",
				trendUp: true,
				icon: HiOutlineDocumentText,
			},
			{
				label: "Approved",
				value: appData.filter((a) => a.status === "approved").length.toString(),
				trend: "Successfully approved",
				trendUp: true,
				icon: HiOutlineCheckCircle,
			},
			{
				label: "Pending Review",
				value: appData
					.filter((a) => a.status === "pending" || a.status === "under review")
					.length.toString(),
				trend: "Awaiting action",
				trendUp: false,
				icon: HiOutlineClock,
			},
			{
				label: "Rejected",
				value: appData.filter((a) => a.status === "rejected").length.toString(),
				trend: "Applications denied",
				trendUp: false,
				icon: HiOutlineXCircle,
			},
		]
		setOverviewStats(stats)
	}

	// Update scholarship distribution from applications
	const updateScholarshipDistribution = (appData) => {
		const courseCounts = {}
		const colors = [
			"#3b82f6",
			"#f59e0b",
			"#ef4444",
			"#8b5cf6",
			"#10b981",
			"#ec4899",
			"#14b8a6",
		]

		appData.forEach((app) => {
			const course = app.course || "Other"
			courseCounts[course] = (courseCounts[course] || 0) + 1
		})

		const labels = Object.keys(courseCounts)
		const data = Object.values(courseCounts)
		const backgroundColor = colors.slice(0, labels.length)

		setScholarshipDistribution({
			labels,
			datasets: [
				{
					data,
					backgroundColor,
					borderWidth: 0,
				},
			],
		})
	}

	// Filters for Analytics
	const [analyticsCourseFilter, setAnalyticsCourseFilter] = useState("All")
	const [analyticsMonthFilter, setAnalyticsMonthFilter] = useState("All")

	// Filters for Applications
	const [appStatusFilter, setAppStatusFilter] = useState("All Statuses")
	const [appCourseFilter, setAppCourseFilter] = useState("All Courses")
	const [appDateFilter, setAppDateFilter] = useState("All Dates")

	// Filter Overview applications
	const filteredOverviewApps = applications.filter((app) => {
		if (overviewStatusFilter === "All") return true
		const status = (app.status || "").toLowerCase()
		const filter = overviewStatusFilter.toLowerCase()
		return status.includes(filter)
	})

	// Filter Applications page
	const filteredApplications = applications.filter((app) => {
		let statusMatch = true
		let courseMatch = true
		let dateMatch = true

		if (appStatusFilter !== "All Statuses") {
			const statusMap = {
				Submitted: "pending",
				"In Review": "under review",
				Approved: "approved",
				Rejected: "rejected",
			}
			statusMatch =
				(app.status || "").toLowerCase() === statusMap[appStatusFilter]
		}

		if (appCourseFilter !== "All Courses") {
			courseMatch = (app.course || "").includes(appCourseFilter)
		}

		if (appDateFilter !== "All Dates") {
			const appDate = app.createdAt ? new Date(app.createdAt) : null
			const today = new Date()
			const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
			const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
			const threeMonthsAgo = new Date(
				today.getTime() - 90 * 24 * 60 * 60 * 1000,
			)

			if (appDate) {
				switch (appDateFilter) {
					case "This Week":
						dateMatch = appDate >= weekAgo && appDate <= today
						break
					case "This Month":
						dateMatch = appDate.getMonth() === today.getMonth()
						break
					case "Last Month":
						dateMatch = appDate.getMonth() === today.getMonth() - 1
						break
					case "Last 3 Months":
						dateMatch = appDate >= threeMonthsAgo
						break
					default:
						dateMatch = true
				}
			}
		}

		return statusMatch && courseMatch && dateMatch
	})

	// Get chart data based on time period
	const getChartData = () => {
		const chartDataByPeriod = {
			Daily: {
				labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
				datasets: [
					{
						label: "Approved",
						data: [12, 15, 18, 14, 20, 16, 22],
						borderColor: "#16a34a",
						backgroundColor: "rgba(22, 163, 74, 0.35)",
						fill: true,
						tension: 0.3,
					},
					{
						label: "Total Applications",
						data: [24, 28, 35, 32, 40, 30, 45],
						borderColor: "#22c55e",
						backgroundColor: "rgba(34, 197, 94, 0.3)",
						fill: true,
						tension: 0.3,
					},
				],
			},
			Weekly: {
				labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
				datasets: [
					{
						label: "Approved",
						data: [59, 72, 66, 78],
						borderColor: "#16a34a",
						backgroundColor: "rgba(22, 163, 74, 0.35)",
						fill: true,
						tension: 0.3,
					},
					{
						label: "Total Applications",
						data: [120, 145, 130, 165],
						borderColor: "#22c55e",
						backgroundColor: "rgba(34, 197, 94, 0.3)",
						fill: true,
						tension: 0.3,
					},
				],
			},
			Monthly: {
				labels: [
					"Jan",
					"Feb",
					"Mar",
					"Apr",
					"May",
					"Jun",
					"Jul",
					"Aug",
					"Sep",
					"Oct",
					"Nov",
					"Dec",
				],
				datasets: [
					{
						label: "Approved",
						data: [65, 78, 82, 85, 88, 92, 95, 98, 102, 105, 108, 112],
						borderColor: "#16a34a",
						backgroundColor: "rgba(22, 163, 74, 0.35)",
						fill: true,
						tension: 0.3,
					},
					{
						label: "Total Applications",
						data: [95, 110, 125, 140, 155, 170, 165, 180, 195, 200, 190, 210],
						borderColor: "#22c55e",
						backgroundColor: "rgba(34, 197, 94, 0.3)",
						fill: true,
						tension: 0.3,
					},
				],
			},
			Yearly: {
				labels: ["2020", "2021", "2022", "2023", "2024"],
				datasets: [
					{
						label: "Approved",
						data: [420, 520, 615, 780, 1045],
						borderColor: "#16a34a",
						backgroundColor: "rgba(22, 163, 74, 0.35)",
						fill: true,
						tension: 0.3,
					},
					{
						label: "Total Applications",
						data: [680, 845, 1050, 1320, 1845],
						borderColor: "#22c55e",
						backgroundColor: "rgba(34, 197, 94, 0.3)",
						fill: true,
						tension: 0.3,
					},
				],
			},
		}
		return chartDataByPeriod[chartTimePeriod]
	}

	return (
		<div
			className={`admin-dashboard ${theme === "dark" ? "admin-dashboard--dark" : ""}`}
		>
			<header className="admin-header">
				<div className="admin-header-top-stripe"></div>
				<div className="admin-header-content">
					<div className="admin-header-left">
						<img src={logo2} alt="BulsuScholar" className="admin-header-logo" />
						<h1 className="admin-header-brand">BulsuScholar</h1>
					</div>
					<div className="admin-header-right">
						<button
							type="button"
							className="admin-header-notification-btn"
							aria-label="Messages"
						>
							<HiOutlineMail
								className="admin-header-notification-icon"
								aria-hidden
							/>
							<span className="admin-header-badge">0</span>
						</button>
						<div className="admin-header-user-wrap" ref={userMenuRef}>
							<button
								type="button"
								className="admin-header-user-btn"
								onClick={() => setUserMenuOpen((o) => !o)}
								aria-label="User menu"
								aria-expanded={userMenuOpen}
							>
								<HiMenu className="admin-header-menu-icon" aria-hidden />
								<div className="admin-header-avatar">AD</div>
							</button>
							{userMenuOpen && (
								<div className="admin-verified-dropdown">
									<div className="admin-verified-dropdown-user">
										<div className="admin-verified-dropdown-avatar">AD</div>
										<div className="admin-verified-dropdown-user-info">
											<p className="admin-verified-dropdown-name">
												{adminUser?.name || "Administrator"}
											</p>
											<p className="admin-verified-dropdown-email">
												{adminUser?.uid || "Loading..."}
											</p>
										</div>
									</div>
									<nav className="admin-verified-dropdown-nav">
										<button
											type="button"
											className="admin-verified-dropdown-item"
										>
											<HiOutlineUserCircle
												className="admin-verified-dropdown-item-icon"
												aria-hidden
											/>
											My Profile
										</button>
										<button
											type="button"
											className="admin-verified-dropdown-item"
										>
											<HiOutlineCog
												className="admin-verified-dropdown-item-icon"
												aria-hidden
											/>
											Settings
										</button>
									</nav>
									<div className="admin-verified-dropdown-theme">
										<span className="admin-verified-dropdown-theme-label">
											THEME
										</span>
										<div className="admin-verified-dropdown-theme-btns">
											<button
												type="button"
												className={`admin-verified-dropdown-theme-btn ${theme === "light" ? "active" : ""}`}
												onClick={() => setTheme("light")}
											>
												<HiOutlineSun aria-hidden />
												Light
											</button>
											<button
												type="button"
												className={`admin-verified-dropdown-theme-btn ${theme === "dark" ? "active" : ""}`}
												onClick={() => setTheme("dark")}
											>
												<HiOutlineMoon aria-hidden />
												Dark
											</button>
										</div>
									</div>
									<button
										type="button"
										className="admin-verified-dropdown-logout"
										onClick={() => {
											setUserMenuOpen(false)
											// Add logout logic here
										}}
									>
										<HiOutlineLogout
											className="admin-verified-dropdown-logout-icon"
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

			{/* Sidebar Navigation */}
			<div
				className={`dashboard-sidebar ${sidebarOpen ? "dashboard-sidebar--open" : ""}`}
			>
				<nav className="dashboard-sidebar-nav">
					<a
						href="#"
						className="dashboard-sidebar-item dashboard-sidebar-item--active"
					>
						Overview
					</a>
					<a href="#" className="dashboard-sidebar-item">
						Analytics
					</a>
					<a href="#" className="dashboard-sidebar-item">
						Applications
					</a>
					<a href="#" className="dashboard-sidebar-item">
						Settings
					</a>
					<a href="#" className="dashboard-sidebar-item">
						Logout
					</a>
				</nav>
			</div>

			<main className="dashboard-main">
				<div className="dashboard-content">
					<div className="dashboard-page-title">
						<h2 className="dashboard-page-heading">Dashboard Overview</h2>
						<p className="dashboard-page-sub">
							Monitor and manage college scholarship applications
						</p>
					</div>

					{/* Tabs */}
					<nav className="dashboard-tabs" aria-label="Dashboard sections">
						<button
							type="button"
							className={`dashboard-tab ${activeTab === "Overview" ? "dashboard-tab--active" : ""}`}
							onClick={() => setActiveTab("Overview")}
						>
							Overview
						</button>
						<button
							type="button"
							className={`dashboard-tab ${activeTab === "Registrations" ? "dashboard-tab--active" : ""}`}
							onClick={() => setActiveTab("Registrations")}
						>
							Registrations
						</button>
					</nav>

					{activeTab === "Overview" && (
						<>
							{/* stat cards from Firestore */}
							<section className="dashboard-stats-grid">
								{overviewStats.map(
									({ label, value, trend, trendUp, icon: Icon }) => (
										<div key={label} className="dashboard-stat-card">
											<div className="dashboard-stat-card-header">
												<span className="dashboard-stat-label">{label}</span>
												<span className="dashboard-stat-icon-wrap">
													{Icon && (
														<Icon className="dashboard-stat-icon" aria-hidden />
													)}
												</span>
											</div>
											<div className="dashboard-stat-value">{value}</div>
											<div
												className={`dashboard-stat-trend ${trendUp ? "dashboard-stat-trend--up" : "dashboard-stat-trend--down"}`}
											>
												{trend}
											</div>
										</div>
									),
								)}
							</section>

							{/* Charts row */}
							<section className="dashboard-charts-row">
								<div className="dashboard-panel dashboard-panel--chart">
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											alignItems: "center",
											marginBottom: "1rem",
										}}
									>
										<div>
											<h3 className="dashboard-panel-title">
												College Applications Overview
											</h3>
											<p className="dashboard-panel-sub">
												Application trends for college students
											</p>
										</div>
										<div style={{ display: "flex", gap: "0.5rem" }}>
											<button
												onClick={() => setChartTimePeriod("Daily")}
												style={{
													padding: "0.5rem 1rem",
													border:
														chartTimePeriod === "Daily"
															? "2px solid #22c55e"
															: "1px solid #d1d5db",
													background:
														chartTimePeriod === "Daily"
															? "rgba(34, 197, 94, 0.1)"
															: "#fff",
													borderRadius: "6px",
													cursor: "pointer",
													fontSize: "0.875rem",
													fontWeight:
														chartTimePeriod === "Daily" ? "600" : "400",
													color:
														chartTimePeriod === "Daily" ? "#22c55e" : "#6b7280",
												}}
											>
												Daily
											</button>
											<button
												onClick={() => setChartTimePeriod("Weekly")}
												style={{
													padding: "0.5rem 1rem",
													border:
														chartTimePeriod === "Weekly"
															? "2px solid #22c55e"
															: "1px solid #d1d5db",
													background:
														chartTimePeriod === "Weekly"
															? "rgba(34, 197, 94, 0.1)"
															: "#fff",
													borderRadius: "6px",
													cursor: "pointer",
													fontSize: "0.875rem",
													fontWeight:
														chartTimePeriod === "Weekly" ? "600" : "400",
													color:
														chartTimePeriod === "Weekly"
															? "#22c55e"
															: "#6b7280",
												}}
											>
												Weekly
											</button>
											<button
												onClick={() => setChartTimePeriod("Monthly")}
												style={{
													padding: "0.5rem 1rem",
													border:
														chartTimePeriod === "Monthly"
															? "2px solid #22c55e"
															: "1px solid #d1d5db",
													background:
														chartTimePeriod === "Monthly"
															? "rgba(34, 197, 94, 0.1)"
															: "#fff",
													borderRadius: "6px",
													cursor: "pointer",
													fontSize: "0.875rem",
													fontWeight:
														chartTimePeriod === "Monthly" ? "600" : "400",
													color:
														chartTimePeriod === "Monthly"
															? "#22c55e"
															: "#6b7280",
												}}
											>
												Monthly
											</button>
											<button
												onClick={() => setChartTimePeriod("Yearly")}
												style={{
													padding: "0.5rem 1rem",
													border:
														chartTimePeriod === "Yearly"
															? "2px solid #22c55e"
															: "1px solid #d1d5db",
													background:
														chartTimePeriod === "Yearly"
															? "rgba(34, 197, 94, 0.1)"
															: "#fff",
													borderRadius: "6px",
													cursor: "pointer",
													fontSize: "0.875rem",
													fontWeight:
														chartTimePeriod === "Yearly" ? "600" : "400",
													color:
														chartTimePeriod === "Yearly"
															? "#22c55e"
															: "#6b7280",
												}}
											>
												Yearly
											</button>
										</div>
									</div>
									<div className="dashboard-chart-wrap">
										<Line data={getChartData()} options={lineChartOptions} />
									</div>
								</div>
								<div className="dashboard-panel dashboard-panel--chart">
									<h3 className="dashboard-panel-title">
										Scholarship Distribution
									</h3>
									<p className="dashboard-panel-sub">
										College applications by course/program
									</p>
									<div className="dashboard-pie-container">
										<div className="dashboard-chart-wrap dashboard-chart-wrap--pie">
											<Doughnut
												data={scholarshipDistribution}
												options={doughnutOptions}
											/>
										</div>
										<div className="dashboard-pie-stats">
											{scholarshipDistribution.labels.map((label, idx) => (
												<div key={label} className="pie-stat-item">
													<span
														className="stat-color"
														style={{
															backgroundColor:
																scholarshipDistribution.datasets[0]
																	?.backgroundColor?.[idx],
														}}
													></span>
													<span>{label}</span>
												</div>
											))}
										</div>
									</div>
								</div>
							</section>

							{/* Pending Registrations Preview */}
							<section className="dashboard-panel dashboard-panel--table">
								<div className="dashboard-panel-header">
									<div>
										<h3 className="dashboard-panel-title">
											Pending Registrations Preview
										</h3>
										<p className="dashboard-panel-sub">
											Students awaiting verification and approval
										</p>
									</div>
									<button
										type="button"
										style={{
											padding: "0.5rem 1rem",
											background: "#16a34a",
											color: "#fff",
											border: "none",
											borderRadius: "6px",
											cursor: "pointer",
											fontSize: "0.875rem",
											fontWeight: "600",
											transition: "all 0.2s ease",
										}}
										onClick={() => setActiveTab("Registrations")}
										onMouseEnter={(e) =>
											(e.target.style.background = "#15803d")
										}
										onMouseLeave={(e) =>
											(e.target.style.background = "#16a34a")
										}
									>
										View All ({pendingStudents.length})
									</button>
								</div>
								<div className="dashboard-table-wrap">
									<table className="dashboard-table">
										<thead>
											<tr>
												<th>Student Name</th>
												<th>Student No.</th>
												<th>Course</th>
												<th>Year / Section</th>
												<th>COR File</th>
											</tr>
										</thead>
										<tbody>
											{isLoadingPending ? (
												<tr>
													<td
														colSpan="5"
														style={{
															textAlign: "center",
															padding: "2rem",
															color: "#6b7280",
														}}
													>
														Loading pending students...
													</td>
												</tr>
											) : pendingStudents.length === 0 ? (
												<tr>
													<td
														colSpan="5"
														style={{
															textAlign: "center",
															padding: "2rem",
															color: "#6b7280",
														}}
													>
														No pending registrations at the moment
													</td>
												</tr>
											) : (
												pendingStudents.slice(0, 5).map((student) => {
													const fullName = [
														student.fname,
														student.mname,
														student.lname,
													]
														.filter(Boolean)
														.join(" ")
													const studentNo = student.studentnumber || student.id
													const fileMeta = student.corFile || null
													return (
														<tr key={student.id}>
															<td>{fullName || "—"}</td>
															<td>
																<span className="dashboard-table-id">
																	{studentNo || "—"}
																</span>
															</td>
															<td>{student.course || "—"}</td>
															<td>
																Yr {student.year || "—"} / Sec{" "}
																{student.section || "—"}
															</td>
															<td>
																{fileMeta ? (
																	<button
																		type="button"
																		className="dashboard-preview-btn"
																		onClick={() => {
																			setPreviewImgError(false)
																			setPreviewFile({
																				studentName: fullName || "Student",
																				studentNo,
																				file: fileMeta,
																			})
																		}}
																	>
																		Preview
																	</button>
																) : (
																	<span
																		style={{
																			fontSize: "0.8rem",
																			color: "#9ca3af",
																		}}
																	>
																		No file
																	</span>
																)}
															</td>
														</tr>
													)
												})
											)}
										</tbody>
									</table>
								</div>
							</section>
						</>
					)}

					{activeTab === "Registrations" && (
						<>
							{/* Approvals Analytics KPI Cards */}
							<section className="dashboard-stats-grid">
								<div className="dashboard-stat-card dashboard-stat-card--blue">
									<div className="dashboard-stat-card-header">
										<span className="dashboard-stat-label">
											Pending Reviews
										</span>
										<span
											className="dashboard-stat-icon-wrap"
											style={{ color: "#3b82f6" }}
										>
											<HiOutlineClock
												className="dashboard-stat-icon"
												aria-hidden
											/>
										</span>
									</div>
									<div className="dashboard-stat-value">
										{pendingStudents.length}
									</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--neutral">
										Waiting for approval
									</div>
								</div>
								<div className="dashboard-stat-card dashboard-stat-card--green">
									<div className="dashboard-stat-card-header">
										<span className="dashboard-stat-label">
											Approved Students
										</span>
										<span
											className="dashboard-stat-icon-wrap"
											style={{ color: "#22c55e" }}
										>
											<HiOutlineCheckCircle
												className="dashboard-stat-icon"
												aria-hidden
											/>
										</span>
									</div>
									<div className="dashboard-stat-value">
										{approvedStudents.length}
									</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--up">
										Total approved
									</div>
								</div>
								<div className="dashboard-stat-card dashboard-stat-card--red">
									<div className="dashboard-stat-card-header">
										<span className="dashboard-stat-label">
											Rejected Students
										</span>
										<span
											className="dashboard-stat-icon-wrap"
											style={{ color: "#ef4444" }}
										>
											<HiOutlineXCircle
												className="dashboard-stat-icon"
												aria-hidden
											/>
										</span>
									</div>
									<div className="dashboard-stat-value">
										{rejectedStudents.length}
									</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--down">
										Total rejected
									</div>
								</div>
							</section>

							<section className="dashboard-panel dashboard-panel--table">
								<div className="dashboard-panel-header">
									<div>
										<h3 className="dashboard-panel-title">
											Student Registrations
										</h3>
										<p className="dashboard-panel-sub">
											View and manage student registrations.
										</p>
									</div>
								</div>

								{/* Approval Status Filter Buttons */}
								<div
									style={{
										display: "flex",
										gap: "0.5rem",
										marginBottom: "1.5rem",
										padding: "0 0 1rem 0",
										borderBottom: "1px solid #e5e7eb",
									}}
								>
									{["Pending", "Approved", "Rejected"].map((status) => (
										<button
											type="button"
											key={status}
											onClick={() => setApprovalStatusFilter(status)}
											style={{
												padding: "0.5rem 1rem",
												border:
													approvalStatusFilter === status
														? "2px solid #16a34a"
														: "1px solid #d1d5db",
												background:
													approvalStatusFilter === status
														? "rgba(22, 163, 74, 0.08)"
														: "#fff",
												borderRadius: "6px",
												cursor: "pointer",
												fontSize: "0.875rem",
												fontWeight:
													approvalStatusFilter === status ? "600" : "500",
												color:
													approvalStatusFilter === status
														? "#16a34a"
														: "#6b7280",
												transition: "all 0.2s ease",
											}}
										>
											{status} (
											{status === "Pending"
												? pendingStudents.length
												: status === "Approved"
													? approvedStudents.length
													: rejectedStudents.length}
											)
										</button>
									))}
								</div>

								{isLoadingPending ? (
									<p className="dashboard-placeholder">Loading students…</p>
								) : (approvalStatusFilter === "Pending" &&
										pendingStudents.length === 0) ||
								  (approvalStatusFilter === "Approved" &&
										approvedStudents.length === 0) ||
								  (approvalStatusFilter === "Rejected" &&
										rejectedStudents.length === 0) ? (
									<p className="dashboard-placeholder">
										There are no {approvalStatusFilter.toLowerCase()} student
										accounts at the moment.
									</p>
								) : (
									<div className="dashboard-table-wrap">
										<table className="dashboard-table">
											<thead>
												<tr>
													<th>Student</th>
													<th>Student No.</th>
													<th>Course / Year &amp; Section</th>
													<th>Registration No.</th>
													<th>COR File</th>
													<th>Actions</th>
												</tr>
											</thead>
											<tbody>
												{(() => {
													let studentsToShow = []
													if (approvalStatusFilter === "Pending") {
														studentsToShow = pendingStudents
													} else if (approvalStatusFilter === "Approved") {
														studentsToShow = approvedStudents
													} else if (approvalStatusFilter === "Rejected") {
														studentsToShow = rejectedStudents
													}
													return studentsToShow.map((s) => {
														const fullName = [s.fname, s.mname, s.lname]
															.filter(Boolean)
															.join(" ")
														const studentNo = s.studentnumber || s.id
														const fileMeta = s.corFile || null
														return (
															<tr key={s.id}>
																<td>
																	<div
																		style={{
																			display: "flex",
																			flexDirection: "column",
																		}}
																	>
																		<span style={{ fontWeight: 600 }}>
																			{fullName || "Student"}
																		</span>
																	</div>
																</td>
																<td>
																	<span className="dashboard-table-id">
																		{studentNo || "—"}
																	</span>
																</td>
																<td>
																	<div
																		style={{
																			display: "flex",
																			flexDirection: "column",
																		}}
																	>
																		<span>{s.course || "—"}</span>
																		<span
																			style={{
																				fontSize: "0.8rem",
																				color: "#6b7280",
																			}}
																		>
																			Year {s.year || "—"} / Sec{" "}
																			{s.section || "—"}
																		</span>
																	</div>
																</td>
																<td>{s.registrationNumber || "—"}</td>
																<td>
																	{fileMeta ? (
																		<button
																			type="button"
																			className="dashboard-preview-btn"
																			onClick={() => {
																				setPreviewImgError(false)
																				setPreviewFile({
																					studentName: fullName || "Student",
																					studentNo,
																					file: fileMeta,
																				})
																			}}
																		>
																			Preview
																		</button>
																	) : (
																		<span
																			style={{
																				fontSize: "0.8rem",
																				color: "#9ca3af",
																			}}
																		>
																			No COR uploaded
																		</span>
																	)}
																</td>
																<td>
																	<div className="dashboard-approval-actions">
																		{approvalStatusFilter === "Pending" ? (
																			<>
																				<button
																					type="button"
																					className="dashboard-approval-btn dashboard-approval-btn--approve"
																					onClick={async () => {
																						try {
																							const studentId = studentNo
																							await setDoc(
																								doc(db, "students", studentId),
																								{
																									fname: s.fname || "",
																									mname: s.mname || "",
																									lname: s.lname || "",
																									course: s.course || "",
																									year: s.year || "",
																									section: s.section || "",
																									studentnumber: studentId,
																									userType: "student",
																									isValidated: true,
																									isPending: false,
																									validatedAt:
																										serverTimestamp(),
																									registrationNumber:
																										s.registrationNumber || "",
																									corFile: s.corFile || null,
																									password: s.password || "",
																								},
																								{ merge: true },
																							)
																							await deleteDoc(
																								doc(db, "pendingStudent", s.id),
																							)
																							setPendingStudents((prev) =>
																								prev.filter(
																									(p) => p.id !== s.id,
																								),
																							)
																							setApprovedStudents((prev) => [
																								...prev,
																								{
																									id: studentNo,
																									status: "approved",
																									fname: s.fname || "",
																									mname: s.mname || "",
																									lname: s.lname || "",
																									course: s.course || "",
																									year: s.year || "",
																									section: s.section || "",
																									registrationNumber:
																										s.registrationNumber || "",
																									corFile: s.corFile || null,
																									validatedAt: new Date(),
																								},
																							])
																						} catch (err) {
																							// eslint-disable-next-line no-console
																							console.error(
																								"Approve failed",
																								err,
																							)
																						}
																					}}
																				>
																					Approve
																				</button>
																				<button
																					type="button"
																					className="dashboard-approval-btn dashboard-approval-btn--reject"
																					onClick={async () => {
																						try {
																							await setDoc(
																								doc(db, "rejected", s.id),
																								{
																									...s,
																									rejectedAt: serverTimestamp(),
																								},
																							)
																							await deleteDoc(
																								doc(db, "pendingStudent", s.id),
																							)
																							setPendingStudents((prev) =>
																								prev.filter(
																									(p) => p.id !== s.id,
																								),
																							)
																							setRejectedStudents((prev) => [
																								...prev,
																								{
																									id: s.id,
																									status: "rejected",
																									fname: s.fname || "",
																									mname: s.mname || "",
																									lname: s.lname || "",
																									course: s.course || "",
																									year: s.year || "",
																									section: s.section || "",
																									registrationNumber:
																										s.registrationNumber || "",
																									corFile: s.corFile || null,
																									rejectedAt: new Date(),
																								},
																							])
																						} catch (err) {
																							// eslint-disable-next-line no-console
																							console.error(
																								"Reject failed",
																								err,
																							)
																						}
																					}}
																				>
																					Reject
																				</button>
																			</>
																		) : (
																			<span
																				className={`dashboard-status-pill ${
																					approvalStatusFilter === "Approved"
																						? "dashboard-status-pill--approved"
																						: "dashboard-status-pill--rejected"
																				}`}
																				style={{
																					padding: "0.5rem 1rem",
																					borderRadius: "9999px",
																					fontSize: "0.875rem",
																					fontWeight: "600",
																					backgroundColor:
																						approvalStatusFilter === "Approved"
																							? "rgba(22, 163, 74, 0.1)"
																							: "rgba(220, 38, 38, 0.1)",
																					color:
																						approvalStatusFilter === "Approved"
																							? "#16a34a"
																							: "#dc2626",
																				}}
																			>
																				{approvalStatusFilter === "Approved"
																					? "✓ Approved"
																					: "✕ Rejected"}
																			</span>
																		)}
																	</div>
																</td>
															</tr>
														)
													})
												})()}
											</tbody>
										</table>
									</div>
								)}
							</section>
						</>
					)}

					{activeTab === "Analytics" && (
						<>
							{/* Analytics KPI Cards */}
							<section className="dashboard-stats-grid">
								<div className="dashboard-stat-card dashboard-stat-card--blue">
									<div className="dashboard-stat-card-header">
										<span className="dashboard-stat-label">
											Scholarship Approval Rate
										</span>
										<span
											className="dashboard-stat-icon-wrap"
											style={{ color: "#3b82f6" }}
										>
											<HiOutlineCheckCircle
												className="dashboard-stat-icon"
												aria-hidden
											/>
										</span>
									</div>
									<div className="dashboard-stat-value">78.4%</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--up">
										↑ 6.3% from last month
									</div>
								</div>
								<div className="dashboard-stat-card dashboard-stat-card--purple">
									<div className="dashboard-stat-card-header">
										<span className="dashboard-stat-label">
											Avg Review Time
										</span>
										<span
											className="dashboard-stat-icon-wrap"
											style={{ color: "#8b5cf6" }}
										>
											<HiOutlineClock
												className="dashboard-stat-icon"
												aria-hidden
											/>
										</span>
									</div>
									<div className="dashboard-stat-value">3.5 days</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--down">
										↓ 0.8 days from last month
									</div>
								</div>
								<div className="dashboard-stat-card dashboard-stat-card--pink">
									<div className="dashboard-stat-card-header">
										<span className="dashboard-stat-label">
											Active Recipients
										</span>
										<span
											className="dashboard-stat-icon-wrap"
											style={{ color: "#ec4899" }}
										>
											<HiOutlineUserGroup
												className="dashboard-stat-icon"
												aria-hidden
											/>
										</span>
									</div>
									<div className="dashboard-stat-value">1,256</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--up">
										↑ 89 new recipients
									</div>
								</div>
							</section>

							{/* Analytics Charts */}
							<section className="dashboard-charts-row">
								<div className="dashboard-panel dashboard-panel--chart">
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											alignItems: "center",
											marginBottom: "1rem",
										}}
									>
										<div>
											<h3 className="dashboard-panel-title">
												Scholarship Completion Rates
											</h3>
											<p className="dashboard-panel-sub">
												Percentage of scholarships disbursed by period
											</p>
										</div>
										<div style={{ display: "flex", gap: "0.5rem" }}>
											<button
												onClick={() => setChartTimePeriod("Daily")}
												style={{
													padding: "0.5rem 1rem",
													border:
														chartTimePeriod === "Daily"
															? "2px solid #22c55e"
															: "1px solid #d1d5db",
													background:
														chartTimePeriod === "Daily"
															? "rgba(34, 197, 94, 0.1)"
															: "#fff",
													borderRadius: "6px",
													cursor: "pointer",
													fontSize: "0.875rem",
													fontWeight:
														chartTimePeriod === "Daily" ? "600" : "400",
													color:
														chartTimePeriod === "Daily" ? "#22c55e" : "#6b7280",
												}}
											>
												Daily
											</button>
											<button
												onClick={() => setChartTimePeriod("Weekly")}
												style={{
													padding: "0.5rem 1rem",
													border:
														chartTimePeriod === "Weekly"
															? "2px solid #22c55e"
															: "1px solid #d1d5db",
													background:
														chartTimePeriod === "Weekly"
															? "rgba(34, 197, 94, 0.1)"
															: "#fff",
													borderRadius: "6px",
													cursor: "pointer",
													fontSize: "0.875rem",
													fontWeight:
														chartTimePeriod === "Weekly" ? "600" : "400",
													color:
														chartTimePeriod === "Weekly"
															? "#22c55e"
															: "#6b7280",
												}}
											>
												Weekly
											</button>
											<button
												onClick={() => setChartTimePeriod("Monthly")}
												style={{
													padding: "0.5rem 1rem",
													border:
														chartTimePeriod === "Monthly"
															? "2px solid #22c55e"
															: "1px solid #d1d5db",
													background:
														chartTimePeriod === "Monthly"
															? "rgba(34, 197, 94, 0.1)"
															: "#fff",
													borderRadius: "6px",
													cursor: "pointer",
													fontSize: "0.875rem",
													fontWeight:
														chartTimePeriod === "Monthly" ? "600" : "400",
													color:
														chartTimePeriod === "Monthly"
															? "#22c55e"
															: "#6b7280",
												}}
											>
												Monthly
											</button>
											<button
												onClick={() => setChartTimePeriod("Yearly")}
												style={{
													padding: "0.5rem 1rem",
													border:
														chartTimePeriod === "Yearly"
															? "2px solid #22c55e"
															: "1px solid #d1d5db",
													background:
														chartTimePeriod === "Yearly"
															? "rgba(34, 197, 94, 0.1)"
															: "#fff",
													borderRadius: "6px",
													cursor: "pointer",
													fontSize: "0.875rem",
													fontWeight:
														chartTimePeriod === "Yearly" ? "600" : "400",
													color:
														chartTimePeriod === "Yearly"
															? "#22c55e"
															: "#6b7280",
												}}
											>
												Yearly
											</button>
										</div>
									</div>
									<div className="dashboard-chart-wrap">
										<Bar data={getChartData()} options={lineChartOptions} />
									</div>
								</div>
							</section>

							{/* Analytics Metrics Table */}
							<section className="dashboard-panel">
								<h3 className="dashboard-panel-title">Performance Metrics</h3>
								<p className="dashboard-panel-sub">
									Key performance indicators for the scholarship program
								</p>
								<div className="dashboard-table-wrap">
									<table className="dashboard-table">
										<thead>
											<tr>
												<th>Metric</th>
												<th>Current Month</th>
												<th>Previous Month</th>
												<th>Change</th>
												<th>Target</th>
											</tr>
										</thead>
										<tbody>
											<tr>
												<td>
													<strong>Applications Received</strong>
												</td>
												<td>284</td>
												<td>256</td>
												<td>
													<span style={{ color: "#22c55e" }}>↑ 10.9%</span>
												</td>
												<td>250</td>
											</tr>
											<tr>
												<td>
													<strong>Approval Rate</strong>
												</td>
												<td>71.8%</td>
												<td>68.5%</td>
												<td>
													<span style={{ color: "#22c55e" }}>↑ 3.3%</span>
												</td>
												<td>70%</td>
											</tr>
											<tr>
												<td>
													<strong>Avg Review Time</strong>
												</td>
												<td>3.2 days</td>
												<td>4.1 days</td>
												<td>
													<span style={{ color: "#ef4444" }}>↓ 0.9 days</span>
												</td>
												<td>3 days</td>
											</tr>
											<tr>
												<td>
													<strong>Student Satisfaction</strong>
												</td>
												<td>4.6/5</td>
												<td>4.4/5</td>
												<td>
													<span style={{ color: "#22c55e" }}>↑ 0.2</span>
												</td>
												<td>4.5/5</td>
											</tr>
										</tbody>
									</table>
								</div>
							</section>
						</>
					)}

					{activeTab === "Applications" && (
						<>
							{/* Applications Status Cards - Dynamic from Firestore */}
							<section className="dashboard-stats-grid">
								<div
									className="dashboard-stat-card dashboard-stat-card--red"
									style={{ cursor: "pointer", transition: "all 0.3s ease" }}
									onClick={() => setAppStatusFilter("Submitted")}
									onMouseEnter={(e) =>
										(e.currentTarget.style.transform = "translateY(-4px)")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.transform = "translateY(0)")
									}
								>
									<div className="dashboard-stat-card-header">
										<span className="dashboard-stat-label">Pending</span>
										<span
											className="dashboard-stat-icon-wrap"
											style={{ color: "#ef4444" }}
										>
											<HiOutlineDocumentText
												className="dashboard-stat-icon"
												aria-hidden
											/>
										</span>
									</div>
									<div className="dashboard-stat-value">
										{
											applications.filter(
												(a) => (a.status || "").toLowerCase() === "pending",
											).length
										}
									</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--up">
										Awaiting review
									</div>
								</div>
								<div
									className="dashboard-stat-card dashboard-stat-card--yellow"
									style={{ cursor: "pointer", transition: "all 0.3s ease" }}
									onClick={() => setAppStatusFilter("In Review")}
									onMouseEnter={(e) =>
										(e.currentTarget.style.transform = "translateY(-4px)")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.transform = "translateY(0)")
									}
								>
									<div className="dashboard-stat-card-header">
										<span className="dashboard-stat-label">In Review</span>
										<span
											className="dashboard-stat-icon-wrap"
											style={{ color: "#eab308" }}
										>
											<HiOutlineClock
												className="dashboard-stat-icon"
												aria-hidden
											/>
										</span>
									</div>
									<div className="dashboard-stat-value">
										{
											applications.filter(
												(a) =>
													(a.status || "").toLowerCase() === "under review",
											).length
										}
									</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--up">
										Being processed
									</div>
								</div>
								<div
									className="dashboard-stat-card dashboard-stat-card--teal"
									style={{ cursor: "pointer", transition: "all 0.3s ease" }}
									onClick={() => setAppStatusFilter("Approved")}
									onMouseEnter={(e) =>
										(e.currentTarget.style.transform = "translateY(-4px)")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.transform = "translateY(0)")
									}
								>
									<div className="dashboard-stat-card-header">
										<span className="dashboard-stat-label">Approved</span>
										<span
											className="dashboard-stat-icon-wrap"
											style={{ color: "#14b8a6" }}
										>
											<HiOutlineCheckCircle
												className="dashboard-stat-icon"
												aria-hidden
											/>
										</span>
									</div>
									<div className="dashboard-stat-value">
										{
											applications.filter(
												(a) => (a.status || "").toLowerCase() === "approved",
											).length
										}
									</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--up">
										Scholarships granted
									</div>
								</div>
								<div
									className="dashboard-stat-card dashboard-stat-card--darkred"
									style={{ cursor: "pointer", transition: "all 0.3s ease" }}
									onClick={() => setAppStatusFilter("Rejected")}
									onMouseEnter={(e) =>
										(e.currentTarget.style.transform = "translateY(-4px)")
									}
									onMouseLeave={(e) =>
										(e.currentTarget.style.transform = "translateY(0)")
									}
								>
									<div className="dashboard-stat-card-header">
										<span className="dashboard-stat-label">Rejected</span>
										<span
											className="dashboard-stat-icon-wrap"
											style={{ color: "#dc2626" }}
										>
											<HiOutlineXCircle
												className="dashboard-stat-icon"
												aria-hidden
											/>
										</span>
									</div>
									<div className="dashboard-stat-value">
										{
											applications.filter(
												(a) => (a.status || "").toLowerCase() === "rejected",
											).length
										}
									</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--down">
										Applications denied
									</div>
								</div>
							</section>

							{/* Filter Section */}
							<section className="dashboard-panel">
								<h3 className="dashboard-panel-title">Application Filters</h3>
								<div className="dashboard-filters">
									<select
										className="dashboard-filter-select"
										value={appStatusFilter}
										onChange={(e) => setAppStatusFilter(e.target.value)}
									>
										<option>All Statuses</option>
										<option>Submitted</option>
										<option>In Review</option>
										<option>Approved</option>
										<option>Rejected</option>
									</select>
									<select
										className="dashboard-filter-select"
										value={appCourseFilter}
										onChange={(e) => setAppCourseFilter(e.target.value)}
									>
										<option>All Courses</option>
										<option>Engineering</option>
										<option>Business Administration</option>
										<option>Education</option>
										<option>Nursing</option>
										<option>Computer Science</option>
									</select>
									<select
										className="dashboard-filter-select"
										value={appDateFilter}
										onChange={(e) => setAppDateFilter(e.target.value)}
									>
										<option>All Dates</option>
										<option>This Week</option>
										<option>This Month</option>
										<option>Last Month</option>
										<option>Last 3 Months</option>
									</select>
								</div>
							</section>

							{/* Applications Table */}
							<section className="dashboard-panel">
								<h3 className="dashboard-panel-title">All Applications</h3>
								<p className="dashboard-panel-sub">
									Complete list of all scholarship applications
								</p>
								<div className="dashboard-table-wrap">
									<table className="dashboard-table">
										<thead>
											<tr>
												<th>Application ID</th>
												<th>Student Name</th>
												<th>Course</th>
												<th>Scholarship</th>
												<th>Date</th>
												<th>Status</th>
											</tr>
										</thead>
										<tbody>
											{isLoadingApplications ? (
												<tr>
													<td
														colSpan="6"
														style={{
															textAlign: "center",
															padding: "2rem",
															color: "#6b7280",
														}}
													>
														Loading applications...
													</td>
												</tr>
											) : filteredApplications.length === 0 ? (
												<tr>
													<td
														colSpan="6"
														style={{
															textAlign: "center",
															padding: "2rem",
															color: "#6b7280",
														}}
													>
														No applications match the selected filters
													</td>
												</tr>
											) : (
												filteredApplications.map((row) => (
													<tr key={row.id}>
														<td>
															<span className="dashboard-table-id">
																{row.id || "—"}
															</span>
														</td>
														<td>{row.studentName || row.fname || "—"}</td>
														<td>{row.course || "—"}</td>
														<td>{row.scholarship || "—"}</td>
														<td>
															{row.createdAt
																? new Date(row.createdAt).toLocaleDateString()
																: row.date || "—"}
														</td>
														<td>
															<span
																className={`dashboard-status-pill ${statusClass(row.status)}`}
															>
																{row.status || "pending"}
															</span>
														</td>
													</tr>
												))
											)}
										</tbody>
									</table>
								</div>
							</section>
						</>
					)}
				</div>
			</main>

			{previewFile && (
				<div
					className="dashboard-preview-backdrop"
					onClick={() => setPreviewFile(null)}
					role="presentation"
				>
					<div
						className="dashboard-preview-modal"
						onClick={(e) => e.stopPropagation()}
						role="dialog"
						aria-modal="true"
						aria-label="Preview COR file"
					>
						<div className="dashboard-preview-header">
							<div>
								<h3 className="dashboard-preview-title">
									{previewFile.studentName}
								</h3>
								<p className="dashboard-preview-sub">
									Student No. {previewFile.studentNo || "—"}
								</p>
							</div>
							<button
								type="button"
								className="dashboard-preview-close"
								onClick={() => setPreviewFile(null)}
								aria-label="Close preview"
							>
								×
							</button>
						</div>

						<div className="dashboard-preview-body">
							{previewFile.file?.url && !previewImgError ? (
								<img
									src={previewFile.file.url}
									alt={previewFile.file.name || "COR"}
									className="dashboard-preview-image"
									onError={() => setPreviewImgError(true)}
								/>
							) : previewFile.file?.url && previewImgError ? (
								<p className="dashboard-placeholder">
									Image could not be loaded. The URL may have expired.
								</p>
							) : (
								<p className="dashboard-placeholder">
									Preview is not available because no file URL was stored.
								</p>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
