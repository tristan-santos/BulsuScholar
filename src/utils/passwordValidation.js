export function isPasswordStrong(password) {
	return (
		password.length >= 6 &&
		/[A-Z]/.test(password) &&
		/[0-9]/.test(password) &&
		/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)
	)
}
