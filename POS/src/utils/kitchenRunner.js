//// Neoffice — added file (no upstream equivalent). The kitchen's last action follows the station's runner setting (NeoResto lot 1,
//// task 38a-1, ruling 112). A preparation station says whether its dishes go through a runner (`use_runner`, on by default).
////
//// - WITH a runner, the cook stops at "Ready": the dish waits for the runner, who delivers it from the runner screen. It stays on the
////   kitchen's ticket, STRUCK THROUGH like a delivered dish (kitchen test, 01.11: the cook wants to see what was sent; it first left the
////   ticket, which was taking room), and a ticket whose dishes are all at the pass leaves the screen. The kitchen keeps the information
////   in a count of what waits at the pass, and a dish can be called back to preparation from the list behind it.
//// - WITHOUT a runner (a small bistro: the cook walks the plate to the table), the cook delivers: "Ready" and "Delivered" are one
////   gesture, the dish and its ticket leave the screen at once.
////
//// Which it is, is a fact about a STATION; the restaurant's own runner switch (`enable_runner`) overrides it: with no runner at all
//// the kitchen delivers whatever a station says. A station the screen does not know, or that does not say, has a runner (the
//// default of the setting). These are the rules, written once, here, and only read by the screen.
//// Neoffice — a line of several units can be marked ready for SOME of them (kitchen test of 01.11: « six of the same dish, and four are done »). A line
//// carries two cumulative counters, `kds_ready_qty` (units cooked so far) and `kds_delivered_qty` (units delivered so far), and the rule of the units
//// AT THE PASS (the ones the runner carries) is written here, once (`unitsAtThePass`), as on the server (`_units_at_the_pass`), both tested against the
//// one table pos_next/tests/kitchen_pass_cases.json. A line cooked in part stays on the kitchen's ticket with the units still to cook as its quantity
//// (`qty`, the line's own quantity being kept in `ordered_qty`), and the cooked ones wait at the pass.
import { splitIntoBands } from "@/utils/kitchenBands"
//// Neoffice — a dish sent ahead of its course is not at the pass until the room calls it (the service rhythm, NeoResto lot 1, Daniel, 01.11)
import { isUncalled } from "@/utils/courseCall"

// A dish the cook still works on, or has finished: what a ticket is about
const LIVE = new Set(["Pending", "Preparing", "Ready"])
// A dish at the stove: not ready yet, so a line of it can be cooked in part
const AT_THE_STOVE = new Set(["Pending", "Preparing"])

// A quantity counts to three decimals, as the server's does (a line can be 1.5 kg)
const rounded = (value) => Math.round(value * 1000) / 1000
const count = (value) => {
	const number = Number(value)
	return Number.isFinite(number) ? number : 0
}

/**
 * The quantity a line was ORDERED in. A view of the screen lowers `qty` to the units it shows (the ones still to cook on a ticket, the ones at
 * the pass in the runner's list) and keeps the line's own quantity in `ordered_qty`.
 *
 * @param {{ qty?: number|string, ordered_qty?: number|string }|null|undefined} line
 * @returns {number}
 */
export function orderedQty(line) {
	return rounded(count(line?.ordered_qty ?? line?.qty))
}

/**
 * How many units of a line wait AT THE PASS: the units the runner carries. This is the rule of `_units_at_the_pass` on the server, tested against
 * the same table (pos_next/tests/kitchen_pass_cases.json).
 *
 * - Delivered: none
 * - Ready: the quantity, less what was delivered (a line saved before the counters existed has them at 0: all of it waits)
 * - Pending or Preparing, a line cooked in part: what was cooked, less what was delivered
 * - no status, Waiting, a status the kitchen does not know: none
 * Never below 0, never above the line's quantity.
 *
 * @param {object} line - A line with its `kds_status`, `qty` and the counters `kds_ready_qty` and `kds_delivered_qty`
 * @returns {number}
 */
export function unitsAtThePass(line) {
	const qty = orderedQty(line)
	const delivered = Math.min(rounded(count(line?.kds_delivered_qty)), qty)
	let units = 0
	if (line?.kds_status === "Ready") units = qty - delivered
	else if (AT_THE_STOVE.has(line?.kds_status))
		units = Math.min(rounded(count(line?.kds_ready_qty)), qty) - delivered
	return Math.max(0, rounded(units))
}

/**
 * How many units of a line the kitchen still has to cook: what was not cooked, for a line at the stove; none for any other.
 *
 * @param {object} line
 * @returns {number}
 */
export function unitsToCook(line) {
	if (!AT_THE_STOVE.has(line?.kds_status)) return 0
	const qty = orderedQty(line)
	return Math.max(0, rounded(qty - Math.min(rounded(count(line?.kds_ready_qty)), qty)))
}

/**
 * How many units of ONE ITEM the kitchen still has to cook, over all its lines of the order: the server marks units ready line by line, in the
 * order of the order's lines, so this is what a quantity picked can reach.
 *
 * @param {object[]} lines - The order's lines
 * @param {string} itemCode
 * @returns {number}
 */
export function unitsLeftToCookOfItem(lines, itemCode) {
	return rounded(
		(lines || [])
			.filter((line) => line?.item_code === itemCode)
			.reduce((total, line) => total + unitsToCook(line), 0),
	)
}

/**
 * The state a line is left in once the runner delivers what waits at the pass of it, as the server does it: a line that is Ready is Delivered, every unit counted
 * delivered; a line cooked in part keeps its status and the delivered units catch up with the cooked ones (the rest is still to cook). Only the status for a line the
 * server sent no counters for. This is what the toast of the five seconds compares with, to put the line back.
 *
 * @param {object} line - A line of the runner's list, as the card holds it
 * @returns {{ kds_status: string, kds_ready_qty?: number, kds_delivered_qty?: number }}
 */
export function stateAfterDelivery(line) {
	const known = line?.kds_ready_qty !== undefined || line?.kds_delivered_qty !== undefined
	if (isCookedInPart(line)) {
		const cooked = rounded(count(line.kds_ready_qty))
		return { kds_status: line.kds_status, kds_ready_qty: cooked, kds_delivered_qty: cooked }
	}
	if (!known) return { kds_status: "Delivered" }
	const ordered = orderedQty(line)
	return { kds_status: "Delivered", kds_ready_qty: ordered, kds_delivered_qty: ordered }
}

/**
 * Whether a line is cooked in part: some of its units are cooked, not all of them. It is still on the kitchen's ticket, for the rest.
 *
 * @param {object} line
 * @returns {boolean}
 */
export function isCookedInPart(line) {
	if (!AT_THE_STOVE.has(line?.kds_status)) return false
	//// Neoffice — units cooked of a dish whose course is not called are not "sent": nothing leaves for the pass before the call, so the line is shown whole (the service rhythm)
	if (isUncalled(line)) return false
	const cooked = rounded(count(line?.kds_ready_qty))
	return cooked > 0 && cooked < orderedQty(line)
}

/**
 * Whether a station's dishes go through a runner.
 *
 * @param {{ use_runner?: number|string|boolean }|null|undefined} station - A station of `get_preparation_stations`
 * @returns {boolean} true unless the station says it has none (a station that does not say keeps the default: yes)
 */
export function stationUsesRunner(station) {
	const flag = station?.use_runner
	if (flag === undefined || flag === null || flag === "") return true
	return !(flag === 0 || flag === "0" || flag === false)
}

const stationOf = (line, stations) =>
	(stations || []).find((station) => station.name === line?.preparation_station)

/** Whether the dish's own station sends it through a runner, when the restaurant has one. */
function dishUsesRunner(line, stations, runnerEnabled) {
	return runnerEnabled !== false && stationUsesRunner(stationOf(line, stations))
}

/**
 * Whether a dish has left the kitchen for the runner: it is Ready and its station has one. The kitchen screen does not draw it.
 *
 * @param {object} line - A dish of an order
 * @param {object[]} stations - The stations the screen knows
 * @param {boolean} [runnerEnabled] - The restaurant's own runner switch
 * @returns {boolean}
 */
export function carriedByRunner(line, stations, runnerEnabled = true) {
	//// Neoffice — « Prêt d'avance » (the kitchen prepares ahead): a dish finished before its course is called waits for the call, not for the runner; it stays on the ticket as it is, and goes to the pass when the room calls it
	return (
		line?.kds_status === "Ready" &&
		!isUncalled(line) &&
		dishUsesRunner(line, stations, runnerEnabled)
	)
}

/**
 * Whether the ticket's last action is "Ready" (a runner carries it on) rather than "Delivered" (the cook does): a live dish of the
 * ticket sits at a station that uses a runner. A ticket whose live dishes are all at stations with none is delivered by the cook.
 * Nothing live, nothing known: the default, a runner.
 *
 * @param {object} order
 * @param {object[]} stations
 * @param {boolean} [runnerEnabled]
 * @returns {boolean}
 */
export function orderUsesRunner(order, stations, runnerEnabled = true) {
	if (runnerEnabled === false) return false
	const live = (order?.items || []).filter((line) => LIVE.has(line?.kds_status))
	if (!live.length) return true
	return live.some((line) => dishUsesRunner(line, stations, runnerEnabled))
}

/**
 * The orders as the KITCHEN screen draws them: the dishes a runner now carries stay on the ticket, struck through.
 *
 * A dish that has left for the runner is drawn as finished business (a delivered dish is struck through and inert, and the tickets keep
 * those for the whole meal): the cook still sees what was sent, and what is left to cook. It is a COPY of the dish that says
 * "Delivered" and `at_the_pass`; the dish itself, and the order's own data, keep saying "Ready". A ticket therefore falls in the band its
 * dishes still to cook give it, as when the dishes at the pass were left off (the delivered ones count for nothing in a band).
 *
 * An order with no dish at the pass is the order itself (a ticket updates it optimistically and the screen has to see it); the dishes of
 * one that has some are the SAME objects, but for the copies. An order with nothing live left for the kitchen is dropped: its dishes
 * are at the pass or delivered. (A fully delivered order has none at the pass and stays, for the screen to show or hide.)
 *
 * @param {object[]} orders
 * @param {{ stations?: object[], runnerEnabled?: boolean }} [context]
 * @returns {object[]}
 */
export function kitchenView(
	orders,
	{ stations = [], runnerEnabled = true } = {},
) {
	const view = []
	for (const order of orders || []) {
		const lines = order?.items || []
		const atThePass = (line) => carriedByRunner(line, stations, runnerEnabled)
		//// Neoffice — a ticket is never dropped for having nothing left to cook (Daniel, 01.11: « ça ne doit pas disparaître, ça doit venir barrer »). It used to leave the screen with its
		//// last dish, for the list « to deliver »; it now stays, every dish struck through, until the runner delivers them, and a table whose starters are done while its mains are held
		//// back stays too, the starters struck and the mains to come. `view_state` tells the screen why the ticket has no dish to cook (read by kitchenStatusOf and the card).
		const live = lines.some(
			(line) => !atThePass(line) && LIVE.has(line?.kds_status),
		)
		const held = lines.some((line) => line?.kds_status === "Waiting")
		const done = lines.some((line) => line?.kds_status === "Delivered")
		if (!lines.some((line) => atThePass(line) || isCookedInPart(line))) {
			if (!live && held && done) view.push({ ...order, view_state: "next-course" })
			else view.push(order)
		} else {
			view.push({
				...order,
				...(live ? {} : { view_state: "at-the-pass" }),
				items: lines.map((line) => {
					if (atThePass(line))
						return { ...line, kds_status: "Delivered", at_the_pass: true }
					//// Neoffice — a line cooked in part keeps the units still to cook as its quantity, and the line's own quantity beside it: the cooked units are at the pass
					if (isCookedInPart(line))
						return { ...line, qty: unitsToCook(line), ordered_qty: orderedQty(line) }
					return line
				}),
			})
		}
	}
	return view
}

/**
 * What waits at the pass: the orders that hold Ready dishes of a station with a runner, each reduced to those dishes, oldest first.
 *
 * @param {object[]} orders
 * @param {{ stations?: object[], runnerEnabled?: boolean }} [context]
 * @returns {object[]}
 */
export function readyForTheRunner(
	orders,
	{ stations = [], runnerEnabled = true } = {},
) {
	const waiting = []
	for (const order of orders || []) {
		const ready = []
		for (const line of order?.items || []) {
			if (!dishUsesRunner(line, stations, runnerEnabled)) continue
			//// Neoffice — the runner is offered a dish only once its course is called (the service rhythm, NeoResto lot 1)
			if (isUncalled(line)) continue
			const units = unitsAtThePass(line)
			if (units <= 0) continue
			//// Neoffice — a Ready line that waits whole is the line itself (a recall is optimistic on it); a line cooked in part, or with units delivered, is a
			//// Ready copy of the units that wait, the line's own quantity beside them
			if (line.kds_status === "Ready" && units === orderedQty(line) && line.ordered_qty === undefined)
				ready.push(line)
			else
				ready.push({
					...line,
					kds_status: "Ready",
					qty: units,
					ordered_qty: orderedQty(line),
					at_the_pass: true,
				})
		}
		if (ready.length) waiting.push({ ...order, items: ready })
	}
	// Every one of these is Ready: they all sort into the same band, in the order of the bands
	return splitIntoBands(waiting).production
}

/**
 * How many dishes the orders hold, by quantity: two plates on one line are two plates to carry.
 *
 * @param {object[]} orders
 * @returns {number}
 */
export function countDishes(orders) {
	let total = 0
	for (const order of orders || [])
		for (const line of order?.items || []) total += Number(line?.qty) || 0
	return total
}

/**
 * How many dishes wait in one room, by quantity: the chip of a room counts what the page counts, two plates on one line being two plates.
 *
 * @param {object[]} orders - The orders of `get_runner_orders`, each with its `area`
 * @param {string} area - The room
 * @returns {number}
 */
export function countDishesOfRoom(orders, area) {
	return countDishes((orders || []).filter((order) => order?.area === area))
}

/**
 * How many dishes wait at each station, by quantity: `{ station: dishes }`. A dish that names no station is at none.
 *
 * @param {object[]} orders
 * @returns {Record<string, number>}
 */
export function countDishesByStation(orders) {
	const counts = {}
	for (const order of orders || [])
		for (const line of order?.items || []) {
			const station = line?.preparation_station
			if (!station) continue
			counts[station] = (counts[station] || 0) + (Number(line?.qty) || 0)
		}
	return counts
}
