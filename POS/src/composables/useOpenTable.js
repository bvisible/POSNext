//// Neoffice — added file (no upstream equivalent). Opening a table in the till (NeoRestau lot 1, Daniel, 01.11: « regarde comment la caisse sommelier reçoit l'info »). This was the body of the floor plan's
//// `selectTable`; it moved here so that the notice of a guest's order (« View table ») opens a table the way tapping it in the list does, through the same function and not a copy of it.
////
//// The server's order of the table is read FIRST, while the cart stays in front of the waiter (no jolt); then the cart is cleared and rebuilt in one go: the table, the lines of its order, the draft, the customer.
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSShiftStore } from "@/stores/posShift"
import { call } from "@/utils/apiWrapper"
//// Neoffice — what the options of a line loaded from the table's draft add to its price (NeoRestau lot 1, task 27).
import { modifiersPriceAdjustment } from "@/utils/modifiersPrice"
// « Offert » (NeoRestau lot 1, task 24): what an offered row of a table's draft keeps when the table is opened
import { offeredSourceFields } from "@/utils/offeredRows"

export function useOpenTable() {
	const cartStore = usePOSCartStore()
	const shiftStore = usePOSShiftStore()

	/**
	 * Opens a table: its order is read from the server and put in the cart.
	 *
	 * @param {{ name: string }} table - A table of the floor
	 * @returns {Promise<boolean>} Whether the table was opened; false when its order could not be read (the cart is then as it was)
	 */
	async function openTable(table) {
		try {
			// Fetch table data FIRST (while keeping old cart visible to avoid jolt)
			const res = await call("pos_next.api.restaurant.open_table", {
				table_name: table.name,
				pos_profile: shiftStore.profileName,
			})

			// Now clear and rebuild in one batch — no visual gap
			await cartStore.clearCart()
			cartStore.setRestaurantTable(table)

			if (res?.name) {
				// Existing draft found — load items into cart
				if (res.items && res.items.length > 0) {
					for (const item of res.items) {
						// Calculate modifier price adjustment from saved JSON
						//// Neoffice — read by the one helper every path that loads a line uses (utils/modifiersPrice.js;
						//// NeoRestau lot 1, task 27, fix round 1): same sum as the loop it replaces.
						const modifierPriceAdjustment = modifiersPriceAdjustment(item.posa_item_modifiers)

						cartStore.addItem(
							{
								item_code: item.item_code,
								item_name: item.item_name,
								rate: item.rate,
								uom: item.uom,
								//// Neoffice — the order row names the item's stock unit, the factor of the line and the item's other units
								//// (open_table): the line carries them, or its unit select could not list them (NeoRestau lot 1, task 22).
								stock_uom: item.stock_uom,
								conversion_factor: item.conversion_factor,
								item_uoms: item.item_uoms,
								image: item.image,
								preparation_station: item.preparation_station,
								posa_special_instructions: item.posa_special_instructions,
								posa_item_modifiers: item.posa_item_modifiers,
								kds_status: item.kds_status || "Pending",
								//// Neoffice — the stored family: a table opened again had no held course, so « Order the next course » never showed (Daniel, 01.11)
								service_family: item.service_family || "",
								_modifiers_applied: modifierPriceAdjustment || 0,
								// An offered row of the table (« Offert », NeoRestau lot 1, task 24) comes back offered:
								// its flag and its list price
								...offeredSourceFields(item),
								//// Neoffice — whether the line left ahead of its course and when the room called it (the service rhythm, NeoRestau lot 1): the next course to call is named from them
								kds_ahead: item.kds_ahead || 0,
								kds_called_at: item.kds_called_at || null,
							},
							item.qty || 1,
						)
					}
				}

				cartStore.$patch({
					currentDraftId: res.name,
					kdsStatus: res.kds_status || "Pending",
					hasUnsentChanges: false,
					guestPaidAmount: res.paid_amount || 0,
					guestTipAmount: res.tip_total || 0,
				})
				if (res.customer) cartStore.setCustomer(res.customer)
			}
			return true
		} catch (e) {
			console.error("[FloorPlan] Failed to open table:", e)
			return false
		}
	}

	return { openTable }
}
