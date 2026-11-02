//// Neoffice — added file (no upstream equivalent). « View table » on the notice of a guest's order (NeoResto lot 1, Daniel, 01.11: « regarde comment la caisse sommelier reçoit l'info »). It opens the table of the notice
//// the way tapping it in the list does: the same function (composables/useOpenTable), and a table the guest has paid goes where tapping a paid table goes (the payment summary of the page, where the cashier decides what
//// happens to it). The notice is dismissed with the press. What the waiter has in front of him is never thrown away to show another table: an order in progress with lines not sent yet keeps the screen and the notice, and
//// the waiter is told.
import { usePOSCartStore } from "@/stores/posCart"
import { useFloorNoticesStore } from "@/stores/floorNotices"
import { useRestaurantStore } from "@/stores/restaurant"
import { useOpenTable } from "@/composables/useOpenTable"
import { tableNeedsCleaning } from "@/utils/tableStatus"
import { useToast } from "@/composables/useToast"
import { KIND_PAYMENT } from "@/utils/floorNotices"

/**
 * @param {{ onPaid?: (table: Object) => void, onOpened?: (table: Object) => void }} [handlers] - `onPaid`: what the page does for a paid table (its payment summary); `onOpened`: what it does once a table is open
 * @returns {{ see: (notice: Object) => Promise<boolean> }} `see` returns whether the notice was dealt with (false: it stays, and the waiter was told why)
 */
export function useSeeFloorNotice({ onPaid = () => {}, onOpened = () => {} } = {}) {
	const cartStore = usePOSCartStore()
	const restaurantStore = useRestaurantStore()
	const floorNotices = useFloorNoticesStore()
	const { openTable } = useOpenTable()
	const { showWarning } = useToast()

	const find = (name) => restaurantStore.tables.find((table) => table.name === name)

	// The floor is read again when the page does not know the table: it was reloaded at an open table, and the floor plan that loads it was never shown
	async function tableOf(name) {
		let table = find(name)
		if (!table) {
			await restaurantStore.fetchFromNetwork()
			table = find(name)
		}
		return table
	}

	async function see(notice) {
		const open = cartStore.restaurantTable?.name
		if ((open || cartStore.isTakeaway) && cartStore.hasUnsentChanges && open !== notice.table) {
			showWarning(__("Send or finish the order in progress before opening another table"))
			return false
		}
		const table = await tableOf(notice.table)
		if (!table) {
			showWarning(__("This table could not be found"))
			return false
		}
		// A guest who paid the whole bill: the table is paid, and the cashier decides (the payment summary of the list), as for any paid table
		if ((notice.kind === KIND_PAYMENT && !notice.partial) || tableNeedsCleaning(table)) {
			floorNotices.dismiss(notice.key)
			onPaid(table)
			return true
		}
		if (open === table.name) {
			floorNotices.dismiss(notice.key)
			return true
		}
		if (!(await openTable(table))) {
			showWarning(__("This table could not be opened"))
			return false
		}
		floorNotices.dismiss(notice.key)
		onOpened(table)
		return true
	}

	return { see }
}
