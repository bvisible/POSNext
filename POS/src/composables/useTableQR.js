//// Neoffice — added file (no upstream equivalent). The QR button of a table in the restaurant till: one press asks the
//// server for the table's guest code (create_table_token returns the code the table already has, or makes one) and shows
//// it at once. It used to ask a question first (a confirmation dialog) and wait for a second press on its "Generate QR"
//// button (c5208ba7 + f3affeaa, 2026-03-28); the product owner wanted the code itself, with a line that says what it is
//// (NeoResto lot 1). The click path lives here, out of POSSale.vue, because that page is too large to mount in a test.
////
//// Every press asks the server, which answers the table's active code and makes one only when the table has none: the
//// till keeps no copy of the codes it showed, so a code expired from another device is never shown (Ruling 52; the page
//// used to keep one per table and drop it when it cleaned or freed the table, which no other device could do).
import { ref } from "vue"
import { useToast } from "@/composables/useToast"
import { call } from "@/utils/apiWrapper"

/**
 * @param {object} till what the click path reads when the button is pressed
 * @param {() => object|null} till.table the open table of the cart ({ name, table_name }), null when none is open
 * @param {() => string} till.posProfile the till's POS Profile
 */
export function useTableQR({ table, posProfile }) {
	const { showError } = useToast()
	const showQRDialog = ref(false)
	const currentQR = ref({ token: "", url: "", tableName: "" })
	// A second press while the answer is on its way asks nothing
	let asking = false

	//// Neoffice — the press can name its table (NeoResto lot 1, task 26): the list's QR button and a long press on the plan ask for the code of a table pressed on the FLOOR, where no table is open on the cart; the header bar's
	//// button hands its click event, which is no table, and gets the cart's open table as before.
	const isATable = (value) => Boolean(value && typeof value === "object" && (value.name || value.table_name) && !("target" in value))
	async function handleQRButtonClick(pressed = null) {
		const openTable = isATable(pressed) ? pressed : table()
		if (!openTable || asking) return

		const tableName = openTable.name || openTable.table_name
		const label = openTable.table_name || tableName

		asking = true
		try {
			const result = await call(
				"pos_next.api.guest_ordering.create_table_token",
				{
					table: tableName,
					pos_profile: posProfile(),
				},
			)
			if (result?.token) {
				const url =
					result.url || `${window.location.origin}/pos/guest/${result.token}`
				currentQR.value = { token: result.token, url, tableName: label }
				showQRDialog.value = true
			}
		} catch (err) {
			showError(__("Failed to generate QR code: {0}", [err.message || err]))
		} finally {
			asking = false
		}
	}

	return { showQRDialog, currentQR, handleQRButtonClick }
}
