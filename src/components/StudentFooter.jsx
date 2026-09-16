import { Link } from "react-router-dom"

const FOOTER_LINKS = [
	["Dashboard Home", "/student-dashboard"],
	["Announcements", "/student-dashboard/announcements"],
	["Inbox", "/student-dashboard/inbox"],
	["My Profile", "/student-dashboard/profile"],
	["My Scholarships", "/student-dashboard/scholarships"],
]

export default function StudentFooter({ description = "Manage your records, documents, and application updates in one place." }) {
	return (
		<footer className="student-footer">
			<div className="student-footer-grid">
				<div className="student-footer-brand">
					<h3>BulsuScholar</h3>
					<p>Institutional Student Programs and Services scholarship portal. {description}</p>
				</div>
				<div className="student-footer-col">
					<h4>Support</h4>
					<p>Office of Scholarships</p>
					<p>Email: scholarships@bulsu.edu.ph</p>
					<p>Mon-Fri, 8:00 AM - 5:00 PM</p>
				</div>
				<nav className="student-footer-col" aria-label="Student portal quick links">
					<h4>Quick Links</h4>
					{FOOTER_LINKS.map(([label, path]) => <Link key={path} className="student-footer-link" to={path}>{label}</Link>)}
				</nav>
			</div>
			<p className="student-footer-bottom">(c) {new Date().getFullYear()} BulsuScholar. All rights reserved.</p>
		</footer>
	)
}
