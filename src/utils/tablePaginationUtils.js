const DEFAULT_PAGE_SIZE = 25

export const TABLE_PAGE_SIZE = DEFAULT_PAGE_SIZE

export function getTotalPages(totalItems = 0, pageSize = DEFAULT_PAGE_SIZE) {
	return Math.max(1, Math.ceil(Number(totalItems || 0) / pageSize) || 1)
}

export function clampPage(page = 1, totalPages = 1) {
	return Math.min(Math.max(Number(page || 1), 1), Math.max(1, Number(totalPages || 1)))
}

export function paginateRows(rows = [], page = 1, pageSize = DEFAULT_PAGE_SIZE) {
	const safeRows = Array.isArray(rows) ? rows : []
	const totalItems = safeRows.length
	const totalPages = getTotalPages(totalItems, pageSize)
	const currentPage = clampPage(page, totalPages)
	const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
	const endIndex = totalItems === 0 ? 0 : Math.min(currentPage * pageSize, totalItems)

	return {
		rows: safeRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
		currentPage,
		totalPages,
		totalItems,
		startIndex,
		endIndex,
	}
}
