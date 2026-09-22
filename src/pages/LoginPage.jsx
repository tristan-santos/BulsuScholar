import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
	HiOutlineMail,
	HiOutlineLockClosed,
	HiOutlineEye,
	HiOutlineEyeOff,
	HiX,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { getRecord, TABLES } from "../services/supabaseDataService"
import { promoteEmailConfirmedStudentWorkflow } from "../services/workflowService"
import { supabase } from "../services/supabaseClient"
import { grantorMustChangePassword, GRANTOR_PASSWORD_CHANGE_ID_KEY } from "../constants/grantorAuth"
import { getPortalAccessBlockMessage, getStudentAccessState } from "../services/studentAccessService"
import { closeFromModalBackdrop } from "../services/modalLayerService"
import "../css/LoginPage.css"
import loginBackground from "../assets/LoginBackground.jpg"
import logo from "../assets/logo.png"
import { usePublicConfiguration } from "../contexts/PublicConfigurationContext"
import { beginOperation } from "../services/operationTracker"
import { loginWithUserId, requestPasswordRecovery } from "../services/portalAuthService"

const RESET_EMAIL_COOLDOWN_MS = 60 * 1000
const RESET_EMAIL_COOLDOWN_KEY = "bulsuscholar_reset_email_next_allowed_at"

export default function LoginPage() {
	const branding = usePublicConfiguration().branding || {}
	const brandLogo = branding.logoUrl || logo
	const productName = branding.productName || "BulsuScholar"
	const [userId, setUserId] = useState("")
	const [password, setPassword] = useState("")
	const [showPassword, setShowPassword] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [showForgotModal, setShowForgotModal] = useState(false)
	const [forgotUserId, setForgotUserId] = useState("")
	const [isSendingReset, setIsSendingReset] = useState(false)
	const [resetCooldownSeconds, setResetCooldownSeconds] = useState(0)
	const navigate = useNavigate()

	useEffect(() => {
		const updateCooldown = () => {
			const nextAllowedAt = Number(localStorage.getItem(RESET_EMAIL_COOLDOWN_KEY) || 0)
			const remainingMs = Math.max(0, nextAllowedAt - Date.now())
			setResetCooldownSeconds(Math.ceil(remainingMs / 1000))
		}
		updateCooldown()
		const interval = window.setInterval(updateCooldown, 1000)
		return () => window.clearInterval(interval)
	}, [])

	const closeForgotModal = () => {
		setShowForgotModal(false)
	}

	const handleForgotPasswordClick = () => {
		setForgotUserId(userId.trim())
		setShowForgotModal(true)
	}

	const handleForgotPassword = async (event) => {
		event.preventDefault()
		const id = forgotUserId.trim()
		if (!id) {
			toast.error("Please enter your Student ID")
			return
		}

		const nextAllowedAt = Number(localStorage.getItem(RESET_EMAIL_COOLDOWN_KEY) || 0)
		const remainingSeconds = Math.ceil(Math.max(0, nextAllowedAt - Date.now()) / 1000)
		if (remainingSeconds > 0) {
			setResetCooldownSeconds(remainingSeconds)
			toast.info(`Please wait ${remainingSeconds} second${remainingSeconds === 1 ? "" : "s"} before requesting another reset email.`)
			return
		}

		setIsSendingReset(true)
		try {
			await requestPasswordRecovery(id)

			const nextResetAllowedAt = Date.now() + RESET_EMAIL_COOLDOWN_MS
			localStorage.setItem(RESET_EMAIL_COOLDOWN_KEY, String(nextResetAllowedAt))
			setResetCooldownSeconds(Math.ceil(RESET_EMAIL_COOLDOWN_MS / 1000))
			toast.success("If this Student or Grantor ID is eligible, reset instructions were sent to its registered email.")
			setShowForgotModal(false)
			setForgotUserId("")
		} catch (error) {
			if (error?.message?.includes("rate") || error?.status === 429) {
				const nextResetAllowedAt = Date.now() + RESET_EMAIL_COOLDOWN_MS
				localStorage.setItem(RESET_EMAIL_COOLDOWN_KEY, String(nextResetAllowedAt))
				setResetCooldownSeconds(Math.ceil(RESET_EMAIL_COOLDOWN_MS / 1000))
				console.warn("Password reset rate limited by Supabase Auth.", error)
				toast.error("Too many reset requests. Please wait at least 1 minute before trying again.")
			} else {
				console.error(error)
				toast.error("Failed to send reset email. Please try again later.")
			}
		} finally {
			setIsSendingReset(false)
		}
	}

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

	const handleSubmit = async (event) => {
		event.preventDefault()
		const id = userId.trim()
		const pwd = password.trim()

		if (!id) {
			toast.error("Please enter your User ID")
			return
		}

		if (!pwd) {
			toast.error("Please enter your password")
			return
		}

		const finishLoginOperation = beginOperation("auth.login")
		let loginSucceeded = false
		let loginError = null
		setIsLoading(true)
		try {
			const account = await loginWithUserId(id, pwd)
			let found = {
				type: account.type,
				table: account.table,
				isPending: account.isPending,
				data: await getRecord(account.table, id),
			}
			const isPendingStudent = found.type === "student" && found.table === TABLES.pendingStudent
			if (isPendingStudent) {
				const promoted = await promoteEmailConfirmedStudentWorkflow({ studentId: id })
				if (promoted?.student) {
					found = { ...found, table: TABLES.students, isPending: false, data: { id, ...promoted.student } }
				}
			}

			if (found.type === "student") {
				const accessState = getStudentAccessState(found.data)
				if (accessState.isPortalAccessBlocked) {
					await supabase.auth.signOut().catch(() => {})
					toast.error(getPortalAccessBlockMessage(found.data))
					return
				}
			}

			if (found.type === "provider") {
				const isArchivedGrantor =
					found.data?.archived === true ||
					String(found.data?.status || found.data?.accountStatus || "").toLowerCase() === "archived"
				if (isArchivedGrantor) {
					await supabase.auth.signOut()
					toast.error("This grantor account is archived. Please contact the admin.")
					return
				}
			}

			if (found.type === "provider" && grantorMustChangePassword(found.data)) {
				loginSucceeded = true
				sessionStorage.setItem(GRANTOR_PASSWORD_CHANGE_ID_KEY, id)
				sessionStorage.removeItem("bulsuscholar_userId")
				sessionStorage.removeItem("bulsuscholar_userType")
				toast.info("Set your own password before accessing the grantor portal.")
				navigate("/grantor/change-password", { replace: true })
				return
			}

			if (found.type === "admin" && found.data?.mustChangePassword === true) {
				loginSucceeded = true
				sessionStorage.setItem("bulsuscholar_userId", id)
				sessionStorage.setItem("bulsuscholar_userType", "admin")
				toast.info("Replace the temporary password before accessing the admin portal.")
				navigate("/admin/change-password", { replace: true })
				return
			}

			loginSucceeded = true
			sessionStorage.setItem("bulsuscholar_userId", id)
			sessionStorage.setItem("bulsuscholar_userType", found.type)
			setTimeout(() => {
				navigate(getDashboardPath(found.type), {
					replace: true,
				})
			}, 500)
		} catch (error) {
			loginError = error
			await supabase.auth.signOut().catch(() => {})
			console.error(error)
			if (error?.reason === "account_locked_reset_required") {
				toast.error("This account is locked. Use Forgot password to reset it and restore access.")
			} else if (error?.reason === "admin_account_locked") {
				toast.error("This administrator account is locked. Ask the Root Administrator to unblock it.")
			} else if (error?.reason === "invalid_credentials") {
				const remaining = error?.data?.remainingAttempts
				toast.error(Number.isFinite(remaining) ? `Invalid credentials. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Invalid credentials. Please try again.")
			} else if (error?.reason === "authentication_backend_update_required") {
				toast.error("Login is temporarily unavailable. Please contact the scholarship office.")
			} else {
				toast.error(error?.message || "Login failed. Please try again.")
			}
		} finally {
			finishLoginOperation(loginSucceeded ? null : loginError || new Error("login_not_completed"))
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
							src={brandLogo}
							alt="Institutional Student Programs and Services logo"
							className="login-logo-img"
						/>
					</div>
					<h1 className="login-info-title">Institutional Student Programs and Services</h1>
					<p className="login-info-desc">
						Empowering college students to achieve their educational dreams through streamlined scholarship management.
					</p>
					<ul className="login-info-features" role="list">
						<li>
							<span className="login-feature-title">Comprehensive Tracking</span>
							<span className="login-feature-desc">Monitor all college scholarship applications in one place</span>
						</li>
						<li>
							<span className="login-feature-title">Real-time Analytics</span>
							<span className="login-feature-desc">Get insights with powerful dashboards and reports</span>
						</li>
						<li>
							<span className="login-feature-title">Efficient Management</span>
							<span className="login-feature-desc">Streamline the review and approval process</span>
						</li>
					</ul>
				</div>
			</div>

			<div className="login-panel login-panel-form">
				<div className="login-form-inner">
					<img
						src={brandLogo}
						alt="Bulacan State University Office of the Scholarships"
						className="login-form-logo"
					/>
					<h2 className="login-form-title">{productName}</h2>
					<p className="login-form-subtitle">Login to access your dashboard</p>

					<form className="login-form" onSubmit={handleSubmit} noValidate>
						<label className="login-label" htmlFor="login-user-id">User Id</label>
						<div className="login-input-wrap">
							<HiOutlineMail className="login-input-icon" aria-hidden />
							<input
								id="login-user-id"
								type="text"
								className="login-input"
								placeholder="Enter your User Id"
								value={userId}
								onChange={(event) => setUserId(event.target.value)}
								autoComplete="username"
								autoCapitalize="off"
							/>
						</div>

						<label className="login-label" htmlFor="login-password">Password</label>
						<div className="login-input-wrap">
							<HiOutlineLockClosed className="login-input-icon" aria-hidden />
							<input
								id="login-password"
								type={showPassword ? "text" : "password"}
								className="login-input"
								placeholder="Enter your password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								autoComplete="current-password"
							/>
							<button
								type="button"
								className="password-visibility-toggle"
								onClick={() => setShowPassword((value) => !value)}
								aria-label={showPassword ? "Hide password" : "Show password"}
							>
								{showPassword ? (
									<HiOutlineEyeOff className="login-input-eye-icon" aria-hidden />
								) : (
									<HiOutlineEye className="login-input-eye-icon" aria-hidden />
								)}
							</button>
						</div>
						<button
							type="button"
							className="login-forgot-btn"
							onClick={handleForgotPasswordClick}
						>
							Forgot password?
						</button>

						<button type="submit" className="login-submit" data-button-variant="positive" disabled={isLoading}>
							<HiOutlineLockClosed aria-hidden /> {isLoading ? "Logging in..." : "Enter"}
						</button>

						<div className="login-create-account">
						        <span className="login-create-text">Don't have an account yet?</span>
						        <button type="button" className="create-account-btn" onClick={() => navigate("/signup")}>
						                Create one!
						        </button>
						</div>
						</form>				</div>
			</div>

			{showForgotModal && (
				<div
					className="admin-modal-overlay"
					style={{ zIndex: 9999 }}
					onClick={(event) => closeFromModalBackdrop(event, closeForgotModal, {
						hasUnsavedChanges: Boolean(forgotUserId.trim()),
					})}
				>
					<div
						className="admin-modal-card"
						style={{ maxWidth: "400px", padding: "2rem" }}
						onClick={(event) => event.stopPropagation()}
					>
						<button className="admin-modal-close" onClick={closeForgotModal}>
							<HiX />
						</button>
						<h3 className="admin-modal-title">Reset Password</h3>
						<p className="admin-modal-copy">
							Enter your Student or Grantor ID. If the account is eligible, reset instructions will be sent to its registered email.
						</p>
						<form onSubmit={handleForgotPassword} style={{ marginTop: "1rem" }}>
							<label className="login-label">Student or Grantor ID</label>
							<div className="login-input-wrap" style={{ marginBottom: "1.5rem" }}>
								<HiOutlineMail className="login-input-icon" />
								<input
									type="text"
									className="login-input"
									placeholder="Enter User ID"
									value={forgotUserId}
									onChange={(event) => setForgotUserId(event.target.value)}
									required
								/>
							</div>
							<button type="submit" className="login-submit" data-button-variant="positive" disabled={isSendingReset || resetCooldownSeconds > 0} style={{ width: "100%" }}>
								<HiOutlineMail aria-hidden />
								{isSendingReset
									? "Sending..."
									: resetCooldownSeconds > 0
										? `Try again in ${resetCooldownSeconds}s`
										: "Send Reset Email"}
							</button>
						</form>
					</div>
				</div>
			)}

		</div>
	)
}
