import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
	HiOutlineCheckCircle,
	HiOutlineEye,
	HiOutlineEyeOff,
	HiOutlineLockClosed,
} from "react-icons/hi"
import { toast } from "react-toastify"
import { isPasswordStrong } from "../utils/passwordValidation"
import { supabase } from "../services/supabaseClient"
import { completePasswordRecovery } from "../services/portalAuthService"
import "../css/LoginPage.css"
import loginBackground from "../assets/LoginBackground.jpg"
import logo from "../assets/logo.png"
import { usePublicConfiguration } from "../contexts/PublicConfigurationContext"
import { beginOperation } from "../services/operationTracker"

export default function ResetPasswordPage() {
	const brandLogo = usePublicConfiguration().branding?.logoUrl || logo
	const navigate = useNavigate()
	const [password, setPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [showPassword, setShowPassword] = useState(false)
	const [hasRecoverySession, setHasRecoverySession] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const challenge = new URLSearchParams(window.location.search).get("challenge") || ""

	useEffect(() => {
		let mounted = true

		const checkSession = async () => {
			const code = new URLSearchParams(window.location.search).get("code")
			if (code) {
				const { error } = await supabase.auth.exchangeCodeForSession(code)
				if (!mounted) return
				if (error) {
					setHasRecoverySession(false)
					return
				}
			}

			const { data } = await supabase.auth.getSession()
			if (mounted) setHasRecoverySession(Boolean(data?.session && challenge))
		}

		void checkSession()
		const { data } = supabase.auth.onAuthStateChange((event, session) => {
			if (event === "PASSWORD_RECOVERY" || session) {
				setHasRecoverySession(Boolean(session && challenge))
			}
		})

		return () => {
			mounted = false
			data?.subscription?.unsubscribe?.()
		}
	}, [challenge])

	const handleSubmit = async (event) => {
		event.preventDefault()

		if (!isPasswordStrong(password)) {
			toast.error("Password must include a capital letter, number, special character, and at least 6 characters.")
			return
		}

		if (password !== confirmPassword) {
			toast.error("Passwords do not match.")
			return
		}

		const finishPasswordOperation = beginOperation("auth.password-update")
		let passwordUpdated = false
		let passwordError = null
		setIsSubmitting(true)
		try {
			const { error } = await supabase.auth.updateUser({ password })
			if (error) throw error
			await completePasswordRecovery(challenge)

			passwordUpdated = true
			await supabase.auth.signOut()
			toast.success("Password updated. Please log in with your new password.")
			navigate("/", { replace: true })
		} catch (error) {
			passwordError = error
			console.error(error)
			toast.error(error.message || "Unable to update password.")
		} finally {
			finishPasswordOperation(passwordUpdated ? null : passwordError || new Error("password_update_not_completed"))
			setIsSubmitting(false)
		}
	}

	return (
		<div className="login-page">
			<div className="login-panel login-panel-info" style={{ "--login-bg": `url(${loginBackground})` }}>
				<div className="login-info-inner">
					<div className="login-info-icon" aria-hidden>
						<img src={brandLogo} alt="Institutional Student Programs and Services logo" className="login-logo-img" />
					</div>
					<h1 className="login-info-title">Password Recovery</h1>
					<p className="login-info-desc">
						Set a new password for your BulsuScholar account using the secure Supabase recovery link.
					</p>
				</div>
			</div>

			<div className="login-panel login-panel-form">
				<div className="login-form-inner">
					<img src={brandLogo} alt="Bulacan State University Office of the Scholarships" className="login-form-logo" />
					<h2 className="login-form-title">Reset Password</h2>
					<p className="login-form-subtitle">
						Set a new password for your verified Student or Grantor account.
					</p>

					{!hasRecoverySession ? (
						<div className="signup-pending-details">
							<strong>Recovery session not detected.</strong>
							<p>Open this page from the latest password reset email. Expired links must be requested again.</p>
							<button type="button" className="login-submit login-submit--full" onClick={() => navigate("/")}>
								Back to login
							</button>
						</div>
					) : (
						<form className="login-form" onSubmit={handleSubmit}>
							<label className="login-label" htmlFor="new-password">New Password</label>
							<div className="login-input-wrap">
								<HiOutlineLockClosed className="login-input-icon" aria-hidden />
								<input
									id="new-password"
									type={showPassword ? "text" : "password"}
									className="login-input"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									autoComplete="new-password"
								/>
								<button type="button" className="password-visibility-toggle" onClick={() => setShowPassword((value) => !value)}>
									{showPassword ? <HiOutlineEyeOff className="login-input-eye-icon" /> : <HiOutlineEye className="login-input-eye-icon" />}
								</button>
							</div>

							<label className="login-label" htmlFor="confirm-new-password">Confirm New Password</label>
							<div className="login-input-wrap">
								<HiOutlineCheckCircle className="login-input-icon" aria-hidden />
								<input
									id="confirm-new-password"
									type={showPassword ? "text" : "password"}
									className="login-input"
									value={confirmPassword}
									onChange={(event) => setConfirmPassword(event.target.value)}
									autoComplete="new-password"
								/>
							</div>

							<button type="submit" className="login-submit" data-button-variant="positive" disabled={isSubmitting}>
								<HiOutlineCheckCircle aria-hidden /> {isSubmitting ? "Updating..." : "Update Password"}
							</button>
						</form>
					)}
				</div>
			</div>
		</div>
	)
}
