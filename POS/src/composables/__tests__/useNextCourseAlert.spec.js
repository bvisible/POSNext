/**
 * //// Neoffice — added file (no upstream equivalent). What the kitchen screen does when the next course is ordered (NeoResto lot 1, Daniel, 01.11: « il doit y avoir un popup à la cuisine, et aussi un son
 * //// pour aviser », then « enlever le bandeau et afficher la carte »): it reads each reading of its orders through the rule (utils/nextCourseWatch), rings the sound the till chose once per reading, and makes
 * //// the ticket FLASH until the cook has taken its dishes up or said it has been seen (« To do »): « il faut la laisser clignoter jusqu'à ce qu'on ait validé ». All of it follows the till's settings.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const player = vi.hoisted(() => {
	globalThis.__ = (text) => text
	return { play: vi.fn(() => true) }
})
vi.mock("@/utils/alertSoundPlayer", () => ({ playAlertSound: player.play }))

const { useNextCourseAlert } = await import("../useNextCourseAlert")

const STARTERS = "2026-11-01 12:00:00.000000"
const DESSERTS = "2026-11-01 13:30:00.000000"
const LATER = "2026-11-01 13:50:00.000000"
const dish = (status, sentAt, family, extra = {}) => ({
	item_code: `${status}-${sentAt}-${family}`,
	kds_status: status,
	kds_sent_at: sentAt,
	service_family: family,
	preparation_station: "KITCHEN",
	...extra,
})
const before = (name) => ({ name, restaurant_table: `T-${name}`, table_display_name: `Table ${name}`, items: [dish("Preparing", STARTERS, "Starter")] })
const after = (name, sentAt = DESSERTS, family = "Dessert") => ({
	...before(name),
	items: [dish("Preparing", STARTERS, "Starter"), dish("Pending", sentAt, family)],
})
const taken = (name) => ({ ...before(name), items: [dish("Preparing", STARTERS, "Starter"), dish("Preparing", DESSERTS, "Dessert")] })

const DEFAULTS = { popup: true, nextCourseSound: "bell", runnerSound: "beep", volume: "medium" }
let settings
let scrolled
let alert

function start({ options, ...over } = {}) {
	settings = ref({ ...DEFAULTS, ...over })
	scrolled = []
	alert = useNextCourseAlert({ settings, scrollTo: (order) => scrolled.push(order), ...options })
	return alert
}

beforeEach(() => {
	vi.useFakeTimers()
	player.play.mockClear()
})
afterEach(() => {
	vi.useRealTimers()
})

describe("the next course ordered", () => {
	it("makes a sound, a flashing ticket and a scroll to it, once a ticket already on the screen gets a send", () => {
		start()
		alert.read([before("A")])
		expect(alert.flashing.value).toEqual([])

		const told = alert.read([after("A")])

		expect(told).toHaveLength(1)
		expect(told[0]).toMatchObject({ order: "A", table: "Table A", families: ["Dessert"] })
		expect(player.play).toHaveBeenCalledTimes(1)
		expect(player.play).toHaveBeenCalledWith("bell", "medium")
		expect(alert.flashing.value).toEqual(["A"])
		expect(scrolled).toEqual(["A"])
	})

	it("does nothing on the first reading, nor when the same orders are read again", () => {
		start()
		alert.read([after("A")])
		alert.read([after("A")])
		alert.read([after("A")])

		expect(alert.flashing.value).toEqual([])
		expect(player.play).not.toHaveBeenCalled()
	})

	it("rings once for several tables that order together, and every one of them flashes, the oldest call first, the screen going to that one", () => {
		start()
		alert.read([before("A"), before("B")])
		alert.read([after("A"), after("B", LATER)])

		expect(alert.flashing.value).toEqual(["A", "B"])
		expect(player.play).toHaveBeenCalledTimes(1)
		expect(scrolled).toEqual(["A"])
	})

	it("goes to the first ticket that blinks, not to the newest, when another is called while one is still to be taken", () => {
		start()
		alert.read([before("A"), before("B")])
		alert.read([after("A"), before("B")])
		scrolled.length = 0

		alert.read([after("A"), after("B", LATER)])

		expect(alert.flashing.value).toEqual(["A", "B"])
		expect(scrolled).toEqual(["A"])
	})

	it("is cut to the room the screen shows: a table of another room makes no flash and no sound", () => {
		start({ options: { accept: (order) => order.name !== "B" } })
		alert.read([before("A"), before("B")])
		alert.read([after("A"), after("B")])

		expect(alert.flashing.value).toEqual(["A"])
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("begins again when the screen's scope changes (another station): the next reading is only a baseline", () => {
		start()
		alert.read([before("A")], { station: "KITCHEN" })
		alert.reset()
		alert.read([after("A")], { station: "" })

		expect(alert.flashing.value).toEqual([])
		expect(player.play).not.toHaveBeenCalled()
	})

	it("looks only at the station it is told the screen shows", () => {
		start()
		const bar = (status, sentAt, family) => dish(status, sentAt, family, { preparation_station: "BAR" })
		const held = { ...before("A"), items: [...before("A").items, bar("Preparing", STARTERS, "Starter")] }
		alert.read([held], { station: "BAR" })
		const told = alert.read([{ ...held, items: [...held.items, bar("Pending", DESSERTS, "Dessert"), dish("Pending", DESSERTS, "Dessert")] }], { station: "BAR" })

		expect(told).toHaveLength(1)
		expect(told[0].count).toBe(1)
	})
})

describe("the settings of the till", () => {
	it("play the sound it chose, at the volume it chose", () => {
		start({ nextCourseSound: "gong", volume: "high" })
		alert.read([before("A")])
		alert.read([after("A")])

		expect(player.play).toHaveBeenCalledWith("gong", "high")
	})

	it("play nothing for the sound none, and still flash the ticket", () => {
		start({ nextCourseSound: "none" })
		alert.read([before("A")])
		alert.read([after("A")])

		expect(player.play).not.toHaveBeenCalled()
		expect(alert.flashing.value).toEqual(["A"])
	})

	it("make no flash and no scroll with the popup off, and still ring", () => {
		start({ popup: false })
		alert.read([before("A")])
		alert.read([after("A")])

		expect(alert.flashing.value).toEqual([])
		expect(scrolled).toEqual([])
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("follow a change of the settings from one reading to the next", () => {
		start()
		alert.read([before("A")])
		settings.value = { ...settings.value, nextCourseSound: "chime" }
		alert.read([after("A")])

		expect(player.play).toHaveBeenCalledWith("chime", "medium")
	})
})

describe("the flashing ticket", () => {
	it("flashes until the cook has taken the dishes up, however long it takes", () => {
		start()
		alert.read([before("A")])
		alert.read([after("A")])
		expect(alert.flashing.value).toEqual(["A"])

		vi.advanceTimersByTime(30 * 60 * 1000)
		alert.read([after("A")])
		expect(alert.flashing.value).toEqual(["A"])

		alert.read([taken("A")])
		expect(alert.flashing.value).toEqual([])
	})

	it("stops flashing a ticket that has left the screen", () => {
		start()
		alert.read([before("A")])
		alert.read([after("A")])

		alert.read([])

		expect(alert.flashing.value).toEqual([])
	})

	it("does not flash dishes that have nothing left to cook (they were finished ahead)", () => {
		start()
		alert.read([before("A")])
		alert.read([{ ...before("A"), items: [dish("Preparing", STARTERS, "Starter"), dish("Ready", DESSERTS, "Dessert")] }])

		expect(alert.flashing.value).toEqual([])
	})

	it("flashes again for a later send of the same table", () => {
		start()
		alert.read([before("A")])
		alert.read([after("A")])
		alert.acknowledge("A")
		alert.read([after("A", LATER, "Main")])

		expect(alert.flashing.value).toEqual(["A"])
	})
})

describe("a ticket seen and left to do (« To do »)", () => {
	it("stops flashing, and only that ticket does", () => {
		start()
		alert.read([before("A"), before("B")])
		alert.read([after("A"), after("B")])
		expect(alert.flashing.value.sort()).toEqual(["A", "B"])

		alert.acknowledge("A")

		expect(alert.flashing.value).toEqual(["B"])
	})

	it("stays quiet when the same send is read again: what was seen is not shown twice", () => {
		start()
		alert.read([before("A")])
		alert.read([after("A")])
		alert.acknowledge("A")
		alert.read([after("A")])
		alert.read([after("A")])

		expect(alert.flashing.value).toEqual([])
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("forgets an order it does not know", () => {
		start()
		expect(() => alert.acknowledge("nothing")).not.toThrow()
	})
})

//// Neoffice — the tickets that blink are dealt with one after another (Daniel, 01.11: « il faut pouvoir traiter les tickets qui clignotent l'un après l'autre de manière séparée »): each one has its own two
//// choices, and once one is dealt with the screen brings the next one that blinks into view, oldest call first
describe("the blinking tickets, one after the other", () => {
	const three = () => {
		start()
		alert.read([before("A"), before("B"), before("C")])
		alert.read([after("A")])
		alert.read([after("A"), after("B", LATER)])
		alert.read([after("A"), after("B", LATER), after("C", "2026-11-01 13:55:00.000000")])
		scrolled.length = 0
	}

	it("keeps them in the order they were called: the oldest call first", () => {
		three()

		expect(alert.flashing.value).toEqual(["A", "B", "C"])
	})

	it("brings the next one into view when one is left to do", () => {
		three()

		alert.acknowledge("A")

		expect(scrolled).toEqual(["B"])
		alert.acknowledge("B")
		expect(scrolled).toEqual(["B", "C"])
	})

	it("brings the next one into view when the cook starts the dishes of one", () => {
		three()

		alert.read([taken("A"), after("B", LATER), after("C", "2026-11-01 13:55:00.000000")])

		expect(alert.flashing.value).toEqual(["B", "C"])
		expect(scrolled).toEqual(["B"])
	})

	it("goes nowhere when the one dealt with was the last that blinked", () => {
		start()
		alert.read([before("A")])
		alert.read([after("A")])
		scrolled.length = 0

		alert.acknowledge("A")

		expect(scrolled).toEqual([])
	})

	it("stays where it is when a reading changes nothing", () => {
		three()

		alert.read([after("A"), after("B", LATER), after("C", "2026-11-01 13:55:00.000000")])
		alert.read([after("A"), after("B", LATER), after("C", "2026-11-01 13:55:00.000000")])

		expect(scrolled).toEqual([])
	})
})

//// Neoffice — a course held behind the one before it is not to be taken yet (Daniel, 01.11: table 10 went on blinking after the cook had started it, because its dessert, greyed behind the mains, could not be started):
//// a ticket blinks while a dish of the course called can be STARTED, not while it merely waits its turn
describe("a course held behind another", () => {
	const holdsDesserts = (line) => line.service_family === "Dessert"
	// the mains are still to cook, the dessert is called and waits behind them
	const behind = (name, mains = "Preparing") => ({
		...before(name),
		items: [dish("Preparing", STARTERS, "Starter"), dish(mains, STARTERS, "Main"), dish("Pending", DESSERTS, "Dessert")],
	})

	it("does not blink while every dish of the course called waits behind another, though the sound rings", () => {
		start({ options: { holds: holdsDesserts } })
		alert.read([before("A")])

		alert.read([behind("A")])

		expect(player.play).toHaveBeenCalledTimes(1)
		expect(alert.flashing.value).toEqual([])
	})

	it("blinks when the course before is done and the dish can be started: the call was kept", () => {
		let held = true
		start({ options: { holds: () => held } })
		alert.read([before("A")])
		alert.read([behind("A")])
		expect(alert.flashing.value).toEqual([])

		held = false
		alert.read([behind("A", "Ready")])

		expect(alert.flashing.value).toEqual(["A"])
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("stops blinking when the dish is started, and does not come back when it is held again by nothing", () => {
		start({ options: { holds: () => false } })
		alert.read([before("A")])
		alert.read([after("A")])
		expect(alert.flashing.value).toEqual(["A"])

		alert.read([taken("A")])

		expect(alert.flashing.value).toEqual([])
	})

	it("leaves nothing held by default: every dish of the course called blinks, as before", () => {
		start()
		alert.read([before("A")])
		alert.read([behind("A")])

		expect(alert.flashing.value).toEqual(["A"])
	})
})

//// Neoffice — a kitchen may have several tablets (Daniel, 01.11: « évidemment, on peut avoir imaginé plusieurs tablettes en cuisine »): the « to do » of one is told to the server, and the others stop blinking with their next
//// reading. A call is named by the key of the send the screen was told of; the reading says (`call_seen`) which key was taken up for the screen's station.
describe("a call taken up on another screen of the kitchen", () => {
	/** The key a screen gives the call of `send` on a table it already held (what it tells the server, what the server hands back). */
	function callKey(name, send) {
		const probe = useNextCourseAlert({ settings: ref({ ...DEFAULTS, nextCourseSound: "none" }), scrollTo: () => {} })
		probe.read([before(name)])
		return probe.read([send])[0].key
	}

	it("tells which call was taken up, with the key of the send it was told of", () => {
		const onAcknowledge = vi.fn()
		start({ options: { onAcknowledge } })
		alert.read([before("A")])
		const [told] = alert.read([after("A")])

		alert.acknowledge("A")

		expect(onAcknowledge).toHaveBeenCalledTimes(1)
		expect(onAcknowledge).toHaveBeenCalledWith("A", told.key)
		expect(told.key).toBe(callKey("A", after("A")))
	})

	it("tells nothing for a ticket that does not blink", () => {
		const onAcknowledge = vi.fn()
		start({ options: { onAcknowledge } })
		alert.read([before("A")])

		alert.acknowledge("A")
		alert.acknowledge("nothing")

		expect(onAcknowledge).not.toHaveBeenCalled()
	})

	it("stops blinking when a reading says that call was taken up elsewhere, and brings the next ticket that blinks into view", () => {
		start()
		alert.read([before("A"), before("B")])
		alert.read([after("A"), after("B", LATER)])
		expect(alert.flashing.value).toEqual(["A", "B"])
		scrolled.length = 0

		alert.read([{ ...after("A"), call_seen: callKey("A", after("A")) }, after("B", LATER)])

		expect(alert.flashing.value).toEqual(["B"])
		expect(scrolled).toEqual(["B"])
	})

	it("keeps blinking for a newer send than the one that was taken up", () => {
		start()
		alert.read([before("A")])
		alert.read([after("A")])
		alert.acknowledge("A")
		const later = after("A", LATER, "Main")
		alert.read([{ ...later, call_seen: callKey("A", after("A")) }])

		expect(alert.flashing.value).toEqual(["A"])
	})

	it("does not blink for a call already taken up elsewhere before this screen read it", () => {
		start()
		alert.read([before("A")])

		alert.read([{ ...after("A"), call_seen: callKey("A", after("A")) }])

		expect(alert.flashing.value).toEqual([])
	})

	it("is not told twice: the reading that carries the call taken up here changes nothing", () => {
		const onAcknowledge = vi.fn()
		start({ options: { onAcknowledge } })
		alert.read([before("A")])
		alert.read([after("A")])
		alert.acknowledge("A")
		alert.read([{ ...after("A"), call_seen: callKey("A", after("A")) }])

		expect(onAcknowledge).toHaveBeenCalledTimes(1)
		expect(alert.flashing.value).toEqual([])
	})
})

describe("an addition to a ticket (Daniel, 05.11)", () => {
	const row = (code, name, qty, family, status, sentAt) => ({
		item_code: code,
		item_name: name,
		qty,
		service_family: family,
		kds_status: status,
		kds_sent_at: sentAt,
		preparation_station: "KITCHEN",
	})
	const SOUP = row("SOUP", "Soup", 1, "Starter", "Delivered", STARTERS)
	const STEAK = row("STEAK", "Steak", 1, "Main", "Preparing", DESSERTS)
	const ticket = (name, items) => ({ name, restaurant_table: `T-${name}`, table_display_name: `Table ${name}`, items })
	const lateStarter = row("TARTARE", "Tartare de saumon", 1, "Starter", "Pending", LATER)

	it("rings, flashes the ticket and tells what was added", () => {
		start()
		alert.read([ticket("A", [SOUP, STEAK])])

		const told = alert.read([ticket("A", [SOUP, STEAK, lateStarter])])

		expect(told[0]).toMatchObject({ kind: "addition", order: "A" })
		expect(player.play).toHaveBeenCalledTimes(1)
		expect(alert.flashing.value).toEqual(["A"])
		expect(alert.added.value).toEqual({ A: [{ item_code: "TARTARE", name: "Tartare de saumon", qty: 1, family: "Starter" }] })
	})

	it("flashes although the cook cannot start the dish yet: the kitchen has to KNOW", () => {
		// The screen holds every dish behind the course before it: a next course would not flash, an addition does
		start({ options: { holds: () => true } })
		alert.read([ticket("A", [SOUP, STEAK])])

		alert.read([ticket("A", [SOUP, STEAK, lateStarter])])

		expect(alert.flashing.value).toEqual(["A"])
	})

	it("still does not flash a next course whose dishes all wait behind the course before them", () => {
		start({ options: { holds: () => true } })
		const held = row("TART", "Tart", 1, "Dessert", "Waiting", "")
		alert.read([ticket("A", [SOUP, STEAK, held])])

		alert.read([ticket("A", [SOUP, STEAK, { ...held, kds_status: "Pending", kds_sent_at: LATER }])])

		expect(alert.flashing.value).toEqual([])
		expect(alert.added.value).toEqual({})
	})

	it("stops telling what was added once the cook has seen the ticket", () => {
		start()
		alert.read([ticket("A", [SOUP, STEAK])])
		alert.read([ticket("A", [SOUP, STEAK, lateStarter])])

		alert.acknowledge("A")

		expect(alert.flashing.value).toEqual([])
		expect(alert.added.value).toEqual({})
	})

	it("stops telling it once the ticket leaves the screen, and when the screen begins again", () => {
		start()
		alert.read([ticket("A", [SOUP, STEAK])])
		alert.read([ticket("A", [SOUP, STEAK, lateStarter])])
		alert.read([ticket("B", [SOUP])])
		expect(alert.added.value).toEqual({})

		start()
		alert.read([ticket("A", [SOUP, STEAK])])
		alert.read([ticket("A", [SOUP, STEAK, lateStarter])])
		alert.reset()
		expect(alert.added.value).toEqual({})
	})
})
