import { useEffect, useMemo, useRef, useState } from "react"
import { HiOutlineCalendar, HiOutlineChevronLeft, HiOutlineChevronRight } from "react-icons/hi"
import CustomSelect from "./CustomSelect"

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

function parseIsoDate(value) {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""))
	if (!match) return null
	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
	return Number.isNaN(date.getTime()) ? null : date
}

function toIsoDate(date) {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

function displayDate(value) {
	const date = parseIsoDate(value)
	if (!date) return "DD MM YYYY"
	return `${String(date.getDate()).padStart(2, "0")} ${String(date.getMonth() + 1).padStart(2, "0")} ${date.getFullYear()}`
}

export default function StudentDatePicker({ value, onChange, id = "student-profile-birth-date" }) {
	const selected = parseIsoDate(value)
	const today = useMemo(() => {
		const current = new Date()
		return new Date(current.getFullYear(), current.getMonth(), current.getDate())
	}, [])
	const [open, setOpen] = useState(false)
	const [viewDate, setViewDate] = useState(() => selected || new Date(today.getFullYear() - 18, today.getMonth(), 1))
	const rootRef = useRef(null)

	useEffect(() => {
		if (!open) return undefined
		const close = (event) => {
			if (event.key === "Escape") setOpen(false)
			if (event.type === "mousedown" && !rootRef.current?.contains(event.target)) setOpen(false)
		}
		document.addEventListener("keydown", close)
		document.addEventListener("mousedown", close)
		return () => {
			document.removeEventListener("keydown", close)
			document.removeEventListener("mousedown", close)
		}
	}, [open])

	const days = useMemo(() => {
		const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
		const count = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()
		return [...Array(first.getDay()).fill(null), ...Array.from({ length: count }, (_, index) => new Date(viewDate.getFullYear(), viewDate.getMonth(), index + 1))]
	}, [viewDate])
	const years = useMemo(() => Array.from({ length: today.getFullYear() - 1899 }, (_, index) => today.getFullYear() - index), [today])
	const monthOptions = useMemo(() => MONTHS.map((month, index) => ({ value: String(index), label: month })), [])
	const yearOptions = useMemo(() => years.map((year) => ({ value: String(year), label: String(year) })), [years])
	const moveMonth = (amount) => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1))

	return (
		<div className="student-date-picker" ref={rootRef}>
			<button id={id} type="button" className="student-date-picker-trigger" onClick={() => {
				if (!open && selected) setViewDate(new Date(selected.getFullYear(), selected.getMonth(), 1))
				setOpen((current) => !current)
			}} aria-haspopup="dialog" aria-expanded={open}>
				<span className={value ? "" : "is-placeholder"}>{displayDate(value)}</span>
				<HiOutlineCalendar aria-hidden />
			</button>
			{open ? (
				<div className="student-date-picker-popover" role="dialog" aria-label="Choose date of birth">
					<div className="student-date-picker-head">
						<button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month"><HiOutlineChevronLeft /></button>
						<div className="student-date-picker-selects">
							<CustomSelect
								id={`${id}-month`}
								className="student-date-picker-select student-date-picker-select--month"
								buttonClassName="student-date-picker-select-button"
								value={String(viewDate.getMonth())}
								onChange={(month) => setViewDate(new Date(viewDate.getFullYear(), Number(month), 1))}
								options={monthOptions}
								ariaLabel="Birth month"
							/>
							<CustomSelect
								id={`${id}-year`}
								className="student-date-picker-select student-date-picker-select--year"
								buttonClassName="student-date-picker-select-button"
								value={String(viewDate.getFullYear())}
								onChange={(year) => setViewDate(new Date(Number(year), viewDate.getMonth(), 1))}
								options={yearOptions}
								ariaLabel="Birth year"
							/>
						</div>
						<button type="button" onClick={() => moveMonth(1)} disabled={viewDate.getFullYear() === today.getFullYear() && viewDate.getMonth() >= today.getMonth()} aria-label="Next month"><HiOutlineChevronRight /></button>
					</div>
					<div className="student-date-picker-weekdays" aria-hidden>{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
					<div className="student-date-picker-grid">
						{days.map((date, index) => date ? (
							<button
								type="button"
								key={toIsoDate(date)}
								className={toIsoDate(date) === value ? "is-selected" : ""}
								disabled={date > today}
								onClick={() => { onChange(toIsoDate(date)); setOpen(false) }}
							>
								{date.getDate()}
							</button>
						) : <span key={`empty-${index}`} />)}
					</div>
				</div>
			) : null}
		</div>
	)
}
