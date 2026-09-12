import { useEffect, useState } from "react"
import { HiOutlineExclamation, HiX } from "react-icons/hi"
import {
	closeFromModalBackdrop,
	MODAL_DISCARD_REQUEST_EVENT,
} from "../services/modalLayerService"

export default function ModalDiscardConfirmation() {
	const [closeModal, setCloseModal] = useState(null)

	useEffect(() => {
		const handleRequest = (event) => {
			if (typeof event.detail?.closeModal === "function") {
				setCloseModal(() => event.detail.closeModal)
			}
		}
		window.addEventListener(MODAL_DISCARD_REQUEST_EVENT, handleRequest)
		return () => window.removeEventListener(MODAL_DISCARD_REQUEST_EVENT, handleRequest)
	}, [])

	if (!closeModal) return null

	const cancel = () => setCloseModal(null)
	const discard = () => {
		const action = closeModal
		setCloseModal(null)
		action()
	}

	return (
		<div
			className="bulsuscholar-discard-backdrop"
			role="presentation"
			onClick={(event) => closeFromModalBackdrop(event, cancel)}
		>
			<section
				className="bulsuscholar-discard-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="bulsuscholar-discard-title"
			>
				<button type="button" className="bulsuscholar-discard-close" onClick={cancel} aria-label="Keep editing">
					<HiX />
				</button>
				<span className="bulsuscholar-discard-icon" aria-hidden="true"><HiOutlineExclamation /></span>
				<div>
					<h3 id="bulsuscholar-discard-title">Discard unsaved changes?</h3>
					<p>Your changes in this form have not been saved.</p>
				</div>
				<footer>
					<button type="button" className="bulsuscholar-discard-cancel" onClick={cancel}>Keep Editing</button>
					<button type="button" className="bulsuscholar-discard-confirm" onClick={discard}>Discard Changes</button>
				</footer>
			</section>
		</div>
	)
}
