//// Neoffice — added file (no upstream equivalent). The piece the two « ⋯ » of the restaurant till share to open a card
//// the opening hours keep off the till (NeoRestau lot 1, task 25): the « ⋯ » at the end of the order screen's card
//// row, and the entry of the floor plan's own « ⋯ » menu. Both list the same cards (the store's `pickableCards`), pick
//// through the same gesture, and the card picked joins the row of THIS till until the next service begins or until it
//// is closed, so that the next table opened shows it.
////
//// Picking goes through the authorization gate as « Open a card outside its hours »: opt-in, nothing is asked until a
//// POS Authorization Rule names the action, and then a manager's PIN. The server enforces it as well.
import { computed, reactive } from "vue"
import {
	isAuthorizationError,
	useAuthorization,
} from "@/composables/useAuthorization"
import { useToast } from "@/composables/useToast"
import { usePOSShiftStore } from "@/stores/posShift"
import { useRestaurantStore } from "@/stores/restaurant"

// The name the gate knows the action by (pos_next/authorization/actions/card_hours.py): it is also what the approver reads
export const ACTION_OPEN_CARD_OUTSIDE_HOURS = "Open a card outside its hours"

// Lucide « book-open », a single path like the glyphs of the floor plan's menu
const ICON_OPEN_CARD =
	"M12 7v14m-9-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4a4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3a3 3 0 0 0-3-3z"

// Shared by every caller: the dialog the floor plan opens is one, and one card is opened at a time
const state = reactive({ open: false, busy: false })

export function useCardPicker() {
	const restaurantStore = useRestaurantStore()
	const shiftStore = usePOSShiftStore()
	const { requireAuthorization } = useAuthorization()
	const { handleError } = useToast()

	// The cards the hours keep off the till and that are not opened yet
	const cards = computed(() => restaurantStore.pickableCards || [])
	// Offered where there is a card to fetch
	const available = computed(
		() => Boolean(restaurantStore.isEnabled) && cards.value.length > 0,
	)

	/**
	 * Opens a card by hand: asks the gate for it (a manager's PIN where a rule says so), then fetches it from the server.
	 * Resolves true once the card is on the till, false when the approval was cancelled or the server refused.
	 */
	async function pick(card) {
		if (state.busy) return false
		state.busy = true
		try {
			const context = {
				pos_profile: shiftStore.profileName,
				restaurant_card: card.name,
				// What the approver reads: the action, and which card it is (the summary of the authorization dialog)
				actionLabel: __(ACTION_OPEN_CARD_OUTSIDE_HOURS),
				card_label: card.card_name || card.name,
			}
			let grant = await requireAuthorization(
				ACTION_OPEN_CARD_OUTSIDE_HOURS,
				context,
			)
			if (!grant) return false
			try {
				await restaurantStore.openCardByHand(card, grant.grant_token)
			} catch (error) {
				// A rule was set after the till loaded its policy: the server wants the PIN the till did not know of
				if (grant.required !== false || !isAuthorizationError(error))
					throw error
				grant = await requireAuthorization(
					ACTION_OPEN_CARD_OUTSIDE_HOURS,
					context,
					{
						force: true,
					},
				)
				if (!grant) return false
				await restaurantStore.openCardByHand(card, grant.grant_token)
			}
			return true
		} catch (error) {
			handleError(error, __("Failed to open the card"))
			return false
		} finally {
			state.busy = false
		}
	}

	function openDialog() {
		state.open = true
	}

	function closeDialog() {
		state.open = false
	}

	return { state, cards, available, pick, openDialog, closeDialog }
}

/**
 * The entry of the floor plan's « ⋯ » menu that opens another card. It is shaped like the entries of that menu
 * (`key`, `label`, `icon`, `visible`, `run`) and is meant to be called where the floor plan builds its list, in its
 * computed `menuItems`, so that `visible` follows the cards on offer.
 */
export function openAnotherCardMenuItem() {
	const picker = useCardPicker()
	return {
		key: "open-another-card",
		label: __("Open another card"),
		icon: ICON_OPEN_CARD,
		// There is a card to fetch (the server decides who may open it)
		visible: picker.available.value,
		run: picker.openDialog,
	}
}
