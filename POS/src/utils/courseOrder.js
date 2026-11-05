//// Neoffice — added file (no upstream equivalent). The order of the meal on a kitchen ticket (NeoResto lot 1, Daniel, 01.11: « on commence évidemment par les entrées. On ne peut pas lancer les
//// plats si on n'a pas fait les entrées. Les plats viennent disponibles quand on a fini les entrées. Les entrées viennent grisées [barrées] […] et puis on avance comme ça »).
////
//// A ticket's dishes come in courses (utils/serviceFamilies: Starter, Main, Dessert after the drinks). The kitchen follows the order of the meal: a course WAITS, greyed and not to be touched,
//// while a course before it still has a dish to cook (Pending or Preparing); it becomes available when that dish is ready (or delivered, or at the pass). A dish already begun is never held, whatever is still to cook before it (Daniel, 05.11). A drink never waits and never makes another
//// dish wait, nor does a dish with no family, nor a dish the waiter holds back (Waiting): it is not at the kitchen yet. The rule is a choice of the SCREEN (a small kitchen that cooks everything
//// at once turns it off), kept on the device like the size of the text, and ON by default: it is what the product owner asked.

import { COURSES, familyOf } from "@/utils/serviceFamilies"
//// Neoffice — the rule is without effect where the kitchen prepares ahead (the service rhythm, NeoResto lot 1, Daniel, 01.11)
import { isPreparedAhead } from "@/utils/serviceRhythm"

/** The rule is on unless a device says otherwise. */
export const DEFAULT_COURSE_ORDER = true

export const COURSE_ORDER_KEY = "pos_next_kitchen_course_order"

// A dish still to cook: the courses after it wait for it
const TO_COOK = new Set(["Pending", "Preparing"])
// A dish begun or done: it is never held itself (a begun dish still makes the courses after it wait, it is in TO_COOK)
const BEGUN = new Set(["Preparing", "Ready", "Delivered"])

const rankOf = (line) => {
	const rank = COURSES.indexOf(familyOf(line))
	return rank < 0 ? 0 : rank + 1
}

/**
 * The rank (1 starters, 2 mains, 3 desserts) of the first course that still has a dish to cook, or Infinity when none has.
 *
 * @param {Array<Object>} lines - The dishes of the ticket as the screen shows them (`service_family`, `kds_status`)
 * @returns {number}
 */
export function lockedCourseRank(lines) {
	let first = Number.POSITIVE_INFINITY
	for (const line of lines || []) {
		const rank = rankOf(line)
		if (rank && TO_COOK.has(line?.kds_status) && rank < first) first = rank
	}
	return first
}

/**
 * Whether a dish waits for the course before it.
 *
 * @param {Object} line - The dish
 * @param {Array<Object>} lines - Every dish of the ticket on this screen (the line is one of them)
 * @param {boolean} [enabled] - The screen's choice: false holds nothing
 * @returns {boolean}
 */
export function isHeldByCourse(line, lines, enabled = DEFAULT_COURSE_ORDER) {
	if (!enabled) return false
	// A dish already begun is never held, nor is one that is done (Daniel, 05.11: « on ne grise jamais un plat commencé […] marqué en préparation, je ne comprends pas comment ça peut être
	// en préparation et grisé »). Only a dish nobody has begun waits for its turn; a dish begun ahead of its course, or begun before a late starter was ordered, keeps its whole menu.
	if (BEGUN.has(line?.kds_status)) return false
	const rank = rankOf(line)
	return rank > 0 && rank > lockedCourseRank(lines)
}

/**
 * Whether the kitchen follows the order of the meal on a screen: the device's choice, and never where the restaurant's kitchen prepares ahead. There the later courses are on the ticket from
 * « Valider », marked « à l'avance », and the cooks may start and finish them whenever they like: greying them would forbid what the rhythm is for (Daniel, 01.11: the rule is off in that mode).
 *
 * @param {boolean} deviceChoice - What the device chose (the default is on)
 * @param {string} [rhythm] - The restaurant's service rhythm
 * @returns {boolean}
 */
export function followsTheOrderOfTheMeal(deviceChoice, rhythm) {
	return Boolean(deviceChoice) && !isPreparedAhead(rhythm)
}

/** The choice a device stored ("1" / "0"); anything else is the default. */
export function courseOrderFromStorage(value) {
	if (value === "1") return true
	if (value === "0") return false
	return DEFAULT_COURSE_ORDER
}

/** Reads the device's choice; storage that is missing or refuses is the default. */
export function readCourseOrder() {
	try {
		return courseOrderFromStorage(window.localStorage?.getItem(COURSE_ORDER_KEY))
	} catch {
		return DEFAULT_COURSE_ORDER
	}
}

/** Keeps the device's choice; a device that cannot store keeps it for the page only. */
export function saveCourseOrder(value) {
	try {
		window.localStorage?.setItem(COURSE_ORDER_KEY, value ? "1" : "0")
	} catch {
		// the choice holds for as long as the page is open
	}
}
