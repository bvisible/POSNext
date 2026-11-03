//// Neoffice — added file (no upstream equivalent). Leaving a table after a dish that had left for the kitchen was taken off the order (NeoResto lot 1, product owner, 03.11.2026: « Back » without « Send » dropped the
//// removal without a word, so the kitchen cooked the dish and the guest was billed for it). « Back » asks first, when it must, and says what each answer does:
//// - send the cancellation: the order is saved without the dish, which tells the kitchen (a ticket « cancelled » on paper, the dish off its screen); the till then leaves the table as it does after a send;
//// - put the order back as it was: the table is read again, the dish is on it, and the waiter stays;
//// - stay: nothing changes.
//// The page hands over what only it knows how to do (`send`, `putBack`, `leave`): this file is the question and its three answers.
import { computed, ref } from "vue"

/**
 * @param {Object} options
 * @param {Object} options.cartStore - The till's cart (`removedSentLines`, `restaurantTable`, `isTakeaway`)
 * @param {() => Promise<boolean>} options.send - Saves the order without the dishes taken off and leaves the table; true when the kitchen has it
 * @param {() => Promise<void>} options.putBack - Reads the table's order again, as the kitchen has it
 * @param {() => void} options.leave - What « Back » did before: clears the cart, back to the floor
 */
export function useLeaveTable({ cartStore, send, putBack, leave }) {
	const asking = ref(false)
	const busy = ref(false)
	const removed = computed(() => cartStore.removedSentLines || [])
	// A takeaway has no table to read again: its order is put back only by leaving it as the kitchen has it, which the till cannot show
	const canPutBack = computed(() => Boolean(cartStore.restaurantTable) && !cartStore.isTakeaway)

	function requestLeave() {
		if (removed.value.length === 0) return leave()
		asking.value = true
	}

	async function sendCancellation() {
		if (busy.value) return
		busy.value = true
		try {
			// A cancellation that did not go keeps the question open: nothing is dropped
			if (await send()) asking.value = false
		} finally {
			busy.value = false
		}
	}

	async function putTheOrderBack() {
		if (busy.value) return
		busy.value = true
		try {
			await putBack()
			asking.value = false
		} finally {
			busy.value = false
		}
	}

	function stay() {
		if (busy.value) return
		asking.value = false
	}

	return { asking, busy, removed, canPutBack, requestLeave, sendCancellation, putTheOrderBack, stay }
}
