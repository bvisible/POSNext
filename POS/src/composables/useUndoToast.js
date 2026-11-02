//// Neoffice — added file (no upstream equivalent). The toast that offers « Undo » for five seconds after a ticket was marked ready or delivered (NeoResto lot 1, task 38a-2,
//// ruling 112). A card cannot hold it: the ticket leaves its band, even its screen, the moment it is pressed, and a component that is gone cannot answer a press. It lives
//// here, one at a time for the whole screen (a new offer replaces the one before, which simply runs out), and the page draws it (UndoToast.vue).
import { ref } from "vue"

export const UNDO_MS = 5000

const offer = ref(null)
let timer = null
let serial = 0

function clear() {
	if (timer) clearTimeout(timer)
	timer = null
}

/** Drop the offer: it was undone, or its time is up. */
export function dismissUndo() {
	clear()
	offer.value = null
}

/**
 * Offer to take a move back for five seconds.
 *
 * @param {{ message: string, undo: () => Promise<boolean|void> }} what - `message` says what just happened; `undo` puts it back and says whether it did
 */
export function offerUndo({ message, undo }) {
	clear()
	serial += 1
	const mine = serial
	offer.value = { id: mine, message, undo }
	timer = setTimeout(() => {
		if (offer.value?.id === mine) offer.value = null
		timer = null
	}, UNDO_MS)
}

/**
 * Put the move back. The offer goes at once, so that a second press cannot undo twice.
 *
 * @returns {Promise<boolean>} Whether it was put back (false: nothing to undo, or the server refused)
 */
export async function undoNow() {
	const taken = offer.value
	if (!taken) return false
	dismissUndo()
	try {
		return (await taken.undo()) !== false
	} catch {
		return false
	}
}

/** For a screen: the offer in view (null when there is none). */
export function useUndoToast() {
	return { offer, undoNow, dismissUndo }
}
