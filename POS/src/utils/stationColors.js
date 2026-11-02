//// Neoffice — added file (no upstream equivalent). What to write on a preparation station's colour, and what colour to write the
//// station in on a dark card (NeoResto lot 1, task 46). A station carries a colour the restaurant picked (its pills, its chips, its
//// box on the floor plan), so the kitchen and runner screens cannot know it when they are written: they used white text on it
//// and the station's own colour as text on a tint of itself, which reads on a light card and not on a dark one (white on a clay
//// pill measured 2.8:1, a blue station's name on its own tint 2.0:1). The light mode keeps what it draws; the screens hand these two
//// answers to their `dark:` classes as CSS variables (`--station-ink`, `--station-on-dark`), because a colour in an inline style
//// cannot be reached by a class.

// The design system's ink (--sand-950) and paper (--paper-bright): the two colours text takes on a coloured fill
const INK = "#141414"
const PAPER = "#FFFFFF"
// The ground a station's name sits on in dark mode: the LIGHTER of the two it meets, a filter chip (the till's remap of `bg-gray-100`,
// #23272F, index.css) rather than a ticket (its remap of `bg-white`, #1C1F26). Read against the lighter one it reads on both.
const DARK_GROUND = "#23272F"
const FALLBACK = "#6B7280"
// How much of its own colour a station's pill is tinted with (`#rrggbb20`: 0x20 of 0xFF)
const TINT = 0.125

function parse(color) {
	const text = String(color || "").trim()
	const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text)
	if (short) return short.slice(1).map((d) => Number.parseInt(d + d, 16))
	const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(text)
	if (long) return long.slice(1).map((d) => Number.parseInt(d, 16))
	return null
}

const hex = (rgb) =>
	`#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase()

function luminance([r, g, b]) {
	const [R, G, B] = [r, g, b].map((v) => {
		const s = v / 255
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

/** The WCAG contrast ratio of two colours given as [r, g, b]. */
function contrast(a, b) {
	const [hi, lo] = luminance(a) > luminance(b) ? [a, b] : [b, a]
	return (luminance(hi) + 0.05) / (luminance(lo) + 0.05)
}

/**
 * The text colour that reads on a station's colour: white or the design system's ink, whichever contrasts more.
 *
 * @param {string} color - The station's colour (#rgb or #rrggbb)
 * @returns {string} "#FFFFFF" or "#141414" (white for a colour that cannot be read)
 */
export function inkOn(color) {
	const rgb = parse(color)
	if (!rgb) return PAPER
	return contrast(rgb, parse(INK)) > contrast(rgb, parse(PAPER)) ? INK : PAPER
}

/**
 * The station's colour, lightened toward white just enough to be read as text on a dark ticket or chip.
 *
 * The screens write a station's name in its own colour on a TINT of that colour (a pill, a chip's count: the colour at 12.5 %), and
 * the tint of a light colour is lighter than its ground, so the colour is read against the dark ground washed with the station's own: a
 * colour that already reads there (a pale clay) is returned as it is, a dark one (a blue station) is mixed with white a step at a
 * time until it reaches the contrast asked for, so that every station keeps its own hue.
 *
 * @param {string} color - The station's colour (#rgb or #rrggbb)
 * @param {number} [minimum=4.8] - The contrast to reach (4.5 asked, a little to spare)
 * @returns {string} "#RRGGBB"
 */
export function onDark(color, minimum = 4.8) {
	const rgb = parse(color) || parse(FALLBACK)
	const base = parse(DARK_GROUND)
	// The ground a station's name sits on: the dark ground with the station's colour washed over it at 12.5 % (the tint of a pill)
	const ground = base.map((v, i) => v + (rgb[i] - v) * TINT)
	for (let step = 0; step <= 20; step += 1) {
		const mix = rgb.map((v) => v + (255 - v) * (step / 20))
		if (contrast(mix, ground) >= minimum) return hex(mix)
	}
	return PAPER
}
