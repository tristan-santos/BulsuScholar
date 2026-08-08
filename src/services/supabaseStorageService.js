import { supabase } from "./supabaseClient"

const DEFAULT_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "bulsuscholar"

export function parseSupabaseStorageLocation(file = {}) {
	const bucket = file.bucket || DEFAULT_BUCKET
	const directPath = file.path || file.publicId || file.storagePath || ""
	if (directPath) return { bucket, path: directPath }

	const url = file.url || file.publicUrl || ""
	if (!url) return { bucket, path: "" }

	try {
		const parsedUrl = new URL(url)
		const marker = "/storage/v1/object/public/"
		const markerIndex = parsedUrl.pathname.indexOf(marker)
		if (markerIndex === -1) return { bucket, path: "" }

		const storagePath = parsedUrl.pathname.slice(markerIndex + marker.length)
		const [urlBucket, ...objectPathParts] = storagePath.split("/")
		return {
			bucket: decodeURIComponent(urlBucket || bucket),
			path: objectPathParts.map((segment) => decodeURIComponent(segment)).join("/"),
		}
	} catch {
		return { bucket, path: "" }
	}
}

export async function getStorageObjectBlob(file = {}) {
	const url = file.url || file.publicUrl || ""
	const normalizedUrl = normalizeStoragePublicUrl(url)
	if (normalizedUrl) {
		const response = await fetch(normalizedUrl)
		if (response.ok) return response.blob()
	}

	const { bucket, path } = parseSupabaseStorageLocation(file)
	if (!path) throw new Error("storage_path_missing")

	const { data, error } = await supabase.storage.from(bucket).download(path)
	if (error) throw error
	return data
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
