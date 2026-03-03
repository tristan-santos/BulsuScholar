/**
 * Authentication service for encrypting and decrypting passwords
 */

const SECRET =
	import.meta.env.VITE_PASSWORD_SECRET ||
	"bulsuscholar-default-secret-key-32!!!"

/**
 * Encrypts a password using AES-256-GCM
 * @param {string} plainPassword - The plain text password to encrypt
 * @returns {Promise<string>} - The encrypted password as a base64 string
 */
export async function encryptPasswordAES256(plainPassword) {
	if (!plainPassword) return ""

	const enc = new TextEncoder()
	const keyBytes = enc.encode(SECRET.padEnd(32).slice(0, 32))

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

	let binary = ""
	for (let i = 0; i < combined.byteLength; i += 1) {
		binary += String.fromCharCode(combined[i])
	}
	return btoa(binary)
}

/**
 * Decrypts a password that was encrypted with AES-256-GCM
 * @param {string} encryptedPassword - The encrypted password as a base64 string
 * @returns {Promise<string>} - The decrypted plain text password
 */
export async function decryptPasswordAES256(encryptedPassword) {
	if (!encryptedPassword) return ""

	try {
		const binary = atob(encryptedPassword)
		const combined = new Uint8Array(binary.length)
		for (let i = 0; i < binary.length; i += 1) {
			combined[i] = binary.charCodeAt(i)
		}

		const iv = combined.slice(0, 12)
		const cipherBuffer = combined.slice(12)

		const enc = new TextEncoder()
		const keyBytes = enc.encode(SECRET.padEnd(32).slice(0, 32))

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
