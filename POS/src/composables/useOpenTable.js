//// Neoffice — added file (no upstream equivalent). Opening a table in the till (NeoResto lot 1, Daniel, 01.11: « regarde comment la caisse sommelier reçoit l'info »). This was the body of the floor plan's
//// `selectTable`; it moved here so that the notice of a guest's order (« View table ») opens a table the way tapping it in the list does, through the same function and not a copy of it.
////
//// The server's order of the table is read FIRST, while the cart stays in front of the waiter (no jolt); then the cart is cleared and rebuilt in one go: the table, the lines of its order, the draft, the customer.
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSShiftStore } from "@/stores/posShift"
import { call } from "@/utils/apiWrapper"
//// Neoffice — a table opened empty asks how many people are seated, whoever opened it: the plan's tile, the list, the notice of a guest's order (NeoResto lot 1, covers)
import { useCovers } from "@/composables/useCovers"
//// Neoffice — what the options of a line loaded from the table's draft add to its price (NeoResto lot 1, task 27).
import { modifiersPriceAdjustment } from "@/utils/modifiersPrice"
// « Offert » (NeoResto lot 1, task 24): what an offered row of a table's draft keeps when the table is opened
import { offeredSourceFields } from "@/utils/offeredRows"
//// Neoffice — the note of the table (.1, .2) the order is, and the notes the table has (NeoResto lot 1, notes)
import { effectiveRank, NOTE_MIN } from "@/utils/tableNotes"

/**
 * Puts the note an order of a table answers in the cart: its rank (1 for a table with no order), its name, and the notes the table has. Whoever puts an order of the table in the cart (opening it, reading it again after a
 * guest's order) goes through this, so that the header never shows another note than the lines it holds.
 *
 * @param {Object} cartStore - The till's cart
 * @param {{ note?: number, note_name?: string|null, notes?: Array<Object> }|null|undefined} order - The answer of open_table / get_table_order
 * @param {number} [asked] - The note the caller asked for, taken when the answer does not name one
 */
export function keepTheNotesOfTheOrder(cartStore, order, asked = NOTE_MIN) {
	cartStore.setRestaurantNotes(order?.notes)
	cartStore.setRestaurantNote(effectiveRank(order?.note ?? asked))
	cartStore.setRestaurantNoteName(order?.note_name ?? "")
}

/**
 * What to ask the server to read the note in front of the waiter again: nothing for the first note of a table that has one, else `{ note }`. A table with one note is read exactly as before.
 *
 * @param {Object} cartStore - The till's cart
 * @returns {{ note?: number }}
 */
export function noteToReadAgain(cartStore) {
	const rank = effectiveRank(cartStore.restaurantNote)
	const several = (cartStore.restaurantNotes || []).length > 1
	return rank !== NOTE_MIN || several ? { note: rank } : {}
}

/**
 * The customer of a table's order as the cart holds a customer the till picked: his record's name and his name.
 *
 * @param {{ customer: string, customer_name?: string }} order - The order of a table, as the server answers it
 * @returns {{ name: string, customer_name: string }}
 */
export function customerOfTheOrder(order) {
	return { name: order.customer, customer_name: order.customer_name || order.customer }
}

export function useOpenTable() {
	const cartStore = usePOSCartStore()
	const shiftStore = usePOSShiftStore()
	const covers = useCovers()

	//// Neoffice — a table that has no order yet (`is_new`) asks how many people are seated when the restaurant asks it (the question is the cart's `coversAsk`, the page mounts its dialog): the answer of this function
	//// is the same, it only says whether the table was opened, and the waiter can dismiss the question and order at once. A table that has an order comes back with the number it holds (NeoResto lot 1, covers).
	/**
	 * Opens a table: its order is read from the server and put in the cart.
	 *
	 * @param {{ name: string }} table - A table of the floor
	 * @param {{ note?: number }} [options] - `note`: the note of the table to open (its draft, or a new empty note); the lowest open note when none is given (NeoResto lot 1, notes)
	 * @returns {Promise<boolean>} Whether the table was opened; false when its order could not be read (the cart is then as it was)
	 */
	async function openTable(table, { note = null } = {}) {
		try {
			// Fetch table data FIRST (while keeping old cart visible to avoid jolt)
			const res = await call("pos_next.api.restaurant.open_table", {
				table_name: table.name,
				pos_profile: shiftStore.profileName,
				//// Neoffice — a given note is passed on, else the server opens the lowest one: a table with one note is asked exactly as before (NeoResto lot 1, notes)
				...(note ? { note } : {}),
			})

			// Now clear and rebuild in one batch — no visual gap
			await cartStore.clearCart()
			cartStore.setRestaurantTable(table)
			//// Neoffice — which note of the table this is, and the notes the table has, for the header's pills and the payload of the next « Valider » (NeoResto lot 1, notes)
			keepTheNotesOfTheOrder(cartStore, res, note ?? NOTE_MIN)

			if (res?.name) {
				// Existing draft found — load items into cart
				if (res.items && res.items.length > 0) {
					for (const item of res.items) {
						// Calculate modifier price adjustment from saved JSON
						//// Neoffice — read by the one helper every path that loads a line uses (utils/modifiersPrice.js;
						//// NeoResto lot 1, task 27, fix round 1): same sum as the loop it replaces.
						const modifierPriceAdjustment = modifiersPriceAdjustment(item.posa_item_modifiers)

						cartStore.addItem(
							{
								item_code: item.item_code,
								item_name: item.item_name,
								rate: item.rate,
								uom: item.uom,
								//// Neoffice — the order row names the item's stock unit, the factor of the line and the item's other units
								//// (open_table): the line carries them, or its unit select could not list them (NeoResto lot 1, task 22).
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
								// An offered row of the table (« Offert », NeoResto lot 1, task 24) comes back offered:
								// its flag and its list price
								...offeredSourceFields(item),
								//// Neoffice — whether the line left ahead of its course and when the room called it (the service rhythm, NeoResto lot 1): the next course to call is named from them
								kds_ahead: item.kds_ahead || 0,
								kds_called_at: item.kds_called_at || null,
								//// Neoffice — whether the item is a stock item, as open_table reads it: a "+" made the unit a stock item whatever the item was (neoffice-maintenance#2080)
								is_stock_item: item.is_stock_item,
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
				//// Neoffice — the people the order holds (null when nobody said), so that the header and the counter show them again (NeoResto lot 1, covers)
				cartStore.setRestaurantCovers(res.covers ?? null)
				//// Neoffice — the customer as a customer the till picked is (his record's name and his name): the cart's header names him,
				//// a code on a site that numbers its customers was no name, and a bare string read as no name at all (neoffice-maintenance#2163)
				if (res.customer) cartStore.setCustomer(customerOfTheOrder(res))
			}
			//// Neoffice — what the kitchen has of this order, remembered: « Back » asks before it drops a dish taken off since (NeoResto lot 1, product owner, 03.11.2026)
			cartStore.rememberSentLines()
			//// Neoffice — a table with no order yet asks how many people are seated (when the restaurant asks it and nobody said): the answer to the caller is the same, and the waiter can dismiss the question (NeoResto lot 1, covers).
			//// Asking is a courtesy: a failure of the question never turns an opened table into a failed one.
			//// Neoffice — nobody is seated at a table of direct service (a bar, a counter): the question is not asked there (the product owner, 08.11.2026)
			if ((res?.is_new || !res?.name) && !table.direct_service) {
				try {
					covers.askOnOpen()
				} catch (e) {
					console.error("[Covers] Failed to ask the number of people:", e)
				}
			}
			return true
		} catch (e) {
			console.error("[FloorPlan] Failed to open table:", e)
			return false
		}
	}

	return { openTable }
}
