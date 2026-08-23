import { useNavigate } from "react-router-dom"
import {
	HiOutlineClock,
	HiOutlineCog,
	HiOutlineHome,
	HiOutlineShieldCheck,
} from "react-icons/hi"
import logo from "../assets/logo.png"
import "../css/MaintenancePage.css"

export default function MaintenancePage() {
	const navigate = useNavigate()

	return (
		<main className="maintenance-page">
			<section className="maintenance-shell" aria-labelledby="maintenance-title">
				<header className="maintenance-header">
					<div className="maintenance-brand">
						<img src={logo} alt="BulSU Scholar logo" />
						<div>
							<strong>BulsuScholar</strong>
							<span>Portal Maintenance</span>
						</div>
					</div>
					<span className="maintenance-status"><HiOutlineClock /> Temporarily unavailable</span>
				</header>

				<div className="maintenance-content">
					<div className="maintenance-icon" aria-hidden>
						<HiOutlineCog />
					</div>
					<p className="maintenance-kicker">Maintenance Mode</p>
					<h1 id="maintenance-title">The portal is currently under maintenance.</h1>
					<p>
						BulsuScholar is being updated by the administrator. Student and grantor pages are paused for now,
						but administrator access remains available for system management.
					</p>
				</div>

				<div className="maintenance-grid">
					<article>
						<HiOutlineShieldCheck />
						<div>
							<strong>Your records are protected</strong>
							<span>Existing scholarship and account data remain stored while maintenance is active.</span>
						</div>
					</article>
					<article>
						<HiOutlineClock />
						<div>
							<strong>Please check again later</strong>
							<span>The portal will reopen once the administrator disables maintenance mode.</span>
						</div>
					</article>
				</div>

				<div className="maintenance-actions">
					<button type="button" onClick={() => navigate("/")}>
						<HiOutlineHome /> Go To Login
					</button>
				</div>

			</section>
		</main>
	)
}
