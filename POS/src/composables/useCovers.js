//// Neoffice — added file (no upstream equivalent). « How many people? » (NeoResto lot 1, covers): the number of people seated at a table lives on the table's order. The till asks it the first time a table is opened empty
//// (when the restaurant asks it), and the waiter changes it from the header when the party grows or shrinks. This file is the question and its answers; the dialog (components/restaurant/CoversDialog.vue) is mounted once, by the page.
////
//// - The question is open while the cart's `coversAsk` is "open" (asked by itself on an empty table) or "change" (asked from the header). It lives with the table in the cart store: clearing the cart closes it, and a
////   dialog can never stay open over a table that is gone.
//// - Confirming sets the number in the cart. When the order already exists on the server (a saved draft) the number is also saved there (`set_table_covers`), and a refusal keeps the previous number and the question open.
////   Without a draft the number just lives in the cart until the first « Valider » saves it with the order.
//// - Asking never blocks ordering: « Later » (or Escape, or a tap beside the dialog) leaves the number unset, and the header's pastille asks again whenever the waiter wants.
import { computed, ref } from "vue"
import { useToast } from "@/composables/useToast"
import { usePOSCartStore } from "@/stores/posCart"
import { useRestaurantStore } from "@/stores/restaurant"
import { call } from "@/utils/apiWrapper"
import { courseChips, normalizeCovers } from "@/utils/coverCounts"

/** The question asked by itself, on a table opened empty: it offers « Later ». */
export const ASK_ON_OPEN = "open"
/** The question asked from the header's pastille: it offers « Cancel ». */
export const ASK_TO_CHANGE = "change"

export function useCovers() {
	const cartStore = usePOSCartStore()
	const { showError } = useToast()
	const busy = ref(false)

	const asking = computed(() => cartStore.coversAsk !== null)
	const mode = computed(() => cartStore.coversAsk)
	// The counter's chips: the portions per course against the people seated; none while nobody is counted, so that the counter is not drawn
	const chips = computed(() =>
		cartStore.restaurantCovers === null
			? []
			: courseChips(cartStore.invoiceItems, cartStore.restaurantCovers),
	)

	/**
	 * Opens the question.
	 *
	 * @param {"open"|"change"} [how] - "open": asked by itself on a first opening; "change": asked from the header
	 */
	function ask(how = ASK_TO_CHANGE) {
		cartStore.coversAsk = how === ASK_ON_OPEN ? ASK_ON_OPEN : ASK_TO_CHANGE
	}

	/**
	 * The question a table opened empty asks by itself: only at a table (not a takeaway), when the restaurant asks it and nobody has said the number yet.
	 *
	 * @returns {boolean} Whether the question was opened
	 */
	function askOnOpen() {
		if (!cartStore.restaurantTable || cartStore.isTakeaway) return false
		if (!useRestaurantStore().askCoversOnOpen) return false
		if (cartStore.restaurantCovers !== null) return false
		ask(ASK_ON_OPEN)
		return true
	}

	/**
	 * Keeps the number the waiter chose.
	 *
	 * @param {number|string} value - 1 to 99
	 * @returns {Promise<boolean>} Whether the number was kept (false: it is no valid number, a save is on its way, or the server refused it; the previous number stays)
	 */
	async function confirm(value) {
		const covers = normalizeCovers(value)
		if (covers === null || busy.value) return false
		const draft = cartStore.currentDraftId
		if (draft) {
			busy.value = true
			try {
				const saved = await call("pos_next.api.restaurant.set_table_covers", {
					invoice: draft,
					covers,
				})
				// The table was left while the server answered: the number belongs to an order that is no longer in front of the waiter
				if (cartStore.currentDraftId !== draft) return false
				cartStore.setRestaurantCovers(saved?.covers ?? covers)
			} catch (error) {
				console.error("[Covers] Failed to save the number of people:", error)
				showError(__("Failed to save the number of people"))
				return false
			} finally {
				busy.value = false
			}
		} else {
			cartStore.setRestaurantCovers(covers)
		}
		cartStore.coversAsk = null
		return true
	}

	/** « Later »: the number stays unset (or as it was) and the question closes. */
	function later() {
		if (busy.value) return
		cartStore.coversAsk = null
	}

	/** « Cancel »: the question closes and the number stays as it was. The same gesture as « Later », named for the header's question. */
	const cancel = later

	return { asking, mode, busy, chips, ask, askOnOpen, confirm, later, cancel }
}
