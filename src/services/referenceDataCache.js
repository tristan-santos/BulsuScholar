const cache = new Map()
const DEFAULT_TTL_MS = 30_000

export async function getCachedReferenceData(key, loader, ttlMs = DEFAULT_TTL_MS) {
	const now = Date.now()
	const cached = cache.get(key)
	if (cached?.value && cached.expiresAt > now) return cached.value
	if (cached?.promise) return cached.promise

	const promise = Promise.resolve()
		.then(loader)
		.then((value) => {
			cache.set(key, { value, expiresAt: Date.now() + ttlMs })
			return value
		})
		.catch((error) => {
			cache.delete(key)
			throw error
		})
	cache.set(key, { promise, expiresAt: now + ttlMs })
	return promise
}

export function invalidateReferenceData(prefix = "") {
	if (!prefix) {
		cache.clear()
		return
	}
	for (const key of cache.keys()) {
		if (key.startsWith(prefix)) cache.delete(key)
	}
}
