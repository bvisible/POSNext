/**
 * //// Neoffice — added file (no upstream equivalent). The payments typed into the payment dialog before the sale is closed (NeoResto lot 1; product owner, 05.11.2026: « si on encaisse en espèces, est-ce qu'il
 * //// serait possible, avant la clôture du ticket, de repasser ce montant en carte ou en Twint si la personne n'a pas assez de cash sur elle ? »). A card or TWINT payment is VALIDATED by its terminal: the customer
 * //// has been charged and the entry is locked (`is_locked`), nothing at the till can take it back. A cash entry is only a number the cashier typed: until the ticket is closed it can be taken back, and the
 * //// amount paid again with another method. The rules are written once here, and tested without the dialog.
 */

/** Whether an entry was captured by a terminal (a card or TWINT payment the customer has already made): it can never be edited away. */
export function isLockedEntry(entry) {
	return Boolean(entry?.is_locked)
}

/**
 * The entries as the list under the totals draws them: each one with its place in the dialog's own list (the dialog removes by it), its method, its amount, and whether the cashier may take it back.
 *
 * @param {Array<{ mode_of_payment?: string, amount?: number, is_locked?: boolean }>} entries
 * @returns {Array<{ index: number, mode: string, amount: number, locked: boolean }>}
 */
export function entryRows(entries) {
	return (entries || []).map((entry, index) => ({
		index,
		mode: entry?.mode_of_payment || "",
		amount: Number(entry?.amount) || 0,
		locked: isLockedEntry(entry),
	}))
}

/**
 * The entries without the one at `index`, or the same list when that entry is a terminal's (or there is none at that place): what a terminal captured is never removed by a tap.
 *
 * @returns {Array<object>} A new list when an entry was taken back, else the list itself
 */
export function withoutEntry(entries, index) {
	const list = entries || []
	const entry = list[index]
	if (!entry || isLockedEntry(entry)) return list
	return list.filter((_, at) => at !== index)
}

/** Only the entries a terminal captured: what « clear all » leaves, since the customer has already paid them. */
export function lockedEntries(entries) {
	return (entries || []).filter(isLockedEntry)
}
