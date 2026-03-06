import { useEffect, useState } from "react"

const THEME_KEY = "bulsuscholar_theme"

function getInitialTheme() {
	const stored = localStorage.getItem(THEME_KEY)
	if (stored === "light" || stored === "dark") return stored
	return "light"
}

export default function useThemeMode() {
	const [theme, setTheme] = useState(getInitialTheme)

	useEffect(() => {
		localStorage.setItem(THEME_KEY, theme)
		document.documentElement.setAttribute("data-theme", theme)
	}, [theme])

	return { theme, setTheme }
}

