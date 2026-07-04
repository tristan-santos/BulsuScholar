import { uploadToSupabaseStorage } from "./supabaseStorageService"

export async function uploadToStorage(file, options = {}) {
	return uploadToSupabaseStorage(file, options)
}
