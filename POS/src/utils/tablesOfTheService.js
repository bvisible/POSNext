//// Neoffice — added file (no upstream equivalent). The list of tables of the restaurant till (NeoResto lot 1, task 26):
//// on a phone the till opens on it rather than on the floor plan (product owner, 31.10.2026: « on the phone, show the
//// list of the tables by default rather than the plan »), as the waiter mockup draws it. It holds every table of the
//// restaurant, sorted by what needs the waiter first, and says of each only what the till's data says: the parts of
//// the mockup a later lot brings (the waiter's own tables, « order the next course? », the course families, « the
//// guest is calling ») are left out, not faked (Ruling 66). This module is the list's logic, and nothing else: what
//// goes first, what each badge says, what a filter keeps. The components draw it (TablesList, TableCard).
import { secondsSinceMidnight } from "@/utils/offerSchedule"
//// Neoffice — the groups of a table (.1, .2) its order summary counts and names, and the search that finds a table by them (NeoResto lot 1, notes)
import { tableMatchesSearch, tableNotesInfo } from "@/utils/tableNotes"

// The filter that keeps every room: « All »
export const ALL_ROOMS = "all"

// A reservation shows under « Soon » when it arrives within the hour...
export const SOON_MINUTES = 60
// ...and still while it is late and its guests are not seated, until the delay after which the server marks a booking
// as a no-show when the restaurant sets none (`no_show_delay or 60`, pos_next/api/reservations.py). Past it the guests are
// not coming, or the server has marked them so already
export const LATE_MINUTES = 60

// The bookings whose guests are still to come
const COMING = ["Pending", "Confirmed"]

const DAY_MS = 24 * 60 * 60000
const pad = (n) => String(n).padStart(2, "0")

// Tables in their natural order: « Table 2 » before « Table 10 »
const NATURAL = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
})

/**
 * A time as the server writes it ("2026-10-31 19:33:12.123456": no zone, a space, microseconds). The server writes the
 * site's wall clock (System Settings' time zone): the time is read as that wall clock, its fields written as UTC, so
 * that it compares with siteClock(...).wall whatever zone the device is set to. Safari, the phones' browser, reads no
 * space in a date and would give an invalid date, so the parts are read one by one.
 *
 * @param {string|null|undefined} value
 * @returns {Date|null}
 */
export function serverTime(value) {
	const parts = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
		String(value || ""),
	)
	if (!parts) return null
	const [, year, month, day, hours, minutes, seconds] = parts.map(Number)
	return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds || 0))
}

/**
 * The site's clock at an instant: its date, its minutes since midnight, and its wall clock written as UTC fields (as
 * serverTime() reads the server's times). The time of day is read with the till's own helper for the site's zone
 * (utils/offerSchedule.js, which the offers' hours use); a zone the device does not know, or none, is the device's.
 *
 * @param {string|null|undefined} timezone - the site's time zone (the bootstrap's `system_timezone`)
 * @param {Date} now
 * @returns {{date: string, minutes: number, wall: number}}
 */
export function siteClock(timezone, now = new Date()) {
	// A zone the device does not know reads the device's clock, for the date as for the time
	let zone = timezone || null
	let date
	try {
		const parts = new Intl.DateTimeFormat("en-GB", {
			timeZone: zone || undefined,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).formatToParts(now)
		const get = (type) => parts.find((part) => part.type === type)?.value
		date = `${get("year")}-${get("month")}-${get("day")}`
	} catch {
		date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
		zone = null
	}
	const seconds = secondsSinceMidnight(zone, now)
	const [year, month, day] = date.split("-").map(Number)
	return {
		date,
		minutes: Math.floor(seconds / 60),
		wall: Date.UTC(year, month - 1, day) + seconds * 1000,
	}
}

/** A date as the server writes it (2026-10-31), moved by a number of days */
function shiftDate(date, days) {
	const [year, month, day] = date.split("-").map(Number)
	const moved = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS)
	return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`
}

/**
 * The days whose reservations « Soon » needs at a time of the site's clock: today; tomorrow too within the hour before
 * midnight (a booking at 00:15 arrives within the hour from 23:15); yesterday too within the hour after it (a booking
 * at 23:50 is still late at 00:20).
 *
 * @param {{date: string, minutes: number}} clock - siteClock()
 * @returns {string[]}
 */
export function reservationDays(clock) {
	const days = [clock.date]
	if (clock.minutes >= 24 * 60 - SOON_MINUTES)
		days.push(shiftDate(clock.date, 1))
	if (clock.minutes < LATE_MINUTES) days.push(shiftDate(clock.date, -1))
	return days
}

/** The word the floor plan writes on a table for its state: one literal msgid per state, the plan's own. */
function stateWord(status) {
	switch (status) {
		case "Occupied":
			return __("Occupied")
		case "Paid":
			return __("Paid")
		case "Cleaning":
			return __("Cleaning")
		case "Reserved":
			return __("Reserved")
		default:
			return __("Empty")
	}
}

/**
 * What the badge of a table ready at the pass says. The pass names the station each ready line comes from, and the
 * type of that station: a kitchen's line is a dish, so « Dishes ready at the pass »; drinks only, or lines whose station
 * says nothing, are only « Ready at the pass », which is true of whatever is waiting there.
 */
function readyBadge(lines) {
	const aDish = lines.some((line) => line.station_type === "Kitchen")
	return {
		text: aDish ? __("Dishes ready at the pass") : __("Ready at the pass"),
		tone: "ready",
	}
}

function qrBadge(count) {
	return {
		text:
			count === 1
				? __("QR · {0} item to accept", [count])
				: __("QR · {0} items to accept", [count]),
		tone: "quiet",
	}
}

// The tone of a badge, by the table's state, for the states that are not an alert
const QUIET_TONES = {
	Occupied: "neutral",
	Paid: "paid",
	Cleaning: "cleaning",
	Reserved: "reserved",
	Empty: "free",
}

/**
 * The tables of the service, as the list shows them.
 *
 * @param {object} floor
 * @param {object[]} floor.tables - the floor's tables (get_tables): state, room, the open order's summary, the counts of
 *   lines on hold (`waiting_items_count`) and of a QR order's lines to accept (`qr_waiting_count`)
 * @param {object[]} floor.areas - the rooms of the plan, in its order
 * @param {object[]} floor.runnerOrders - the pass's orders (get_runner_orders): the ready lines of each table
 * @param {object[]} floor.reservations - the restaurant's reservations of the days around now (get_reservations)
 * @param {Date} floor.now - the instant
 * @param {string} [floor.timezone] - the site's time zone: the server's times are its wall clock
 * @param {string} floor.room - the filter: a room's name, or ALL_ROOMS
 * @param {string} [floor.search] - what was typed to find a table: its label, or the name of one of its groups (NeoResto lot 1, notes); the tables that do not answer it are left out of the list. « All · N » and the free tables
 *   of « Open a table » are not narrowed by it
 * @returns {{room: string, rooms: {name: string, label: string}[], activeCount: number, busy: object[], soon: object[],
 *   others: object[], free: object[]}} `busy` the tables with something going on, the most urgent first; `soon` the
 *   reservations arriving; `others` the free, cleaning and reserved tables; `free` the free tables, for « Open a table »
 */
export function tablesOfTheService({
	tables = [],
	areas = [],
	runnerOrders = [],
	reservations = [],
	now = new Date(),
	timezone = null,
	room = ALL_ROOMS,
	search = "",
}) {
	const clock = siteClock(timezone, now)
	const rooms = areas.map((area) => ({
		name: area.name,
		label: area.area_name || area.name,
	}))
	// A room that is gone from the plan (renamed or deleted on another till) leaves « All » shown
	const shownRoom =
		room !== ALL_ROOMS && rooms.some((r) => r.name === room) ? room : ALL_ROOMS
	const roomOrder = new Map(rooms.map((r, at) => [r.name, at]))
	const planOrder = (a, b) =>
		(roomOrder.get(a.table.area) ?? rooms.length) -
			(roomOrder.get(b.table.area) ?? rooms.length) ||
		NATURAL.compare(a.title, b.title)

	const readyLines = new Map()
	for (const order of runnerOrders) {
		if (!order?.restaurant_table) continue
		readyLines.set(order.restaurant_table, [
			...(readyLines.get(order.restaurant_table) || []),
			...(order.items || []),
		])
	}

	const everyEntry = tables.map((table) =>
		entryOf(table, readyLines.get(table.name) || [], clock),
	)
	//// Neoffice — the search narrows what the list shows, not its counts nor the free tables of « Open a table » (NeoResto lot 1, notes): « All · N » stays the number of tables in service
	const busyCount = everyEntry.filter((entry) =>
		BUSY_TIERS.includes(entry.tier),
	).length
	const entries = everyEntry.filter((entry) =>
		tableMatchesSearch(entry.table, search),
	)
	const busy = entries.filter((entry) => BUSY_TIERS.includes(entry.tier))
	const inRoom = (entry) =>
		shownRoom === ALL_ROOMS || entry.table.area === shownRoom

	return {
		room: shownRoom,
		rooms,
		// « Toutes · N »: every table with something going on, whatever room is shown
		activeCount: busyCount,
		busy: busy.filter(inRoom).sort((a, b) => urgency(a, b) || planOrder(a, b)),
		soon: soonOf(reservations, tables, clock, shownRoom),
		others: entries
			.filter((entry) => !BUSY_TIERS.includes(entry.tier) && inRoom(entry))
			.sort(planOrder),
		free: everyEntry
			.filter((entry) => entry.tier === "free" && inRoom(entry))
			.sort(planOrder)
			.map((entry) => entry.table),
	}
}

// The tiers of the tables with something going on, in the order the list shows them
const BUSY_TIERS = ["ready", "qr", "occupied", "paid"]

// The most urgent first; within a tier, the table seated longest first (one whose time is not known after the others)
function urgency(a, b) {
	const tier = BUSY_TIERS.indexOf(a.tier) - BUSY_TIERS.indexOf(b.tier)
	if (tier) return tier
	if (a.seatedAt && b.seatedAt) return a.seatedAt - b.seatedAt
	return (a.seatedAt ? 0 : 1) - (b.seatedAt ? 0 : 1)
}

function entryOf(table, readyLinesOfTable, clock) {
	const status = table.status || "Empty"
	const order = status === "Occupied" ? table.order_summary || null : null
	const notes = order ? tableNotesInfo(table) : { count: 0, names: [] }
	const seatedAt = order ? serverTime(order.opened_at) : null
	const qrCount = Number(table.qr_waiting_count) || 0
	const onHold = Number(table.waiting_items_count) || 0

	let tier
	let badge
	if (status === "Occupied" && readyLinesOfTable.length) {
		tier = "ready"
		badge = readyBadge(readyLinesOfTable)
	} else if (status === "Occupied" && qrCount > 0) {
		tier = "qr"
		badge = qrBadge(qrCount)
	} else {
		tier =
			{
				Occupied: "occupied",
				Paid: "paid",
				Cleaning: "cleaning",
				Reserved: "reserved",
			}[status] || "free"
		//// Neoffice — a table of direct service (a bar, a counter) says so instead of « Empty »: it is never seated (the product owner, 08.11.2026)
		badge = { text: table.direct_service ? __("Direct service") : stateWord(status), tone: QUIET_TONES[status] || "free" }
	}

	return {
		key: table.name,
		kind: "table",
		tier,
		table,
		// The table by its label alone: the till records no covers on an order (only a reservation says its guests)
		title: table.table_name || table.name,
		badge,
		seatedAt,
		minutes: seatedAt
			? Math.max(0, Math.floor((clock.wall - seatedAt.getTime()) / 60000))
			: null,
		// The server tells the total only to whoever may read the sales invoices: none is said otherwise
		total:
			order && order.grand_total != null ? Number(order.grand_total) : null,
		// The lines on hold, as the plan's chip counts them, but for the ones the QR badge already counts
		waiting: Math.max(0, onHold - (tier === "qr" ? qrCount : 0)),
		//// Neoffice — how many groups (.1, .2) the table seats and the names they were given, from the order summary (NeoResto lot 1, notes)
		notesCount: notes.count,
		noteNames: notes.names,
		// The table's QR code, for the guests to order: on a table that is occupied or free
		qr:
			tier === "ready" ||
			tier === "qr" ||
			tier === "occupied" ||
			tier === "free",
	}
}

/**
 * « Soon »: the reservations arriving within the hour, or late and not seated yet (marked), the earliest first. A
 * booking is placed by its date and its time on the site's clock, so that midnight is no edge: tomorrow's 00:15 is
 * 45 minutes ahead at 23:30.
 */
function soonOf(reservations, tables, clock, shownRoom) {
	// The minute the site's clock is in: a booking due this minute is neither ahead nor late
	const nowMinute = clock.wall - (clock.wall % 60000)
	const byName = new Map(tables.map((table) => [table.name, table]))
	const soon = []
	for (const booking of reservations || []) {
		if (!COMING.includes(booking.status)) continue
		const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(
			String(booking.reservation_date || ""),
		)
		const time = /^(\d{1,2}):(\d{2})/.exec(
			String(booking.reservation_time || ""),
		)
		if (!day || !time) continue
		const due = Date.UTC(
			Number(day[1]),
			Number(day[2]) - 1,
			Number(day[3]),
			Number(time[1]),
			Number(time[2]),
		)
		const ahead = (due - nowMinute) / 60000
		if (ahead > SOON_MINUTES || ahead < -LATE_MINUTES) continue

		const bookedTables = (booking.tables || []).map((row) => ({
			table: byName.get(row.restaurant_table) || null,
			label:
				byName.get(row.restaurant_table)?.table_name ||
				row.table_name ||
				row.restaurant_table,
			area: byName.get(row.restaurant_table)?.area || row.area,
		}))
		// A booking belongs to the rooms of its tables; one with no table belongs to no room, « All » shows it
		if (
			shownRoom !== ALL_ROOMS &&
			!bookedTables.some((row) => row.area === shownRoom)
		)
			continue

		const guests = Number(booking.no_of_guests) || 0
		const shownTime = `${time[1].padStart(2, "0")}:${time[2]}`
		soon.push({
			key: booking.name,
			kind: "reservation",
			due,
			// Its guests are late and not seated yet
			late: ahead < 0,
			title: bookedTables.length
				? bookedTables.map((row) => row.label).join(" + ")
				: __("No table"),
			detail:
				guests === 1
					? __("reserved {0} · {1} guest", [shownTime, guests])
					: __("reserved {0} · {1} guests", [shownTime, guests]),
			// A tap opens the booking's (first) table, as a tap on the plan opens it; a booking with no table opens nothing
			table: bookedTables.find((row) => row.table)?.table || null,
		})
	}
	return soon.sort((a, b) => a.due - b.due)
}
