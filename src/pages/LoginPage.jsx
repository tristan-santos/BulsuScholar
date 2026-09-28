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
import { supabase } from "../services/supabaseClient"
import { GRANTOR_PASSWORD_CHANGE_ID_KEY } from "../constants/grantorAuth"
import { closeFromModalBackdrop } from "../services/modalLayerService"
import "../css/LoginPage.css"
import loginBackground from "../assets/LoginBackground.jpg"
import logo from "../assets/logo.png"
import { usePublicConfiguration } from "../contexts/PublicConfigurationContext"
import { beginOperation } from "../services/operationTracker"
import { completeEmailVerification, loginWithUserId, requestPasswordRecovery, resendEmailVerification } from "../services/portalAuthService"
import { setPortalIdentity } from "../services/portalSessionStorage"

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
	const [emailChallenge, setEmailChallenge] = useState(null)
	const [emailCode, setEmailCode] = useState("")
	const [emailCodeBusy, setEmailCodeBusy] = useState(false)
	const [emailResendSeconds, setEmailResendSeconds] = useState(0)
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

	useEffect(() => {
		if (emailResendSeconds <= 0) return undefined
		const timer = window.setInterval(() => setEmailResendSeconds((value) => Math.max(0, value - 1)), 1000)
		return () => window.clearInterval(timer)
	}, [emailResendSeconds])

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

	const completePortalLogin = (account, id) => {
	if (account.type === "provider" && account.mustChangePassword) {
		sessionStorage.setItem(GRANTOR_PASSWORD_CHANGE_ID_KEY, id)
		setPortalIdentity(id, account.type)
			toast.info("Set your own password before accessing the grantor portal.")
			navigate("/grantor/change-password", { replace: true })
			return
		}
		setPortalIdentity(id, account.type)
		if (account.type === "admin" && account.mustChangePassword) {
			toast.info("Replace the temporary password before accessing the admin portal.")
			navigate("/admin/change-password", { replace: true })
			return
		}
		navigate(getDashboardPath(account.type), { replace: true })
	}

	const handleSubmit = async (event) => {
		event.preventDefault()
		const id = userId.trim()
		const pwd = password

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
			const result = await loginWithUserId(id, pwd)
			if (result.emailVerification?.required) {
				loginSucceeded = true
				setEmailChallenge({ ...result.emailVerification, account: result.account, userId: id })
				setEmailCode("")
				setEmailResendSeconds(result.emailVerification.resendAfter || 60)
				return
			}
			loginSucceeded = true
			completePortalLogin(result.account, id)
		} catch (error) {
			loginError = error
			await supabase.auth.signOut().catch(() => {})
			const expectedLoginReasons = new Set([
				"account_locked_reset_required",
				"admin_account_locked",
				"invalid_credentials",
				"account_unavailable",
			])
			if (!expectedLoginReasons.has(error?.reason)) console.error(error)
			if (error?.reason === "account_locked_reset_required") {
				toast.error("This account is locked. Use Forgot password to reset it and restore access.")
			} else if (error?.reason === "admin_account_locked") {
				toast.error("This administrator account is locked. Ask the Root Administrator to unblock it.")
			} else if (error?.reason === "invalid_credentials") {
				const remaining = error?.data?.remainingAttempts
				toast.error(Number.isFinite(remaining) ? `Invalid credentials. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Invalid credentials. Please try again.")
			} else if (error?.reason === "authentication_backend_update_required") {
				toast.error("Login is temporarily unavailable. Please contact the scholarship office.")
			} else if (error?.reason === "account_unavailable") {
				toast.error("This account is unavailable. Please contact the scholarship office.")
			} else {
				toast.error(error?.message || "Login failed. Please try again.")
			}
		} finally {
			finishLoginOperation(loginSucceeded ? null : loginError || new Error("login_not_completed"))
			setIsLoading(false)
		}
	}

	const handleEmailVerification = async (event) => {
		event.preventDefault()
		if (!/^\d{6}$/.test(emailCode)) {
			toast.error("Enter the six-digit code from your email.")
			return
		}
		setEmailCodeBusy(true)
		try {
			const result = await completeEmailVerification(emailChallenge.challengeId, emailCode, password)
			setEmailChallenge(null)
			completePortalLogin(result.account, emailChallenge.userId)
		} catch (error) {
			const remaining = error?.data?.remainingAttempts
			toast.error(Number.isFinite(remaining) ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : error?.message || "Email verification failed.")
		} finally {
			setEmailCodeBusy(false)
		}
	}

	const handleEmailResend = async () => {
		if (!emailChallenge || emailResendSeconds > 0) return
		setEmailCodeBusy(true)
		try {
			const result = await resendEmailVerification(emailChallenge.challengeId)
			setEmailChallenge((current) => ({ ...current, ...result.emailVerification }))
			setEmailCode("")
			setEmailResendSeconds(result.emailVerification?.resendAfter || 60)
			toast.success("A new verification code was sent.")
		} catch (error) {
			toast.error(error?.message || "The code could not be resent.")
		} finally {
			setEmailCodeBusy(false)
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
					role="presentation"
					style={{ zIndex: 9999 }}
					onClick={(event) => closeFromModalBackdrop(event, closeForgotModal, {
						hasUnsavedChanges: Boolean(forgotUserId.trim()),
					})}
				>
					<div
						className="admin-modal-card"
						role="dialog"
						aria-modal="true"
						aria-labelledby="password-reset-title"
						style={{ maxWidth: "400px", padding: "2rem" }}
						onClick={(event) => event.stopPropagation()}
					>
						<button className="admin-modal-close" onClick={closeForgotModal} aria-label="Close password reset" title="Close">
							<HiX />
						</button>
						<h3 id="password-reset-title" className="admin-modal-title">Reset Password</h3>
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
									autoFocus
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

			{emailChallenge && (
				<div className="admin-modal-overlay" role="presentation" style={{ zIndex: 10000 }}>
					<div className="admin-modal-card login-verification-card" role="dialog" aria-modal="true" aria-labelledby="email-verification-title" onClick={(event) => event.stopPropagation()}>
						<h3 id="email-verification-title" className="admin-modal-title">Email verification</h3>
						<p className="admin-modal-copy">Enter the six-digit code sent to <strong>{emailChallenge.maskedEmail}</strong>. The code expires in 10 minutes.</p>
						<form onSubmit={handleEmailVerification}>
							<label className="login-label" htmlFor="email-verification-code">Verification code</label>
							<input id="email-verification-code" className="login-input login-code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus />
							<button type="submit" className="login-submit" data-button-variant="positive" disabled={emailCodeBusy || emailCode.length !== 6}>Verify and Sign In</button>
							<button type="button" className="login-forgot-btn" data-button-variant="none" onClick={handleEmailResend} disabled={emailCodeBusy || emailResendSeconds > 0}>{emailResendSeconds > 0 ? `Resend in ${emailResendSeconds}s` : "Resend code"}</button>
							<button type="button" className="login-forgot-btn" data-button-variant="none" onClick={() => { setEmailChallenge(null); setEmailCode(""); setPassword("") }}>Cancel sign in</button>
						</form>
					</div>
				</div>
			)}

		</div>
	)
}
