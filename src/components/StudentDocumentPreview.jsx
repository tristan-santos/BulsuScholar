import { useEffect, useState } from "react"
import { HiOutlineDownload, HiOutlineExclamation, HiOutlineRefresh, HiX } from "react-icons/hi"
import ZoomableImagePreview from "./ZoomableImagePreview"
import { getStudentVerificationDocumentBlob } from "../services/studentProfileService"
import { convertPdfToImage } from "../utils/pdfConverter"
import { getStorageObjectBlob } from "../services/supabaseStorageService"
import { downloadStoredDocument, protectGeneratedBlob } from "../services/protectedDownloadService"
import { toast } from "react-toastify"

export default function StudentDocumentPreview({ submission, onClose }) {
	const [preview, setPreview] = useState({ loading: true, error: "", imageUrl: "", fileUrl: "" })
	const [attempt, setAttempt] = useState(0)

	useEffect(() => {
		let active = true
		const urls = []
		const objectUrl = (blob) => {
			const url = URL.createObjectURL(blob)
			urls.push(url)
			return url
		}
		const load = async () => {
			let fileUrl = ""
			try {
				const blob = submission.blob || await (submission.requirementFile ? getStorageObjectBlob(submission) : getStudentVerificationDocumentBlob(submission.id))
				if (!active) return
				fileUrl = objectUrl(blob)
				const isPdf = blob.type === "application/pdf" || /\.pdf$/i.test(submission.name || "")
				const image = isPdf ? await convertPdfToImage(blob) : blob
				if (!active) return
				const imageUrl = isPdf ? objectUrl(image) : fileUrl
				setPreview({ loading: false, error: "", fileUrl, imageUrl })
			} catch (error) {
				if (active) setPreview({ loading: false, error: error.message || "Unable to open this document.", fileUrl, imageUrl: "" })
			}
		}
		load()
		return () => {
			active = false
			urls.forEach((url) => URL.revokeObjectURL(url))
		}
	}, [submission, attempt])

	return (
		<div className="student-document-preview-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
			<section className="student-document-preview-modal" role="dialog" aria-modal="true" aria-labelledby="student-vault-preview-title">
				<header className="student-document-preview-head">
					<div><h3 id="student-vault-preview-title">Document Preview</h3><p>{submission.name || "Student document"}</p></div>
					<div className="student-document-preview-actions">
						{preview.fileUrl ? <button type="button" className="student-document-preview-open" onClick={async () => { try { if (submission.blob) await protectGeneratedBlob(submission.blob); else await downloadStoredDocument(submission) } catch (error) { toast.error(error.message) } }}><HiOutlineDownload /> Download</button> : null}
						<button type="button" className="student-document-preview-close" onClick={onClose} aria-label="Close document preview" title="Close"><HiX /></button>
					</div>
				</header>
				<div className="student-document-preview-body" aria-busy={preview.loading}>
					{preview.loading ? <div className="student-document-preview-state" role="status"><HiOutlineRefresh /><p>Loading document...</p></div> : preview.error ? <div className="student-document-preview-state" role="alert"><HiOutlineExclamation /><p>{preview.error}</p><button type="button" className="student-document-preview-open" onClick={() => { setPreview({ loading: true, error: "", imageUrl: "", fileUrl: "" }); setAttempt((value) => value + 1) }}><HiOutlineRefresh /> Retry</button></div> : <ZoomableImagePreview key={preview.imageUrl} src={preview.imageUrl} alt={submission.name || "Student document"} hint="" />}
				</div>
			</section>
		</div>
	)
}
