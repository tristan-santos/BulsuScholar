import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
	HiOutlineMail,
	HiOutlineLockClosed,
	HiOutlineEye,
	HiOutlineEyeOff,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { doc, getDoc } from "firebase/firestore"
import { db } from "../../firebase"
import { verifyPassword } from "../services/authService"
import "../css/LoginPage.css"
import loginBackground from "../assets/LoginBackground.jpg"
import logo from "../assets/logo.png"
import logo2 from "../assets/logo2.png"

const COLLECTIONS = [
	{ type: "student", collection: "students" },
	{ type: "admin", collection: "admins" },
	{ type: "provider", collection: "providers" },
]

export default function LoginPage() {
	const [userId, setUserId] = useState("")
	const [password, setPassword] = useState("")
	const [showPassword, setShowPassword] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const navigate = useNavigate()

	const getDashboardPath = (type) => {
		switch (type) {
			case "student":
				return "/student-dashboard"
			case "admin":
				return "/admin-dashboard"
			case "provider":
				return "/provider-dashboard"
			default:
				return "/"
		}
	}

	const handleSubmit = async (e) => {
		e.preventDefault()
		const id = userId.trim()
		const pwd = password.trim()

		// Validate inputs
		if (!id) {
			toast.error("Please enter your User ID")
			return
		}

		if (!pwd) {
			toast.error("Please enter your password")
			return
		}

		setIsLoading(true)
		try {
			// Check all collections in parallel to detect user type by document ID
			const results = await Promise.all(
				COLLECTIONS.map(({ type, collection }) =>
					getDoc(doc(db, collection, id)).then((snap) => ({
						exists: snap.exists(),
						type,
						data: snap.exists() ? snap.data() : null,
					})),
				),
			)
			const found = results.find((r) => r.exists)

			if (!found) {
				toast.error("User ID not found. Please check your credentials.")
				return
			}

			// Verify password
			if (!found.data.password) {
				toast.error("Account configuration error. Please contact support.")
				return
			}

			const isPasswordCorrect = await verifyPassword(pwd, found.data.password)
			if (!isPasswordCorrect) {
				toast.error("Invalid password. Please try again.")
				return
			}

			// Password is correct, proceed with login
			toast.info("Logging in…", { autoClose: 1500 })
			if (found.type === "student") {
				sessionStorage.setItem("bulsuscholar_userId", id)
				sessionStorage.setItem("bulsuscholar_userType", "student")
			}
			setTimeout(() => {
				navigate(getDashboardPath(found.type), {
					replace: true,
					state: { user: found.data, userId: id },
				})
			}, 500)
		} catch (err) {
			console.error(err)
			toast.error("Login failed. Please try again.")
		} finally {
			setIsLoading(false)
		}
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
					<img
						src={logo2}
						alt="Bulacan State University Office of the Scholarships"
						className="login-form-logo"
					/>
					<h2 className="login-form-title">BulsuScholar</h2>
					<p className="login-form-subtitle">Login to access your dashboard</p>

					<form className="login-form" onSubmit={handleSubmit} noValidate>
						<label className="login-label" htmlFor="login-user-id">
							User Id
						</label>
						<div className="login-input-wrap">
							<HiOutlineMail className="login-input-icon" aria-hidden />
							<input
								id="login-user-id"
								type="text"
								className="login-input"
								placeholder="Enter your User Id"
								value={userId}
								onChange={(e) => setUserId(e.target.value)}
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
								type={showPassword ? "text" : "password"}
								className="login-input"
								placeholder="Enter your password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								autoComplete="current-password"
							/>
							<button
								type="button"
								className="login-input-eye-btn"
								onClick={() => setShowPassword((v) => !v)}
								aria-label={showPassword ? "Hide password" : "Show password"}
							>
								{showPassword ? (
									<HiOutlineEyeOff
										className="login-input-eye-icon"
										aria-hidden
									/>
								) : (
									<HiOutlineEye className="login-input-eye-icon" aria-hidden />
								)}
							</button>
						</div>
						<a href="#forgot" className="login-forgot">
							Forgot password?
						</a>

						<button type="submit" className="login-submit" disabled={isLoading}>
							{isLoading ? "Logging in…" : "Enter"}
						</button>

						<div className="login-create-account">
							<span className="login-create-text">
								Don't have an account yet?
							</span>
							<button
								type="button"
								className="create-account-btn"
								onClick={() => navigate("/signup")}
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
