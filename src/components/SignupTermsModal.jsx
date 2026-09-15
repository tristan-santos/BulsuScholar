import { HiOutlineCheckCircle } from "react-icons/hi"

export const SIGNUP_TERMS_VERSION = "2026-09-15"

export default function SignupTermsModal({ checked, onCheckedChange, onClose, onAccept }) {
	return (
		<div className="signup-terms-modal-overlay" onClick={onClose}>
			<div
				className="signup-terms-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="signup-terms-title"
				aria-describedby="signup-terms-summary"
				onClick={(event) => event.stopPropagation()}
			>
				<button
					type="button"
					className="signup-terms-close"
					aria-label="Close terms and conditions"
					onClick={onClose}
				>
					X
				</button>

				<header className="signup-terms-header">
					<span className="signup-terms-icon" aria-hidden>
						<HiOutlineCheckCircle />
					</span>
					<div>
						<p className="signup-terms-kicker">Account Consent</p>
						<h2 id="signup-terms-title">Terms and Conditions</h2>
						<p className="signup-terms-version">Effective September 15, 2026 | Version {SIGNUP_TERMS_VERSION}</p>
					</div>
				</header>

				<div className="signup-terms-body" tabIndex="0">
					<p id="signup-terms-summary" className="signup-terms-intro">
						These Terms and Conditions govern the creation and use of a BulsuScholar student account. By accepting them, you confirm that you understand and agree to the rules below.
					</p>

					<section>
						<h3>1. Eligibility and Account Registration</h3>
						<ul>
							<li>You must provide complete, accurate, current, and truthful identity, contact, enrollment, academic, and scholarship information.</li>
							<li>You may create and use only your own account. You must not use another person's student number, email address, contact number, documents, or identity.</li>
							<li>You are responsible for protecting your password, keeping your contact information current, and promptly reporting suspected unauthorized account access.</li>
							<li>Account creation does not guarantee eligibility, approval, funding, or a scholarship award.</li>
						</ul>
					</section>

					<section>
						<h3>2. Documents and Verification</h3>
						<ul>
							<li>Your COR, ROG, School ID, Student Application Profile, Other Requirements, and related records may be checked by authorized BulsuScholar administrators and the relevant scholarship grantor.</li>
							<li>You authorize reasonable verification against university, grantor, application, and existing account records to confirm eligibility and prevent duplicate or fraudulent submissions.</li>
							<li>You must replace expired, unreadable, incomplete, or inaccurate documents when requested. Review decisions may be invalidated when a shared document is replaced.</li>
							<li>Submitting altered, fabricated, borrowed, misleading, or unauthorized documents is prohibited.</li>
						</ul>
					</section>

					<section className="signup-terms-warning">
						<h3>3. Tampering, Fraud, and Misuse</h3>
						<p>
							Students must not tamper with their own data or any other person's data without authorization. This includes changing records, bypassing controls, impersonating another user, gaining unauthorized access, interfering with applications, or attempting to manipulate scholarship decisions or slot availability.
						</p>
						<p>
							A verified violation may result in removal or cancellation of scholarships, rejection of applications, account suspension or termination, return of improperly obtained benefits where applicable, university disciplinary referral, and legal action. Any sanction will be imposed only after review, notice, and an opportunity to explain or appeal under applicable university policy, scholarship rules, and law.
						</p>
					</section>

					<section>
						<h3>4. Scholarship Applications and Awards</h3>
						<ul>
							<li>You must satisfy each scholarship's eligibility, document, deadline, and availability requirements. Grantors and authorized administrators may approve, reject, archive, or request corrections based on applicable rules.</li>
							<li>You may maintain eligible pending applications as allowed by BulsuScholar, but confirming a material request commits you to the selected scholarship and may close competing applications.</li>
							<li>You must not reserve duplicate slots, submit duplicate applications to the same grantor, abuse invitations, or conceal an existing committed scholarship.</li>
							<li>Withdrawal, rejection, cancellation, and reapplication remain subject to the displayed cooldowns, deadlines, invitation rules, and grantor-specific policies.</li>
						</ul>
					</section>

					<section>
						<h3>5. Data Privacy Act of 2012 (Republic Act No. 10173)</h3>
						<p>
							BulsuScholar will process personal information and sensitive personal information in accordance with Republic Act No. 10173, its Implementing Rules and Regulations, and applicable university privacy and records policies. Processing will follow transparency, legitimate purpose, and proportionality.
						</p>
						<ul>
							<li><strong>Data collected:</strong> identity and contact details, student and enrollment information, academic records, uploaded documents, scholarship records, communications, consent records, and security or activity logs.</li>
							<li><strong>Purposes:</strong> account administration, identity and eligibility verification, scholarship matching and processing, document review, slot management, material requests, communication, support, fraud prevention, security, reporting, audit, and compliance with legal obligations.</li>
							<li><strong>Authorized recipients:</strong> authorized university personnel, BulsuScholar administrators, the grantor responsible for an application, contracted service providers acting under appropriate safeguards, and public authorities when disclosure is required or permitted by law.</li>
							<li><strong>Retention and protection:</strong> records will be retained only as long as necessary for the stated purposes, scholarship history, audit, dispute resolution, or legal requirements, and will be protected through reasonable organizational, physical, and technical safeguards.</li>
							<li><strong>Your rights:</strong> subject to lawful limitations, you may be informed, request access, object to certain processing, correct inaccurate data, request erasure or blocking, obtain data portability where applicable, claim damages, and lodge a complaint with the National Privacy Commission.</li>
						</ul>
						<p>
							Privacy requests should be submitted through BulsuScholar Help and Support or the university's authorized scholarship or data-protection office. Some processing or retention may continue when required by law, public authority, contract, fraud investigation, or the establishment, exercise, or defense of legal claims.
						</p>
					</section>

					<section>
						<h3>6. Communications and System Use</h3>
						<ul>
							<li>You consent to receive account, verification, application, deadline, review, material, security, and support notices through the portal, email, or available contact channels.</li>
							<li>You must use BulsuScholar only for lawful scholarship-related purposes and must not probe security, upload malicious content, disrupt service, scrape protected data, or access records beyond your permission.</li>
							<li>Maintenance, connectivity, third-party service interruptions, or security incidents may temporarily affect availability. Important deadlines remain your responsibility unless an authorized notice states otherwise.</li>
						</ul>
					</section>

					<section>
						<h3>7. Enforcement, Changes, and Governing Rules</h3>
						<ul>
							<li>BulsuScholar may restrict access or preserve records when reasonably necessary to investigate misconduct, protect users, secure the system, comply with law, or enforce scholarship and university rules.</li>
							<li>Material changes to these terms will be communicated through the system and may require renewed acceptance. Historical acceptance records may be retained for audit and legal purposes.</li>
							<li>These terms are governed by applicable laws of the Republic of the Philippines and relevant Bulacan State University and scholarship-provider policies.</li>
							<li>If one provision is found unenforceable, the remaining provisions continue to apply.</li>
						</ul>
					</section>

					<section>
						<h3>8. Acknowledgment</h3>
						<p>
							By accepting, you confirm that you have read and understood these Terms and Conditions, consent to the described processing of your personal and sensitive personal information, and agree to comply with BulsuScholar, university, grantor, and applicable legal requirements.
						</p>
					</section>
				</div>

				<label className="signup-terms-check">
					<input
						type="checkbox"
						checked={checked}
						onChange={(event) => onCheckedChange(event.target.checked)}
					/>
					<span>I have read, understood, and agree to these Terms and Conditions and the Data Privacy notice.</span>
				</label>

				<div className="signup-terms-actions">
					<button type="button" className="signup-terms-cancel" onClick={onClose}>Cancel</button>
					<button type="button" className="signup-terms-continue" disabled={!checked} onClick={onAccept}>
						Accept and Continue
					</button>
				</div>
			</div>
		</div>
	)
}
