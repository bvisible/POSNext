//// Neoffice — added file (no upstream equivalent). The kitchen's last action follows the station's runner setting (NeoRestau lot 1,
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
import { splitIntoBands } from "@/utils/kitchenBands"

// A dish the cook still works on, or has finished: what a ticket is about
const LIVE = new Set(["Pending", "Preparing", "Ready"])

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
	return (
		line?.kds_status === "Ready" &&
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
		if (!lines.some(atThePass)) {
			view.push(order)
		} else if (
			lines.some((line) => !atThePass(line) && LIVE.has(line?.kds_status))
		) {
			view.push({
				...order,
				items: lines.map((line) =>
					atThePass(line)
						? { ...line, kds_status: "Delivered", at_the_pass: true }
						: line,
				),
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
		const ready = (order?.items || []).filter((line) =>
			carriedByRunner(line, stations, runnerEnabled),
		)
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
