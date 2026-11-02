//// Neoffice — added file (no upstream equivalent). Which cart lines have left for the kitchen (NeoResto lot 1, task
//// 22, fix round 1). A line is not sent yet while it has no kitchen status or is « Waiting » (held back by the waiter):
//// the kitchen dialog offers it, the Validate button counts it, the payment sends it. Every other status (Pending,
//// Preparing, Ready, Delivered) means the kitchen has it; the dialog and the cart already read it that way, this is the
//// same rule in one place for the code that adds a unit to a line.

/**
 * Whether a cart line has left for the kitchen: it has a kitchen status other than « Waiting ».
 *
 * @param {Object|null|undefined} line - A cart line
 * @returns {boolean}
 */
export function hasLeftForTheKitchen(line) {
	return Boolean(line?.kds_status) && line.kds_status !== "Waiting"
}

/**
 * Whether the table shows the kitchen's state on a line (« En préparation », « Prêt »…). A line of a station that works on paper alone shows none:
 * its cooks read a ticket and talk to the room, nobody marks anything on a screen, so a state would say « pending » for ever (Daniel, 02.11.2026:
 * « on n'a plus cette notion du tout affichée sur les tables »). « Waiting » is not the kitchen's: it is the waiter's own hold on a course, shown as ever.
 *
 * @param {Object|null|undefined} line - A cart line
 * @param {(station: string) => boolean} [isPaperOnly] - Whether a preparation station works on paper alone
 * @returns {boolean}
 */
export function showsKitchenState(line, isPaperOnly) {
	if (!line?.kds_status) return false
	if (line.kds_status === "Waiting") return true
	return !isPaperOnly?.(line.preparation_station)
}
