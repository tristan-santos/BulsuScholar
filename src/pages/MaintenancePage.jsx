import { useNavigate } from "react-router-dom"
import {
	HiOutlineClock,
	HiOutlineCog,
	HiOutlineHome,
	HiOutlineShieldCheck,
} from "react-icons/hi"
import logo from "../assets/logo.png"
import { usePublicConfiguration } from "../contexts/PublicConfigurationContext"
import "../css/MaintenancePage.css"

export default function MaintenancePage() {
	const configuration = usePublicConfiguration()
	const branding = configuration.branding || {}
	const brandLogo = branding.logoUrl || logo
	const productName = branding.productName || "BulsuScholar"
	const navigate = useNavigate()

	return (
		<main className="maintenance-page">
			<section className="maintenance-shell" aria-labelledby="maintenance-title">
				<header className="maintenance-header">
					<div className="maintenance-brand">
						<img src={brandLogo} alt="BulSU Scholar logo" />
						<div>
							<strong>{productName}</strong>
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
					<p>{branding.maintenanceMessage || `${productName} is temporarily unavailable while protected system maintenance is completed.`}</p>
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
					<button type="button" onClick={() => navigate("/help")}>
						<HiOutlineHome /> Open Help
					</button>
				</div>

			</section>
		</main>
	)
}
