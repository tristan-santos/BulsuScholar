import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

function readEnvFile(path) {
	try {
		return readFileSync(path, "utf8")
	} catch {
		return ""
	}
}

function parseEnv(contents) {
	const env = {}
	for (const line of contents.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith("#")) continue

		const separator = trimmed.indexOf("=")
		if (separator === -1) continue

		const key = trimmed.slice(0, separator).trim()
		const rawValue = trimmed.slice(separator + 1).trim()
		env[key] = rawValue.replace(/^['"]|['"]$/g, "")
	}
	return env
}

const env = {
	...parseEnv(readEnvFile(resolve(".env"))),
	...process.env,
}

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
const storageBucket = env.VITE_SUPABASE_STORAGE_BUCKET || "bulsuscholar"

if (!supabaseUrl || !supabaseAnonKey) {
	console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.")
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		persistSession: false,
		autoRefreshToken: false,
	},
})

const startedAt = Date.now()
const tables = [
	"admins",
	"students",
	"pending_students",
	"soe_requests",
	"soe_downloads",
	"announcements",
	"providers",
	"grantor_portals",
	"scholarship_applications",
	"student_warnings",
	"grantor_portal_scholars",
	"grantor_portal_applications",
	"grantor_portal_announcements",
	"studentNotifications",
	"grantorNotifications",
	"student_document_usage",
	"systemLogs",
]

const failures = []
for (const table of tables) {
	const { error, count } = await supabase.from(table).select("id", {
		count: "exact",
		head: true,
	})

	if (error) {
		failures.push({ table, error })
	} else {
		console.log(`${table}: reachable (${count ?? 0} rows)`)
	}
}

if (failures.length > 0) {
	console.error("Supabase connection check failed.")
	for (const failure of failures) {
		console.error(`${failure.table}: ${failure.error.code || "ERROR"}: ${failure.error.message}`)
	}
	process.exit(1)
}

const smokeId = `supabase_verify_${Date.now()}`
const smokePayload = {
	id: smokeId,
	data: {
		kind: "verification",
		createdBy: "scripts/verify-supabase.mjs",
		createdAt: new Date().toISOString(),
	},
	updated_at: new Date().toISOString(),
}

const { error: writeError } = await supabase.from("student_warnings").upsert(smokePayload)
if (writeError) {
	console.error("Supabase write smoke test failed.")
	console.error(`student_warnings: ${writeError.code || "ERROR"}: ${writeError.message}`)
	process.exit(1)
}

const { data: smokeRow, error: readBackError } = await supabase
	.from("student_warnings")
	.select("id")
	.eq("id", smokeId)
	.maybeSingle()
if (readBackError || !smokeRow) {
	console.error("Supabase read-after-write smoke test failed.")
	if (readBackError) console.error(`student_warnings: ${readBackError.code || "ERROR"}: ${readBackError.message}`)
	process.exit(1)
}

const { error: deleteError } = await supabase.from("student_warnings").delete().eq("id", smokeId)
if (deleteError) {
	console.error("Supabase cleanup smoke test failed.")
	console.error(`student_warnings: ${deleteError.code || "ERROR"}: ${deleteError.message}`)
	process.exit(1)
}
console.log("student_warnings: write/read/delete smoke test passed")

const storagePath = `verification/${smokeId}.png`
const storageBody = new Blob(
	[
		new Uint8Array([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
			0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
			0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
			0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
			0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
			0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
		]),
	],
	{ type: "image/png" },
)
const { error: uploadError } = await supabase.storage.from(storageBucket).upload(storagePath, storageBody, {
	contentType: "image/png",
	upsert: false,
})
if (uploadError) {
	console.error("Supabase storage upload smoke test failed.")
	console.error(`${storageBucket}: ${uploadError.statusCode || "ERROR"}: ${uploadError.message}`)
	process.exit(1)
}

const { data: publicUrlData } = supabase.storage.from(storageBucket).getPublicUrl(storagePath)
if (!publicUrlData?.publicUrl) {
	console.error("Supabase storage public URL smoke test failed.")
	process.exit(1)
}

const { error: removeError } = await supabase.storage.from(storageBucket).remove([storagePath])
if (removeError) {
	console.error("Supabase storage cleanup smoke test failed.")
	console.error(`${storageBucket}: ${removeError.statusCode || "ERROR"}: ${removeError.message}`)
	process.exit(1)
}
console.log(`${storageBucket}: upload/public-url/delete smoke test passed`)

console.log(`Supabase connection verified in ${Date.now() - startedAt}ms.`)
