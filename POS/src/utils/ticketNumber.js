//// Neoffice — added file (no upstream equivalent). How a ticket number is written on a restaurant screen (NeoRestau lot 1, task 38b,
//// rulings 122 and 124). The server counts the tickets of a restaurant (`ticket_no`, a whole number) and tells each screen the digits the
//// restaurant writes them with (`ticket_digits`): the screen writes 7 as « 0007 ». The invoice's own name (FA-…) is NEVER what a service
//// screen reads aloud: a draft takes it in an order nobody chose, and it is only a number once the sale is validated.

/**
 * A ticket number as the kitchen, the runner and the takeaway screen write it.
 *
 * - a whole number (or a string of digits) is padded with zeros to the restaurant's digits: `7` with 4 digits is `0007`; a number longer
 *   than its digits is never cut; with no digits told, it is written as it comes
 * - a reference that is not a number (a house's own, « T0042 ») is written as it is
 * - no ticket (none given yet, 0, empty) is an empty string: the screen shows nothing rather than a guess
 *
 * @param {number|string|null|undefined} ticketNo - `ticket_no` of an order
 * @param {number|string|null|undefined} digits - `ticket_digits` of the same order
 * @returns {string}
 */
export function formatTicketNo(ticketNo, digits) {
	if (ticketNo == null || ticketNo === "" || ticketNo === 0) return ""
	const text = String(ticketNo).trim()
	if (!/^\d+$/.test(text)) return text
	const width = Number(digits)
	return Number.isInteger(width) && width > 0 ? text.padStart(width, "0") : text
}
