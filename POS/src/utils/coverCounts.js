//// Neoffice — added file (no upstream equivalent). The covers of a table (NeoResto lot 1): how many people are seated, and how many portions the order holds per course against that number, so that a waiter forgets
//// nobody (« Starters 3/3 ✓ · Mains 2/3 ») and the kitchen and the pass read the same count on the ticket. The rule is PURE: lines and a number in, chips out; the cart, the dialog, the header and the two kitchen
//// cards all go through it, so that none of them can count differently.
////
//// Only the food courses count (Starter, Main, Dessert): a drink follows no course, and a dish with no family cannot be set against the guests. A row that hangs under another (a promotion's gift, a free row) is the
//// line that earned it, not a portion of its own, and is left out; an offered row (« Offert ») is a real portion on the table and counts, as it does on the kitchen's ticket.

import { COURSES, familyOf } from "@/utils/serviceFamilies"
import { sectionLabel } from "@/utils/ticketFamilies"

/** The fewest and the most people a table can hold: the server refuses anything else. */
export const COVERS_MIN = 1
export const COVERS_MAX = 99

/** The states of a course against the covers: no number set, short of it, exactly it, past it. */
export const TALLY_NONE = "none"
export const TALLY_SHORT = "short"
export const TALLY_DONE = "done"
export const TALLY_OVER = "over"

/**
 * The number of people as the server takes it: a whole number from 1 to 99, else nothing at all.
 *
 * @param {unknown} value - A number, a numeric string, or whatever a field holds
 * @returns {number|null} null for no number (unset, empty, 0, a fraction, out of bounds, not a number)
 */
export function normalizeCovers(value) {
	if (value === null || value === undefined || value === "") return null
	if (typeof value !== "number" && typeof value !== "string") return null
	const number = typeof value === "number" ? value : Number(value.trim())
	if (!Number.isInteger(number)) return null
	return number >= COVERS_MIN && number <= COVERS_MAX ? number : null
}

/**
 * A number brought into bounds (what the stepper and the field of the dialog keep): the nearest whole number from 1 to 99, `fallback` for something that is no number.
 *
 * @param {unknown} value
 * @param {number} [fallback] - Taken when `value` is no number at all
 * @returns {number}
 */
export function clampCovers(value, fallback = COVERS_MIN) {
	const number =
		typeof value === "string"
			? Number(value.trim() || Number.NaN)
			: Number(value)
	if (value === null || value === undefined || !Number.isFinite(number))
		return fallback
	return Math.min(COVERS_MAX, Math.max(COVERS_MIN, Math.round(number)))
}

/**
 * What an order payload carries for the covers: the key alone when a number is set, nothing when it is not (never an invalid value).
 *
 * @param {unknown} covers
 * @returns {{ restaurant_covers: number }|{}}
 */
export function coversPayload(covers) {
	const number = normalizeCovers(covers)
	return number === null ? {} : { restaurant_covers: number }
}

/** The state of a count of portions against the covers. */
export function tallyState(count, covers) {
	const wanted = normalizeCovers(covers)
	if (wanted === null) return TALLY_NONE
	if (count < wanted) return TALLY_SHORT
	return count === wanted ? TALLY_DONE : TALLY_OVER
}

// A gift, an offered row hanging under its line, a free row: no portion of their own (see the header)
const hangsUnder = (line) =>
	Boolean(
		line?._giftOf ||
			line?._offeredOf ||
			line?.is_free_item ||
			line?._isStandaloneFreeRow,
	)

// 2 and not 1.9999999999999998: quantities are summed, weighed ones included
const round = (value) => Math.round(value * 100) / 100

/**
 * The portions the lines hold per course.
 *
 * @param {Array<Object>} lines - Cart lines: `quantity`, `service_family`
 * @returns {Map<string, number>} Course (Starter, Main, Dessert) to portions, only the courses that have a line
 */
export function portionsByCourse(lines) {
	const portions = new Map()
	for (const line of lines || []) {
		if (hangsUnder(line)) continue
		const family = familyOf(line)
		if (!COURSES.includes(family)) continue
		const quantity = Number(line.quantity ?? line.qty)
		if (!(quantity > 0)) continue
		portions.set(family, (portions.get(family) || 0) + quantity)
	}
	return portions
}

/**
 * The chips of the counter at the head of the order: one per course that has a line, in the order of the meal.
 *
 * @param {Array<Object>} lines - Cart lines
 * @param {unknown} covers - The number of people, unset when null
 * @returns {Array<{ family: string, label: string, count: number, covers: number|null, state: "none"|"short"|"done"|"over" }>}
 */
export function courseChips(lines, covers) {
	const wanted = normalizeCovers(covers)
	const portions = portionsByCourse(lines)
	return COURSES.filter((family) => portions.has(family)).map((family) => {
		const count = round(portions.get(family))
		return {
			family,
			label: sectionLabel(family),
			count,
			covers: wanted,
			state: tallyState(count, wanted),
		}
	})
}

/**
 * The count of one course of an order the SERVER counted (`family_counts` over all its lines), against the order's covers: what a kitchen or pass ticket writes after the label of a course.
 *
 * @param {{ covers?: number|null, family_counts?: Object<string, number> }} order
 * @param {string} family
 * @returns {{ count: number, covers: number, state: "short"|"done"|"over" }|null} null for a drink, an order with no covers, or a course the server did not count
 */
export function ticketTally(order, family) {
	const covers = normalizeCovers(order?.covers)
	if (covers === null || !COURSES.includes(family)) return null
	const raw = order?.family_counts?.[family]
	if (raw === null || raw === undefined || raw === "") return null
	const count = Number(raw)
	if (!Number.isFinite(count)) return null
	return {
		count: round(count),
		covers,
		state: tallyState(round(count), covers),
	}
}

/**
 * What a kitchen or pass ticket says of the people at its table: « 3 guests » (« 3 pers. » in French), the words of the context "Kitchen ticket covers" so that the abbreviation is a kitchen's own.
 *
 * @param {unknown} covers
 * @returns {string} "" for no valid number
 */
export function ticketCoversLabel(covers) {
	const number = normalizeCovers(covers)
	if (number === null) return ""
	return number === 1
		? __("1 guest", null, "Kitchen ticket covers")
		: __("{0} guests", [number], "Kitchen ticket covers")
}

/** « 2/3 »: how many portions against how many people. */
export function tallyText({ count, covers }) {
	return `${count}/${covers}`
}

/**
 * The text colour of a count on a kitchen or pass ticket (small grey capitals): the design system's status tones with their dark counterparts, as the list of tables wears them.
 * The count never relies on colour alone: « 3/3 » has a tick and « 4/3 » a plus sign, written by the card.
 */
export const TALLY_TEXT = {
	[TALLY_NONE]: "text-gray-700",
	[TALLY_SHORT]: "text-[#92610C] dark:text-ds-warning",
	[TALLY_DONE]: "text-[#11663A] dark:text-ds-success",
	[TALLY_OVER]: "text-[#9C2920] dark:text-ds-danger",
}
