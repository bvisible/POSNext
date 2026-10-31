/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen and runner PAGES, and the pieces they are made of, in DARK mode
 * //// (NeoRestau lot 1, task 46): the floor plan's canvas was a fixed light sheet under light table names, an unchecked
 * //// "Show completed" box was a solid white disc that reads as "on", the runner's room count was white on a light green, a station's
 * //// name was written in its own colour on a tint of it (a blue one 2.0:1), the empty states were a shade under 4.5:1. The cards
 * //// have their own spec (components/invoices/__tests__/kitchenDarkMode.spec.js); a browser measured the contrast (task 46's
 * //// harness). Here the classes that carry it are pinned, and the light mode keeps every class and every colour it drew.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({
	runnerEnabled: true,
	tillRestaurant: "The Bistro",
	fetchRestaurantSettings: async () => {},
}))

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))
vi.mock("@/socket", () => ({ initSocket: () => null }))

const { default: Runner } = await import("../Runner.vue")
const { default: KDS } = await import("../KDS.vue")
const { default: KitchenBand } = await import(
	"@/components/restaurant/KitchenBand.vue"
)
const { default: RoomStationFilterLine } = await import(
	"@/components/restaurant/RoomStationFilterLine.vue"
)

const dish = (id, station) => ({
	name: id,
	item_name: `Dish ${id}`,
	qty: 1,
	kds_status: "Ready",
	preparation_station: station,
	station_name: station === "bar" ? "Bar" : "Kitchen",
	station_color: station === "bar" ? "#2C4FA8" : "#D68A59",
})
const ORDERS = [
	{
		name: "R1",
		area: "r1",
		restaurant_table: "table-T1",
		table_display_name: "T1",
		kds_status: "Preparing",
		creation: "2026-10-30 12:00:00",
		modified: "2026-10-30 12:00:00",
		items: [dish("R1-0", "kit"), dish("R1-1", "bar")],
	},
]
const serve = ({ orders = ORDERS, stations = [] } = {}) => {
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method.endsWith("get_tables"))
			return {
				areas: [{ name: "r1", area_name: "Room 1" }],
				tables: [
					{
						name: "table-T1",
						table_name: "T1",
						area: "r1",
						pos_x: 10,
						pos_y: 10,
					},
				],
				stations,
			}
		if (
			method.endsWith("get_runner_orders") ||
			method.endsWith("get_kds_orders")
		)
			return orders
		if (method.endsWith("get_preparation_stations")) return []
		return []
	})
}

let opened = []
async function runner() {
	const wrapper = mount(Runner, {
		global: {
			stubs: { RunnerOrderCard: { template: "<div />" } },
			mocks: { __: globalThis.__ },
		},
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
const names = (wrapper) => wrapper.classes()

beforeEach(() => {
	localStorage.clear()
	opened = []
	restaurantStore.runnerEnabled = true
	serve()
})
afterEach(() => opened.forEach((wrapper) => wrapper.unmount()))

describe("the 'Show completed' box in dark mode (task 46)", () => {
	const dark = [
		"dark:[&:not(:checked)]:bg-transparent",
		"dark:[&:not(:checked)]:ring-1",
		"dark:[&:not(:checked)]:ring-inset",
		"dark:[&:not(:checked)]:ring-ds-sand-400",
	]
	const light = [
		"rounded",
		"border-gray-300",
		"text-blue-600",
		"focus:ring-blue-500",
	]

	it("is empty with a ring when it is not checked, on the runner screen: only an UNCHECKED box, a checked one keeps its fill", async () => {
		const box = (await runner()).get('input[type="checkbox"]')

		expect(names(box)).toEqual(expect.arrayContaining([...light, ...dark]))
		// Every dark variant of the box is for the unchecked state: a variant without it would paint over the clay of a checked box
		expect(
			names(box).filter(
				(name) => name.startsWith("dark:") && !name.includes(":not(:checked)"),
			),
		).toEqual([])
	})

	it("is the same on the kitchen screen", async () => {
		serve()
		const wrapper = mount(KDS, {
			global: {
				stubs: { KitchenBand: { template: "<div />" } },
				mocks: { __: globalThis.__ },
			},
		})
		opened.push(wrapper)
		await flushPromises()

		expect(names(wrapper.get('input[type="checkbox"]'))).toEqual(
			expect.arrayContaining([...light, ...dark]),
		)
	})
})

describe("the runner's counts in dark mode (task 46)", () => {
	it("a room's count is ink on the dark ramp's green in dark, and keeps its white on green-500 in light", async () => {
		const wrapper = await runner()

		const count = wrapper.get('[data-test="room-count"]')
		expect(names(count)).toEqual(
			expect.arrayContaining([
				"text-white",
				"bg-green-500",
				"dark:bg-ds-success",
				"dark:text-ds-ink",
			]),
		)
	})

	it("a station's count is written in the station's colour through a variable, lightened for dark, with no colour left in the inline style", async () => {
		const wrapper = await runner()

		const counts = wrapper.findAll('[data-test="station-count"]')
		expect(counts).toHaveLength(2)
		const bar = counts.find(
			(c) => c.element.style.getPropertyValue("--station-color") === "#2C4FA8",
		)
		expect(bar).toBeTruthy()
		expect(names(bar)).toEqual(
			expect.arrayContaining([
				"text-[color:var(--station-color)]",
				"dark:text-[color:var(--station-on-dark)]",
			]),
		)
		expect(bar.element.style.getPropertyValue("--station-on-dark")).toMatch(
			/^#[0-9A-F]{6}$/,
		)
		expect(bar.element.style.getPropertyValue("--station-on-dark")).not.toBe(
			"#2C4FA8",
		)
		expect(bar.element.style.color).toBe("")
		// The tint behind it is what it was: the colour at 12.5 %
		expect(bar.element.style.backgroundColor).toBe("rgba(44, 79, 168, 0.125)")
	})

	it("the count inside a CHOSEN station chip keeps the text colour of the chip and its white wash, which in dark turns black on a chip whose text is white", async () => {
		const wrapper = await runner()
		const countOf = async (label) => {
			await wrapper
				.findAll('[data-test="stations"] button')
				.find((b) => b.text().startsWith(label))
				.trigger("click")
			return wrapper
				.findAll('[data-test="stations"] button')
				.find((b) => b.text().startsWith(label))
				.get('[data-test="station-count"]')
		}

		// The bar's chip is blue, its text white: the wash is white in light and black in dark
		const bar = await countOf("Bar")
		expect(
			names(bar).filter(
				(name) =>
					name.includes("station-color") || name.includes("station-on-dark"),
			),
		).toEqual([])
		expect(names(bar)).toEqual(
			expect.arrayContaining([
				"bg-[rgba(255,255,255,0.3)]",
				"dark:bg-black/25",
			]),
		)
		// A class, not an inline colour (an inline one could not be changed for dark)
		expect(bar.element.style.backgroundColor).toBe("")
		// The kitchen's chip is clay, its text ink in dark: the white wash stays, nothing black on it
		const kitchen = await countOf("Kitchen")
		expect(names(kitchen)).toContain("bg-[rgba(255,255,255,0.3)]")
		expect(names(kitchen)).not.toContain("dark:bg-black/25")
	})
})

describe("the chosen station's chip in dark mode (task 46)", () => {
	const STATIONS = [
		{ name: "kit", label: "Kitchen", color: "#D68A59" },
		{ name: "bar", label: "Bar", color: "#2C4FA8" },
	]
	const chip = (wrapper, label) =>
		wrapper.findAll("button").find((b) => b.text().startsWith(label))

	it("writes ink on a light station's colour and white on a dark one, in dark only", () => {
		const wrapper = mount(RoomStationFilterLine, {
			props: { stations: STATIONS, selectedStation: "kit" },
			global: { mocks: { __: globalThis.__ } },
		})

		const clay = chip(wrapper, "Kitchen")
		expect(names(clay)).toEqual(
			expect.arrayContaining([
				"text-white",
				"dark:text-[color:var(--station-ink)]",
			]),
		)
		expect(clay.element.style.getPropertyValue("--station-ink")).toBe("#141414")
		expect(clay.element.style.backgroundColor).toBe("rgb(214, 138, 89)")
	})

	it("leaves a station that is not chosen alone: no colour, no variable", () => {
		const wrapper = mount(RoomStationFilterLine, {
			props: { stations: STATIONS, selectedStation: "kit" },
			global: { mocks: { __: globalThis.__ } },
		})

		const idle = chip(wrapper, "Bar")
		expect(names(idle).some((name) => name.includes("station-ink"))).toBe(false)
		expect(idle.element.style.getPropertyValue("--station-ink")).toBe("")
	})

	it("white for the blue of a bar", () => {
		const wrapper = mount(RoomStationFilterLine, {
			props: { stations: STATIONS, selectedStation: "bar" },
			global: { mocks: { __: globalThis.__ } },
		})

		expect(
			chip(wrapper, "Bar").element.style.getPropertyValue("--station-ink"),
		).toBe("#FFFFFF")
	})
})

describe("the floor plan in dark mode (task 46)", () => {
	async function plan({
		stations = [
			{
				name: "kit",
				station_name: "Kitchen",
				color: "#D68A59",
				area: "r1",
				pos_x: 200,
				pos_y: 10,
			},
		],
	} = {}) {
		serve({ stations })
		const wrapper = await runner()
		await wrapper
			.findAll("button")
			.find((b) => b.text() === "Plan")
			.trigger("click")
		await flushPromises()
		return wrapper
	}

	it("its canvas is the same light sheet with the same dots in light, and a dark sheet with faint dots in dark: in classes, not in an inline style", async () => {
		const wrapper = await plan()

		const canvas = wrapper.get("main.relative")
		expect(names(canvas)).toEqual(
			expect.arrayContaining([
				"bg-[#f8fafc]",
				"dark:bg-[#181b21]",
				"[--plan-dot:#cbd5e1]",
				"dark:[--plan-dot:rgba(255,255,255,0.1)]",
				"bg-[radial-gradient(circle,var(--plan-dot)_1px,transparent_1px)]",
			]),
		)
		// A colour in the inline style could not be reached by a dark class: only the size stays there
		expect(canvas.element.style.backgroundColor).toBe("")
		expect(canvas.element.style.backgroundImage).toBe("")
		expect(canvas.element.style.backgroundSize).toBe("25px 25px")
	})

	it("a station's name on the plan is written through a variable, lightened for dark", async () => {
		const wrapper = await plan()

		const label = wrapper.findAll("span").find((s) => s.text() === "Kitchen")
		expect(names(label)).toEqual(
			expect.arrayContaining([
				"text-[color:var(--station-color)]",
				"dark:text-[color:var(--station-on-dark)]",
			]),
		)
		expect(label.element.style.getPropertyValue("--station-color")).toBe(
			"#D68A59",
		)
		expect(label.element.style.getPropertyValue("--station-on-dark")).toMatch(
			/^#[0-9A-F]{6}$/,
		)
		expect(label.element.style.color).toBe("")
	})

	it("a table's ready badge keeps its pale mint and its pulse in light, and is a green tint that swells (never fades) in dark", async () => {
		const wrapper = await plan()

		const badge = wrapper.findAll("span").find((s) => s.text() === "2✓")
		expect(names(badge)).toEqual(
			expect.arrayContaining([
				"text-green-700",
				"bg-green-200",
				"animate-pulse",
				"dark:bg-ds-success/25",
				"dark:text-ds-success-soft",
				"dark:animate-ready-pulse",
			]),
		)
	})

	it("the plan's Mark Delivered gives its text colour back to the Button in dark", async () => {
		const wrapper = await plan()
		await wrapper
			.findAll("main.relative span")
			.find((s) => s.text() === "T1")
			.trigger("click")
		await flushPromises()

		const button = wrapper
			.findAll("button")
			.find((b) => b.text() === "Mark Delivered")
		expect(names(button)).toEqual(
			expect.arrayContaining(["text-white", "dark:enabled:text-ink-white"]),
		)
	})
})

describe("the empty states in dark mode (task 46)", () => {
	it("'No items ready' and 'Runner is disabled' use a doubled selector to outrank the till's `!important` grey", async () => {
		serve({ orders: [] })
		const empty = await runner()
		const emptyBox = empty
			.findAll("div")
			.find(
				(d) => d.classes().includes("text-gray-500") && d.find("h2").exists(),
			)
		expect(names(emptyBox)).toEqual(
			expect.arrayContaining(["text-gray-500", "dark:[&&]:!text-gray-400"]),
		)

		restaurantStore.runnerEnabled = false
		const disabled = await runner()
		expect(names(disabled.get("h2"))).toEqual(
			expect.arrayContaining(["text-gray-500", "dark:[&&]:!text-gray-400"]),
		)
	})

	it("the kitchen band's count and its empty line do the same", () => {
		const wrapper = mount(KitchenBand, {
			props: {
				band: "waiting",
				label: "Waiting",
				emptyText: "No pending orders",
				orders: [],
			},
			global: {
				stubs: { KDSOrderCard: { template: "<div />" } },
				mocks: { __: globalThis.__ },
			},
		})

		expect(names(wrapper.get('[data-test="band-count"]'))).toEqual(
			expect.arrayContaining(["text-gray-500", "dark:[&&]:!text-gray-400"]),
		)
		expect(names(wrapper.get('[data-test="band-empty"]'))).toEqual(
			expect.arrayContaining(["text-gray-500", "dark:[&&]:!text-gray-400"]),
		)
	})
})
