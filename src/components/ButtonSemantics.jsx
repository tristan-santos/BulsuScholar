import { useEffect } from "react"

const CONTROL_SELECTOR = [
	"[role='tab']",
	"[role='option']",
	"[aria-haspopup='listbox']",
	"[aria-haspopup='menu']",
	".custom-select__button",
	".custom-select__option",
	".login-forgot-btn",
	".create-account-btn",
	"[class*='link-btn']",
	"[class*='link-button']",
	"[class*='text-button']",
	".support-topic-card button",
	"[class*='pagination']",
	"[class*='theme-switch']",
	"[class*='topbar-theme']",
	"[class*='account-theme']",
	"[class*='tabs'] button",
	"[class*='format-toggle'] button",
	"[class*='trend-controls'] button",
	"[class*='calendar-head'] button",
	"[class*='carousel'] button",
	"[class*='gallery'] button",
	"[class*='theme-switch'] button",
	"[class*='topbar-theme'] button",
	"[class*='account-theme'] button",
	"[class*='nav-button']",
	"[class*='sidebar'] nav button",
	"nav button",
].join(",")

const POSITIVE_ACTION = /\b(accept|activate|add|apply|approve|assign|complete|confirm|continue|create|download|execute|finish|generate|invite|keep scholarship|log in|login|next|proceed|publish|re-?assign|reactivate|request|restore|retry|save|send|sign|sign in|sign up|submit|unarchive|update|upload|verify)\b/i
const DANGER_ACTION = /\b(archive|cancel|clear|decline|delete|discard|disable|log out|logout|not my record|reject|remove|reset|revoke|sign out|withdraw)\b/i
const NEUTRAL_ACTION = /\b(back|browse|change|choose|close preview|edit|filter|keep editing|open|preview|print|refresh|search|select|show|view)\b/i

function getButtonLabel(button) {
	return [
		button.textContent,
		button.getAttribute("aria-label"),
		button.getAttribute("title"),
	].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
}

function getButtonVariant(button) {
	const label = getButtonLabel(button)
	const semanticSource = `${label} ${button.className || ""}`

	if (NEUTRAL_ACTION.test(label)) return "neutral"
	if (DANGER_ACTION.test(semanticSource)) return "danger"
	if (POSITIVE_ACTION.test(semanticSource) || button.type === "submit") return "positive"
	return "neutral"
}

function classifyButton(button) {
	if (!(button instanceof HTMLButtonElement)) return
	if (button.matches(CONTROL_SELECTOR) || button.dataset.buttonVariant === "none") return
	button.dataset.buttonVariant = getButtonVariant(button)
}

function classifyButtons(root) {
	if (root instanceof HTMLButtonElement) classifyButton(root)
	root.querySelectorAll?.("button").forEach(classifyButton)
}

export default function ButtonSemantics() {
	useEffect(() => {
		classifyButtons(document)
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node instanceof Element) classifyButtons(node)
				})
			})
		})
		observer.observe(document.body, { childList: true, subtree: true })
		return () => observer.disconnect()
	}, [])

	return null
}
