/**
 * Payment Numpad Composable
 * Handles numeric keypad state, input, and keyboard support for payment dialog
 */

import { ref, computed, onMounted, onUnmounted } from "vue"

export function usePaymentNumpad(options = {}) {
	const numpadDisplay = ref("")

	const numpadValue = computed(() => {
		const val = Number.parseFloat(numpadDisplay.value)
		return Number.isNaN(val) ? 0 : val
	})

	/**
	 * Add a character to the numpad display
	 * @param {string} char - Character to add ('0'-'9', '.', '00')
	 */
	function numpadInput(char) {
		// Prevent multiple decimal points
		if (char === "." && numpadDisplay.value.includes(".")) {
			return
		}

		// Limit decimal places to 2
		if (numpadDisplay.value.includes(".")) {
			const [, decimal] = numpadDisplay.value.split(".")
			if (decimal && decimal.length >= 2) {
				return
			}
		}

		// Limit total length to reasonable amount
		if (numpadDisplay.value.length >= 10) {
			return
		}

		// Add the character
		numpadDisplay.value += char
	}

	/**
	 * Remove the last character from numpad display
	 */
	function numpadBackspace() {
		numpadDisplay.value = numpadDisplay.value.slice(0, -1)
	}

	/**
	 * Clear the numpad display
	 */
	function numpadClear() {
		numpadDisplay.value = ""
	}

	/**
	 * Set the numpad display to a specific value
	 * @param {number|string} value - Value to display
	 */
	function setNumpadValue(value) {
		if (typeof value === "number") {
			numpadDisplay.value = value.toFixed(2)
		} else {
			numpadDisplay.value = String(value)
		}
	}

	// Keyboard input handling
	//// Neoffice — Biome reformat only: the destructured options collapsed onto one line
	//// (458d81a9). No behaviour change; see the block just below for the merge instruction.
	//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
	const { isEnabled = ref(true), onEnter = null } = options

	/**
	 * Handle keyboard input for physical keyboard support
	 * @param {KeyboardEvent} event
	 */
	function handleKeyboardInput(event) {
		// Check if keyboard input is enabled (e.g., dialog is open)
		//// Neoffice — Biome formatter pass shipped with the de-branding commit: line reflow,
		//// double quotes, trailing commas, Number.parseInt over the global. No behaviour
		//// change anywhere in this file — at the next upstream merge take upstream's version
		//// wholesale and re-run the formatter, do not hand-merge these hunks
		//// (458d81a9, 2026-03-20 "remove BrainWise branding, add restaurant mode, and code
		//// formatting").
		const enabled =
			typeof isEnabled === "function" ? isEnabled() : isEnabled.value
		if (!enabled) return

		// Don't handle if user is typing in an input field
		const activeElement = document.activeElement
		//// Neoffice — same Biome pass (458d81a9): reflow only, no behaviour change.
		const isInInput =
			activeElement &&
			(activeElement.tagName === "INPUT" ||
				activeElement.tagName === "TEXTAREA" ||
				activeElement.isContentEditable)
		if (isInInput) return

		const key = event.key

		// Handle numeric keys (0-9)
		if (/^[0-9]$/.test(key)) {
			event.preventDefault()
			numpadInput(key)
			return
		}

		// Handle decimal point (. or ,)
		//// Neoffice — same Biome pass (458d81a9): reflow only, no behaviour change.
		if (key === "." || key === ",") {
			event.preventDefault()
			//// Neoffice — same Biome pass (458d81a9): reflow only, no behaviour change.
			numpadInput(".")
			return
		}

		// Handle backspace
		//// Neoffice — same Biome pass (458d81a9): reflow only, no behaviour change.
		if (key === "Backspace") {
			event.preventDefault()
			numpadBackspace()
			return
		}

		// Handle Delete or Escape to clear
		//// Neoffice — same Biome pass (458d81a9): reflow only, no behaviour change.
		if (key === "Delete" || key === "Escape") {
			event.preventDefault()
			numpadClear()
			return
		}

		// Handle Enter - call custom handler if provided
		//// Neoffice — same Biome pass (458d81a9): reflow only, no behaviour change.
		if (key === "Enter") {
			event.preventDefault()
			//// Neoffice — same Biome pass (458d81a9): reflow only, no behaviour change.
			if (onEnter && typeof onEnter === "function") {
				onEnter(numpadValue.value)
			}
			return
		}
	}

	// Set up keyboard event listeners
	onMounted(() => {
		//// Neoffice — same Biome pass (458d81a9): reflow only, no behaviour change.
		window.addEventListener("keydown", handleKeyboardInput)
	})

	onUnmounted(() => {
		//// Neoffice — same Biome pass (458d81a9): reflow only, no behaviour change.
		window.removeEventListener("keydown", handleKeyboardInput)
	})

	return {
		// State
		numpadDisplay,
		numpadValue,

		// Actions
		numpadInput,
		numpadBackspace,
		numpadClear,
		setNumpadValue,
	}
}
