const frontendUrl = String(process.env.FRONTEND_URL || process.env.VITE_APP_URL || "https://bulsu-scholar.vercel.app").replace(/\/$/, "")
const backendUrl = String(process.env.BACKEND_URL || process.env.VITE_BACKEND_API_URL || "https://bulsuscholar.onrender.com").replace(/\/$/, "")

const requiredFrontend = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_BACKEND_API_URL", "VITE_APP_URL"]
const missing = requiredFrontend.filter((key) => !process.env[key])
if (missing.length) {
	console.warn(`Environment note: ${missing.join(", ")} are not loaded in this shell. Confirm them in Vercel.`)
}

async function check(path) {
	const response = await fetch(`${backendUrl}${path}`, { signal: AbortSignal.timeout(20_000) })
	if (!response.ok) throw new Error(`${path} returned ${response.status}`)
	return response.json()
}

async function verifyCors() {
	const response = await fetch(`${backendUrl}/health`, {
		method: "OPTIONS",
		headers: {
			Origin: frontendUrl,
			"Access-Control-Request-Method": "GET",
		},
		signal: AbortSignal.timeout(20_000),
	})
	const allowedOrigin = response.headers.get("access-control-allow-origin")
	if (allowedOrigin !== frontendUrl && allowedOrigin !== "*") {
		throw new Error(`CORS did not allow ${frontendUrl}; received ${allowedOrigin || "no origin header"}`)
	}
}

try {
	for (const path of ["/health", "/deployment/health", "/scan-document/health", "/email/health"]) {
		await check(path)
		console.log(`PASS ${path}`)
	}
	await verifyCors()
	console.log(`PASS CORS ${frontendUrl}`)
	console.log(`Deployment verification passed for ${backendUrl}.`)
} catch (error) {
	console.error(`Deployment verification failed: ${error.message}`)
	process.exitCode = 1
}
