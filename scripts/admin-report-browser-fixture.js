// Isolated local browser fixture; this file is never imported by the application.
(() => {
	const originalFetch = window.fetch.bind(window)
	const fixtures = originalFetch('/test-results/admin-report-fixtures.json').then((response) => response.json())
	window.__reportRequests = []
	window.__failReportNext = false
	window.__reportDelay = 0
	window.__waitFor = async (check) => {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (check()) return
			await new Promise((resolve) => setTimeout(resolve, 50))
		}
		throw new Error('Timed out waiting for report UI')
	}
	window.__clickText = (text, selector = 'button') => {
		const element = [...document.querySelectorAll(selector)].find((item) => item.textContent.trim() === text)
		if (!element) throw new Error(`Missing control: ${text}`)
		element.click()
	}
	for (const storage of [localStorage, sessionStorage]) {
		storage.setItem('bulsuscholar_userId', 'report-admin')
		storage.setItem('bulsuscholar_userType', 'admin')
	}
	const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
	window.fetch = async (input, options = {}) => {
		const url = new URL(typeof input === 'string' ? input : input.url, location.href)
		if (url.origin === location.origin) return originalFetch(input, options)
		const data = await fixtures
		const payload = options.body ? JSON.parse(options.body) : {}
		if (url.pathname === '/auth/session') return json({ ok: true, actorId: 'report-admin', actorType: 'admin' })
		if (url.pathname === '/portal/data/query') {
			let rows = (data.tables[payload.table] || []).map((row) => ({ id: row.id, data: row }))
			if (payload.id) rows = rows.filter((row) => row.id === payload.id)
			return json({ ok: true, rows })
		}
		if (url.pathname.startsWith('/admin/reports/')) {
			if (url.pathname.endsWith('/history')) return json({ ok: true, history: [] })
			window.__reportRequests.push({ path: url.pathname, payload })
			if (window.__failReportNext) {
				window.__failReportNext = false
				return json({ detail: 'fixture_temporary_failure' }, 503)
			}
			const delay = window.__reportDelay
			if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
			if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
			const report = data.reports[`${payload.reportType}:${payload.dataset || 'all'}`]
			if (!report) return json({ detail: 'invalid_report_dataset' }, 422)
			if (Object.keys(payload.filters || {}).some((key) => ['view', 'grantorLabel'].includes(key))) return json({ detail: 'unsupported_report_filter' }, 422)
			if (url.pathname.endsWith('/preview')) return json(report.preview)
			const format = url.pathname.endsWith('/file-preview') ? 'pdf' : payload.format
			const content = Uint8Array.from(atob(report[format]), (character) => character.charCodeAt(0))
			return new Response(content, { status: 200, headers: {
				'content-type': format === 'pdf' ? 'application/pdf' : 'text/csv',
				'content-disposition': `attachment; filename="fixture-${payload.reportType}-${payload.dataset}.${format}"`,
			} })
		}
		return json({ ok: true, portal: { reportExportEnabled: true }, branding: {}, notifications: [], pendingAccounts: [], submissions: [] })
	}
})()
