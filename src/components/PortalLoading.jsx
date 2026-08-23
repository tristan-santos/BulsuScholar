import { HiOutlineRefresh } from "react-icons/hi"

export function LoadingSpinner({ label = "Loading", compact = false }) {
	return (
		<span className={`portal-loading-spinner ${compact ? "is-compact" : ""}`} role="status" aria-live="polite">
			<HiOutlineRefresh aria-hidden="true" />
			<span>{label}</span>
		</span>
	)
}

export function PageLoading({ label = "Loading BulsuScholar" }) {
	return (
		<main className="portal-page-loading" aria-busy="true" aria-label={label}>
			<div className="portal-page-loading__brand" aria-hidden="true">BS</div>
			<LoadingSpinner label={label} />
			<div className="portal-page-loading__skeleton" aria-hidden="true">
				<span />
				<span />
				<span />
			</div>
		</main>
	)
}

export function TableSkeleton({ rows = 5, columns = 5, label = "Loading records" }) {
	return (
		<div className="portal-table-skeleton" role="status" aria-busy="true" aria-label={label}>
			{Array.from({ length: rows }, (_, rowIndex) => (
				<div className="portal-table-skeleton__row" key={rowIndex}>
					{Array.from({ length: columns }, (_, columnIndex) => (
						<span key={columnIndex} style={{ "--skeleton-width": `${58 + ((rowIndex + columnIndex) % 4) * 10}%` }} />
					))}
				</div>
			))}
		</div>
	)
}

export function CardSkeleton({ count = 3, label = "Loading content" }) {
	return (
		<div className="portal-card-skeleton-grid" role="status" aria-busy="true" aria-label={label}>
			{Array.from({ length: count }, (_, index) => (
				<div className="portal-card-skeleton" key={index} aria-hidden="true">
					<span className="portal-card-skeleton__media" />
					<span />
					<span />
					<span className="portal-card-skeleton__short" />
				</div>
			))}
		</div>
	)
}
