//// Neoffice — added file (no upstream equivalent). What the header of an open table says of its notes (NeoResto lot 1, notes: « table 5, .1, .2, .3 »). It only READS the cart: the label of the table (« Table 5 », « Table 5.2 · Dupont »
//// once the table has a second note), the pills of the row under the bar (shown from two notes on), and whether a new group can be added. The waiter's gestures (switching, adding, naming) are composables/useTableNotes; this is shared by
//// the tablet's header and the phone's screen, which draw the same notes.
import { computed } from "vue"
import { usePOSCartStore } from "@/stores/posCart"
import { NOTE_MAX, notePills, tableLabel } from "@/utils/tableNotes"

export function useTableNotePills() {
	const cartStore = usePOSCartStore()

	// A takeaway and a counter sale have no table, so no notes
	const atATable = computed(() => Boolean(cartStore.restaurantTable) && !cartStore.isTakeaway)
	const pills = computed(() =>
		atATable.value
			? notePills(cartStore.restaurantNotes, {
					rank: cartStore.restaurantNote,
					name: cartStore.restaurantNoteName,
					covers: cartStore.restaurantCovers,
					total: cartStore.roundedGrandTotal,
					lines: (cartStore.invoiceItems || []).length,
				})
			: [],
	)
	// The row of pills: from two notes on. A table with one note keeps its bar as it was
	const showPills = computed(() => pills.value.length > 1)
	// A group is added to an order that exists on the server: a table not saved yet has nothing to group, and a note that is itself new is already the empty one
	const canAdd = computed(() => atATable.value && Boolean(cartStore.currentDraftId) && pills.value.length < NOTE_MAX)
	// « ＋ Group »: the discreet button of a table with one note; from two notes on the pills row has its own ＋
	const showAddGroup = computed(() => canAdd.value && pills.value.length === 1)
	// « Table 5 », or « Table 5.2 · Dupont » when the table has several notes
	const label = computed(() => {
		const table = cartStore.restaurantTable
		const base = table?.table_name || table?.name || ""
		return tableLabel(base, {
			rank: cartStore.restaurantNote,
			name: cartStore.restaurantNoteName,
			count: pills.value.length,
		})
	})

	return { pills, showPills, canAdd, showAddGroup, label }
}
