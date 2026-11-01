//// Neoffice — added file (no upstream equivalent). A datetime the server wrote, as a number of milliseconds (NeoRestau lot 1). The kitchen's order of tickets and the ticket's own
//// timer read the same times, so they read them with the same hand (the parser lived in utils/kitchenBands; the timer of a ticket needs it too, and the two files import each other's
//// neighbours, so it is a file of its own).

const DATETIME =
	/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/

/**
 * A datetime as a number of milliseconds, NaN when it cannot be read.
 *
 * Frappe writes "2026-10-30 12:00:01.123456" (a space, up to six digits of fraction). Not every browser reads that with
 * `new Date(string)` (Safari has refused the space), and a tablet in a kitchen is as likely to be one as any other, so
 * the parts are read by hand and the date is built from them, in the local time zone like the ticket's own timer.
 */
export function timeOf(value) {
	if (value == null || value === "") return Number.NaN
	if (value instanceof Date) return value.getTime()
	if (typeof value === "number") return value
	const text = String(value).trim()
	const match = DATETIME.exec(text)
	if (match) {
		const [, year, month, day, hour, minute, second, fraction = ""] = match
		const milliseconds = Number(fraction.slice(0, 3).padEnd(3, "0"))
		return new Date(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hour),
			Number(minute),
			Number(second),
			milliseconds,
		).getTime()
	}
	return Date.parse(text)
}
