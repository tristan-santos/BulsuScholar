import {
	GRANTOR_DEFAULT_PASSWORD,
	grantorMustChangePassword,
} from "../constants/grantorAuth"
import { encryptPasswordAES256 } from "./authService"
import { getRecord, upsertProvider } from "./supabaseDataService"

/**
 * Reset a single grantor account password (default: Grantor@123).
 * Uses the same AES-256-GCM encryption as login verification.
 *
 * Intended for future admin tooling — not wired into the UI yet.
 *
 * @param {string} grantorId - Provider/grantor User ID (e.g. grantor_tina)
 * @param {object} [options]
 * @param {string} [options.password] - Plain password to set (default: GRANTOR_DEFAULT_PASSWORD)
 * @param {boolean} [options.mustChangePassword] - Force change-password flow on next login (default: true)
 * @returns {Promise<{ grantorId: string, providerName: string, mustChangePassword: boolean, passwordUpdatedAt: string }>}
 */
export async function resetGrantorPasswordToDefault(grantorId, options = {}) {
	const id = String(grantorId || "").trim()
	if (!id) {
		throw new Error("Grantor User ID is required.")
	}

	const plainPassword = options.password ?? GRANTOR_DEFAULT_PASSWORD
	const mustChangePassword = options.mustChangePassword ?? true

	const existing = await getRecord("providers", id)
	if (!existing) {
		throw new Error(`Grantor not found: ${id}`)
	}

	const encryptedPassword = await encryptPasswordAES256(plainPassword)
	const passwordUpdatedAt = new Date().toISOString()

	await upsertProvider(
		id,
		{
			password: encryptedPassword,
			mustChangePassword,
			passwordUpdatedAt,
			passwordResetBy: options.resetBy || "system",
		},
		{ merge: true },
	)

	return {
		grantorId: id,
		providerName: existing.providerName || existing.name || id,
		mustChangePassword,
		passwordUpdatedAt,
	}
}

/**
 * Read-only helper for future admin views.
 */
export function getGrantorPasswordStatus(provider = {}) {
	return {
		mustChangePassword: grantorMustChangePassword(provider),
		passwordUpdatedAt: provider.passwordUpdatedAt || null,
		passwordResetBy: provider.passwordResetBy || null,
	}
}
