import { supabase } from "./supabaseClient"

const DEFAULT_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "bulsuscholar"
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024
const DEFAULT_ALLOWED_MIME_TYPES = new Set([
	"application/pdf",
	"image/png",
	"image/jpeg",
	"image/webp",
	"text/csv",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.ms-excel.sheet.binary.macroenabled.12",
	"application/vnd.ms-excel.sheet.macroenabled.12",
])

function validateUpload(file, options = {}) {
	const maxSize = Number(options.maxSize || DEFAULT_MAX_FILE_SIZE)
	const allowedTypes = new Set(
		(options.allowedTypes || [...DEFAULT_ALLOWED_MIME_TYPES]).map((type) => String(type).toLowerCase()),
	)
	const fileType = String(file.type || "").toLowerCase()
	if (file.size > maxSize) {
		throw new Error(`file_too_large: Maximum upload size is ${Math.round(maxSize / 1024 / 1024)} MB.`)
	}
	if (!fileType || !allowedTypes.has(fileType)) {
		throw new Error(`unsupported_file_type: ${fileType || "unknown MIME type"}.`)
	}
}

function parsePublicStorageUrl(url = "", fallbackBucket = DEFAULT_BUCKET) {
	if (!url) return { bucket: fallbackBucket, path: "" }
	try {
		const parsedUrl = new URL(url)
		const marker = "/storage/v1/object/public/"
		const markerIndex = parsedUrl.pathname.indexOf(marker)
		if (markerIndex === -1) return { bucket: fallbackBucket, path: "" }

		const storagePath = parsedUrl.pathname.slice(markerIndex + marker.length)
		const [urlBucket, ...objectPathParts] = storagePath.split("/")
		return {
			bucket: decodeURIComponent(urlBucket || fallbackBucket),
			path: objectPathParts.map((segment) => decodeURIComponent(segment)).join("/"),
		}
	} catch {
		return { bucket: fallbackBucket, path: "" }
	}
}

export function parseSupabaseStorageLocation(file = {}) {
	const bucket = file.bucket || DEFAULT_BUCKET
	const directPath = file.path || file.publicId || file.storagePath || ""
	if (directPath) {
		const directText = String(directPath || "")
		if (/^https?:\/\//i.test(directText)) return parsePublicStorageUrl(directText, bucket)
		return { bucket, path: directText.replace(/^\/+/, "") }
	}

	const url = file.url || file.publicUrl || ""
	if (!url) return { bucket, path: "" }
	return parsePublicStorageUrl(url, bucket)
}

export async function getStorageObjectBlob(file = {}) {
	const url = file.url || file.publicUrl || ""
	const { bucket, path } = parseSupabaseStorageLocation(file)
	if (path) {
		const { data, error } = await supabase.storage.from(bucket).download(path)
		if (!error && data) return data
		if (error) throw error
	}

	const normalizedUrl = normalizeStoragePublicUrl(url)
	if (normalizedUrl) {
		const response = await fetch(normalizedUrl)
		if (response.ok) return response.blob()
		throw new Error(`preview_failed_${response.status}`)
	}

	throw new Error("storage_path_missing")
}

export function sanitizeDownloadFileName(fileName = "document.pdf", fallback = "document.pdf") {
	const withoutControlCharacters = [...String(fileName || fallback)]
		.map((character) => character.charCodeAt(0) < 32 ? "_" : character)
		.join("")
	const normalized = withoutControlCharacters
		.replace(/[<>:"/\\|?*]+/g, "_")
		.replace(/\s+/g, " ")
		.trim()
	return normalized || fallback
}

export async function validatePdfBlob(blob) {
	if (!(blob instanceof Blob) || blob.size < 5) {
		throw new Error("pdf_file_empty")
	}
	const signature = new TextDecoder("ascii").decode(
		new Uint8Array(await blob.slice(0, 5).arrayBuffer()),
	)
	if (signature !== "%PDF-") {
		throw new Error("invalid_pdf_file")
	}
	return blob
}

export function triggerBlobDownload(blob, fileName = "document.pdf") {
	if (!(blob instanceof Blob) || blob.size === 0) throw new Error("download_file_empty")
	const link = document.createElement("a")
	const url = URL.createObjectURL(blob)
	link.href = url
	link.download = sanitizeDownloadFileName(fileName)
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function downloadStorageObject(file = {}, options = {}) {
	const blob = await getStorageObjectBlob(file)
	if (options.validatePdf === true) await validatePdfBlob(blob)
	const fallbackName = options.validatePdf === true ? "document.pdf" : "document"
	const fileName = sanitizeDownloadFileName(
		options.fileName || file.name || file.fileName || fallbackName,
		fallbackName,
	)
	triggerBlobDownload(blob, fileName)
	return { blob, fileName }
}

export function getDocumentDownloadErrorMessage(error, label = "document") {
	const reason = String(error?.message || error || "").toLowerCase()
	if (reason.includes("invalid_pdf") || reason.includes("pdf_file_empty") || reason.includes("download_file_empty")) {
		return `The saved ${label} is empty or is not a valid PDF.`
	}
	if (reason.includes("storage_path_missing") || reason.includes("_missing") || reason.includes("404") || reason.includes("not found")) {
		return `The saved ${label} file could not be found.`
	}
	if (reason.includes("row-level security") || reason.includes("permission") || reason.includes("403") || reason.includes("unauthorized")) {
		return `Access to the saved ${label} was denied.`
	}
	if (reason.includes("failed to fetch") || reason.includes("network")) {
		return `The ${label} could not be downloaded because of a network error.`
	}
	return `Unable to download the ${label}. Please try again.`
}

export function normalizeStoragePublicUrl(url = "") {
	if (!url) return ""
	try {
		const parsedUrl = new URL(url)
		parsedUrl.pathname = parsedUrl.pathname
			.split("/")
			.map((segment) => encodeURIComponent(decodeURIComponent(segment)))
			.join("/")
		return parsedUrl.toString()
	} catch {
		return encodeURI(url)
	}
}

export async function uploadToSupabaseStorage(file, options = {}) {
	if (!file) throw new Error("No file provided for upload.")
	validateUpload(file, options)
	const bucket = options.bucket || DEFAULT_BUCKET
	const folder = options.folder || "uploads"
	const extension = file.name?.includes(".") ? file.name.split(".").pop() : "bin"
	const safeName = String(file.name || "upload")
		.replace(/\.[^/.]+$/, "")
		.replace(/[^a-zA-Z0-9_-]+/g, "_")
		.slice(0, 80)
	const path = `${folder}/${Date.now()}_${safeName}.${extension}`

	const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
		cacheControl: "3600",
		upsert: false,
		contentType: file.type || undefined,
	})
	if (error) {
		const message = String(error?.message || "")
		if (message.toLowerCase().includes("row-level security")) {
			throw new Error(
				"storage_policy_missing: Supabase Storage blocked the upload. Run supabase/storage-policies.sql for the bulsuscholar bucket.",
			)
		}
		throw error
	}

	const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(data.path)
	return {
		url: publicData.publicUrl,
		publicId: data.path,
		path: data.path,
		bucket,
		format: extension,
		name: file.name,
		type: file.type,
		size: file.size,
		bytes: file.size,
	}
}

export const uploadFile = uploadToSupabaseStorage
