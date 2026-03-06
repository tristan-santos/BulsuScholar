import { useNavigate } from "react-router-dom"
import { HiOutlineUserCircle } from "react-icons/hi"
import "../css/AdminDashboard.css"
import useThemeMode from "../hooks/useThemeMode"

export default function ProviderDashboard() {
	const navigate = useNavigate()
	const { theme } = useThemeMode()
	return (
		<div
			className={`admin-dashboard ${theme === "dark" ? "admin-dashboard--dark" : ""}`}
		>
			<header className="dashboard-header">
				<div className="dashboard-header-left">
					<h1 className="dashboard-header-title">BulsuScholar</h1>
					<p className="dashboard-header-sub">Provider Dashboard</p>
				</div>
				<div className="dashboard-header-right">
					<button
						type="button"
						className="dashboard-user-btn"
						onClick={() => navigate("/")}
						aria-label="Logout"
					>
						<HiOutlineUserCircle className="dashboard-user-icon" aria-hidden />
					</button>
				</div>
			</header>
			<main className="dashboard-main">
				<div className="dashboard-content">
					<p>Welcome to your provider dashboard.</p>
				</div>
			</main>
		</div>
	)
}
