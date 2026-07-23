import { useLocation, useNavigate } from "react-router-dom"
import { HiOutlineArrowLeft, HiOutlineHome, HiOutlineSearch } from "react-icons/hi"
import logo from "../assets/logo.png"
import "../css/NotFoundPage.css"

export default function NotFoundPage() {
	const navigate = useNavigate()
	const location = useLocation()

	return (
		<main className="not-found-page">
			<section className="not-found-shell" aria-labelledby="not-found-title">
				<div className="not-found-brand">
					<img src={logo} alt="BulSU Scholar logo" />
					<div>
						<strong>BulsuScholar</strong>
						<span>Portal Navigation</span>
					</div>
				</div>

				<div className="not-found-content">
					<div className="not-found-icon" aria-hidden>
						<HiOutlineSearch />
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
