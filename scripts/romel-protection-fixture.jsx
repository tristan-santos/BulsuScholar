import React from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import ProtectedDownloadDialog from "../src/components/ProtectedDownloadDialog"
import ModalAccessibilityManager from "../src/components/ModalAccessibilityManager"
import OperationStatusProvider from "../src/components/OperationStatusProvider"
import { trackOperation } from "../src/services/operationTracker"
import "../src/css/App.css"
import { requestDownloadPassword } from "../src/services/protectedDownloadService"
import { convertPdfToImage } from "../src/utils/pdfConverter"

window.__romelResult = { completed: 0, cancelled: 0, validLength: false }
async function open(upload = false) {
	const password = await trackOperation(() => requestDownloadPassword({ upload, file: "COR.pdf" }), "document.download")
	window.__romelResult = {
		completed: window.__romelResult.completed + (password ? 1 : 0),
		cancelled: window.__romelResult.cancelled + (password ? 0 : 1),
		validLength: password?.length === 32,
	}
}
async function encryptedPreview() {
	const response = await fetch("/test-results/romel-encrypted-preview.pdf")
	const file = new File([await response.blob()], "synthetic-preview.pdf", { type: "application/pdf" })
	const blob = await convertPdfToImage(file)
	const url = URL.createObjectURL(blob)
	const image = new Image()
	image.onload = () => {
		const canvas = document.createElement("canvas")
		canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
		const context = canvas.getContext("2d")
		context.drawImage(image, 0, 0)
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
		let ink = 0
		for (let index = 0; index < pixels.length; index += 4) if (pixels[index] < 100 && pixels[index + 3] > 0) ink++
		window.__romelPreviewResult = { rendered: true, ink, width: canvas.width, height: canvas.height }
		URL.revokeObjectURL(url)
	}
	image.src = url
}
createRoot(document.getElementById("root")).render(<BrowserRouter><OperationStatusProvider>
	<main style={{ padding: 24, fontFamily: "Arial, sans-serif" }}><h1>BulsuScholar</h1><button onClick={() => open()}>Protected Download</button><button onClick={() => open(true)}>Encrypted Upload</button><button onClick={encryptedPreview}>Encrypted PDF Preview</button></main>
	<ProtectedDownloadDialog /><ModalAccessibilityManager />
</OperationStatusProvider></BrowserRouter>)
