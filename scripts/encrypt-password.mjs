#!/usr/bin/env node
/**
 * Generate AES-256-GCM password hash matching src/services/authService.js
 *
 * Usage:
 *   node scripts/encrypt-password.mjs "Grantor@123"
 *
 * Uses VITE_PASSWORD_SECRET from .env when present, otherwise the app default.
 */

import { readFileSync } from "node:fs"
import { createCipheriv, randomBytes } from "node:crypto"
import { resolve } from "node:path"

function readSecret() {
	const defaultSecret = "bulsuscholar-default-secret-key-32!!!"
	try {
		const envText = readFileSync(resolve(".env"), "utf8")
		for (const line of envText.split(/\r?\n/)) {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith("#")) continue
			if (!trimmed.startsWith("VITE_PASSWORD_SECRET=")) continue
			const value = trimmed.slice("VITE_PASSWORD_SECRET=".length).trim()
			return value.replace(/^['"]|['"]$/g, "") || defaultSecret
		}
	} catch {
		// use default
	}
	return defaultSecret
}

function encryptPasswordAES256(plainPassword, secret) {
	const key = Buffer.from(secret.padEnd(32).slice(0, 32), "utf8")
	const iv = randomBytes(12)
	const cipher = createCipheriv("aes-256-gcm", key, iv)
	const encrypted = Buffer.concat([cipher.update(plainPassword, "utf8"), cipher.final()])
	const tag = cipher.getAuthTag()
	return Buffer.concat([iv, encrypted, tag]).toString("base64")
}

const plainPassword = process.argv[2] || "Grantor@123"
const secret = readSecret()
const encrypted = encryptPasswordAES256(plainPassword, secret)

console.log(`Plain:     ${plainPassword}`)
console.log(`Encrypted: ${encrypted}`)
console.log("")
console.log("SQL snippet:")
console.log(
	`UPDATE providers SET data = jsonb_set(data, '{password}', to_jsonb('${encrypted}'::text), true), updated_at = now() WHERE id IN ('grantor_tina', 'grantor_kuya_win');`,
)
