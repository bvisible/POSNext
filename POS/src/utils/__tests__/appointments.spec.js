//// Neoffice — added file (no upstream equivalent). The agenda of a salon at its till (NeoSalon, step 2, lot G4; product owner, 10.11.2026).
// The rules of the screen: which column an appointment belongs to, where a block stands on the grid, which hours are free, what waits for its payment,
// how a person stands. No component here: the rules alone.
import { beforeAll, describe, expect, it } from "vitest"

beforeAll(() => {
	globalThis.__ = (text, args = []) =>
		(args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

const {
	activeTimeOf,
	appointmentsOf,
	avatarColorOf,
	blockGeometry,
	clockOf,
	columnsOf,
	dayMoved,
	dayRange,
	firstStepOf,
	freeHoursOf,
	hourOf,
	initialsOf,
	isOff,
	isToCollect,
	lengthOf,
	minutesLongOf,
	minutesOf,
	offsetOf,
	personOf,
	remainingOf,
	standingOf,
	standsAs,
	titleOf,
	toCollectCount,
} = await import("../appointments")

const row = (booking, person, start, end, extra = {}) => ({
	key: booking,
	booking,
	starts_at: `2026-11-10 ${start}:00`,
	ends_at: `2026-11-10 ${end}:00`,
	steps: [{ label: "Coupe", sales_person: person, sales_person_name: person }],
	state: "booked",
	busy: false,
	can: { collect: true, move: true, cancel: true, clock: true },
	...extra,
})
const person = (name, extra = {}) => ({
	key: name,
	sales_person: name,
	sales_person_name: name,
	status: "present",
	periods: [
		["09:00", "12:00"],
		["13:00", "17:00"],
	],
	...extra,
})

describe("the times of the site", () => {
	it("reads the minutes and the hour of a moment, with or without its date", () => {
		expect(minutesOf("2026-11-10 09:30:00")).toBe(570)
		expect(minutesOf("9:05")).toBe(545)
		expect(hourOf("2026-11-10 09:30:00")).toBe("09:30")
		expect(hourOf("")).toBe("")
		expect(hourOf(null)).toBe("")
		expect(minutesOf("nothing")).toBeNull()
		expect(clockOf(570)).toBe("09:30")
		expect(clockOf(5)).toBe("00:05")
	})

	it("says a length in the words of a salon", () => {
		expect([lengthOf(45), lengthOf(90), lengthOf(120), lengthOf(0)]).toEqual([
			"45 min",
			"1 h 30",
			"2 h",
			"0 min",
		])
	})

	it("says the time a clock really ran in hours and minutes", () => {
		expect([
			activeTimeOf(0),
			activeTimeOf(2460),
			activeTimeOf(3900),
			activeTimeOf(-5),
		]).toEqual(["0:00", "0:41", "1:05", "0:00"])
	})

	it("moves a day by a number of days, over a month and a year", () => {
		expect([
			dayMoved("2026-11-10", 1),
			dayMoved("2026-11-30", 1),
			dayMoved("2026-01-01", -1),
			dayMoved("2026-03-01", -1),
		]).toEqual(["2026-11-11", "2026-12-01", "2025-12-31", "2026-02-28"])
	})
})

describe("how a person stands", () => {
	it("names the state of a column's header in the site's words, with the hour she arrives", () => {
		expect(standingOf(person("Luc"))).toEqual({ label: "Here", tone: "ok" })
		expect(
			standingOf(person("Camille", { status: "not_yet", from: "14:00" })),
		).toEqual({ label: "From 14:00", tone: "warn" })
		expect(standingOf(person("Camille", { status: "not_yet" }))).toEqual({
			label: "Not in yet",
			tone: "warn",
		})
		expect(standingOf(person("Sonia", { status: "on_leave" })).tone).toBe(
			"mute",
		)
		expect(standingOf(person("Sonia", { status: "holiday" })).label).toBe(
			"Holiday",
		)
		expect(standingOf(person("Alix", { status: "unknown" }))).toBeNull()
	})

	it("takes a person off the grid when she does not work that day", () => {
		expect(
			["on_leave", "holiday", "off"].map((status) =>
				isOff(person("x", { status })),
			),
		).toEqual([true, true, true])
		expect(
			["present", "break", "not_yet", "done", "scheduled", "unknown"].some(
				(status) => isOff(person("x", { status })),
			),
		).toBe(false)
	})
})

describe("where an appointment stands", () => {
	it("is in the till while a draft is open, unless it is paid", () => {
		expect(
			standsAs(row("A", "Luc", "09:00", "10:00", { in_the_till: true })),
		).toBe("in_the_till")
		expect(
			standsAs(
				row("A", "Luc", "09:00", "10:00", { in_the_till: true, state: "paid" }),
			),
		).toBe("paid")
		expect(
			standsAs(row("A", "Luc", "09:00", "10:00", { state: "started" })),
		).toBe("started")
		expect(standsAs({})).toBe("booked")
	})

	it("is to handle when the salon was closed on its day after it was booked, and nobody has begun it", () => {
		expect(
			standsAs(row("A", "Luc", "09:00", "10:00", { to_handle: "closed" })),
		).toBe("to_handle")
		// Begun, paid or absent: what it is wins over the flag
		for (const state of ["started", "finished", "paid", "absent"]) {
			expect(
				standsAs(row("A", "Luc", "09:00", "10:00", { to_handle: "closed", state })),
			).toBe(state)
		}
	})

	it("waits for its payment when the work is done or its hour is over, and it is hers to collect", () => {
		const now = 12 * 60
		expect(isToCollect(row("A", "Luc", "09:00", "10:00"), now)).toBe(true)
		expect(isToCollect(row("A", "Luc", "11:30", "12:30"), now)).toBe(false)
		expect(
			isToCollect(
				row("A", "Luc", "11:30", "12:30", { state: "finished" }),
				now,
			),
		).toBe(true)
		expect(
			isToCollect(row("A", "Luc", "09:00", "10:00", { state: "paid" }), now),
		).toBe(false)
		expect(
			isToCollect(row("A", "Luc", "09:00", "10:00", { state: "absent" }), now),
		).toBe(false)
		expect(
			isToCollect(
				row("A", "Luc", "09:00", "10:00", { can: { collect: false } }),
				now,
			),
		).toBe(false)
		expect(
			isToCollect(row("A", "Luc", "09:00", "10:00", { busy: true }), now),
		).toBe(false)
		expect(isToCollect(null, now)).toBe(false)
	})

	it("counts what waits for its payment", () => {
		const day = [
			row("A", "Luc", "09:00", "10:00"),
			row("B", "Luc", "11:00", "12:00", { state: "paid" }),
			row("C", "Luc", "13:00", "14:00"),
		]
		expect(toCollectCount(day, 12 * 60 + 30)).toBe(1)
		expect(toCollectCount(day, 15 * 60)).toBe(2)
		expect(toCollectCount([], 0)).toBe(0)
	})

	it("is about the labels of its steps and as long as its hours", () => {
		const appointment = {
			...row("A", "Luc", "09:00", "10:30"),
			steps: [{ label: "Coupe" }, { label: "Brushing" }, {}],
		}
		expect(titleOf(appointment)).toBe("Coupe + Brushing")
		expect(firstStepOf(appointment).label).toBe("Coupe")
		expect(firstStepOf({})).toEqual({})
		expect(minutesLongOf(appointment)).toBe(90)
		expect(minutesLongOf({})).toBe(0)
	})
})

describe("the columns of the agenda", () => {
	it("has a column for each person of the team, in her order, with her appointments", () => {
		const columns = columnsOf(
			[
				person("Luc"),
				person("Sonia", { status: "on_leave" }),
				person("Camille"),
			],
			[
				row("A", "Camille", "14:30", "15:30"),
				row("B", "Luc", "09:00", "10:00"),
				row("C", "Luc", "11:00", "12:00"),
			],
		)

		expect(
			columns.map((c) => [c.key, c.appointments.map((a) => a.booking)]),
		).toEqual([
			["Luc", ["B", "C"]],
			["Sonia", []],
			["Camille", ["A"]],
		])
	})

	it("puts an appointment nobody holds in a last column, and one of somebody the team does not list in a column of her own", () => {
		const columns = columnsOf(
			[person("Luc")],
			[
				row("A", null, "15:00", "16:00"),
				row("B", "Marc", "10:00", "11:00"),
				row("C", "Luc", "09:00", "10:00"),
			],
		)

		expect(
			columns.map((c) => [c.key, c.appointments.map((a) => a.booking)]),
		).toEqual([
			["Luc", ["C"]],
			["Marc", ["B"]],
			["unassigned", ["A"]],
		])
		expect(columns[1].person.sales_person_name).toBe("Marc")
		expect(columns[2].person).toBeNull()
	})

	it("keeps no unassigned column when nobody is unassigned, and handles an empty day", () => {
		expect(columnsOf([person("Luc")], []).map((c) => c.key)).toEqual(["Luc"])
		expect(columnsOf(undefined, undefined)).toEqual([])
	})

	it("says whose an appointment is by its first step that has a person", () => {
		const appointment = {
			steps: [
				{ label: "Pose" },
				{ sales_person: "Luc" },
				{ sales_person: "Sonia" },
			],
		}
		expect(personOf(appointment)).toBe("Luc")
		expect(personOf({ steps: [] })).toBeNull()
		expect(
			appointmentsOf(
				[
					row("A", "Luc", "09:00", "10:00"),
					row("B", "Sonia", "09:00", "10:00"),
				],
				"Sonia",
			).map((a) => a.booking),
		).toEqual(["B"])
		expect(
			appointmentsOf([row("A", "Luc", "09:00", "10:00")], null),
		).toHaveLength(1)
	})
})

describe("the grid of the day", () => {
	it("shows 8:00 to 18:00 at least and widens to what is worked and what is booked", () => {
		expect(dayRange([], [])).toEqual({ start: 8, end: 18 })
		expect(
			dayRange([person("Luc", { periods: [["07:30", "19:15"]] })], []),
		).toEqual({ start: 7, end: 20 })
		expect(
			dayRange(
				[person("Luc")],
				[row("A", "Luc", "06:00", "07:00"), row("B", "Luc", "20:00", "21:30")],
			),
		).toEqual({ start: 6, end: 22 })
	})

	it("puts a block where its hour is and as high as its length, never under a thumb's width", () => {
		const range = { start: 8, end: 18 }
		expect(blockGeometry(row("A", "Luc", "09:00", "10:30"), range, 60)).toEqual(
			{ top: 60, height: 87 },
		)
		expect(blockGeometry(row("A", "Luc", "08:00", "08:15"), range, 60)).toEqual(
			{ top: 0, height: 30 },
		)
		expect(blockGeometry({}, range, 60)).toEqual({ top: 0, height: 30 })
		expect(offsetOf(14 * 60 + 10, range, 60)).toBe(370)
	})
})

describe("the hours a person is free", () => {
	it("are what she works less what is booked, not shorter than half an hour", () => {
		const free = freeHoursOf(person("Luc"), [
			row("A", "Luc", "09:30", "10:30"),
			row("B", "Luc", "13:00", "15:30"),
		])

		expect(free.map((f) => [clockOf(f.from), clockOf(f.to)])).toEqual([
			["09:00", "09:30"],
			["10:30", "12:00"],
			["15:30", "17:00"],
		])
	})

	it("drop a gap that is shorter than the least asked, and an appointment that overlaps two hours is counted once", () => {
		const free = freeHoursOf(
			person("Luc", { periods: [["09:00", "12:00"]] }),
			[row("A", "Luc", "09:10", "11:50"), row("B", "Luc", "10:00", "10:30")],
			30,
		)
		expect(free).toEqual([])
		expect(
			freeHoursOf(
				person("Luc", { periods: [["09:00", "12:00"]] }),
				[row("A", "Luc", "09:10", "11:50")],
				10,
			).map((f) => [f.from, f.to]),
		).toEqual([
			[540, 550],
			[710, 720],
		])
	})

	it("are none for a person who is off, has no hours, or is nobody", () => {
		expect(freeHoursOf(person("Sonia", { status: "on_leave" }), [])).toEqual([])
		expect(freeHoursOf(person("Alix", { periods: [] }), [])).toEqual([])
		expect(freeHoursOf(null, [])).toEqual([])
	})
})

describe("the money of a sale", () => {
	it("is what a customer owes after what she paid, to the cent, and negative when she is owed", () => {
		expect(remainingOf(188, 40)).toBe(148)
		expect(remainingOf(180.2, 40)).toBe(140.2)
		expect(remainingOf(30, 40)).toBe(-10)
		expect(remainingOf(0.3, 0.1)).toBe(0.2)
		expect(remainingOf(undefined, undefined)).toBe(0)
	})
})

describe("the avatars", () => {
	it("keep two letters and always the same colour for a name", () => {
		expect([
			initialsOf("Sonia Martin"),
			initialsOf("Sonia"),
			initialsOf(""),
			initialsOf(null),
		]).toEqual(["SM", "SO", "?", "?"])
		expect(avatarColorOf("Sonia")).toBe(avatarColorOf("Sonia"))
		expect(avatarColorOf("Sonia")).toMatch(/^#[0-9A-F]{6}$/i)
	})
})
