import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
	HiOutlineCheckCircle,
	HiOutlineEye,
	HiOutlineEyeOff,
	HiOutlineLockClosed,
	HiOutlineMail,
} from "react-icons/hi"
import { toast } from "react-toastify"
import {
	GRANTOR_DEFAULT_PASSWORD,
	GRANTOR_PASSWORD_CHANGE_ID_KEY,
} from "../constants/grantorAuth"
import { encryptPasswordAES256 } from "../services/authService"
import { getRecord, serverTimestamp, upsertProvider } from "../services/supabaseDataService"
import { isPasswordStrong } from "../utils/passwordValidation"
import "../css/LoginPage.css"
import loginBackground from "../assets/LoginBackground.jpg"
import logo from "../assets/logo.png"
import logo2 from "../assets/logo2.png"

export default function GrantorChangePasswordPage() {
	const navigate = useNavigate()
	const [grantorId, setGrantorId] = useState("")
	const [password, setPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [showPassword, setShowPassword] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [isReady, setIsReady] = useState(false)
	const [returnPath] = useState(() =>
		sessionStorage.getItem("bulsuscholar_userType") === "provider" ? "/provider-dashboard/profile" : "/",
	)

	useEffect(() => {
		const pendingGrantorId = sessionStorage.getItem(GRANTOR_PASSWORD_CHANGE_ID_KEY)
		if (!pendingGrantorId) {
			toast.error("Sign in with your default grantor password first.")
			navigate("/", { replace: true })
			return
		}

		let active = true
		const loadGrantor = async () => {
			const provider = await getRecord("providers", pendingGrantorId)
			if (!active) return
			if (!provider) {
				toast.error("Grantor account not found.")
				sessionStorage.removeItem(GRANTOR_PASSWORD_CHANGE_ID_KEY)
				navigate("/", { replace: true })
				return
			}
			const isExistingGrantorSession = sessionStorage.getItem("bulsuscholar_userType") === "provider"
			const requestApproved = provider.passwordChangeRequestStatus === "approved"
			if (isExistingGrantorSession && !requestApproved) {
				toast.error("Your password change request must be approved by an administrator first.")
				sessionStorage.removeItem(GRANTOR_PASSWORD_CHANGE_ID_KEY)
				navigate("/provider-dashboard/profile", { replace: true })
				return
			}
			setGrantorId(pendingGrantorId)
			setIsReady(true)
		}

		void loadGrantor()
		return () => {
			active = false
		}
	}, [navigate])

	const handleSubmit = async (event) => {
		event.preventDefault()

		if (!grantorId) return

		if (!isPasswordStrong(password)) {
			toast.error("Password must include a capital letter, number, special character, and at least 6 characters.")
			return
		}

		if (password === GRANTOR_DEFAULT_PASSWORD) {
			toast.error("Choose a new password different from the default grantor password.")
			return
		}

		if (password !== confirmPassword) {
			toast.error("Passwords do not match.")
			return
		}

		setIsSubmitting(true)
		try {
			const provider = await getRecord("providers", grantorId)
			if (!provider) {
				toast.error("Grantor account not found.")
				return
			}

			const encryptedPassword = await encryptPasswordAES256(password)
			await upsertProvider(
				grantorId,
				{
					password: encryptedPassword,
					mustChangePassword: false,
					passwordChangeRequested: false,
					passwordChangeRequestStatus: "completed",
					passwordChangeCompletedAt: serverTimestamp(),
					passwordUpdatedAt: serverTimestamp(),
				},
				{ merge: true },
			)

			sessionStorage.removeItem(GRANTOR_PASSWORD_CHANGE_ID_KEY)
			sessionStorage.removeItem("bulsuscholar_userId")
			sessionStorage.removeItem("bulsuscholar_userType")

			toast.success("Password updated. Please log in with your new password.")
			navigate("/", { replace: true })
		} catch (error) {
			console.error(error)
			toast.error(error.message || "Unable to update password.")
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<div className="login-page">
			<div className="login-panel login-panel-info" style={{ "--login-bg": `url(${loginBackground})` }}>
				<div className="login-info-inner">
					<div className="login-info-icon" aria-hidden>
						<img src={logo} alt="Institutional Student Programs and Services logo" className="login-logo-img" />
					</div>
					<h1 className="login-info-title">Grantor Account Security</h1>
					<p className="login-info-desc">
						Your password change request has been approved. Choose a secure new password for your grantor account.
					</p>
				</div>
			</div>

			<div className="login-panel login-panel-form">
				<div className="login-form-inner">
					<img src={logo2} alt="Bulacan State University Office of the Scholarships" className="login-form-logo" />
					<h2 className="login-form-title">Change Password</h2>
					<p className="login-form-subtitle">
						{grantorId ? `Changing the password for grantor ${grantorId}` : "Loading grantor account..."}
					</p>

					{!isReady ? (
						<p className="signup-pending-details">Preparing password setup...</p>
					) : (
						<form className="login-form" onSubmit={handleSubmit}>
							<label className="login-label" htmlFor="grantor-user-id">Grantor User ID</label>
							<div className="login-input-wrap">
								<HiOutlineMail className="login-input-icon" aria-hidden />
								<input id="grantor-user-id" type="text" className="login-input" value={grantorId} readOnly />
							</div>

							<label className="login-label" htmlFor="grantor-new-password">New Password</label>
							<div className="login-input-wrap">
								<HiOutlineLockClosed className="login-input-icon" aria-hidden />
								<input
									id="grantor-new-password"
									type={showPassword ? "text" : "password"}
									className="login-input"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									autoComplete="new-password"
								/>
								<button
									type="button"
									className="login-input-eye-btn"
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

							<label className="login-label" htmlFor="grantor-confirm-password">Confirm New Password</label>
							<div className="login-input-wrap">
								<HiOutlineCheckCircle className="login-input-icon" aria-hidden />
								<input
									id="grantor-confirm-password"
									type={showPassword ? "text" : "password"}
									className="login-input"
									value={confirmPassword}
									onChange={(event) => setConfirmPassword(event.target.value)}
									autoComplete="new-password"
								/>
							</div>

							<button type="submit" className="login-submit" disabled={isSubmitting}>
								{isSubmitting ? "Saving..." : "Save New Password"}
							</button>

							<button
								type="button"
								className="login-forgot-btn"
								onClick={() => {
									sessionStorage.removeItem(GRANTOR_PASSWORD_CHANGE_ID_KEY)
									navigate(returnPath)
								}}
							>
								{returnPath === "/" ? "Back to login" : "Back to profile"}
							</button>
						</form>
					)}
				</div>
			</div>
		</div>
	)
}
