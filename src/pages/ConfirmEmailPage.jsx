import { useEffect, useState } from "react"
import { HiOutlineArrowLeft, HiOutlineCheckCircle, HiOutlineClock, HiOutlineMail, HiOutlineXCircle } from "react-icons/hi"
import { supabase } from "../services/supabaseClient"
import { resolveSupabaseAuthCallback } from "../services/supabaseAuthCallback"
import { promoteEmailConfirmedStudentWorkflow } from "../services/workflowService"
import "../css/LoginPage.css"
import "../css/ConfirmEmailPage.css"
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
			const { session, error, hadCallback } = await resolveSupabaseAuthCallback(supabase, {
				allowedOtpTypes: ["email", "signup"],
			})
			if (!active) return

			if (error) {
				setStatus(hadCallback ? "error" : "missing")
				return
			}

			if (session?.user) {
				const user = session.user
				const userEmailAddr = user.email || ""
				setEmail(userEmailAddr)
				try {
					const promotion = await promoteEmailConfirmedStudentWorkflow()
					setStatus(promotion.accountActivated ? "activated" : "confirmed")
				} catch {
					setStatus("activation-error")
					return
				}
				
				// Sign out so they have to log in manually with Student ID
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
			icon: <HiOutlineMail />,
			label: "Verification in progress",
			title: "Confirming your email",
			copy: "Please wait while we verify your confirmation link.",
		},
		confirmed: {
			icon: <HiOutlineCheckCircle />,
			label: "Confirmation complete",
			title: "Email confirmed",
			copy: "Your account is now waiting for Scholarship Office approval. We will email you when you can sign in.",
		},
		activated: {
			icon: <HiOutlineCheckCircle />,
			label: "Account ready",
			title: "Welcome to BulsuScholar",
			copy: "Your email and signup documents were approved automatically. You can now sign in using your Student ID.",
		},
		missing: {
			icon: <HiOutlineXCircle />,
			label: "Link unavailable",
			title: "Confirmation link not active",
			copy: "Open this page from the latest confirmation email. The link may be expired or already used.",
		},
		error: {
			icon: <HiOutlineXCircle />,
			label: "Confirmation failed",
			title: "Unable to confirm email",
			copy: "Request a new confirmation email or contact support if the problem continues.",
		},
		"activation-error": {
			icon: <HiOutlineClock />,
			label: "Action still required",
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

			<div className="login-panel login-panel-form confirm-email-panel">
				<div className="confirm-email-shell">
					<img src={brandLogo} alt="Bulacan State University Office of the Scholarships" className="confirm-email-logo" />
					<section className={`confirm-email-card confirm-email-card--${status}`} aria-live="polite">
						<div className="confirm-email-status-icon" aria-hidden="true">{content.icon}</div>
						<span className="confirm-email-kicker">{content.label}</span>
						<h2>{content.title}</h2>
						<p>{content.copy}</p>
						{["confirmed", "activated"].includes(status) && email ? <div className="confirm-email-address"><HiOutlineMail /><span title={email}>{email}</span></div> : null}
						{status === "confirmed" ? <div className="confirm-email-next-step"><HiOutlineClock /><span><strong>Next step</strong>Scholarship Office account review</span></div> : null}
						{status === "activated" ? <div className="confirm-email-next-step"><HiOutlineCheckCircle /><span><strong>Next step</strong>Sign in and complete your Student Application Profile</span></div> : null}
						<button type="button" className="confirm-email-back" onClick={returnToLogin}>
							<HiOutlineArrowLeft /> {status === "activated" ? "Continue to Login" : "Back to Login"}
						</button>
						{["confirmed", "activated"].includes(status) ? <small className="confirm-email-redirect">Returning to login automatically...</small> : null}
					</section>
					</div>
			</div>
		</div>
	)
}
