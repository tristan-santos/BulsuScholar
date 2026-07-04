import { createCipheriv, randomBytes } from "node:crypto"

export const GRANTOR_DEFAULT_PASSWORD = "Grantor@123"

export function encryptPasswordAES256Node(plainPassword, secret) {
	const key = Buffer.from(String(secret || "").padEnd(32).slice(0, 32), "utf8")
	const iv = randomBytes(12)
	const cipher = createCipheriv("aes-256-gcm", key, iv)
	const encrypted = Buffer.concat([cipher.update(String(plainPassword), "utf8"), cipher.final()])
	const tag = cipher.getAuthTag()
	return Buffer.concat([iv, encrypted, tag]).toString("base64")
}

/**
 * Reset one grantor password in Supabase (Node/scripts).
 * Encryption matches src/services/authService.js in the browser.
 */
export async function resetGrantorPasswordInDatabase(
	supabase,
	grantorId,
	{ plainPassword = GRANTOR_DEFAULT_PASSWORD, secret, mustChangePassword = true, resetBy = "script" } = {},
) {
	const id = String(grantorId || "").trim()
	if (!id) {
		throw new Error("Grantor User ID is required.")
	}

	const { data: existing, error: readError } = await supabase
		.from("providers")
		.select("id,data")
		.eq("id", id)
		.maybeSingle()

	if (readError) {
		throw new Error(`${id}: read failed - ${readError.message}`)
	}

	if (!existing) {
		throw new Error(`${id}: provider row not found. Seed the grantor first.`)
	}

	const encryptedPassword = encryptPasswordAES256Node(plainPassword, secret)
	const passwordUpdatedAt = new Date().toISOString()
	const nextData = {
		...(existing.data || {}),
		password: encryptedPassword,
		mustChangePassword,
		passwordUpdatedAt,
		passwordResetBy: resetBy,
		role: existing.data?.role || "provider",
		userType: existing.data?.userType || "provider",
	}

	const { error: writeError } = await supabase.from("providers").upsert({
		id,
		data: nextData,
		updated_at: passwordUpdatedAt,
	})

	if (writeError) {
		throw new Error(`${id}: update failed - ${writeError.message}`)
	}

	return {
		grantorId: id,
		providerName: nextData.providerName || nextData.name || id,
		mustChangePassword,
		passwordUpdatedAt,
		plainPassword,
	}
}
