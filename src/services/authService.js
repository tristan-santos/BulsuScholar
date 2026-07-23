/**
 * Authentication service for encrypting and decrypting passwords
 */

const PRIMARY_SECRET =
	import.meta.env.VITE_PASSWORD_SECRET ||
	"bulsuscholar-default-secret-key-32!!!"
const LEGACY_SECRETS = String(import.meta.env.VITE_PASSWORD_LEGACY_SECRETS || "")
	.split(",")
	.map((secret) => secret.trim())
	.filter(Boolean)
const PASSWORD_SECRETS = Array.from(new Set([PRIMARY_SECRET, ...LEGACY_SECRETS]))

function bytesToBase64(bytes) {
	let binary = ""
	for (let i = 0; i < bytes.byteLength; i += 1) {
		binary += String.fromCharCode(bytes[i])
	}
	return btoa(binary)
}

function base64ToBytes(base64) {
	const binary = atob(base64)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i)
	}
	return bytes
}

/**
 * Encrypts a password using AES-256-GCM
 * @param {string} plainPassword - The plain text password to encrypt
 * @returns {Promise<string>} - The encrypted password as a base64 string
 */
export async function encryptPasswordAES256(plainPassword) {
	if (!plainPassword) return ""

	const enc = new TextEncoder()
	const keyBytes = enc.encode(PRIMARY_SECRET.padEnd(32).slice(0, 32))

	const cryptoKey = await window.crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: "AES-GCM" },
		false,
		["encrypt"],
	)

	const iv = window.crypto.getRandomValues(new Uint8Array(12))
	const cipherBuffer = await window.crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		cryptoKey,
		enc.encode(plainPassword),
	)

	const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength)
	combined.set(iv, 0)
	combined.set(new Uint8Array(cipherBuffer), iv.byteLength)

	return bytesToBase64(combined)
}

/**
 * Decrypts a password that was encrypted with AES-256-GCM
 * @param {string} encryptedPassword - The encrypted password as a base64 string
 * @returns {Promise<string>} - The decrypted plain text password
 */
export async function decryptPasswordAES256(encryptedPassword) {
	if (!encryptedPassword) return ""

	let combined
	try {
		combined = base64ToBytes(encryptedPassword)
	} catch {
		console.warn("Password decryption failed. Stored password is not valid encrypted data.")
		return ""
	}

	const iv = combined.slice(0, 12)
	const cipherBuffer = combined.slice(12)
	const enc = new TextEncoder()

	for (const secret of PASSWORD_SECRETS) {
		try {
			const keyBytes = enc.encode(secret.padEnd(32).slice(0, 32))

			const cryptoKey = await window.crypto.subtle.importKey(
				"raw",
				keyBytes,
				{ name: "AES-GCM" },
				false,
				["decrypt"],
			)

			const decrypted = await window.crypto.subtle.decrypt(
				{ name: "AES-GCM", iv },
				cryptoKey,
				cipherBuffer,
			)

			const dec = new TextDecoder()
			return dec.decode(decrypted)
		} catch {
			// Try the next configured secret. AES-GCM throws when the key does not match.
		}
	}

	console.warn(
		"Password decryption failed. Check that VITE_PASSWORD_SECRET in Vercel matches the secret used when this account password was saved.",
	)
	return ""
}

/**
 * Legacy alias retained for older imports.
 * @param {string} encryptedPassword
 * @returns {Promise<string>}
 */
export async function decryptPasswordAES256Legacy(encryptedPassword) {
	try {
		return await decryptPasswordAES256(encryptedPassword)
	} catch (error) {
		console.error("Password decryption failed:", error)
		return ""
	}
}

/**
 * Verifies a plain text password against an encrypted password
 * @param {string} plainPassword - The plain text password to verify
 * @param {string} encryptedPassword - The encrypted password to compare against
 * @returns {Promise<boolean>} - True if passwords match, false otherwise
 */
export async function verifyPassword(plainPassword, encryptedPassword) {
	if (!plainPassword || !encryptedPassword) return false
	const decryptedPassword = await decryptPasswordAES256(encryptedPassword)
	return plainPassword === decryptedPassword
}
