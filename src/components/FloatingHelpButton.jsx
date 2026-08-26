import { useLocation, useNavigate } from "react-router-dom"
import { MdSupportAgent } from "react-icons/md"
import "../css/FloatingHelpButton.css"

export default function FloatingHelpButton() {
	const location = useLocation()
	const navigate = useNavigate()
	if (location.pathname === "/help" || location.pathname === "/maintenance") return null
	return (
		<button type="button" className="floating-help-button" onClick={() => navigate("/help")} aria-label="Open Help and Support" title="Help and Support">
			<MdSupportAgent aria-hidden />
		</button>
	)
}
