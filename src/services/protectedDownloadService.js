import { requireBackendApiUrl } from "../config/backendApi"
import { buildPortalRequestHeaders } from "./portalApi"

let presenter
let activePrompt = null
let promptQueue = []
const controllers = new Set()
const pendingPaths = new Set()
export function setDownloadPresenter(value) {
	presenter = value
	if (!value) {
		const prompts = [...(activePrompt ? [activePrompt] : []), ...promptQueue]
		activePrompt = null; promptQueue = []
		prompts.forEach((prompt) => prompt.resolve(null))
	} else showNextPrompt()
}

function showNextPrompt() {
	if (!presenter || activePrompt || !promptQueue.length) return
	const prompt = promptQueue.shift()
	activePrompt = prompt
	presenter((answer) => {
		if (activePrompt !== prompt) return
		activePrompt = null
		prompt.resolve(answer)
		if (!answer) {
			promptQueue.forEach((pending) => pending.resolve(null))
			promptQueue = []
		}
		Promise.resolve().then(showNextPrompt)
	}, prompt.options)
}

export function abortProtectedDownloads() {
	controllers.forEach((controller) => controller.abort())
}

async function withProtectedRequest(run) {
	const controller = new AbortController()
	controllers.add(controller)
	const timeout = setTimeout(() => controller.abort(), 60000)
	const abort = () => controller.abort()
	globalThis.addEventListener?.("pagehide", abort, { once: true })
	try { return await run(controller.signal) }
	finally {
		clearTimeout(timeout)
		controllers.delete(controller)
		globalThis.removeEventListener?.("pagehide", abort)
	}
}

export function requestDownloadPassword(options = {}) {
	if (!presenter) return Promise.reject(new Error("Protected download dialog is unavailable."))
	return new Promise((resolve) => { promptQueue.push({ resolve, options }); showNextPrompt() })
}

export async function fetchWithFilePasswords(url, options, { batch = false, fetcher = fetch } = {}) {
	const passwords = {}
	try {
		for (let attempt = 0; attempt < 10; attempt += 1) {
			const response = await fetcher(url, options)
			if (response.status !== 422) return response
			const data = await response.clone().json().catch(() => ({}))
			const detail = data.detail
			const code = typeof detail === "string" ? detail : detail?.code
			if (!["file_password_required", "file_password_incorrect"].includes(code)) return response
			let password = await requestDownloadPassword({ upload: true, incorrect: code === "file_password_incorrect", file: detail?.fileKey ?? detail?.fileIndex ?? "PDF" })
			if (!password) throw new DOMException("Upload cancelled", "AbortError")
			if (batch) {
				passwords[String(detail.fileKey ?? detail.fileIndex)] = password
				options.body.set("file_passwords", JSON.stringify(passwords))
			} else options.body.set("file_password", password)
			password = null
		}
		throw new Error("Too many incorrect file passwords. Try uploading again.")
	} finally {
		options.body.delete("file_password")
		options.body.delete("file_passwords")
		Object.keys(passwords).forEach((key) => { delete passwords[key] })
	}
}

export function generateDownloadPassword() {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
	return Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => alphabet[value & 63]).join("")
}

export function saveProtectedFile(blob, filename) {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url; anchor.download = filename
	anchor.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function protectedPost(path, payload = {}, headersOverride) {
	if (pendingPaths.has(path)) throw new Error("This protected download is already being prepared.")
	pendingPaths.add(path)
	let password
	try {
		password = await requestDownloadPassword()
		if (!password) return null
		return await withProtectedRequest(async (signal) => {
			const response = await fetch(`${requireBackendApiUrl("Protected downloads")}${path}`, {
				method: "POST", headers: headersOverride || await buildPortalRequestHeaders(),
				body: JSON.stringify({ ...payload, downloadProtection: { password } }),
				signal,
			})
			if (!response.ok) throw new Error("Protected download could not be prepared. Check your access and try again.")
			const blob = await response.blob()
			const filename = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || (blob.type === "application/pdf" ? "protected-document.pdf" : "protected-document.zip")
			return { blob, filename, auditId: response.headers.get("x-report-audit-id") || "" }
		})
	} finally { password = null; pendingPaths.delete(path) }
}

export async function protectGeneratedBlob(blob) {
	let password = await requestDownloadPassword()
	if (!password) throw new DOMException("Download cancelled", "AbortError")
	const form = new FormData()
	try {
		return await withProtectedRequest(async (signal) => {
			form.append("file", blob, "document")
			form.append("password", password)
			const headers = await buildPortalRequestHeaders()
			delete headers["Content-Type"]
			// Root uses a separate session header; do not downgrade its authorization.
			const { getRootProtectionHeaders } = await import("./rootService")
			Object.assign(headers, await getRootProtectionHeaders())
			const response = await fetch(`${requireBackendApiUrl("Protected downloads")}/downloads/generated-copy`, { method: "POST", headers, body: form, signal })
			if (!response.ok) throw new Error("Protected download failed. No unencrypted file was downloaded.")
			const protectedBlob = await response.blob()
			const filename = protectedBlob.type === "application/pdf" ? "protected-document.pdf" : "protected-document.zip"
			saveProtectedFile(protectedBlob, filename)
			return { blob: protectedBlob, filename }
		})
	} finally { password = null; form.delete("password") }
}

export async function downloadStoredDocument(file) {
	const url = file.url || ""
	let path = ""
	if (/^\/(student\/profile\/(?:documents|snapshots)\/[^/]+|signed-soe\/[^/]+)\/content$/.test(url)) path = url.replace(/\/content$/, "/download")
	if (/^\/scholarship-applications\/[^/]+\/requirements\/[^/]+\/files\/[^/]+$/.test(url)) path = `${url}/download`
	const id = file.submissionId || (!file.requirementFile && file.id)
	if (!path && id) path = `/student/profile/documents/${encodeURIComponent(id)}/download`
	if (!path) throw new Error("This legacy file has no protected resource identifier. Open its authorized preview or contact support.")
	const result = await protectedPost(path)
	if (result) saveProtectedFile(result.blob, result.filename)
	return result
}
