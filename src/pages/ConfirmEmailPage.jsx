import { useEffect, useState } from "react"
import { HiOutlineCheckCircle, HiOutlineMail, HiOutlineXCircle } from "react-icons/hi"
import { supabase } from "../services/supabaseClient"
import { logEmailConfirmationStep, resolveSupabaseAuthCallback, summarizeAuthError } from "../services/supabaseAuthCallback"
import { promoteEmailConfirmedStudentWorkflow } from "../services/workflowService"
import "../css/LoginPage.css"
import loginBackground from "../assets/LoginBackground.jpg"
import logo from "../assets/logo.png"
import { usePublicConfiguration } from "../contexts/PublicConfigurationContext"

export default function ConfirmEmailPage() {
	const brandLogo = usePublicConfiguration().branding?.logoUrl || logo
	const [status, setStatus] = useState("checking")
	const [email, setEmail] = useState("")
	const returnToLogin = () => window.location.assign("/")

	useEffect(() => {
		let active = true

		const checkSession = async () => {
			logEmailConfirmationStep("page_session_resolution_started", {})
			const { session, error, hadCallback } = await resolveSupabaseAuthCallback(supabase, {
				allowedOtpTypes: ["email", "signup"],
			})
			if (!active) return

			if (error) {
				console.error("[BulsuScholar][Email Confirmation] callback_resolution_failed", {
					hadCallback,
					error: summarizeAuthError(error),
				})
				setStatus(hadCallback ? "error" : "missing")
				return
			}

			if (session?.user) {
				const user = session.user
				const userEmailAddr = user.email || ""
				setEmail(userEmailAddr)
				logEmailConfirmationStep("confirmed_session_ready", {
					authUserId: user.id,
					emailConfirmed: Boolean(user.email_confirmed_at),
				})
				try {
					logEmailConfirmationStep("pending_account_promotion_started", { authUserId: user.id })
					const promotion = await promoteEmailConfirmedStudentWorkflow()
					logEmailConfirmationStep("pending_account_promotion_succeeded", {
						authUserId: user.id,
						pendingApproval: promotion?.pendingApproval === true,
						alreadyActive: promotion?.alreadyActive === true,
					})
				} catch (promotionError) {
					console.error("[BulsuScholar][Email Confirmation] pending_account_promotion_failed", {
						authUserId: user.id,
						status: promotionError?.status || 0,
						reason: promotionError?.reason || "",
						error: summarizeAuthError(promotionError),
					})
					setStatus("activation-error")
					return
				}
				setStatus("confirmed")
				
				// Sign out so they have to log in manually with Student ID
				logEmailConfirmationStep("confirmation_flow_completed", { authUserId: user.id })
				await supabase.auth.signOut({ scope: "local" })
				setTimeout(() => {
					if (active) window.location.replace("/")
				}, 2000)
				return
			}

			setStatus("missing")
		}

		void checkSession()

		const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
			if (!active || !session?.user) return
			if (event !== "SIGNED_IN") return
			setEmail(session.user.email || "")
		})

		return () => {
			active = false
			data?.subscription?.unsubscribe?.()
		}
	}, [])

	const content = {
		checking: {
			icon: <HiOutlineMail className="signup-verified-icon" />,
			title: "Confirming your email",
			copy: "Please wait while we verify your confirmation link.",
		},
		confirmed: {
			icon: <HiOutlineCheckCircle className="signup-verified-icon" />,
			title: "Email confirmed",
			copy: email ? `${email} is confirmed. Your account is awaiting scholarship office approval. We will email you when it is ready.` : "Your account is awaiting scholarship office approval. We will email you when it is ready.",
		},
		missing: {
			icon: <HiOutlineXCircle className="signup-verified-icon" />,
			title: "Confirmation link not active",
			copy: "Open this page from the latest confirmation email. The link may be expired or already used.",
		},
		error: {
			icon: <HiOutlineXCircle className="signup-verified-icon" />,
			title: "Unable to confirm email",
			copy: "Request a new confirmation email or contact support if the problem continues.",
		},
		"activation-error": {
			icon: <HiOutlineXCircle className="signup-verified-icon" />,
			title: "Email confirmed, activation pending",
			copy: "Your email was confirmed, but we could not place your account in the approval queue. Refresh this page to try again or contact support if the problem continues.",
		},
	}[status]

	return (
		<div className="login-page signup-page">
			<div className="login-panel login-panel-info" style={{ "--login-bg": `url(${loginBackground})` }}>
				<div className="login-info-inner">
					<div className="login-info-icon" aria-hidden>
						<img src={brandLogo} alt="Institutional Student Programs and Services logo" className="login-logo-img" />
					</div>
					<h1 className="login-info-title">Email Confirmation</h1>
					<p className="login-info-desc">Confirm your student account before logging in to BulsuScholar.</p>
				</div>
			</div>

			<div className="login-panel login-panel-form">
				<div className="login-form-inner">
					<img src={brandLogo} alt="Bulacan State University Office of the Scholarships" className="login-form-logo" />
					<div className="signup-pending-inner">
						<div className="signup-verified-wrap">{content.icon}</div>
						<h2 className="signup-verified-title">{content.title}</h2>
						<p className="signup-verified-details">{content.copy}</p>
						<button type="button" className="login-submit login-submit--full" onClick={returnToLogin}>
							Back to Login
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
