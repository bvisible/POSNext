/**
 * //// Neoffice — added file (no upstream equivalent). The line of filters the runner and the kitchen screen share
 * //// (NeoRestau lot 1, task 9c): the rooms on the left, the preparation stations on the right, ONE row (it wraps only
 * //// when the screen is too narrow for it), with the counts each screen keeps. The product owner asked for the two
 * //// filters of the runner on a single line and for the same room filter on the kitchen screen.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

const { default: RoomStationFilterLine } = await import(
	"../RoomStationFilterLine.vue"
)

const ROOMS = [
	{ name: "r1", label: "Room 1", count: 2 },
	{ name: "r2", label: "Room 2", count: 0 },
	{ name: "r3", label: "Terrace" },
]
// Bar blue and Kitchen clay: the colours the stations carry, never the filter's own
const STATIONS = [
	{ name: "s1", label: "Bar", color: "#2C4FA8", count: 3 },
	{
		name: "s2",
		label: "Kitchen",
		color: "#D68A59",
		count: 2,
		countLabel: "2✓",
	},
	{ name: "s3", label: "Pastry", color: "#6B7280", count: 0 },
]

const mountLine = (props = {}) =>
	mount(RoomStationFilterLine, {
		props: { rooms: ROOMS, stations: STATIONS, allCount: 5, ...props },
		global: { mocks: { __: globalThis.__ } },
	})
const chips = (wrapper, group) =>
	wrapper.findAll(`[data-test="${group}"] button`)
const texts = (list) => list.map((chip) => chip.text().replace(/\s+/g, " "))

describe("the line of filters", () => {
	it("puts the rooms and the stations on ONE line, the rooms on the left and the stations on the right", () => {
		const wrapper = mountLine()

		const lines = wrapper.findAll('[data-test="filter-line"]')
		expect(lines).toHaveLength(1)
		const groups = [...lines[0].element.children].map(
			(group) => group.dataset.test,
		)
		expect(groups).toEqual(["rooms", "stations"])
		// A flex row that wraps only when the width falls short: never a column, never a sideways scroller
		const classes = lines[0].classes()
		expect(classes).toEqual(
			expect.arrayContaining(["flex", "flex-wrap", "justify-between"]),
		)
		expect(classes).not.toContain("flex-col")
		expect(classes).not.toContain("overflow-x-auto")
		// The stations keep the right edge even when they wrap onto a row of their own
		expect(wrapper.find('[data-test="stations"]').classes()).toContain(
			"ml-auto",
		)
	})

	it("keeps both groups in the one line when only one of them has anything to show", () => {
		const roomsOnly = mountLine({ stations: [] })
		expect(roomsOnly.findAll('[data-test="filter-line"]')).toHaveLength(1)
		expect(roomsOnly.find('[data-test="rooms"]').exists()).toBe(true)
		expect(roomsOnly.find('[data-test="stations"]').exists()).toBe(false)

		const stationsOnly = mountLine({ rooms: [] })
		expect(stationsOnly.find('[data-test="rooms"]').exists()).toBe(false)
		expect(stationsOnly.find('[data-test="stations"]').exists()).toBe(true)
		expect(stationsOnly.find('[data-test="stations"]').classes()).toContain(
			"ml-auto",
		)
	})

	it("shows nothing at all when there is neither a room nor a station to choose", () => {
		const wrapper = mountLine({ rooms: [], stations: [] })

		expect(wrapper.find('[data-test="filter-line"]').exists()).toBe(false)
	})

	it('lists "all rooms" and then each room by its label, with its count when it has one', () => {
		const wrapper = mountLine()

		expect(texts(chips(wrapper, "rooms"))).toEqual([
			"All Areas",
			"Room 1 2",
			"Room 2",
			"Terrace",
		])
		const counts = wrapper.findAll('[data-test="room-count"]')
		expect(texts(counts)).toEqual(["2"])
	})

	it('lists "all" and then each station, counted as its screen counts it', () => {
		const wrapper = mountLine()

		expect(texts(chips(wrapper, "stations"))).toEqual([
			"All (5)",
			"Bar 3",
			// The runner counts the dishes that are ready and marks them; the kitchen counts tickets, bare
			"Kitchen 2✓",
			"Pastry",
		])
	})

	it('counts nothing on "all" when its screen gives no total', () => {
		const wrapper = mountLine({ allCount: undefined })

		expect(texts(chips(wrapper, "stations"))[0]).toBe("All")
	})

	it("gives each station chip its leading colour dot", () => {
		const wrapper = mountLine()

		const dots = wrapper.findAll('[data-test="station-dot"]')
		expect(dots.map((dot) => dot.attributes("style"))).toEqual([
			expect.stringContaining("rgb(44, 79, 168)"),
			expect.stringContaining("rgb(214, 138, 89)"),
			expect.stringContaining("rgb(107, 114, 128)"),
		])
	})

	it("is a touch surface: every chip is at least 44 px high", () => {
		const wrapper = mountLine()

		const all = [...chips(wrapper, "rooms"), ...chips(wrapper, "stations")]
		expect(all).toHaveLength(8)
		for (const chip of all) {
			expect(chip.classes()).toContain("min-h-[44px]")
		}
	})
})

describe("choosing in the line", () => {
	it('marks the room chosen with the screen\'s active style, "all rooms" when none is', () => {
		const none = mountLine({ selectedRoom: "" })
		expect(chips(none, "rooms")[0].classes()).toEqual(
			expect.arrayContaining(["bg-gray-800", "text-white"]),
		)
		expect(chips(none, "rooms")[1].classes()).toEqual(
			expect.arrayContaining(["bg-gray-100", "text-gray-600"]),
		)

		const room = mountLine({ selectedRoom: "r3" })
		expect(chips(room, "rooms")[0].classes()).toContain("bg-gray-100")
		expect(chips(room, "rooms")[3].classes()).toEqual(
			expect.arrayContaining(["bg-gray-800", "text-white"]),
		)
		expect(chips(room, "rooms")[3].attributes("aria-pressed")).toBe("true")
		expect(chips(room, "rooms")[1].attributes("aria-pressed")).toBe("false")
	})

	it('fills the station chosen with its own colour, "all" when none is', () => {
		const none = mountLine({ selectedStation: null })
		expect(chips(none, "stations")[0].classes()).toEqual(
			expect.arrayContaining(["bg-gray-800", "text-white"]),
		)

		const station = mountLine({ selectedStation: "s2" })
		const kitchen = chips(station, "stations")[2]
		expect(kitchen.classes()).toContain("text-white")
		expect(kitchen.attributes("style")).toContain("rgb(214, 138, 89)")
		expect(kitchen.attributes("aria-pressed")).toBe("true")
		expect(chips(station, "stations")[0].classes()).toContain("bg-gray-100")
		expect(
			chips(station, "stations")[1].attributes("style") || "",
		).not.toContain("background")
	})

	it('asks for a room by its name, and for "all rooms" by none', async () => {
		const wrapper = mountLine({ selectedRoom: "r1" })

		await chips(wrapper, "rooms")[3].trigger("click")
		await chips(wrapper, "rooms")[0].trigger("click")

		expect(wrapper.emitted("update:selectedRoom")).toEqual([["r3"], [""]])
	})

	it('asks for a station by its name, for "all" by none, and takes the station back when it is chosen again', async () => {
		const wrapper = mountLine({ selectedStation: "s1" })

		await chips(wrapper, "stations")[2].trigger("click")
		await chips(wrapper, "stations")[1].trigger("click")
		await chips(wrapper, "stations")[0].trigger("click")

		expect(wrapper.emitted("update:selectedStation")).toEqual([
			["s2"],
			[null],
			[null],
		])
	})

	it("names its two groups for whoever cannot see the line", () => {
		const wrapper = mountLine()

		const rooms = wrapper.find('[data-test="rooms"]')
		const stations = wrapper.find('[data-test="stations"]')
		expect(rooms.attributes("role")).toBe("group")
		expect(rooms.attributes("aria-label")).toBe("Filter by room")
		expect(stations.attributes("role")).toBe("group")
		expect(stations.attributes("aria-label")).toBe("Filter by station")
	})
})
