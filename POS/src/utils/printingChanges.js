//// Neoffice — added file (no upstream equivalent). What the till's Printing settings changed, as `cloudprnt.till.set_till_printing` takes it (NeoResto lot 1,
//// task 13, and Daniel, 02.11.2026: a station may work on paper alone). The screen keeps its choices in a draft; its one « Save » writes only what differs
//// from what it read: the receipt printer, the automatic printing, the drawer rule, the printer of each station, the stations that work on paper alone, and the size of the writing of each station's tickets.

/**
 * @param {{ receipt_printer?: string|null, auto_print?: number, open_drawer?: string, stationPrinters?: Object<string, string|null>, stationPaperOnly?: Object<string, number>, stationTextSize?: Object<string, string> }|null} before - The printing as read
 * @param {{ receipt_printer?: string|null, auto_print?: number, open_drawer?: string, stations?: Object<string, string|null>, paper_only?: Object<string, number>, text_size?: Object<string, string> }} after - The printing as edited: only the stations the screen touched
 * @returns {Object|null} The values to save, or null when nothing differs
 */
export function printingChangesOf(before, after) {
	if (!before) return null
	const stations = Object.fromEntries(
		Object.entries(after.stations || {}).filter(
			([station, printer]) => (before.stationPrinters?.[station] || null) !== (printer || null),
		),
	)
	const paperOnly = Object.fromEntries(
		Object.entries(after.paper_only || {}).filter(
			([station, flag]) => Number(before.stationPaperOnly?.[station] || 0) !== Number(flag || 0),
		),
	)
	const textSize = Object.fromEntries(
		Object.entries(after.text_size || {}).filter(
			([station, size]) => (before.stationTextSize?.[station] || "Medium") !== (size || "Medium"),
		),
	)
	const changed =
		(before.receipt_printer || null) !== (after.receipt_printer || null) ||
		Number(before.auto_print || 0) !== Number(after.auto_print || 0) ||
		before.open_drawer !== after.open_drawer ||
		Object.keys(stations).length > 0 ||
		Object.keys(paperOnly).length > 0 ||
		Object.keys(textSize).length > 0
	if (!changed) return null
	return {
		receipt_printer: after.receipt_printer || null,
		auto_print: Number(after.auto_print || 0),
		open_drawer: after.open_drawer,
		...(Object.keys(stations).length ? { stations } : {}),
		...(Object.keys(paperOnly).length ? { paper_only: paperOnly } : {}),
		...(Object.keys(textSize).length ? { text_size: textSize } : {}),
	}
}
