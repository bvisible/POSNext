/**
 * //// Neoffice — added file (no upstream equivalent). What the runner's page hands to a ticket's header (NeoRestau lot 1, task 38b, rulings 122, 124, 126, 130): the
 * //// ticket number the server counted, written with the digits it tells (0007), the code of the room it tells, and the takeaway flag, with the number a takeaway has
 * //// had until now where it has no ticket. The invoice's own name is NEVER a number: it stays in the card for the calls the card makes.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

const order = (name, extra = {}) => ({
	name,
	area: "r1",
	restaurant_table: `table-${name}`,
	table_display_name: `T-${name}`,
	kds_status: "Ready",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:00:00",
	items: [
		{
			name: `${name}-0`,
			item_name: "Dish",
			qty: 1,
			kds_status: "Ready",
			preparation_station: "kit",
			station_name: "Cuisine",
			station_color: "#4A6B8F",
		},
	],
	...extra,
})

let opened = []
async function open(orders) {
	window.history.replaceState({}, "", "/pos/runner")
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
	const wrapper = mount(Runner, {
		global: {
			stubs: {
				RunnerOrderCard: {
					props: ["card", "showStation", "viewMode"],
					template:
						'<div data-test="card" :data-key="card.key" :data-ticket="card.ticketNo" :data-code="card.roomCode" :data-room="card.roomName" :data-take="card.takeaway" />',
				},
			},
			mocks: { __: globalThis.__, $router: { push: vi.fn() } },
		},
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}
const cardOf = (wrapper, key) =>
	wrapper.get(`[data-test="card"][data-key="${key}"]`)

beforeEach(() => {
	opened = []
	localStorage.clear()
	call.mockReset()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
})

describe("what the runner's page tells a ticket's header", () => {
	it("is the ticket number written with the digits the server tells: 7 and 4 digits read 0007", async () => {
		const wrapper = await open([order("SINV-1", { ticket_no: 7, ticket_digits: 4 })])

		expect(cardOf(wrapper, "SINV-1").attributes("data-ticket")).toBe("0007")
	})

	it("is the code of the room the server tells, and the room's name beside it", async () => {
		const wrapper = await open([order("SINV-1", { area_code: "GAR" })])

		const card = cardOf(wrapper, "SINV-1")
		expect(card.attributes("data-code")).toBe("GAR")
		expect(card.attributes("data-room")).toBe("Salle 1")
	})

	it("is the number a takeaway has had until now where it has no ticket, and the takeaway flag", async () => {
		const wrapper = await open([
			order("SINV-1", { is_takeaway: 1, takeaway_number: "T-005", area: "" }),
			order("SINV-2", { is_takeaway: 1, takeaway_number: "T-006", ticket_no: 12, ticket_digits: 4, area: "" }),
		])

		expect(cardOf(wrapper, "SINV-1").attributes("data-ticket")).toBe("T-005")
		expect(cardOf(wrapper, "SINV-1").attributes("data-take")).toBe("true")
		expect(cardOf(wrapper, "SINV-2").attributes("data-ticket")).toBe("0012")
	})

	it("is NEVER the invoice's name: an order with no ticket has no number at all", async () => {
		const wrapper = await open([order("SINV-2026-02689")])

		const card = cardOf(wrapper, "SINV-2026-02689")
		expect(card.attributes("data-ticket")).toBe("")
		expect(card.attributes("data-take")).toBe("false")
	})
})
