/**
 * Imgur Upload Utility
 * Handles image uploads to Imgur (free image hosting).
 *
 * Setup:
 * 1. Register an application at https://api.imgur.com/oauth2/addclient
 * 2. Choose "Anonymous" for authorization type
 * 3. Copy your Client ID
 * 4. Add to .env: VITE_IMGUR_CLIENT_ID=your_client_id
 */

export async function uploadToImgur(file) {
	const clientId = import.meta.env.VITE_IMGUR_CLIENT_KEY

	if (!clientId || clientId === "your_imgur_client_id_here") {
		throw new Error(
			"Imgur Client ID not configured. Please set VITE_IMGUR_CLIENT_KEY in .env file.",
		)
	}

	// Convert file to base64
	const base64Promise = new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result.split(",")[1]) // Remove data URL prefix
		reader.onerror = reject
		reader.readAsDataURL(file)
	})

	const base64Data = await base64Promise

	try {
		const response = await fetch("https://api.imgur.com/3/image", {
			method: "POST",
			headers: {
				Authorization: `Client-ID ${clientId}`,
			},
			body: JSON.stringify({
				image: base64Data,
				type: "base64",
				title: file.name,
			}),
		})

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}))
			throw new Error(
				errorData.data?.error || `Imgur upload failed: ${response.status}`,
			)
		}

		const data = await response.json()

		if (!data.success) {
			throw new Error(data.data?.error || "Imgur upload failed")
		}

		// Return the direct image URL and metadata
		return {
			url: data.data.link,
			deleteHash: data.data.deletehash,
			id: data.data.id,
			name: file.name,
			type: file.type,
			size: file.size,
		}
	} catch (error) {
		console.error("Imgur upload error:", error)
		throw error
	}
}
