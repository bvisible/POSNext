/**
 * //// Neoffice — added file (no upstream equivalent). What the kitchen screen does when the next course is ordered (NeoRestau lot 1, Daniel, 01.11: « il doit y avoir un popup à la cuisine, et aussi un son
 * //// pour aviser »): it reads each reading of its orders through the rule (utils/nextCourseWatch), keeps ONE notice per table in a stack until it is dismissed or its seconds run out, rings the sound the
 * //// till chose once per reading, and highlights the ticket for a few seconds. All of it follows the till's settings.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const player = vi.hoisted(() => {
	globalThis.__ = (text) => text
	return { play: vi.fn(() => true) }
})
vi.mock("@/utils/alertSoundPlayer", () => ({ playAlertSound: player.play }))

const { HIGHLIGHT_MS, useNextCourseNotices } = await import("../useNextCourseNotices")

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

const DEFAULTS = { popup: true, popupSeconds: 30, nextCourseSound: "bell", runnerSound: "beep", volume: "medium" }
let settings
let scrolled
let watch

function start({ options, ...over } = {}) {
	settings = ref({ ...DEFAULTS, ...over })
	scrolled = []
	watch = useNextCourseNotices({ settings, scrollTo: (order) => scrolled.push(order), ...options })
	return watch
}

beforeEach(() => {
	vi.useFakeTimers()
	player.play.mockClear()
})
afterEach(() => {
	vi.useRealTimers()
})

describe("the next course ordered", () => {
	it("makes a notice, a sound and a highlighted ticket, once a ticket already on the screen gets a send", async () => {
		start()
		watch.read([before("A")])
		expect(watch.notices.value).toEqual([])

		watch.read([after("A")])

		expect(watch.notices.value).toHaveLength(1)
		expect(watch.notices.value[0]).toMatchObject({ order: "A", table: "Table A", families: ["Dessert"] })
		expect(player.play).toHaveBeenCalledTimes(1)
		expect(player.play).toHaveBeenCalledWith("bell", "medium")
		expect(watch.highlighted.value).toBe("A")
		expect(scrolled).toEqual(["A"])
	})

	it("does nothing on the first reading, nor when the same orders are read again", () => {
		start()
		watch.read([after("A")])
		watch.read([after("A")])
		watch.read([after("A")])

		expect(watch.notices.value).toEqual([])
		expect(player.play).not.toHaveBeenCalled()
	})

	it("rings once for several tables that order together, and makes a notice for each", () => {
		start()
		watch.read([before("A"), before("B")])
		watch.read([after("A"), after("B")])

		expect(watch.notices.value.map((notice) => notice.order).sort()).toEqual(["A", "B"])
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("keeps ONE notice per table: a second send of the same table replaces the first, newest on top", () => {
		start()
		watch.read([before("A"), before("B")])
		watch.read([after("A"), before("B")])
		watch.read([after("A"), after("B")])
		watch.read([after("A", LATER, "Main"), after("B")])

		expect(watch.notices.value.map((notice) => notice.order)).toEqual(["A", "B"])
		expect(watch.notices.value[0].families).toEqual(["Main"])
	})

	it("is cut to the room the screen shows: a table of another room makes no notice and no sound", () => {
		start({ options: { accept: (order) => order.name !== "B" } })
		watch.read([before("A"), before("B")])
		watch.read([after("A"), after("B")])

		expect(watch.notices.value.map((notice) => notice.order)).toEqual(["A"])
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("begins again when the screen's scope changes (another station): the next reading is only a baseline", () => {
		start()
		watch.read([before("A")], { station: "KITCHEN" })
		watch.reset()
		watch.read([after("A")], { station: "" })

		expect(watch.notices.value).toEqual([])
		expect(player.play).not.toHaveBeenCalled()
	})

	it("looks only at the station it is told the screen shows", () => {
		start()
		const bar = (status, sentAt, family) => dish(status, sentAt, family, { preparation_station: "BAR" })
		const held = { ...before("A"), items: [...before("A").items, bar("Preparing", STARTERS, "Starter")] }
		watch.read([held], { station: "BAR" })
		watch.read([{ ...held, items: [...held.items, bar("Pending", DESSERTS, "Dessert"), dish("Pending", DESSERTS, "Dessert")] }], { station: "BAR" })

		expect(watch.notices.value).toHaveLength(1)
		expect(watch.notices.value[0].count).toBe(1)
	})
})

describe("the settings of the till", () => {
	it("play the sound it chose, at the volume it chose", () => {
		start({ nextCourseSound: "gong", volume: "high" })
		watch.read([before("A")])
		watch.read([after("A")])

		expect(player.play).toHaveBeenCalledWith("gong", "high")
	})

	it("play nothing for the sound none, and still show the notice", () => {
		start({ nextCourseSound: "none" })
		watch.read([before("A")])
		watch.read([after("A")])

		expect(player.play).not.toHaveBeenCalled()
		expect(watch.notices.value).toHaveLength(1)
	})

	it("show no notice, no highlight and no scroll with the popup off, and still ring", () => {
		start({ popup: false })
		watch.read([before("A")])
		watch.read([after("A")])

		expect(watch.notices.value).toEqual([])
		expect(watch.highlighted.value).toBe("")
		expect(scrolled).toEqual([])
		expect(player.play).toHaveBeenCalledTimes(1)
	})

	it("follow a change of the settings from one reading to the next", () => {
		start()
		watch.read([before("A")])
		settings.value = { ...settings.value, nextCourseSound: "chime" }
		watch.read([after("A")])

		expect(player.play).toHaveBeenCalledWith("chime", "medium")
	})
})

describe("how long a notice stays", () => {
	it("goes after its seconds", () => {
		start({ popupSeconds: 20 })
		watch.read([before("A")])
		watch.read([after("A")])

		vi.advanceTimersByTime(19_999)
		expect(watch.notices.value).toHaveLength(1)
		vi.advanceTimersByTime(1)
		expect(watch.notices.value).toEqual([])
	})

	it("stays until it is dismissed when the seconds are 0", () => {
		start({ popupSeconds: 0 })
		watch.read([before("A")])
		watch.read([after("A")])

		vi.advanceTimersByTime(3_600_000)
		expect(watch.notices.value).toHaveLength(1)

		watch.dismiss(watch.notices.value[0].key)
		expect(watch.notices.value).toEqual([])
	})

	it("restarts its time when the same table orders again", () => {
		start({ popupSeconds: 20 })
		watch.read([before("A")])
		watch.read([after("A")])
		vi.advanceTimersByTime(15_000)
		watch.read([after("A", LATER, "Main")])

		vi.advanceTimersByTime(15_000)
		expect(watch.notices.value).toHaveLength(1)
		vi.advanceTimersByTime(5_000)
		expect(watch.notices.value).toEqual([])
	})

	it("dismisses one table without touching another, and all at once", () => {
		start({ popupSeconds: 0 })
		watch.read([before("A"), before("B")])
		watch.read([after("A"), after("B")])
		const [first, second] = watch.notices.value

		watch.dismiss(first.key)
		expect(watch.notices.value.map((notice) => notice.key)).toEqual([second.key])

		watch.read([after("A", LATER, "Main"), after("B")])
		watch.dismissAll()
		expect(watch.notices.value).toEqual([])
	})

	it("forgets a key it does not know", () => {
		start()
		expect(() => watch.dismiss("nothing")).not.toThrow()
	})
})

describe("the highlighted ticket", () => {
	it("is highlighted for a few seconds, then not", () => {
		start()
		watch.read([before("A")])
		watch.read([after("A")])
		expect(watch.highlighted.value).toBe("A")

		vi.advanceTimersByTime(HIGHLIGHT_MS)
		expect(watch.highlighted.value).toBe("")
	})

	it("is shown again, scrolled to, when somebody presses the notice", () => {
		start({ popupSeconds: 0 })
		watch.read([before("A")])
		watch.read([after("A")])
		vi.advanceTimersByTime(HIGHLIGHT_MS)
		scrolled.length = 0

		watch.show("A")

		expect(watch.highlighted.value).toBe("A")
		expect(scrolled).toEqual(["A"])
	})

	it("is the newest table's, when several order together", () => {
		start()
		watch.read([before("A"), before("B")])
		watch.read([after("A"), after("B")])

		expect(watch.notices.value[0].order).toBe(watch.highlighted.value)
	})
})

describe("when the screen is left", () => {
	it("clears its timers", () => {
		start({ popupSeconds: 20 })
		watch.read([before("A")])
		watch.read([after("A")])

		expect(vi.getTimerCount()).toBeGreaterThan(0)
		watch.stop()

		expect(vi.getTimerCount()).toBe(0)
		vi.advanceTimersByTime(60_000)
		expect(watch.notices.value).toHaveLength(1)
	})
})
