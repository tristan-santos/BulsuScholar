import { HiOutlineMoon, HiOutlineSun } from "react-icons/hi"

export default function ThemeToggle({ theme, setTheme, compact = false, className = "" }) {
	const isDark = theme === "dark"
	const label = isDark ? "Dark mode" : "Light mode"

	return (
		<button
			type="button"
			className={`portal-theme-toggle${compact ? " portal-theme-toggle--compact" : ""}${className ? ` ${className}` : ""}`}
			role="switch"
			aria-checked={isDark}
			aria-label={`${label}. Switch to ${isDark ? "light" : "dark"} mode.`}
			title={`Switch to ${isDark ? "light" : "dark"} mode`}
			onClick={() => setTheme(isDark ? "light" : "dark")}
		>
			<span className="portal-theme-toggle__track" aria-hidden="true">
				<span className="portal-theme-toggle__thumb">{isDark ? <HiOutlineMoon /> : <HiOutlineSun />}</span>
			</span>
			<span className="portal-theme-toggle__label">{label}</span>
		</button>
	)
}
