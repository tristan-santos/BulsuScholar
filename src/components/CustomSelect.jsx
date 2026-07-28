import { useEffect, useMemo, useRef, useState } from "react"

function normalizeOption(option) {
	if (option && typeof option === "object") {
		return {
			value: String(option.value ?? ""),
			label: String(option.label ?? option.value ?? ""),
			disabled: Boolean(option.disabled),
		}
	}
	return {
		value: String(option ?? ""),
		label: String(option ?? ""),
		disabled: false,
	}
}

export default function CustomSelect({
	id,
	value = "",
	onChange,
	options = [],
	placeholder = "Select an option",
	disabled = false,
	className = "",
	buttonClassName = "",
	menuClassName = "",
	ariaLabel = "",
}) {
	const [open, setOpen] = useState(false)
	const rootRef = useRef(null)
	const buttonRef = useRef(null)
	const normalizedOptions = useMemo(() => options.map(normalizeOption), [options])
	const selectedValue = String(value ?? "")
	const selectedOption = normalizedOptions.find((option) => option.value === selectedValue)
	const displayLabel = selectedOption?.label || placeholder
	const isDisabled = disabled || normalizedOptions.length === 0

	useEffect(() => {
		if (!open) return undefined
		const handlePointerDown = (event) => {
			if (!rootRef.current?.contains(event.target)) setOpen(false)
		}
		const handleKeyDown = (event) => {
			if (event.key === "Escape") {
				setOpen(false)
				buttonRef.current?.focus()
			}
		}
		document.addEventListener("mousedown", handlePointerDown)
		document.addEventListener("touchstart", handlePointerDown)
		document.addEventListener("keydown", handleKeyDown)
		return () => {
			document.removeEventListener("mousedown", handlePointerDown)
			document.removeEventListener("touchstart", handlePointerDown)
			document.removeEventListener("keydown", handleKeyDown)
		}
	}, [open])

	useEffect(() => {
		if (isDisabled) setOpen(false)
	}, [isDisabled])

	const selectOption = (option) => {
		if (option.disabled) return
		onChange?.(option.value)
		setOpen(false)
		buttonRef.current?.focus()
	}

	const handleButtonKeyDown = (event) => {
		if (isDisabled) return
		if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
			event.preventDefault()
			setOpen(true)
		}
	}

	const handleOptionKeyDown = (event, option, index) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault()
			selectOption(option)
			return
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault()
			const direction = event.key === "ArrowDown" ? 1 : -1
			const nextIndex = (index + direction + normalizedOptions.length) % normalizedOptions.length
			rootRef.current?.querySelectorAll("[data-custom-select-option]")?.[nextIndex]?.focus()
		}
	}

	return (
		<div ref={rootRef} className={`custom-select ${open ? "custom-select--open" : ""} ${className}`}>
			<button
				ref={buttonRef}
				id={id}
				type="button"
				className={`custom-select__button ${buttonClassName}`}
				disabled={isDisabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={ariaLabel || placeholder}
				onClick={() => setOpen((current) => !current)}
				onKeyDown={handleButtonKeyDown}
			>
				<span className={`custom-select__value ${selectedOption ? "" : "custom-select__value--placeholder"}`}>
					{displayLabel}
				</span>
			</button>
			{open ? (
				<div className={`custom-select__menu ${menuClassName}`} role="listbox" aria-labelledby={id}>
					{normalizedOptions.map((option, index) => (
						<button
							key={`${option.value}_${index}`}
							type="button"
							className={`custom-select__option ${option.value === selectedValue ? "is-selected" : ""}`}
							role="option"
							aria-selected={option.value === selectedValue}
							disabled={option.disabled}
							data-custom-select-option
							onClick={() => selectOption(option)}
							onKeyDown={(event) => handleOptionKeyDown(event, option, index)}
						>
							{option.label}
						</button>
					))}
				</div>
			) : null}
		</div>
	)
}
