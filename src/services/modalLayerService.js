export const MODAL_DISCARD_REQUEST_EVENT = "bulsuscholar:modal-discard-request"

export function isModalBackdropClick(event) {
	return event?.target === event?.currentTarget
}

export function closeFromModalBackdrop(event, closeModal, { hasUnsavedChanges = false } = {}) {
	if (!isModalBackdropClick(event) || typeof closeModal !== "function") return
	if (!hasUnsavedChanges) {
		closeModal()
		return
	}

	window.dispatchEvent(new CustomEvent(MODAL_DISCARD_REQUEST_EVENT, {
		detail: { closeModal },
	}))
}
