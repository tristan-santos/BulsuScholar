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
import { findAccountById, getRecord, promotePendingStudentToActive, TABLES, upsertProvider } from "../services/supabaseDataService"
import { supabase } from "../services/supabaseClient"
import { verifyPassword } from "../services/authService"
import { grantorMustChangePassword, GRANTOR_PASSWORD_CHANGE_ID_KEY } from "../constants/grantorAuth"
import { getPortalAccessBlockMessage, getStudentAccessState } from "../services/studentAccessService"
import "../css/LoginPage.css"
import loginBackground from "../assets/LoginBackground.jpg"
import logo from "../assets/logo.png"
import logo2 from "../assets/logo.png"

const APP_URL = (
	import.meta.env.VITE_APP_URL ||
	import.meta.env.VITE_PUBLIC_SITE_URL ||
	"https://bulsu-scholar.vercel.app"
).replace(/\/$/, "")
const RESET_EMAIL_COOLDOWN_MS = 60 * 1000
const RESET_EMAIL_COOLDOWN_KEY = "bulsuscholar_reset_email_next_allowed_at"

export default function LoginPage() {
	const [userId, setUserId] = useState("")
	const [password, setPassword] = useState("")
	const [showPassword, setShowPassword] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [showForgotModal, setShowForgotModal] = useState(false)
	const [showGrantorPasswordModal, setShowGrantorPasswordModal] = useState(false)
	const [forgotUserId, setForgotUserId] = useState("")
	const [grantorPasswordAccount, setGrantorPasswordAccount] = useState(null)
	const [isCheckingForgotAccount, setIsCheckingForgotAccount] = useState(false)
	const [isSendingReset, setIsSendingReset] = useState(false)
	const [resetCooldownSeconds, setResetCooldownSeconds] = useState(0)
	const [isRequestingGrantorPassword, setIsRequestingGrantorPassword] = useState(false)
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

	const closeGrantorPasswordModal = () => {
		setShowGrantorPasswordModal(false)
		setGrantorPasswordAccount(null)
	}

	const handleForgotPasswordClick = async () => {
		const id = userId.trim()
		if (!id) {
			setForgotUserId("")
			setShowForgotModal(true)
			return
		}

		setIsCheckingForgotAccount(true)
		try {
			const found = await findAccountById(id)
			if (found?.type === "provider") {
				setGrantorPasswordAccount({
					id,
					name: found.data?.providerName || found.data?.name || found.data?.grantorName || "Grantor",
					email: found.data?.email || "",
				})
				setShowForgotModal(false)
				setShowGrantorPasswordModal(true)
				return
			}

			setForgotUserId(id)
			setShowGrantorPasswordModal(false)
			setShowForgotModal(true)
		} catch (error) {
			console.error(error)
			toast.error("Unable to check the User ID. Please try again.")
		} finally {
			setIsCheckingForgotAccount(false)
		}
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
			const student = await getRecord("students", id)
			if (!student) {
				toast.error("Student ID not found.")
				return
			}

			if (!student.email) {
				toast.error("No email is associated with this student account. Please contact support.")
				return
			}

			const { error } = await supabase.auth.resetPasswordForEmail(student.email, {
				redirectTo: `${APP_URL}/reset-password?userId=${encodeURIComponent(id)}`,
			})
			if (error) throw error

			const nextResetAllowedAt = Date.now() + RESET_EMAIL_COOLDOWN_MS
			localStorage.setItem(RESET_EMAIL_COOLDOWN_KEY, String(nextResetAllowedAt))
			setResetCooldownSeconds(Math.ceil(RESET_EMAIL_COOLDOWN_MS / 1000))
			toast.success("Password reset instructions sent to the registered student email.")
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

	const handleGrantorPasswordRequest = async (event) => {
		event.preventDefault()
		const id = grantorPasswordAccount?.id || userId.trim()
		if (!id) {
			toast.error("Grantor ID is required.")
			return
		}

		setIsRequestingGrantorPassword(true)
		try {
			await upsertProvider(
				id,
				{
					passwordChangeRequested: true,
					passwordChangeRequestStatus: "pending",
					passwordChangeRequestedAt: new Date().toISOString(),
				},
				{ merge: true },
			)
			toast.success("Password change request submitted. Please wait for admin assistance.")
			closeGrantorPasswordModal()
		} catch (error) {
			console.error(error)
			toast.error("Failed to submit password change request. Please try again later.")
		} finally {
			setIsRequestingGrantorPassword(false)
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

		setIsLoading(true)
		try {
			let found = await findAccountById(id)
			if (!found) {
				toast.error("User ID not found. Please check your credentials.")
				return
			}

			const isPendingStudent = found.type === "student" && found.table === TABLES.pendingStudent
			const hasEncryptedPassword = Boolean(found.data?.password)
			const shouldUseSupabaseAuth =
				found.type === "student" &&
				Boolean(found.data?.email) &&
				Boolean(found.data?.authUserId)

			let authUser = null
			if (shouldUseSupabaseAuth) {
				const { data, error } = await supabase.auth.signInWithPassword({
					email: found.data.email,
					password: pwd,
				})

				if (!error) {
					authUser = data?.user || null
					if (isPendingStudent) {
						const promoted = await promotePendingStudentToActive(id, {
							authUserId: authUser?.id || found.data.authUserId || "",
							email: found.data.email,
						})
						if (promoted?.record) {
							found = {
								...found,
								table: TABLES.students,
								isPending: false,
								data: promoted.record,
							}
						}
					}
				} else if (!hasEncryptedPassword) {
					if (isPendingStudent) {
						const message = String(error.message || "").toLowerCase().includes("email not confirmed")
							? "Please confirm your email before logging in."
							: "Your student account is still under review. Please check your email or wait for approval."
						toast.error(message)
					} else {
						toast.error(error.message || "Invalid password. Please try again.")
					}
					return
				}
			}

			if (!authUser) {
				if (isPendingStudent) {
					toast.error("Your student account is still under review. Please wait for approval before logging in.")
					return
				}
				if (!hasEncryptedPassword) {
					toast.error("Account is not linked to Supabase Auth yet. Please contact support.")
					return
				}

				const isPasswordCorrect = await verifyPassword(pwd, found.data.password)
				if (!isPasswordCorrect) {
					toast.error("Invalid password. Please try again.")
					return
				}

				if (found.type !== "student") {
					await supabase.auth.signOut()
				}
			}

			if (found.type === "student") {
				const accessState = getStudentAccessState(found.data)
				if (accessState.isPortalAccessBlocked) {
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
				sessionStorage.setItem(GRANTOR_PASSWORD_CHANGE_ID_KEY, id)
				sessionStorage.removeItem("bulsuscholar_userId")
				sessionStorage.removeItem("bulsuscholar_userType")
				toast.info("Set your own password before accessing the grantor portal.")
				navigate("/grantor/change-password", { replace: true })
				return
			}

			toast.info("Logging in...", { autoClose: 1500 })
			sessionStorage.setItem("bulsuscholar_userId", id)
			sessionStorage.setItem("bulsuscholar_userType", found.type)
			setTimeout(() => {
				navigate(getDashboardPath(found.type), {
					replace: true,
				})
			}, 500)
		} catch (error) {
			console.error(error)
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
						src={logo2}
						alt="Bulacan State University Office of the Scholarships"
						className="login-form-logo"
					/>
					<h2 className="login-form-title">BulsuScholar</h2>
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
						<button
							type="button"
							className="login-forgot-btn"
							onClick={handleForgotPasswordClick}
							disabled={isCheckingForgotAccount}
						>
							{isCheckingForgotAccount ? "Checking account..." : "Forgot password?"}
						</button>

						<button type="submit" className="login-submit" disabled={isLoading}>
							{isLoading ? "Logging in..." : "Enter"}
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
					onClick={closeForgotModal}
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
							Enter your Student ID and we'll send password reset instructions to your registered email.
						</p>
						<form onSubmit={handleForgotPassword} style={{ marginTop: "1rem" }}>
							<label className="login-label">Student ID</label>
							<div className="login-input-wrap" style={{ marginBottom: "1.5rem" }}>
								<HiOutlineMail className="login-input-icon" />
								<input
									type="text"
									className="login-input"
									placeholder="Enter Student ID"
									value={forgotUserId}
									onChange={(event) => setForgotUserId(event.target.value)}
									required
								/>
							</div>
							<button type="submit" className="login-submit" disabled={isSendingReset || resetCooldownSeconds > 0} style={{ width: "100%" }}>
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

			{showGrantorPasswordModal && (
				<div
					className="admin-modal-overlay"
					style={{ zIndex: 9999 }}
					onClick={closeGrantorPasswordModal}
				>
					<div
						className="admin-modal-card"
						style={{ maxWidth: "400px", padding: "2rem" }}
						onClick={(event) => event.stopPropagation()}
					>
						<button className="admin-modal-close" onClick={closeGrantorPasswordModal}>
							<HiX />
						</button>
						<h3 className="admin-modal-title">Request Change Password</h3>
						<p className="admin-modal-copy">
							Submit a password change request for {grantorPasswordAccount?.name || "this grantor account"}.
							The scholarship office will review the request.
						</p>
						<form onSubmit={handleGrantorPasswordRequest} style={{ marginTop: "1rem" }}>
							<label className="login-label">Grantor ID</label>
							<div className="login-input-wrap" style={{ marginBottom: "1.5rem" }}>
								<HiOutlineMail className="login-input-icon" />
								<input
									type="text"
									className="login-input"
									value={grantorPasswordAccount?.id || ""}
									readOnly
								/>
							</div>
							<button
								type="submit"
								className="login-submit"
								disabled={isRequestingGrantorPassword}
								style={{ width: "100%" }}
							>
								{isRequestingGrantorPassword ? "Submitting..." : "Request Change Password"}
							</button>
						</form>
					</div>
				</div>
			)}
		</div>
	)
}
