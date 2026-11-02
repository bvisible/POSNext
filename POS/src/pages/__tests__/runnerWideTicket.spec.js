/**
 * //// Neoffice — added file (no upstream equivalent). The WIDE card on the runner screen (NeoResto lot 1, task 38a-3, ruling 107 layer 2, ruling 130). A card with more than 12 dishes takes
 * //// TWO card widths in the runner's flow (the width of two tickets and the gap between them), its dishes staying in one list; it is never wider than the flow, and where the flow holds fewer than
 * //// three columns of tickets it stays one width. jsdom has no layout engine: the width of the flow is given by hand, the card is read from its classes.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"
import { TICKET_CARD, TICKET_CARD_WIDE } from "@/utils/ticketLayout"
import { WIDE_TICKET_LINES } from "@/utils/wideTicket"

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

/** A ready order with `count` dishes. */
const order = (name, count, at = 1) => ({
	name,
	area: "r1",
	restaurant_table: `table-${name}`,
	table_display_name: `T-${name}`,
	kds_status: "Ready",
	creation: `2026-10-30 12:00:${String(at).padStart(2, "0")}`,
	modified: `2026-10-30 12:00:${String(at).padStart(2, "0")}`,
	items: Array.from({ length: count }, (_, index) => ({
		name: `${name}-${index}`,
		item_name: `Dish ${index + 1}`,
		qty: 1,
		kds_status: "Ready",
		preparation_station: "kit",
		station_name: "Cuisine",
		station_color: "#4A6B8F",
	})),
})

/** The width the runner's flow is laid out at: jsdom has none. */
let flowWidth = 0
const observers = []
let orders = []

let opened = []
async function open() {
	window.history.replaceState({}, "", "/pos/runner")
	const wrapper = mount(Runner, {
		global: {
			stubs: {
				RunnerOrderCard: {
					props: ["card", "showStation", "viewMode"],
					template:
						'<div data-test="card" :data-name="card.invoiceName">{{ card.title }}</div>',
				},
			},
			mocks: { __: globalThis.__, $router: { push: vi.fn() } },
		},
		attachTo: document.body,
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
const card = (wrapper, name) =>
	wrapper
		.findAll('[data-test="card"]')
		.find((el) => el.attributes("data-name") === name)

beforeEach(() => {
	opened = []
	flowWidth = 1342
	observers.length = 0
	localStorage.clear()
	orders = [order("SHORT", 3, 1), order("LONG", WIDE_TICKET_LINES + 1, 2)]
	vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
		function width() {
			return this.matches?.('[data-test="ticket-flow"]') ? flowWidth : 0
		},
	)
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback) {
				this.callback = callback
				observers.push(this)
			}
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	)
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method.endsWith("get_runner_orders")) return orders
		if (method.endsWith("get_tables"))
			return {
				areas: [{ name: "r1", area_name: "Salle 1" }],
				tables: [],
				stations: [],
			}
		return []
	})
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

describe("a ticket with many dishes in the runner's flow", () => {
	it("is two widths wide plus the gap between them, a short one keeps one width", async () => {
		const wrapper = await open()

		const long = card(wrapper, "LONG")
		expect(long.classes()).toEqual(
			expect.arrayContaining(tokens(TICKET_CARD_WIDE)),
		)
		expect(long.attributes("data-wide")).toBe("true")
		expect(TICKET_CARD_WIDE).toContain("calc(var(--kds-card-w,250px)*2+0.5rem)")
		const short = card(wrapper, "SHORT")
		expect(short.classes()).toEqual(expect.arrayContaining(tokens(TICKET_CARD)))
		expect(short.classes()).not.toContain(tokens(TICKET_CARD_WIDE)[0])
		expect(short.attributes("data-wide")).toBeUndefined()
	})

	it("is never wider than the flow, and never taller than it: it takes the width of two tickets at most", () => {
		expect(tokens(TICKET_CARD_WIDE)).toEqual(
			expect.arrayContaining(["max-w-full", "max-h-full", "flex-none"]),
		)
	})

	it("is wide from the 13th dish: 12 dishes are one width", async () => {
		orders = [order("TWELVE", 12, 1), order("THIRTEEN", 13, 2)]
		const wrapper = await open()

		expect(card(wrapper, "TWELVE").attributes("data-wide")).toBeUndefined()
		expect(card(wrapper, "THIRTEEN").attributes("data-wide")).toBe("true")
	})

	it("stays one width where the flow holds fewer than three columns: two tickets (516 px) is too narrow, three (766 px) is enough", async () => {
		flowWidth = 516
		const narrow = await open()
		expect(card(narrow, "LONG").attributes("data-wide")).toBeUndefined()
		expect(card(narrow, "LONG").classes()).toEqual(
			expect.arrayContaining(tokens(TICKET_CARD)),
		)

		flowWidth = 766
		const enough = await open()
		expect(card(enough, "LONG").attributes("data-wide")).toBe("true")
	})

	it("is not wide until the flow has been measured", async () => {
		flowWidth = 0
		const wrapper = await open()

		expect(card(wrapper, "LONG").attributes("data-wide")).toBeUndefined()
	})

	it("follows the flow when it changes size, as a tablet turned does", async () => {
		flowWidth = 516
		const wrapper = await open()
		expect(card(wrapper, "LONG").attributes("data-wide")).toBeUndefined()

		flowWidth = 1342
		observers.forEach((observer) => observer.callback())
		await nextTick()
		expect(card(wrapper, "LONG").attributes("data-wide")).toBe("true")
	})

	it("follows the text size: with the Large width (330 px) a 1000 px flow holds two columns, not three", async () => {
		flowWidth = 1000
		const wrapper = await open()
		expect(card(wrapper, "LONG").attributes("data-wide")).toBe("true")

		// The size button of the bar goes Compact, Normal, Large: the page's root then carries the variables of the size, the flow keeps its width
		await wrapper.get('[data-test="text-size"]').trigger("click")
		await wrapper.get('[data-test="text-size"]').trigger("click")
		await nextTick()
		await nextTick()
		await nextTick()

		expect(
			wrapper.get('[data-test="runner-screen"]').attributes("data-text-size"),
		).toBe("large")
		expect(card(wrapper, "LONG").attributes("data-wide")).toBeUndefined()
	})

	it("takes two widths with one ticket per column too (the setting « stack short tickets » turned off)", async () => {
		localStorage.setItem("pos_runner_stack", "0")
		const wrapper = await open()

		expect(
			wrapper.get('[data-test="ticket-flow"]').attributes("data-stacked"),
		).toBe("false")
		expect(card(wrapper, "LONG").attributes("data-wide")).toBe("true")
	})
})
