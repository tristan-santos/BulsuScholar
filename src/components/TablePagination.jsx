const DEFAULT_PAGE_SIZE = 25

function buildPageItems(currentPage, totalPages) {
	if (totalPages <= 6) {
		return Array.from({ length: totalPages }, (_, index) => index + 1)
	}

	if (currentPage <= 4) {
		return [1, 2, 3, 4, "ellipsis", totalPages]
	}

	if (currentPage >= totalPages - 3) {
		return [1, "ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
	}

	return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages]
}

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

export default function TablePagination({
	currentPage = 1,
	totalItems = 0,
	pageSize = DEFAULT_PAGE_SIZE,
	onPageChange,
}) {
	const totalPages = getTotalPages(totalItems, pageSize)
	if (totalItems <= 0 || totalPages <= 1) return null

	const safeCurrentPage = clampPage(currentPage, totalPages)
	const startIndex = (safeCurrentPage - 1) * pageSize + 1
	const endIndex = Math.min(safeCurrentPage * pageSize, totalItems)
	const pageItems = buildPageItems(safeCurrentPage, totalPages)

	return (
		<div className="admin-table-pagination">
			<span className="admin-table-pagination__meta">
				Showing {startIndex}-{endIndex} of {totalItems}
			</span>
			<div className="admin-table-pagination__actions" role="navigation" aria-label="Table pagination">
				<button
					type="button"
					className="admin-table-pagination__button"
					onClick={() => onPageChange?.(safeCurrentPage - 1)}
					disabled={safeCurrentPage <= 1}
				>
					Prev
				</button>
				<div className="admin-table-pagination__pages">
					{pageItems.map((item, index) =>
						item === "ellipsis" ? (
							<span key={`ellipsis_${index}`} className="admin-table-pagination__ellipsis" aria-hidden="true">
								...
							</span>
						) : (
							<button
								key={`page_${item}`}
								type="button"
								className={`admin-table-pagination__button ${
									safeCurrentPage === item ? "admin-table-pagination__button--active" : ""
								}`.trim()}
								onClick={() => onPageChange?.(item)}
								aria-current={safeCurrentPage === item ? "page" : undefined}
							>
								{item}
							</button>
						),
					)}
				</div>
				<button
					type="button"
					className="admin-table-pagination__button"
					onClick={() => onPageChange?.(safeCurrentPage + 1)}
					disabled={safeCurrentPage >= totalPages}
				>
					Next
				</button>
			</div>
		</div>
	)
}
