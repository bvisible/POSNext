/**
 * //// Neoffice — added file (no upstream equivalent). The toast of the five seconds lives on the PAGE (NeoResto lot 1, task 38a-2, ruling 112): the ticket's card is gone from its
 * //// band when it is pressed. The kitchen and the runner draw it, and read their tickets again once a move is put back.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dismissUndo } from "@/composables/useUndoToast"

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
	Button: { template: "<button @click=\"$emit('click')\"><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))
vi.mock("@/socket", () => ({ initSocket: () => null }))

const { default: KDS } = await import("../KDS.vue")
const { default: Runner } = await import("../Runner.vue")

const kitchenOrder = {
	name: "SINV-1",
	area: "",
	restaurant_table: "t1",
	table_display_name: "Table 1",
	kds_status: "Preparing",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:00:00",
	items: [
		{
			name: "r1",
			item_code: "SOUP",
			item_name: "Soup",
			qty: 1,
			kds_status: "Preparing",
		},
	],
}
const runnerOrder = {
	...kitchenOrder,
	kds_status: "Ready",
	items: [
		{
			name: "r1",
			item_code: "SOUP",
			item_name: "Soup",
			qty: 1,
			kds_status: "Ready",
			preparation_station: "kit",
			station_name: "Cuisine",
			station_color: "#F55D1A",
		},
	],
}

let opened = []
const reads = (name) =>
	call.mock.calls.filter(([method]) => method.endsWith(name)).length
async function open(Screen, address) {
	window.history.replaceState({}, "", address)
	const wrapper = mount(Screen, {
		global: { mocks: { __: globalThis.__, $router: { push: vi.fn() } } },
		attachTo: document.body,
	})
	opened.push(wrapper)
	await flushPromises()
	return wrapper
}

beforeEach(() => {
	opened = []
	localStorage.clear()
	dismissUndo()
	call.mockReset()
	call.mockImplementation(async (method) => {
		if (method.endsWith("get_kds_orders")) return [kitchenOrder]
		if (method.endsWith("get_runner_orders")) return [runnerOrder]
		if (method.endsWith("get_tables"))
			return { areas: [], tables: [], stations: [] }
		return []
	})
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	dismissUndo()
})

describe("the kitchen screen", () => {
	it("draws the toast itself and reads its tickets again once a move is put back", async () => {
		const wrapper = await open(KDS, "/pos/kds")
		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await flushPromises()
		expect(wrapper.find('[data-test="undo-toast"]').exists()).toBe(true)
		const before = reads("get_kds_orders")

		await wrapper.get('[data-test="undo-button"]').trigger("click")
		await flushPromises()

		expect(wrapper.find('[data-test="undo-toast"]').exists()).toBe(false)
		// One read for the move itself (the card asks for it), one more once it was put back
		expect(reads("get_kds_orders")).toBeGreaterThan(before)
	})
})

describe("the runner screen", () => {
	it("draws the toast itself after « Deliver » and reads its tickets again once it is put back", async () => {
		const wrapper = await open(Runner, "/pos/runner")
		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await flushPromises()
		expect(wrapper.get('[data-test="undo-message"]').text()).toBe(
			"Table 1 · Delivered",
		)
		const before = reads("get_runner_orders")

		await wrapper.get('[data-test="undo-button"]').trigger("click")
		await flushPromises()

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{
				invoice_name: "SINV-1",
				item_code: "SOUP",
				status: "Ready",
			},
		)
		expect(reads("get_runner_orders")).toBeGreaterThan(before)
	})
})
