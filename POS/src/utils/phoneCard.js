//// Neoffice — added file (no upstream equivalent). The restaurant card on a phone, as the waiter mockup draws it
//// (NeoRestau lot 1, task 27; product owner, 31.10.2026, pointing at the mockup: « look at your mockup, it is well
//// done… the same for the card as buttons »): the card's types as chips, one colour per type taken from the items' own
//// colour (the Item's custom_color, set on the item sheet), the quantities the order already holds, and the price of a
//// dish with its options. Pure functions: the phone's order screen and its options sheet read the card through here.

import { cardItemToCartItem } from "@/utils/cartLineUnits"

// Below this width the till lays out for a phone; a tablet and a computer keep their screen
export const PHONE_MAX_WIDTH = 768

// A button or a chip of no colour: the design system's sand, on the bright paper
export const NEUTRAL_EDGE = "#BFB5A4"
export const NEUTRAL_FACE = "#FFFDF8"

// The background of a button of any other colour: its hue, kept as saturated (85 % at most), at the lightness of the
// design system's « 50 » tints
const TINT_LIGHTNESS = 0.94
const TINT_MAX_SATURATION = 0.85

// A colour of the design system's ramps (tokens/colors.css) is painted on its ramp's soft tint, as the waiter mockup
// pairs them: each ramp's « 50 ». The clay ramp holds two of the mockup's types, mains (clay-500) and desserts
// (clay-600): its darker steps take clay-100, one step deeper, so the two stay apart. Any other colour: the formula below
const RAMP_TINTS = {
	// blue-500, -600, -700 → blue-50
	"#4A6B8F": "#EEF2F6",
	"#3A5572": "#EEF2F6",
	"#2C4156": "#EEF2F6",
	// clay-400, -500 → clay-50; clay-600, -700 → clay-100
	"#D68A59": "#FAEFE6",
	"#C2723F": "#FAEFE6",
	"#A15A2E": "#F3DECC",
	"#7E4523": "#F3DECC",
	// amber-500, -600, -700 → amber-50
	"#E0980F": "#FCF2DD",
	"#BC7D0B": "#FCF2DD",
	"#92610C": "#FCF2DD",
	// red-500, -600, -700 → red-50
	"#DC4A3D": "#FBEBE7",
	"#C1372C": "#FBEBE7",
	"#9C2920": "#FBEBE7",
	// green-500, -600, -700 → green-50
	"#1F9D57": "#E9F7EE",
	"#178347": "#E9F7EE",
	"#11663A": "#E9F7EE",
}

const HEX_COLOUR = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * The colour of the item sheet as "#RRGGBB", or null when it is none (empty, a name, a malformed value).
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function cardColor(value) {
	const found = typeof value === "string" && value.trim().match(HEX_COLOUR)
	if (!found) return null
	const digits = found[1].length === 3 ? [...found[1]].map((digit) => digit + digit).join("") : found[1]
	return `#${digits.toUpperCase()}`
}

/**
 * The soft background of a colour: its ramp's soft tint for a colour of the design system (RAMP_TINTS), else the light
 * tint of its hue, as the design system draws its « 50 » tints; light enough for ink to read on it either way.
 * @param {string} color - "#RRGGBB"
 * @returns {string} "#RRGGBB"
 */
export function softTint(color) {
	const hex = cardColor(color)
	if (!hex) return NEUTRAL_FACE
	if (RAMP_TINTS[hex]) return RAMP_TINTS[hex]
	const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const spread = max - min
	const lightness = (max + min) / 2
	const saturation = spread === 0 ? 0 : spread / (1 - Math.abs(2 * lightness - 1))
	let hue = 0
	if (spread !== 0) {
		if (max === r) hue = ((g - b) / spread) % 6
		else if (max === g) hue = (b - r) / spread + 2
		else hue = (r - g) / spread + 4
	}
	return fromHsl(hue * 60, Math.min(saturation, TINT_MAX_SATURATION), TINT_LIGHTNESS)
}

function fromHsl(hue, saturation, lightness) {
	const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
	const sector = (((hue % 360) + 360) % 360) / 60
	const second = chroma * (1 - Math.abs((sector % 2) - 1))
	const [r, g, b] = [
		[chroma, second, 0],
		[second, chroma, 0],
		[0, chroma, second],
		[0, second, chroma],
		[second, 0, chroma],
		[chroma, 0, second],
	][Math.floor(sector) % 6]
	const base = lightness - chroma / 2
	return `#${[r, g, b]
		.map((channel) =>
			Math.round((channel + base) * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")
		.toUpperCase()}`
}

// The colour most of the items carry; the first one met wins a tie
function commonColour(entries) {
	const counts = new Map()
	for (const entry of entries) {
		const colour = entry.item_type === "Item" ? cardColor(entry.custom_color) : null
		if (colour) counts.set(colour, (counts.get(colour) || 0) + 1)
	}
	let best = null
	for (const [colour, count] of counts) if (best === null || count > counts.get(best)) best = colour
	return best
}

/**
 * The chips and the buttons of a card. The chips are the card's categories in their order (a category with no dish
 * left out); a card without any category gets the item groups of its items instead, in the order they come. Each chip
 * takes the colour most of its items carry; each button its item's own colour, else its chip's, else none.
 *
 * @param {Array<Object>} entries - The rows of a card as the server lists them (Category, Item, Menu)
 * @returns {{ chips: Array<{key: string, label: string, color: string|null}>,
 *             buttons: Array<{key: string, entry: Object, chip: string|null, color: string|null}> }}
 */
export function cardSections(entries) {
	const rows = Array.isArray(entries) ? entries : []
	const byCategory = rows.some((row) => row.item_type === "Category")
	const sections = new Map()
	const buttons = []
	let current = null
	rows.forEach((row, index) => {
		if (row.item_type === "Category") {
			current = `category:${index}`
			sections.set(current, { key: current, label: row.label || "", entries: [] })
			return
		}
		if (row.item_type !== "Item" && row.item_type !== "Menu") return
		let chip = current
		if (!byCategory) {
			chip = row.item_type === "Item" && row.item_group ? `group:${row.item_group}` : null
			if (chip && !sections.has(chip)) sections.set(chip, { key: chip, label: row.item_group, entries: [] })
		}
		if (chip) sections.get(chip).entries.push(row)
		buttons.push({ key: `entry:${index}`, entry: row, chip })
	})
	const chips = [...sections.values()]
		.filter((section) => section.entries.length > 0)
		.map((section) => ({ key: section.key, label: section.label, color: commonColour(section.entries) }))
	const colourOfChip = new Map(chips.map((chip) => [chip.key, chip.color]))
	for (const button of buttons) {
		const own = button.entry.item_type === "Item" ? cardColor(button.entry.custom_color) : null
		button.color = own || colourOfChip.get(button.chip) || null
	}
	return { chips, buttons }
}

// A gift row of an offer is no dish the waiter ordered
const ordered = (line) => line && !line.is_free_item

/**
 * The quantity of each item the order already holds, its lines added up.
 * @param {Array<Object>} lines - The cart's lines
 * @returns {Map<string, number>}
 */
export function orderedByItem(lines) {
	const counts = new Map()
	for (const line of lines || []) {
		if (!ordered(line)) continue
		counts.set(line.item_code, (counts.get(line.item_code) || 0) + (Number(line.quantity) || 0))
	}
	return counts
}

/**
 * The lines of an order not sent to the kitchen yet, by the till's own rule (SendToKitchenDialog.vue, isSendable): no
 * kitchen status, or held back (« Waiting »). A gift row of an offer follows its dish and is not counted.
 * @param {Array<Object>} lines - The cart's lines
 * @returns {Array<Object>}
 */
export function unsentLines(lines) {
	return (lines || []).filter((line) => ordered(line) && (!line.kds_status || line.kds_status === "Waiting"))
}

/**
 * The number of articles of an order.
 * @param {Array<Object>} lines - The cart's lines
 * @returns {number}
 */
export function articleCount(lines) {
	let count = 0
	for (const line of lines || []) if (ordered(line)) count += Number(line.quantity) || 0
	return count
}

/**
 * A count as a person writes it: no needless decimals, three at most.
 * @param {number} count
 * @returns {string}
 */
export function formatCount(count) {
	return String(Math.round((Number(count) || 0) * 1000) / 1000)
}

/**
 * What an option group asks for: "required" (a choice must be made), "single" (one at most, by choice) or "optional"
 * (any number, by choice).
 * @param {{required?: number|boolean, selection_type?: string}} group
 * @returns {"required"|"single"|"optional"}
 */
export function groupRule(group) {
	if (group?.required) return "required"
	return group?.selection_type === "Single" ? "single" : "optional"
}

/**
 * A portion of a dish priced with its options, then the portions. An option may set the quantity of a portion (a glass
 * of 3 dl is a quantity of 3 of a wine priced by the decilitre): the line's quantity is then that quantity once per
 * portion. The options are written as the till stores them on the line (posa_item_modifiers).
 *
 * @param {number} price - The price of the dish without options
 * @param {Array<Object>} groups - Its option groups
 * @param {Object<string, string[]>} selections - The options chosen, by group name
 * @param {number} portions - The portions ordered
 * @returns {{adjustment: number, quantityValue: number, quantity: number, unit: number, total: number,
 *            modifiers: Array<{group: string, options: Array<Object>}>}}
 */
export function pricedChoice(price, groups, selections, portions) {
	let adjustment = 0
	let quantityValue = 0
	const modifiers = []
	for (const group of groups || []) {
		const chosen = selections?.[group.group_name] || []
		if (chosen.length === 0) continue
		const options = []
		for (const name of chosen) {
			const option = (group.options || []).find((candidate) => candidate.option_name === name)
			const entry = { name, price_adjustment: Number(option?.price_adjustment) || 0 }
			adjustment += entry.price_adjustment
			if (Number(option?.quantity_value) > 0) {
				entry.quantity_value = Number(option.quantity_value)
				quantityValue = entry.quantity_value
			}
			options.push(entry)
		}
		modifiers.push({ group: group.group_name, options })
	}
	// Never below zero, as the cart never prices a line below zero (posCart.updateItemModifiers)
	const unit = Math.max(0, round((Number(price) || 0) + adjustment))
	const quantity = (quantityValue || 1) * Math.max(1, portions || 1)
	return { adjustment: round(adjustment), quantityValue, quantity, unit, total: round(unit * quantity), modifiers }
}

function round(amount) {
	return Math.round(amount * 1e6) / 1e6
}

/**
 * The line a card item makes in the order: the very line the card grid's touch gives it (cardItemToCartItem, the one
 * builder of POSSale.vue's handleCardItemClick), the station that prepares it included.
 *
 * //// Neoffice — was a copy of the touch's field list, which carried no unit; it now takes the touch's own builder, so that a
 * //// field the touch gains (a unit, a course) reaches the long press too (task 27 meeting task 22).
 *
 * @param {Object} cardItem - An Item row of a card
 * @param {Function} stationOf - (item_code, item_group) → { station } or null (the restaurant store's getStationForItem)
 * @returns {Object}
 */
export function cardItemLine(cardItem, stationOf) {
	const line = cardItemToCartItem(cardItem)
	const station = stationOf?.(line.item_code, line.item_group)
	if (station) line.preparation_station = station.station
	return line
}

/**
 * Whether the till shows the phone's order screen: on a phone (below PHONE_MAX_WIDTH), on the order tab of an open
 * table or takeaway order, at a restaurant till with an open shift and at least one card — the same moment a tablet
 * shows the card grid. It steps aside while the table's QR code is shown, which the till draws under it.
 *
 * @param {{width: number, hasOpenShift: boolean, restaurant: boolean, cards: number, table: Object|null,
 *          takeaway: boolean, tab: string, qrShown: boolean}} till
 * @returns {boolean}
 */
export function phoneOrderShown(till) {
	return Boolean(
		till.width < PHONE_MAX_WIDTH &&
			till.hasOpenShift &&
			till.restaurant &&
			till.cards > 0 &&
			(till.table || till.takeaway) &&
			till.tab === "items" &&
			!till.qrShown,
	)
}
