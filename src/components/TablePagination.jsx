import { TABLE_PAGE_SIZE, getTotalPages } from "../utils/tablePaginationUtils"

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

export default function TablePagination({
	currentPage = 1,
	totalItems = 0,
	pageSize = TABLE_PAGE_SIZE,
	onPageChange,
}) {
	const totalPages = getTotalPages(totalItems, pageSize)
	if (totalItems <= 0 || totalPages <= 1) return null

	const safeCurrentPage = Math.min(Math.max(Number(currentPage || 1), 1), totalPages)
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
