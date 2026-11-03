//// Neoffice — added file (no upstream equivalent). How much of the bottom of the page a phone's on-screen keyboard covers (NeoResto lot 1, product owner, 03.11.2026: on his phone
//// the keyboard hid the « Send me a code » button of the sign-in sheet, which is drawn at the bottom of the page). Chrome on Android and Safari on iOS draw the keyboard OVER the
//// page without shrinking it: a box fixed to the bottom stays under the keyboard. The page that is left to see is the visual viewport, so the box is lifted by what the keyboard
//// takes from it. Where the browser resizes the page itself (some installed apps) the two heights agree and nothing is lifted.
import { onBeforeUnmount, onMounted, ref } from "vue"

// What the bars of the browser (address bar showing or hiding) can move the visual viewport by, which is not a keyboard: the smallest keyboard is much taller
const SMALLEST_KEYBOARD = 100

/**
 * @param {{height: number, offsetTop: number, scale: number}|null|undefined} viewport - `window.visualViewport`
 * @param {number} layoutHeight - `window.innerHeight`, the height of the page the browser laid out
 * @returns {number} the pixels at the bottom of the page that the keyboard covers (0 when there is none)
 */
export function keyboardInsetOf(viewport, layoutHeight) {
	if (!viewport) return 0
	// A page the person has zoomed into shows less of itself for no keyboard: never lift anything for that
	if (viewport.scale > 1.01) return 0
	const covered = Math.round(layoutHeight - viewport.height - viewport.offsetTop)
	return covered >= SMALLEST_KEYBOARD ? covered : 0
}

/** The keyboard's inset as a ref, kept up to date while the component that asks is on screen. */
export function useKeyboardInset() {
	const inset = ref(0)
	const viewport = typeof window === "undefined" ? null : window.visualViewport

	function update() {
		inset.value = keyboardInsetOf(viewport, window.innerHeight)
	}

	onMounted(() => {
		if (!viewport) return
		update()
		viewport.addEventListener("resize", update)
		viewport.addEventListener("scroll", update)
	})
	onBeforeUnmount(() => {
		if (!viewport) return
		viewport.removeEventListener("resize", update)
		viewport.removeEventListener("scroll", update)
	})

	return { inset }
}
