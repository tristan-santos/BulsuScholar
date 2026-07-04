/**
 * Converts PDF files to PNG images using pdf.js (legacy build for browser compatibility)
 */

import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"

// Check if file is a PDF
export function isPdf(file) {
	if (!file) return false
	return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

/**
 * Convert a PDF file to a PNG image (first page)
 * @param {File} pdfFile - The PDF file to convert
 * @param {number} pageNum - Which page to convert (default: 1)
 * @returns {Promise<Blob>} PNG image blob
 */
export async function convertPdfToImage(pdfFile, pageNum = 1) {
	const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs")

	pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

	return new Promise((resolve, reject) => {
		const reader = new FileReader()

		reader.onload = async (event) => {
			try {
				const pdf = await pdfjsLib.getDocument({
					data: new Uint8Array(event.target.result),
				}).promise

				const page = await pdf.getPage(Math.max(1, Math.min(pageNum, pdf.numPages)))

				const scale = 2
				const viewport = page.getViewport({ scale })

				const canvas = document.createElement("canvas")
				canvas.width = viewport.width
				canvas.height = viewport.height

				await page.render({
					canvas,
					viewport,
				}).promise

				canvas.toBlob((blob) => {
					if (blob) {
						resolve(blob)
					} else {
						reject(new Error("Failed to convert canvas to blob"))
					}
				}, "image/png")
			} catch (error) {
				reject(error)
			}
		}

		reader.onerror = () => {
			reject(new Error("Failed to read PDF file"))
		}

		reader.readAsArrayBuffer(pdfFile)
	})
}

/**
 * Convert PDF to image and return as File object (keeps original filename, .pdf → .png)
 * @param {File} pdfFile - The PDF file to convert
 * @returns {Promise<File>} PNG File object
 */
export async function convertPdfToImageFile(pdfFile) {
	try {
		const blob = await convertPdfToImage(pdfFile, 1)
		const pngName = pdfFile.name.replace(/\.pdf$/i, ".png")
		return new File([blob], pngName, {
			type: "image/png",
		})
	} catch (error) {
		throw new Error(`PDF conversion failed: ${error.message}`)
	}
}
