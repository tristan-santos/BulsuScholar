import { useEffect, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import { HiOutlineClipboardCopy, HiOutlineDownload, HiX } from "react-icons/hi"
import { abortProtectedDownloads, generateDownloadPassword, setDownloadPresenter } from "../services/protectedDownloadService"
import "../css/ProtectedDownloadDialog.css"

function DownloadDialog() {
	const [dialog, setDialog] = useState(null)
	const [saved, setSaved] = useState(false)
	const [copied, setCopied] = useState(false)
	const pending = useRef(null)
	const previousFocus = useRef(null)
	const close = (accepted = false) => {
		pending.current?.(accepted ? dialog.password : null)
		pending.current = null
		setDialog(null); setSaved(false); setCopied(false)
		previousFocus.current?.focus()
	}
	useEffect(() => {
		setDownloadPresenter((resolve, options) => {
			pending.current?.(null)
			previousFocus.current = document.activeElement
			pending.current = resolve
			setSaved(false); setCopied(false)
			setDialog({ ...options, password: options.upload ? "" : generateDownloadPassword() })
		})
		return () => { setDownloadPresenter(null); pending.current?.(null); pending.current = null; abortProtectedDownloads() }
	}, [])
	if (!dialog) return null
	return <div className="protected-download-backdrop" onKeyDown={(event) => { if (event.key === "Escape") close() }}>
		<section className="protected-download-dialog" role="dialog" aria-modal="true" aria-labelledby="protected-download-title">
			<header><h2 id="protected-download-title">{dialog.upload ? "Unlock Uploaded PDF" : "Save Your File Password"}</h2><button type="button" onClick={() => close()} aria-label="Cancel download" title="Cancel"><HiX /></button></header>
			{dialog.upload ? <>
				<p>{dialog.incorrect ? "Incorrect password. Try again." : "This PDF is password-protected."} Enter the password for {String(dialog.file)}. It is used only to validate this upload.</p>
				<label>File password<input autoFocus type="password" autoComplete="off" maxLength={1024} value={dialog.password} onChange={(event) => setDialog({ ...dialog, password: event.target.value })} /></label>
			</> : <>
			<p>This download is encrypted. Save this password before continuing.</p>
			<div className="protected-download-password"><code>{dialog.password}</code><button type="button" autoFocus title="Copy password" aria-label="Copy password" onClick={async () => { try { await navigator.clipboard.writeText(dialog.password); setCopied(true) } catch { setCopied(false) } }}><HiOutlineClipboardCopy /></button></div>
			<span role="status">{copied ? "Password copied" : ""}</span>
			<p>A forgotten password cannot be recovered. You can create a new protected download while you still have access.</p>
			<label><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} /> I have saved this password.</label>
			<p className="protected-download-note">Keep the file and password private. Encryption cannot stop an authorized viewer from taking screenshots or sharing content.</p>
			</>}
			<footer><button type="button" onClick={() => close()}>Cancel</button><button type="button" disabled={dialog.upload ? !dialog.password : !saved} onClick={() => close(true)}><HiOutlineDownload /> {dialog.upload ? "Unlock" : "Continue"}</button></footer>
		</section>
	</div>
}

export default function ProtectedDownloadDialog() {
	const { pathname } = useLocation()
	return <DownloadDialog key={pathname} />
}
