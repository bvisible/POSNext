//// Neoffice — added file (no upstream equivalent). The time a ticket has waited, as the kitchen's and the pass's tickets write it (NeoResto
//// lot 1): minutes and seconds up to the hour, then hours and minutes. The tickets counted minutes only, so that a ticket left open since
//// the day before read « 1107:52 », which nobody reads.

const two = (value) => String(value).padStart(2, "0")

/**
 * How long a ticket has waited, written for a person.
 *
 * @param {number} milliseconds - The wait; below zero (the clocks of the till and of the server disagree) or not a number reads as no time
 * @returns {string} « 06:38 » under the hour, « 1 h 07 » from the hour on (seconds no longer matter)
 */
export function elapsedLabel(milliseconds) {
	const seconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000))
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${two(minutes)}:${two(seconds % 60)}`
	return __("{0} h {1}", [Math.floor(minutes / 60), two(minutes % 60)], "Elapsed time")
}
