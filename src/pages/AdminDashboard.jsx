/**
 * Admin Dashboard - Overview content (prototype, no database).
 */
import { useState } from "react"
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
} from "react-icons/hi"
import "../css/AdminDashboard.css"
import logo from "../assets/logo.png"

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

/* ----- Overview stat cards ----- */
const OVERVIEW_STATS = [
	{
		label: "Total College Applications",
		value: "1,284",
		trend: "↑ 12% from last month",
		trendUp: true,
		icon: HiOutlineDocumentText,
	},
	{
		label: "Active Scholarships",
		value: "48",
		trend: "↑ 3 new this month",
		trendUp: true,
		icon: HiOutlineUserGroup,
	},
	{
		label: "Approved",
		value: "856",
		trend: "↑ 8% from last month",
		trendUp: true,
		icon: HiOutlineCheckCircle,
	},
	{
		label: "Pending Review",
		value: "142",
		trend: "↓ 5% from last month",
		trendUp: false,
		icon: HiOutlineClock,
	},
	{
		label: "Rejected",
		value: "286",
		trend: "↓ 3% from last month",
		trendUp: false,
		icon: HiOutlineXCircle,
	},
]

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

/* ----- Scholarship Distribution (pie) ----- */
const SCHOLARSHIP_DISTRIBUTION = {
	labels: [
		"Engineering",
		"Business Administration",
		"Education",
		"Nursing",
		"Computer Science",
	],
	datasets: [
		{
			data: [33, 22, 17, 15, 13],
			backgroundColor: ["#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#10b981"],
			borderWidth: 0,
		},
	],
}

/* ----- Recent Applications table ----- */
const RECENT_APPLICATIONS = [
	{
		id: "APP-2024-001",
		name: "Maria Santos",
		course: "BS Civil Engineering",
		scholarship: "Engineering Excellence Award",
		amount: "₱25,000",
		gpa: "3.9",
		date: "2/1/2024",
		status: "pending",
	},
	{
		id: "APP-2024-002",
		name: "Juan Dela Cruz",
		course: "BS Business Administration",
		scholarship: "Merit Scholarship",
		amount: "₱20,000",
		gpa: "3.8",
		date: "2/2/2024",
		status: "approved",
	},
	{
		id: "APP-2024-003",
		name: "Ana Reyes",
		course: "BS Nursing",
		scholarship: "Healthcare Grant",
		amount: "₱30,000",
		gpa: "3.95",
		date: "2/3/2024",
		status: "under review",
	},
	{
		id: "APP-2024-004",
		name: "Carlos Mendoza",
		course: "BS Computer Science",
		scholarship: "Tech Excellence Award",
		amount: "₱28,000",
		gpa: "3.7",
		date: "2/4/2024",
		status: "rejected",
	},
	{
		id: "APP-2024-005",
		name: "Elena Torres",
		course: "BS Education",
		scholarship: "Future Educators Grant",
		amount: "₱22,000",
		gpa: "3.85",
		date: "2/5/2024",
		status: "approved",
	},
	{
		id: "APP-2024-006",
		name: "Miguel Fernandez",
		course: "BS Civil Engineering",
		scholarship: "Engineering Excellence Award",
		amount: "₱25,000",
		gpa: "3.6",
		date: "2/6/2024",
		status: "pending",
	},
]

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

	// Filters for Overview
	const [overviewStatusFilter, setOverviewStatusFilter] = useState("All")
	const [chartTimePeriod, setChartTimePeriod] = useState("Monthly")

	// Filters for Analytics
	const [analyticsCourseFilter, setAnalyticsCourseFilter] = useState("All")
	const [analyticsMonthFilter, setAnalyticsMonthFilter] = useState("All")

	// Filters for Applications
	const [appStatusFilter, setAppStatusFilter] = useState("All Statuses")
	const [appCourseFilter, setAppCourseFilter] = useState("All Courses")
	const [appDateFilter, setAppDateFilter] = useState("All Dates")

	// Filter Overview applications
	const filteredOverviewApps = RECENT_APPLICATIONS.filter((app) => {
		if (overviewStatusFilter === "All") return true
		const status = app.status.toLowerCase()
		const filter = overviewStatusFilter.toLowerCase()
		return status.includes(filter)
	})

	// Filter Applications page
	const filteredApplications = RECENT_APPLICATIONS.filter((app) => {
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
			statusMatch = app.status === statusMap[appStatusFilter]
		}

		if (appCourseFilter !== "All Courses") {
			const courseKeywords = {
				"BS Engineering": "Engineering",
				"BS Business Administration": "Business Administration",
				"BS Education": "Education",
				"BS Nursing": "Nursing",
				"BS Computer Science": "Computer Science",
			}
			courseMatch = Object.entries(courseKeywords).some(
				([course, keyword]) =>
					app.course === course && appCourseFilter.includes(keyword),
			)
		}

		if (appDateFilter !== "All Dates") {
			const appDate = new Date(app.date)
			const today = new Date()
			const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
			const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
			const threeMonthsAgo = new Date(
				today.getTime() - 90 * 24 * 60 * 60 * 1000,
			)

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
		<div className="admin-dashboard">
			{/* Dark header */}
			<header className="dashboard-header">
				<div className="dashboard-header-left">
					<button
						type="button"
						className="dashboard-burger-btn"
						aria-label="Toggle navigation"
						onClick={() => setSidebarOpen(!sidebarOpen)}
					>
						{sidebarOpen ? (
							<HiX className="dashboard-burger-icon" aria-hidden />
						) : (
							<HiMenu className="dashboard-burger-icon" aria-hidden />
						)}
					</button>
					<div className="dashboard-logo">
						<img src={logo} alt="Logo" className="dashboard-logo-img" />
					</div>
					<div>
						<h1 className="dashboard-header-title">
							Institutional Student Programs and Services
						</h1>
						<p className="dashboard-header-sub">Admin Dashboard</p>
					</div>
				</div>
				<div className="dashboard-header-right">
					<button
						type="button"
						className="dashboard-user-btn"
						aria-label="User menu"
					>
						<HiOutlineUserCircle className="dashboard-user-icon" aria-hidden />
					</button>
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
							className={`dashboard-tab ${activeTab === "Analytics" ? "dashboard-tab--active" : ""}`}
							onClick={() => setActiveTab("Analytics")}
						>
							Analytics
						</button>
						<button
							type="button"
							className={`dashboard-tab ${activeTab === "Applications" ? "dashboard-tab--active" : ""}`}
							onClick={() => setActiveTab("Applications")}
						>
							Applications
						</button>
					</nav>

					{activeTab === "Overview" && (
						<>
							{/* 6 stat cards */}
							<section className="dashboard-stats-grid">
								{OVERVIEW_STATS.map(
									({ label, value, trend, trendUp, icon }) => (
										<div key={label} className="dashboard-stat-card">
											<div className="dashboard-stat-card-header">
												<span className="dashboard-stat-label">{label}</span>
												<span className="dashboard-stat-icon-wrap">
													{icon && (
														<icon className="dashboard-stat-icon" aria-hidden />
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
												data={SCHOLARSHIP_DISTRIBUTION}
												options={doughnutOptions}
											/>
										</div>
										<div className="dashboard-pie-stats">
											<div className="pie-stat-item">
												<span
													className="stat-color"
													style={{ backgroundColor: "#3b82f6" }}
												></span>
												<span>Engineering</span>
											</div>
											<div className="pie-stat-item">
												<span
													className="stat-color"
													style={{ backgroundColor: "#f59e0b" }}
												></span>
												<span>Business Admin</span>
											</div>
											<div className="pie-stat-item">
												<span
													className="stat-color"
													style={{ backgroundColor: "#ef4444" }}
												></span>
												<span>Education</span>
											</div>
											<div className="pie-stat-item">
												<span
													className="stat-color"
													style={{ backgroundColor: "#8b5cf6" }}
												></span>
												<span>Nursing</span>
											</div>
											<div className="pie-stat-item">
												<span
													className="stat-color"
													style={{ backgroundColor: "#10b981" }}
												></span>
												<span>Computer Science</span>
											</div>
										</div>
									</div>
								</div>
							</section>

							{/* Recent Applications table */}
							<section className="dashboard-panel dashboard-panel--table">
								<h3 className="dashboard-panel-title">
									Recent College Applications
								</h3>
								<p className="dashboard-panel-sub">
									Latest scholarship applications from college students
								</p>
								<div className="dashboard-filters">
									<select
										className="dashboard-filter-select"
										value={overviewStatusFilter}
										onChange={(e) => setOverviewStatusFilter(e.target.value)}
									>
										<option>All</option>
										<option>Pending</option>
										<option>Approved</option>
										<option>Under Review</option>
										<option>Rejected</option>
									</select>
								</div>
								<div className="dashboard-table-wrap">
									<table className="dashboard-table">
										<thead>
											<tr>
												<th>Application ID</th>
												<th>Student Name</th>
												<th>Course</th>
												<th>Scholarship</th>
												<th>Amount</th>
												<th>GPA</th>
												<th>Date</th>
												<th>Status</th>
												<th>Actions</th>
											</tr>
										</thead>
										<tbody>
											{filteredOverviewApps.map((row) => (
												<tr key={row.id}>
													<td>
														<span className="dashboard-table-id">{row.id}</span>
													</td>
													<td>{row.name}</td>
													<td>{row.course}</td>
													<td>{row.scholarship}</td>
													<td>{row.amount}</td>
													<td>{row.gpa}</td>
													<td>{row.date}</td>
													<td>
														<span
															className={`dashboard-status-pill ${statusClass(row.status)}`}
														>
															{row.status}
														</span>
													</td>
													<td>
														<button
															type="button"
															className="dashboard-actions-btn"
															aria-label="Actions"
														>
															<HiOutlineDotsVertical aria-hidden />
														</button>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
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
							{/* Applications Status Cards */}
							<section className="dashboard-stats-grid">
								<div className="dashboard-stat-card dashboard-stat-card--red">
									<div className="dashboard-stat-card-header">
										<span className="dashboard-stat-label">Submitted</span>
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
									<div className="dashboard-stat-value">1,284</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--up">
										↑ 42 today
									</div>
								</div>
								<div className="dashboard-stat-card dashboard-stat-card--yellow">
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
									<div className="dashboard-stat-value">142</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--up">
										↑ 12 today
									</div>
								</div>
								<div className="dashboard-stat-card dashboard-stat-card--teal">
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
									<div className="dashboard-stat-value">856</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--up">
										↑ 28 today
									</div>
								</div>
								<div className="dashboard-stat-card dashboard-stat-card--darkred">
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
									<div className="dashboard-stat-value">286</div>
									<div className="dashboard-stat-trend dashboard-stat-trend--up">
										↑ 8 today
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
												<th>Amount</th>
												<th>GPA</th>
												<th>Date</th>
												<th>Status</th>
												<th>Actions</th>
											</tr>
										</thead>
										<tbody>
											{filteredApplications.map((row) => (
												<tr key={row.id}>
													<td>
														<span className="dashboard-table-id">{row.id}</span>
													</td>
													<td>{row.name}</td>
													<td>{row.course}</td>
													<td>{row.scholarship}</td>
													<td>{row.amount}</td>
													<td>{row.gpa}</td>
													<td>{row.date}</td>
													<td>
														<span
															className={`dashboard-status-pill ${statusClass(row.status)}`}
														>
															{row.status}
														</span>
													</td>
													<td>
														<button
															type="button"
															className="dashboard-actions-btn"
															aria-label="Actions"
														>
															<HiOutlineDotsVertical aria-hidden />
														</button>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</section>
						</>
					)}
				</div>
			</main>
		</div>
	)
}
