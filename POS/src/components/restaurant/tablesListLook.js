//// Neoffice — added file (no upstream equivalent). The look of the list of tables (NeoRestau lot 1, task 26), shared by
//// its card, its rows and its top: the colours are the waiter mockup's, which takes them from the design system (ink
//// #141414, paper #FAF3EA / #FFFDF8, clay #D68A59, the sand ramp, the status tones of its pills). One place, so that a
//// card and a row say a state in the same colour.

// The QR glyph of the till (the order view's own QR button draws the same)
export const ICON_QR =
	"M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"

// The badge of a card, by its tone (tablesOfTheService says the tone): ready at the pass in clay, as the mockup; a QR
// order to accept as quiet text, as the mockup; the other states in a soft pill of the design system's tones
const PILL = "px-2.5 py-[3px] rounded-xl"
export const BADGE_CLASSES = {
	ready: `${PILL} bg-[#D68A59] text-[#141414] font-bold`,
	quiet: "text-[#6F665A]",
	neutral: `${PILL} bg-[#F6F3ED] text-[#524B41] font-semibold`,
	paid: `${PILL} bg-[#E6F4EA] text-[#15803D] font-semibold`,
	free: "text-[#15803D]",
	cleaning: "text-[#6F665A]",
	reserved: "text-[#A16207]",
}

// The state word of a row (a free, cleaning or reserved table): plain text in its tone
export const ROW_STATE_CLASSES = {
	free: "text-[#15803D]",
	cleaning: "text-[#6F665A]",
	reserved: "text-[#A16207]",
}

/** How long a table has been seated: « For 25 min », « For 1 h 15 » */
export function durationOf(minutes) {
	const total = Math.max(0, Math.floor(Number(minutes) || 0))
	if (total < 60) return __("For {0} min", [total])
	return __("For {0} h {1}", [
		Math.floor(total / 60),
		String(total % 60).padStart(2, "0"),
	])
}

// The font of the mockup's text, Karla, where the till loads it; the till's own font otherwise
export const LIST_FONT = {
	fontFamily: 'Karla, Inter, "IBM Plex Sans", sans-serif',
}
