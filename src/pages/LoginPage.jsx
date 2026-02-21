import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { HiOutlineMail, HiOutlineLockClosed } from "react-icons/hi"
import "../css/LoginPage.css"
import loginBackground from "../assets/LoginBackground.jpg"
import logo from "../assets/logo.png"

export default function LoginPage() {
	const [studentNumber, setStudentNumber] = useState("")
	const [password, setPassword] = useState("")
	const navigate = useNavigate()

	const handleSubmit = (e) => {
		e.preventDefault()
		// Prototype: no database — accept any credentials and redirect
		navigate("/admin-dashboard", { replace: true })
	}

	return (
		<div className="login-page">
			<div
				className="login-panel login-panel-info"
				style={{ "--login-bg": `url(${loginBackground})` }}
			>
				<div className="login-info-inner">
					<div className="login-info-icon" aria-hidden>
						<img
							src={logo}
							alt="Institutional Student Programs and Services logo"
							className="login-logo-img"
						/>
					</div>
					<h1 className="login-info-title">
						Institutional Student Programs and Services
					</h1>
					<p className="login-info-desc">
						Empowering college students to achieve their educational dreams
						through streamlined scholarship management.
					</p>
					<ul className="login-info-features" role="list">
						<li>
							<span className="login-feature-title">
								Comprehensive Tracking
							</span>
							<span className="login-feature-desc">
								Monitor all college scholarship applications in one place
							</span>
						</li>
						<li>
							<span className="login-feature-title">Real-time Analytics</span>
							<span className="login-feature-desc">
								Get insights with powerful dashboards and reports
							</span>
						</li>
						<li>
							<span className="login-feature-title">Efficient Management</span>
							<span className="login-feature-desc">
								Streamline the review and approval process
							</span>
						</li>
					</ul>
				</div>
			</div>

			<div className="login-panel login-panel-form">
				<div className="login-form-inner">
					<h2 className="login-form-title">BulsuScholar</h2>
					<p className="login-form-subtitle">Login to access your dashboard</p>

					<form className="login-form" onSubmit={handleSubmit} noValidate>
						<label className="login-label" htmlFor="login-student-number">
							Student Number
						</label>
						<div className="login-input-wrap">
							<HiOutlineMail className="login-input-icon" aria-hidden />
							<input
								id="login-student-number"
								type="text"
								className="login-input"
								placeholder="e.g., 202012345"
								value={studentNumber}
								onChange={(e) => setStudentNumber(e.target.value)}
								autoComplete="username"
								autoCapitalize="off"
							/>
						</div>

						<label className="login-label" htmlFor="login-password">
							Password
						</label>
						<div className="login-input-wrap">
							<HiOutlineLockClosed className="login-input-icon" aria-hidden />
							<input
								id="login-password"
								type="password"
								className="login-input"
								placeholder="Enter your password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								autoComplete="current-password"
							/>
						</div>
						<a href="#forgot" className="login-forgot">
							Forgot password?
						</a>

						<button type="submit" className="login-submit">
							Enter
						</button>

						<div className="login-create-account">
							<span className="login-create-text">
								Don't have an account yet?
							</span>
							<button
								type="button"
								className="create-account-btn"
								onClick={() => navigate("/register")}
							>
								Create one!
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	)
}
