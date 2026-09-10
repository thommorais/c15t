export const updateCssVariable = (name: string, value: string): void => {
	if (typeof document !== 'undefined') {
		// Check if we're running in the browser
		document.documentElement.style.setProperty(`--${name}`, value)
	}
}
