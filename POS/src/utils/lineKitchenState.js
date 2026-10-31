//// Neoffice — added file (no upstream equivalent). Which cart lines have left for the kitchen (NeoRestau lot 1, task
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
