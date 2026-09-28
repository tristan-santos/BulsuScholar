import { useEffect } from "react"

const FOCUSABLE_SELECTOR = [
	"button:not([disabled])",
	"[href]",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex='-1'])",
].join(",")

const visibleDialogs = () => Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'))
	.filter((dialog) => dialog.getClientRects().length > 0)

const focusableElements = (dialog) => Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
	.filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true")

export default function ModalAccessibilityManager() {
	useEffect(() => {
		let activeDialog = null
		let returnFocus = null

		const syncDialogFocus = () => {
			const dialogs = visibleDialogs()
			const nextDialog = dialogs.at(-1) || null
			if (nextDialog === activeDialog) return

			if (!nextDialog) {
				if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
				activeDialog = null
				returnFocus = null
				return
			}

			if (!activeDialog) returnFocus = document.activeElement
			activeDialog = nextDialog
			if (!activeDialog.contains(document.activeElement)) {
				const target = activeDialog.querySelector("[autofocus]") || focusableElements(activeDialog)[0]
				if (target) target.focus({ preventScroll: true })
				else {
					activeDialog.setAttribute("tabindex", "-1")
					activeDialog.focus({ preventScroll: true })
				}
			}
		}

		const observer = new MutationObserver(() => queueMicrotask(syncDialogFocus))
		observer.observe(document.body, { childList: true, subtree: true })
		syncDialogFocus()

		const handleKeyDown = (event) => {
			const dialog = visibleDialogs().at(-1)
			if (!dialog) return

			if (event.key === "Escape") {
				const closeSelector =
					'[aria-label^="Close" i], [aria-label^="Cancel" i], button.close, [class*="modal-close"], [class*="detail-close"]'
				const closeControl = dialog.querySelector(closeSelector) || dialog.parentElement?.querySelector(closeSelector)
				if (closeControl) {
					event.preventDefault()
					closeControl.click()
				}
				return
			}

			if (event.key !== "Tab") return
			const controls = focusableElements(dialog)
			if (controls.length === 0) {
				event.preventDefault()
				dialog.focus()
				return
			}
			const first = controls[0]
			const last = controls.at(-1)
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault()
				last.focus()
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault()
				first.focus()
			}
		}

		document.addEventListener("keydown", handleKeyDown)
		return () => {
			observer.disconnect()
			document.removeEventListener("keydown", handleKeyDown)
		}
	}, [])

	return null
}
