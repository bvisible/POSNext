/**
 * //// Neoffice — added file (no upstream equivalent). The runner's tickets are STACKED (NeoRestau lot 1, task 38a-2, ruling 130). They stood in one row of
 * //// full-height columns, so a ticket of two dishes left most of its column empty while the next ticket sat off the screen. A short ticket now stacks under
 * //// the one before it in the same column (oldest first, top to bottom, then the next column), a long ticket keeps a column of its own, and the setting
 * //// « stack short tickets » (on by default) turns it back into one ticket per column. jsdom has no layout engine: the flow is read from its classes.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	readStackShortTickets,
	STACK_SHORT_TICKETS,
	STACK_STORAGE_KEY,
} from "@/composables/useStackShortTickets"
import {
	RUNNER_AREA,
	TICKET_CARD,
	TICKET_ROW,
	TICKET_STACK,
} from "@/utils/ticketLayout"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({
	tillRestaurant: "The Bistro",
	runnerEnabled: true,
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

const tokens = (classes) => classes.split(/\s+/).filter(Boolean)

const order = (name, at, station = "kit", extra = {}) => ({
	name,
	area: "r1",
	restaurant_table: `table-${name}`,
	table_display_name: `T-${name}`,
	kds_status: "Ready",
	creation: `2026-10-30 12:00:${String(at).padStart(2, "0")}`,
	modified: `2026-10-30 12:00:${String(at).padStart(2, "0")}`,
	items: [
		{
			name: `${name}-0`,
			item_name: "Dish",
			qty: 1,
			kds_status: "Ready",
			preparation_station: station,
			station_name: station === "bar" ? "Bar" : "Cuisine",
			station_color: "#4A6B8F",
		},
	],
	...extra,
})

let opened = []
async function open(search = "") {
	window.history.replaceState({}, "", `/pos/runner${search}`)
	const wrapper = mount(Runner, {
		global: {
			stubs: {
				RunnerOrderCard: {
					props: ["card", "showStation", "viewMode"],
					template:
						'<div data-test="card" :data-show-station="showStation" :data-room="card.roomName" :data-take="card.takeaway">{{ card.title }}</div>',
				},
			},
			mocks: { __: globalThis.__, $router: { push: vi.fn() } },
		},
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}

beforeEach(() => {
	opened = []
	localStorage.clear()
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method.endsWith("get_runner_orders"))
			return [
				order("C", 3),
				order("A", 1),
				order("B", 2, "bar"),
				order("D", 4, "kit", { is_takeaway: 1, area: "" }),
			]
		if (method.endsWith("get_tables"))
			return {
				areas: [{ name: "r1", area_name: "Salle 1" }],
				tables: [],
				stations: [],
			}
		if (method.endsWith("get_preparation_stations")) return []
		return []
	})
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
})

describe("the runner's flow of tickets", () => {
	it("stacks short tickets by default: cards flow in columns, top to bottom then the next column, in an area that scrolls sideways", async () => {
		const wrapper = await open()

		const flow = wrapper.get('[data-test="ticket-flow"]')
		expect(flow.attributes("data-stacked")).toBe("true")
		expect(flow.classes().sort()).toEqual(tokens(TICKET_STACK).sort())
		// A column that wraps: tall as the screen leaves it, cards from the top down
		expect(flow.classes()).toEqual(
			expect.arrayContaining(["flex", "flex-col", "flex-wrap", "h-full"]),
		)
		const area = wrapper.get('[data-test="ticket-area"]')
		expect(area.classes()).toEqual(expect.arrayContaining(tokens(RUNNER_AREA)))
		expect(area.classes()).toEqual(
			expect.arrayContaining(["overflow-x-auto", "overflow-y-hidden"]),
		)
	})

	it("shows the oldest ticket first: the one that has waited longest is at the top of the first column", async () => {
		const wrapper = await open()

		expect(
			wrapper.findAll('[data-test="card"]').map((card) => card.text()),
		).toEqual(["T-A", "T-B", "T-C", "T-D"])
	})

	it("gives every card the width of the text size and never more height than the flow: a long ticket keeps a column and its dishes scroll inside it", async () => {
		const wrapper = await open()

		const cards = wrapper.findAll('[data-test="ticket-flow"] > *')
		expect(cards).toHaveLength(4)
		for (const card of cards)
			expect(card.classes()).toEqual(
				expect.arrayContaining(tokens(TICKET_CARD)),
			)
		expect(tokens(TICKET_CARD)).toEqual(
			expect.arrayContaining([
				"w-[var(--kds-card-w,250px)]",
				"max-h-full",
				"flex-none",
			]),
		)
	})

	it("is one ticket per column, side by side, when the device turns the setting off", async () => {
		localStorage.setItem(STACK_STORAGE_KEY, "0")
		const wrapper = await open()

		const flow = wrapper.get('[data-test="ticket-flow"]')
		expect(flow.attributes("data-stacked")).toBe("false")
		expect(flow.classes().sort()).toEqual(tokens(TICKET_ROW).sort())
		expect(flow.classes()).toContain("flex-row")
		expect(flow.classes()).not.toContain("flex-wrap")
	})

	it("hands each card the room's name, and whether it is a takeaway", async () => {
		const wrapper = await open()

		const cards = wrapper.findAll('[data-test="card"]')
		expect(cards[0].attributes("data-room")).toBe("Salle 1")
		expect(cards[3].attributes("data-take")).toBe("true")
		expect(cards[0].attributes("data-take")).toBe("false")
	})
})

describe("the station of a dish on the runner", () => {
	it("is shown by the card in the view of all the stations, and left out in a view filtered on one (the station is then known)", async () => {
		const all = await open()
		expect(
			all
				.findAll('[data-test="card"]')
				.every((card) => card.attributes("data-show-station") === "true"),
		).toBe(true)

		const bar = await open("?station=bar")
		const cards = bar.findAll('[data-test="card"]')
		expect(cards.length).toBeGreaterThan(0)
		expect(
			cards.every((card) => card.attributes("data-show-station") === "false"),
		).toBe(true)
	})
})

describe("the setting « stack short tickets »", () => {
	it("is on unless the device says otherwise", () => {
		expect(STACK_SHORT_TICKETS).toBe(true)
		expect(readStackShortTickets()).toBe(true)
		localStorage.setItem(STACK_STORAGE_KEY, "false")
		expect(readStackShortTickets()).toBe(false)
		localStorage.setItem(STACK_STORAGE_KEY, "1")
		expect(readStackShortTickets()).toBe(true)
		localStorage.setItem(STACK_STORAGE_KEY, "perhaps")
		expect(readStackShortTickets()).toBe(true)
	})

	it("is on when the storage refuses", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("denied")
		})

		expect(readStackShortTickets()).toBe(true)
		vi.restoreAllMocks()
	})
})
