import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { HiOutlineCheckCircle, HiOutlineMail, HiOutlineXCircle } from "react-icons/hi"
import { supabase } from "../services/supabaseClient"
import "../css/LoginPage.css"
import loginBackground from "../assets/LoginBackground.jpg"
import logo from "../assets/logo.png"
import logo2 from "../assets/logo2.png"

export default function ConfirmEmailPage() {
	const navigate = useNavigate()
	const [status, setStatus] = useState("checking")
	const [email, setEmail] = useState("")

	useEffect(() => {
		let active = true

		const checkSession = async () => {
			console.log("ConfirmEmailPage: Component mounted. Checking URL for 'code' parameter...");
			const code = new URLSearchParams(window.location.search).get("code")
			
			if (code) {
				console.log("ConfirmEmailPage: 'code' found! Exchanging for session...");
				const { error } = await supabase.auth.exchangeCodeForSession(code)
				if (!active) return
				if (error) {
					console.error("ConfirmEmailPage: Exchange code ERROR:", error);
					setStatus("error")
					return
				}
				console.log("ConfirmEmailPage: Exchange code SUCCESS.");
			} else {
				console.log("ConfirmEmailPage: No 'code' in URL search params.");
			}

			console.log("ConfirmEmailPage: Checking current session...");
			const { data, error } = await supabase.auth.getSession()
			if (!active) return

			if (error) {
				console.error("ConfirmEmailPage: Get session ERROR:", error);
				setStatus("error")
				return
			}

			if (data?.session?.user) {
				console.log("ConfirmEmailPage: Session found for user:", data.session.user.email);
				const userEmailAddr = data.session.user.email || ""
				setEmail(userEmailAddr)
				setStatus("confirmed")
				
				// Sign out so they have to log in manually with Student ID
				await supabase.auth.signOut()
				console.log("ConfirmEmailPage: Signed out after confirmation.")

				setTimeout(() => {
					if (active) navigate("/", { replace: true })
				}, 2000)
				return
			}

			console.warn("ConfirmEmailPage: No active session found.");
			setStatus("missing")
		}

		void checkSession()

		const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
			console.log("ConfirmEmailPage: Auth state change event:", event);
			if (!active || !session?.user) return
			console.log("ConfirmEmailPage: Session confirmed via auth state change.");
			setEmail(session.user.email || "")
			setStatus("confirmed")
			await supabase.auth.signOut()
		})

		return () => {
			active = false
			data?.subscription?.unsubscribe?.()
		}
	}, [navigate])

	const content = {
		checking: {
			icon: <HiOutlineMail className="signup-verified-icon" />,
			title: "Confirming your email",
			copy: "Please wait while we verify your confirmation link.",
		},
		confirmed: {
			icon: <HiOutlineCheckCircle className="signup-verified-icon" />,
			title: "Email confirmed!",
			copy: email ? `${email} has been verified successfully. Redirecting you to login...` : "Your email has been verified successfully. Redirecting you to login...",
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
	}[status]

	return (
		<div className="login-page signup-page">
			<div className="login-panel login-panel-info" style={{ "--login-bg": `url(${loginBackground})` }}>
				<div className="login-info-inner">
					<div className="login-info-icon" aria-hidden>
						<img src={logo} alt="Institutional Student Programs and Services logo" className="login-logo-img" />
					</div>
					<h1 className="login-info-title">Email Confirmation</h1>
					<p className="login-info-desc">Confirm your student account before logging in to BulsuScholar.</p>
				</div>
			</div>

			<div className="login-panel login-panel-form">
				<div className="login-form-inner">
					<img src={logo2} alt="Bulacan State University Office of the Scholarships" className="login-form-logo" />
					<div className="signup-pending-inner">
						<div className="signup-verified-wrap">{content.icon}</div>
						<h2 className="signup-verified-title">{content.title}</h2>
						<p className="signup-verified-details">{content.copy}</p>
						<button type="button" className="login-submit login-submit--full" onClick={() => navigate("/")}>
							Go to Login
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
