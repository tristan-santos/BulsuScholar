import { useLocation, useNavigate } from "react-router-dom"
import {
	HiOutlineAcademicCap,
	HiOutlineArrowLeft,
	HiOutlineBell,
	HiOutlineHome,
	HiOutlineSearch,
	HiOutlineShieldCheck,
	HiOutlineUser,
} from "react-icons/hi"
import logo from "../assets/logo.png"
import "../css/NotFoundPage.css"

export default function NotFoundPage() {
	const navigate = useNavigate()
	const location = useLocation()
	const suggestedRoutes = [
		{ label: "Login", path: "/", icon: HiOutlineHome },
		{ label: "Student Dashboard", path: "/student-dashboard", icon: HiOutlineAcademicCap },
		{ label: "Profile", path: "/student-dashboard/profile", icon: HiOutlineUser },
		{ label: "Announcements", path: "/student-dashboard/announcements", icon: HiOutlineBell },
	]

	return (
		<main className="not-found-page">
			<section className="not-found-shell" aria-labelledby="not-found-title">
				<header className="not-found-header">
					<div className="not-found-brand">
						<img src={logo} alt="BulSU Scholar logo" />
						<div>
							<strong>BulsuScholar</strong>
							<span>Portal Navigation</span>
						</div>
					</div>
					<div className="not-found-code">404</div>
				</header>

				<div className="not-found-content">
					<div className="not-found-visual" aria-hidden>
						<div className="not-found-number">404</div>
						<div className="not-found-rings">
							<span />
							<span />
							<span />
						</div>
						<div className="not-found-icon">
							<HiOutlineSearch />
						</div>
					</div>
					<p className="not-found-kicker">Page Not Found</p>
					<h1 id="not-found-title">We could not find this page.</h1>
					<p>
						The page may have been moved, deleted, or the link may be incorrect.
					</p>
					<div className="not-found-path">
						<span>Requested path</span>
						<strong>{location.pathname}</strong>
					</div>
				</div>

				<div className="not-found-suggestions" aria-label="Suggested pages">
					{suggestedRoutes.map((item) => {
						const Icon = item.icon
						return (
							<button type="button" key={item.path} className="not-found-route" onClick={() => navigate(item.path)}>
								<span aria-hidden>
									<Icon />
								</span>
								<strong>{item.label}</strong>
							</button>
						)
					})}
				</div>

				<div className="not-found-note">
					<HiOutlineShieldCheck aria-hidden />
					<span>If this link came from an email, use the latest message sent by BulsuScholar.</span>
				</div>

				<div className="not-found-actions">
					<button type="button" className="not-found-btn not-found-btn--primary" onClick={() => navigate("/")}>
						<HiOutlineHome />
						Go To Login
					</button>
					<button type="button" className="not-found-btn" onClick={() => navigate(-1)}>
						<HiOutlineArrowLeft />
						Go Back
					</button>
				</div>
			</section>
		</main>
	)
}
