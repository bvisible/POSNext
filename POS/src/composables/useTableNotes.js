//// Neoffice — added file (no upstream equivalent). The waiter's gestures on the notes of a table (NeoResto lot 1, notes: « table 5, .1, .2, .3 »): switch to another note, add a group, name a group. The state of the table's notes is the cart's
//// (`restaurantNote`, `restaurantNoteName`, `restaurantNotes`, `noteAsk`); what the header and the phone draw of them is composables/useTableNotePills; this file is what the pills DO. The page mounts the two small dialogs once.
////
//// - Another note is opened the way a table is: the server's order of that note is read FIRST (the cart stays in front of the waiter meanwhile), then the cart is rebuilt (composables/useOpenTable, `note`). A note the server does not
////   have yet comes back as an empty new order: nothing is created, the draft is created by that note's first « Valider ».
//// - Lines already sent to the kitchen NEVER move. Lines not sent yet (only in the cart) follow the waiter: with some in the cart, tapping another note asks « Move the N new lines to .2? » — « Move them » carries them to the other
////   note (`takeUnsentLines`, then `putUnsentLinesBack`, as « Put the order back as it was » does), « Keep them on .1 » stays where he is, and nothing is lost either way.
//// - A dish taken off after it had left for the kitchen is a change the cart has not told the kitchen yet: leaving the note would drop it without a word (the same trap « Back » asks about), so switching waits until the waiter has
////   sent the cancellation or put the dish back.
//// - The name of a group is saved on the server when the group's order exists (`set_table_note_name`); a group not saved yet carries its name in the cart until its first « Valider ».
import { computed, ref } from "vue"
import { useOpenTable } from "@/composables/useOpenTable"
import { useTableNotePills } from "@/composables/useTableNotePills"
import { useToast } from "@/composables/useToast"
import { usePOSCartStore } from "@/stores/posCart"
import { call } from "@/utils/apiWrapper"
import { putUnsentLinesBack, takeUnsentLines } from "@/utils/keepUnsentLines"
import { linesNotSentYet } from "@/utils/removedSentLines"
import { cleanNoteName, effectiveRank, nextFreeRank, rankLabel } from "@/utils/tableNotes"

export function useTableNotes() {
	const cartStore = usePOSCartStore()
	const { openTable } = useOpenTable()
	const { showError, showWarning } = useToast()
	const view = useTableNotePills()
	const busy = ref(false)

	const moveAsk = computed(() => (cartStore.noteAsk?.kind === "move" ? cartStore.noteAsk : null))
	const nameAsk = computed(() => (cartStore.noteAsk?.kind === "name" ? cartStore.noteAsk : null))
	// The words of the move question: where the lines are now, and where they would go
	const fromLabel = computed(() => rankLabel(cartStore.restaurantNote))
	const toLabel = computed(() => (moveAsk.value ? rankLabel(moveAsk.value.to) : ""))
	// The group whose name is asked, with the name it has now
	const namedPill = computed(() => view.pills.value.find((pill) => pill.rank === nameAsk.value?.rank) || null)

	/**
	 * Reads the other note of the table into the cart, taking the lines not sent along when asked.
	 *
	 * @returns {Promise<boolean>} Whether the note was opened (false: the cart is as it was)
	 */
	async function load(rank, carry) {
		busy.value = true
		try {
			const kept = carry ? takeUnsentLines(cartStore.invoiceItems) : []
			const opened = await openTable(cartStore.restaurantTable, { note: rank })
			if (!opened) {
				showError(__("Failed to open the group"))
				return false
			}
			putUnsentLinesBack(cartStore, kept)
			return true
		} finally {
			busy.value = false
		}
	}

	/**
	 * A tap on a pill, or on « ＋ »: the note becomes the one in front of the waiter.
	 *
	 * @param {number} rank - The note to go to (a rank the table does not have yet is a new group)
	 * @returns {Promise<boolean>} Whether the note was opened now (false: the question was asked, or nothing changed)
	 */
	async function select(rank) {
		if (busy.value || !view.pills.value.length) return false
		const to = effectiveRank(rank)
		if (to === effectiveRank(cartStore.restaurantNote)) return false
		if ((cartStore.removedSentLines || []).length > 0) {
			showWarning(__("Send the cancellation or put the dish back before changing group"))
			return false
		}
		const unsent = linesNotSentYet(cartStore.invoiceItems).length
		if (unsent > 0) {
			cartStore.noteAsk = { kind: "move", to, count: unsent }
			return false
		}
		return load(to, false)
	}

	/** « ＋ Group » and the pills' « ＋ »: opens a new group, the next rank after the table's highest. */
	async function add() {
		if (!view.canAdd.value) return false
		const rank = nextFreeRank(view.pills.value.map((pill) => pill.rank))
		return rank === null ? false : select(rank)
	}

	/** « Move them »: the lines not sent follow the waiter to the other note. */
	async function moveThem() {
		const ask = moveAsk.value
		if (!ask || busy.value) return false
		const opened = await load(ask.to, true)
		if (opened) cartStore.noteAsk = null
		return opened
	}

	/** « Keep them on .1 »: nothing changes; the waiter stays on his note with his lines. */
	function keepThem() {
		if (busy.value) return
		if (cartStore.noteAsk?.kind === "move") cartStore.noteAsk = null
	}

	/** Opens the question that names a group (the pill's long press, the ✎ beside the current pill). */
	function askName(rank = cartStore.restaurantNote) {
		const wanted = effectiveRank(rank)
		if (!view.pills.value.some((pill) => pill.rank === wanted)) return
		cartStore.noteAsk = { kind: "name", rank: wanted }
	}

	/**
	 * Keeps the name the waiter typed. A group whose order exists on the server has it saved there; a group not saved yet keeps it in the cart until its first « Valider ». An empty name takes the name off.
	 *
	 * @param {string} text
	 * @returns {Promise<boolean>} Whether the name was kept (false: the server refused it; the question stays open)
	 */
	async function saveName(text) {
		const ask = nameAsk.value
		const pill = namedPill.value
		if (!ask || busy.value) return false
		const name = cleanNoteName(text)
		const invoice = pill?.invoice || (pill?.current ? cartStore.currentDraftId : null)
		if (!invoice) {
			// Nothing on the server to rename: the name is carried by the first save of this group
			if (pill?.current) cartStore.setRestaurantNoteName(name)
			cartStore.noteAsk = null
			return true
		}
		busy.value = true
		try {
			const saved = await call("pos_next.api.restaurant.set_table_note_name", {
				invoice,
				note_name: name,
			})
			// The table was left (or the question closed) while the server answered: the name belongs to a screen that is gone
			if (cartStore.noteAsk?.kind !== "name" || cartStore.noteAsk.rank !== ask.rank) return false
			const kept = cleanNoteName(saved?.note_name ?? name)
			cartStore.patchRestaurantNote(ask.rank, { note_name: kept || null })
			if (ask.rank === effectiveRank(cartStore.restaurantNote)) cartStore.setRestaurantNoteName(kept)
			cartStore.noteAsk = null
			return true
		} catch (error) {
			console.error("[TableNotes] Failed to save the name of the group:", error)
			showError(__("Failed to save the name of the group"))
			return false
		} finally {
			busy.value = false
		}
	}

	/** « Cancel » on the question that names a group. */
	function cancelName() {
		if (busy.value) return
		if (cartStore.noteAsk?.kind === "name") cartStore.noteAsk = null
	}

	return {
		...view,
		busy,
		moveAsk,
		nameAsk,
		fromLabel,
		toLabel,
		namedPill,
		select,
		add,
		moveThem,
		keepThem,
		askName,
		saveName,
		cancelName,
	}
}
