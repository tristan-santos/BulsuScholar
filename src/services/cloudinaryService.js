/**
 * Cloudinary Upload Utility
 * Handles image uploads to Cloudinary (free tier available).
 *
 * Setup:
 * 1. Sign up at https://cloudinary.com/users/register_free
 * 2. Go to Settings (gear icon) > Upload > Upload presets
 * 3. Click "Add upload preset"
 * 4. Under "Signing Mode" select "Unsigned"
 * 5. Save and copy the "Name" (e.g., "ml_default")
 * 6. Add to .env:
 *    - VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
 *    - VITE_CLOUDINARY_UPLOAD_PRESET=your_preset_name
 */

export async function uploadToCloudinary(file) {
	const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
	const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

	if (!cloudName || !uploadPreset) {
		throw new Error(
			"Cloudinary not configured. Please set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in .env file.",
		)
	}

	const formData = new FormData()
	formData.append("file", file)
	formData.append("upload_preset", uploadPreset)
	formData.append(
		"public_id",
		`bulsuscholar_${Date.now()}_${file.name.replace(/\.[^/.]+$/, "")}`,
	)

	try {
		const response = await fetch(
			`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
			{
				method: "POST",
				body: formData,
			},
		)

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}))
			throw new Error(
				errorData.error?.message ||
					`Cloudinary upload failed: ${response.status}`,
			)
		}

		const data = await response.json()

		// Return the image URL and metadata
		return {
			url: data.secure_url,
			publicId: data.public_id,
			format: data.format,
			width: data.width,
			height: data.height,
			bytes: data.bytes,
			name: file.name,
			type: file.type,
			size: file.size,
		}
	} catch (error) {
		console.error("Cloudinary upload error:", error)
		throw error
	}
}
