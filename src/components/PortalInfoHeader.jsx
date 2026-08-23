import { Link, useNavigate } from "react-router-dom"
import { HiOutlineArrowLeft, HiOutlineHome } from "react-icons/hi"
import logo from "../assets/logo2.png"

function getHomePath() {
	const role = sessionStorage.getItem("bulsuscholar_userType")
	if (role === "admin") return "/admin/dashboard"
	if (role === "provider" || role === "grantor") return "/provider-dashboard/dashboard"
	if (role === "student") return "/student-dashboard"
	return "/"
}

export default function PortalInfoHeader() {
	const navigate = useNavigate()
	const homePath = getHomePath()
	return (
		<header className="portal-info-header">
			<Link to={homePath} className="portal-info-brand"><img src={logo} alt="" /><span><strong>BulsuScholar</strong><small>Scholarship Support Center</small></span></Link>
			<nav aria-label="Support navigation">
				<Link to="/faq">FAQ</Link><Link to="/about">About</Link><Link to="/help">Help</Link>
				<button type="button" onClick={() => navigate(-1)} title="Go back"><HiOutlineArrowLeft /></button>
				<Link className="portal-info-home" to={homePath} title="Portal home"><HiOutlineHome /></Link>
			</nav>
		</header>
	)
}
