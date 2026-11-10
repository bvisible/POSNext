//// Neoffice — added file (no upstream equivalent). The agenda of a salon at its till (NeoSalon, step 2, lot G4; product owner, 10.11.2026).
//// The site's lanes give the till the day (pos_next.api.appointments.get_appointments: the team with how each stands, every appointment with where it
//// stands and what the cashier may do with it). The rules of the screen are here, apart from the store, the composable and the components, to be
//// read and tested alone: where a block stands on the grid, which hours are free, which column an appointment belongs to, what is to collect.

/** The minutes since midnight of a moment the site writes (« 2026-11-10 09:30:00 », or « 09:30 »), or null. */
export function minutesOf(moment) {
	const match = /(\d{1,2}):(\d{2})/.exec(String(moment || ""))
	return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/** « HH:MM » of a number of minutes since midnight. */
export function clockOf(minutes) {
	const total = Math.max(0, Math.round(Number(minutes) || 0))
	return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

/** The hour of a moment the site writes, « 2026-11-10 09:30:00 » → « 09:30 » ("" when there is none). */
export function hourOf(moment) {
	const minutes = minutesOf(moment)
	return minutes === null ? "" : clockOf(minutes)
}

/** A length of time for the screen: 45 → « 45 min », 90 → « 1 h 30 », 120 → « 2 h ». */
export function lengthOf(minutes) {
	const total = Math.max(0, Math.round(Number(minutes) || 0))
	if (total < 60) return `${total} min`
	const hours = Math.floor(total / 60)
	const rest = total % 60
	return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`
}

/** The time a clock has really run, « 1:05 » for 3900 seconds (hours and minutes). */
export function activeTimeOf(seconds) {
	const minutes = Math.floor(Math.max(0, Number(seconds) || 0) / 60)
	return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
}

const OFF_STATUSES = new Set(["on_leave", "holiday", "off"])

/** Whether a person does not work that day (leave, holiday, no hours): her column is a hatched one, nobody is booked there. */
export function isOff(person) {
	return OFF_STATUSES.has(person?.status)
}

/** How a person stands, for her column's header: `{ label, tone }` (tone: ok, warn or mute), or null when the site did not say. */
export function standingOf(person) {
	switch (person?.status) {
		case "present":
			return { label: __("Here"), tone: "ok" }
		case "break":
			return { label: __("Break"), tone: "warn" }
		case "not_yet":
			return {
				label: person.from ? __("From {0}", [person.from]) : __("Not in yet"),
				tone: "warn",
			}
		case "done":
			return { label: __("Done for today"), tone: "mute" }
		case "scheduled":
			return { label: __("Scheduled"), tone: "mute" }
		case "on_leave":
			return { label: __("On leave"), tone: "mute" }
		case "holiday":
			return { label: __("Holiday"), tone: "mute" }
		case "off":
			return { label: __("Not working"), tone: "mute" }
		default:
			return null
	}
}

/**
 * Where an appointment stands, for its pill: `in_the_till` while a cashier holds its draft (and it is not paid), else its state.
 * @returns {"in_the_till"|"booked"|"started"|"finished"|"paid"|"absent"}
 */
export function standsAs(appointment) {
	if (appointment?.in_the_till && appointment.state !== "paid")
		return "in_the_till"
	return appointment?.state || "booked"
}

/**
 * Whether an appointment waits for its payment: not paid, not absent, hers to collect, and the work is done (the clock says so) or its hour is
 * over. A salon that never starts nor finishes still sees what it has to collect.
 * @param {number|null} nowMinutes - the minutes since midnight now
 */
export function isToCollect(appointment, nowMinutes) {
	if (!appointment || appointment.busy || !appointment.can?.collect)
		return false
	if (appointment.state === "finished") return true
	if (appointment.state === "paid" || appointment.state === "absent")
		return false
	const ends = minutesOf(appointment.ends_at)
	return ends !== null && nowMinutes !== null && ends <= nowMinutes
}

/** The person an appointment belongs to on the grid: the person of its first step that has one, or null (« to assign »). */
export function personOf(appointment) {
	return (
		appointment?.steps?.find((step) => step?.sales_person)?.sales_person || null
	)
}

/**
 * The columns of the agenda: one per person of the team, in her order, and a column « to assign » at the end when an appointment has nobody.
 * @returns {Array<{ key: string, person: object|null, appointments: Array }>}
 */
export function columnsOf(people, appointments) {
	const byPerson = new Map()
	const loose = []
	for (const appointment of appointments || []) {
		const person = personOf(appointment)
		if (!person) {
			loose.push(appointment)
			continue
		}
		if (!byPerson.has(person)) byPerson.set(person, [])
		byPerson.get(person).push(appointment)
	}
	const columns = []
	for (const person of people || []) {
		const own =
			byPerson.get(person.sales_person) || byPerson.get(person.key) || []
		columns.push({ key: person.key, person, appointments: own })
		byPerson.delete(person.sales_person)
		byPerson.delete(person.key)
	}
	// An appointment of somebody the team does not list (left, an account of another company) still has a place: nobody loses a customer
	for (const [key, list] of byPerson) {
		const name =
			list[0]?.steps?.find((step) => step?.sales_person === key)
				?.sales_person_name || key
		columns.push({
			key,
			person: {
				key,
				sales_person: key,
				sales_person_name: name,
				status: "unknown",
				periods: [],
			},
			appointments: list,
		})
	}
	if (loose.length)
		columns.push({ key: "unassigned", person: null, appointments: loose })
	return columns
}

/**
 * The hours the grid shows: the earliest start and the latest end of what is worked and what is booked, rounded out to whole hours, at least 8:00 to 18:00.
 * @returns {{ start: number, end: number }} hours (0 to 24)
 */
export function dayRange(people, appointments) {
	let first = 8 * 60
	let last = 18 * 60
	const see = (from, to) => {
		if (from !== null) first = Math.min(first, from)
		if (to !== null) last = Math.max(last, to)
	}
	for (const person of people || []) {
		for (const [from, to] of person?.periods || [])
			see(minutesOf(from), minutesOf(to))
	}
	for (const appointment of appointments || [])
		see(minutesOf(appointment.starts_at), minutesOf(appointment.ends_at))
	return {
		start: Math.max(0, Math.floor(first / 60)),
		end: Math.min(24, Math.ceil(last / 60)),
	}
}

/**
 * Where a block stands on a grid of `pxPerHour` that starts at `range.start`, in pixels.
 * @returns {{ top: number, height: number }}
 */
export function blockGeometry(appointment, range, pxPerHour) {
	const from = minutesOf(appointment?.starts_at)
	const to = minutesOf(appointment?.ends_at)
	const top = from === null ? 0 : ((from - range.start * 60) / 60) * pxPerHour
	const length = from !== null && to !== null && to > from ? to - from : 30
	return {
		top: Math.round(top),
		height: Math.max(Math.round((length / 60) * pxPerHour) - 3, 30),
	}
}

/** Where a time of the day stands on the same grid, in pixels. */
export function offsetOf(minutes, range, pxPerHour) {
	return Math.round(((minutes - range.start * 60) / 60) * pxPerHour)
}

/**
 * The hours a person is free: what she works, less what is booked, at least `least` minutes long. Nobody is offered where she has no hours (the site
 * gave none) or does not work that day.
 * @returns {Array<{ from: number, to: number }>} minutes since midnight
 */
export function freeHoursOf(person, appointments, least = 30) {
	if (!person || isOff(person) || !(person.periods || []).length) return []
	const taken = (appointments || [])
		.map((appointment) => [
			minutesOf(appointment.starts_at),
			minutesOf(appointment.ends_at),
		])
		.filter(([from, to]) => from !== null && to !== null && to > from)
		.sort((a, b) => a[0] - b[0])
	const free = []
	for (const [startText, endText] of person.periods) {
		let cursor = minutesOf(startText)
		const end = minutesOf(endText)
		if (cursor === null || end === null || end <= cursor) continue
		for (const [from, to] of taken) {
			if (to <= cursor || from >= end) continue
			if (from - cursor >= least) free.push({ from: cursor, to: from })
			cursor = Math.max(cursor, to)
		}
		if (end - cursor >= least) free.push({ from: cursor, to: end })
	}
	return free
}

/** How many appointments the cashier may collect now, for the rail's badge. */
export function toCollectCount(appointments, nowMinutes) {
	return (appointments || []).filter((appointment) =>
		isToCollect(appointment, nowMinutes),
	).length
}

/** The appointments of one person (all of them when none is asked). */
export function appointmentsOf(appointments, person) {
	if (!person) return appointments || []
	return (appointments || []).filter(
		(appointment) => personOf(appointment) === person,
	)
}

const AVATAR_COLORS = [
	"#8A4B2A",
	"#2C4FA8",
	"#1E9E62",
	"#A85B32",
	"#6D28D9",
	"#0E7490",
]

/** The two letters of a person's avatar, « Sonia Martin » → « SM », « Sonia » → « SO »; « ? » for nobody. */
export function initialsOf(name) {
	const words = String(name || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
	if (words.length === 0) return "?"
	return (
		words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)
	).toUpperCase()
}

/** A colour for a person's avatar, always the same one for the same name (a team keeps its colours from one screen to the other). */
export function avatarColorOf(name) {
	let hash = 0
	for (const ch of String(name || ""))
		hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
	return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

/** The first step of an appointment, or an empty one. */
export function firstStepOf(appointment) {
	return appointment?.steps?.[0] || {}
}

/** What an appointment is about: the labels of its steps, « Coupe + brushing ». */
export function titleOf(appointment) {
	return (appointment?.steps || [])
		.map((step) => step?.label)
		.filter(Boolean)
		.join(" + ")
}

/** The length of an appointment in minutes (0 when it has no hours). */
export function minutesLongOf(appointment) {
	const from = minutesOf(appointment?.starts_at)
	const to = minutesOf(appointment?.ends_at)
	return from !== null && to !== null && to > from ? to - from : 0
}

/** What a customer owes after what she paid, to the cent: what the till asks of her (negative: what it gives back). */
export function remainingOf(total, paid) {
	return Math.round(((Number(total) || 0) - (Number(paid) || 0)) * 100) / 100
}

/** A day as the site writes it, `YYYY-MM-DD`, moved by `days` (the agenda's arrows). */
export function dayMoved(day, days) {
	const [year, month, date] = String(day || "")
		.split("-")
		.map(Number)
	const moved = new Date(Date.UTC(year, (month || 1) - 1, (date || 1) + days))
	return moved.toISOString().slice(0, 10)
}
