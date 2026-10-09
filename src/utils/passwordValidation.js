export const PASSWORD_MIN_LENGTH = 6
export const PASSWORD_SPECIAL_CHARACTER_EXAMPLE = "! @ # $ % ^ & *"

export function getPasswordRequirements(password = "") {
	return {
		hasMinLength: password.length >= PASSWORD_MIN_LENGTH,
		hasCapital: /[A-Z]/.test(password),
		hasNumber: /[0-9]/.test(password),
		hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
	}
}

export function isPasswordStrong(password) {
	return Object.values(getPasswordRequirements(password)).every(Boolean)
}
