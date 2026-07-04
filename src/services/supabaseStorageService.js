import { supabase } from "./supabaseClient"

const DEFAULT_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "bulsuscholar"

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
	if (error) throw error

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
