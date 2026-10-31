/**
 * //// Neoffice — added file (no upstream equivalent). Five seconds to take back a mis-tap on « Ready » or « Deliver » (NeoRestau lot 1, task 38a-2, ruling 112). A ticket
 * //// that is marked ready leaves the cook's screen and one that is delivered leaves everyone's, so a finger that slipped was a ticket gone. A small toast says what
 * //// happened and offers « Undo » for five seconds; undoing puts each dish back in the state it had (the call-back), one call per item. The toast is the PAGE's: the
 * //// ticket's card is gone from its band the moment it is pressed, and a component that is gone cannot answer a press.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, h } from "vue"
import { dismissUndo, UNDO_MS } from "@/composables/useUndoToast"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))
const showError = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({ runnerEnabled: true }))

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})
vi.mock("frappe-ui", () => ({
	Button: { template: "<button @click=\"$emit('click')\"><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))

const { default: KDSOrderCard } = await import(
	"@/components/invoices/KDSOrderCard.vue"
)
const { default: RunnerOrderCard } = await import(
	"@/components/invoices/RunnerOrderCard.vue"
)
const { default: UndoToast } = await import("../UndoToast.vue")

const UPDATE = "pos_next.api.restaurant.update_item_kds_status"
const MARK = "pos_next.api.restaurant.mark_items_delivered"

const kitchenOrder = (statuses = ["Preparing", "Preparing"], extra = {}) => ({
	name: "SINV-1",
	restaurant_table: "t15",
	table_display_name: "Table 15",
	kds_status: "Preparing",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:05:00",
	items: statuses.map((status, index) => ({
		item_code: `ITEM-${index}`,
		item_name: `Dish ${index + 1}`,
		qty: 1,
		kds_status: status,
		kds_batch: 1,
	})),
	...extra,
})

// A screen: the card, whose ticket leaves when it is pressed, and the page's toast beside it
let opened = []
let undone
function screen(Card, props) {
	undone = vi.fn()
	const Screen = defineComponent({
		render: () =>
			h("div", [h(Card, props), h(UndoToast, { onUndone: undone })]),
	})
	const wrapper = mount(Screen, {
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
const toast = (wrapper) => wrapper.find('[data-test="undo-toast"]')
const press = async (wrapper, selector) => {
	await wrapper.get(selector).trigger("click")
	await flushPromises()
}

beforeEach(() => {
	opened = []
	call.mockClear()
	call.mockImplementation(async () => ({ status: "success" }))
	showError.mockClear()
	dismissUndo()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	dismissUndo()
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("after « Mark ready » on the kitchen's card", () => {
	it("offers « Undo » in a small toast that says the table and the state it came to", async () => {
		const wrapper = screen(KDSOrderCard, {
			order: kitchenOrder(),
			showStationBadge: false,
		})
		expect(toast(wrapper).exists()).toBe(false)

		await press(wrapper, '[data-test="ticket-main"]')

		expect(toast(wrapper).exists()).toBe(true)
		expect(wrapper.get('[data-test="undo-message"]').text()).toBe(
			"Table 15 · Ready",
		)
		expect(wrapper.get('[data-test="undo-button"]').text()).toBe("Undo")
		// The button is 44 px high, like every button of the screens
		expect(wrapper.get('[data-test="undo-button"]').classes()).toContain("h-11")
	})

	it("puts every dish back in the state it had when it is pressed, one call per item, and tells the page to read its tickets again", async () => {
		const wrapper = screen(KDSOrderCard, {
			order: kitchenOrder(["Preparing", "Pending"]),
			showStationBadge: false,
		})
		await press(wrapper, '[data-test="ticket-main"]')
		call.mockClear()

		await press(wrapper, '[data-test="undo-button"]')

		// Both dishes moved to Ready (the card is the kitchen's: Ready follows the dishes that are begun and the ones to start): each goes back to its own state
		expect(call.mock.calls).toEqual([
			[
				UPDATE,
				{ invoice_name: "SINV-1", item_code: "ITEM-0", status: "Preparing" },
			],
			[
				UPDATE,
				{ invoice_name: "SINV-1", item_code: "ITEM-1", status: "Pending" },
			],
		])
		expect(undone).toHaveBeenCalledTimes(1)
		expect(toast(wrapper).exists()).toBe(false)
	})

	it("runs out after five seconds: nothing is offered any more, and nothing was sent", async () => {
		vi.useFakeTimers()
		const wrapper = screen(KDSOrderCard, {
			order: kitchenOrder(),
			showStationBadge: false,
		})
		await press(wrapper, '[data-test="ticket-main"]')
		call.mockClear()

		await vi.advanceTimersByTimeAsync(UNDO_MS - 100)
		expect(toast(wrapper).exists()).toBe(true)
		await vi.advanceTimersByTimeAsync(200)

		expect(toast(wrapper).exists()).toBe(false)
		expect(call).not.toHaveBeenCalled()
		expect(UNDO_MS).toBe(5000)
	})

	it("can be pressed once: a second press finds nothing to undo", async () => {
		const wrapper = screen(KDSOrderCard, {
			order: kitchenOrder(),
			showStationBadge: false,
		})
		await press(wrapper, '[data-test="ticket-main"]')
		call.mockClear()

		await press(wrapper, '[data-test="undo-button"]')
		const sent = call.mock.calls.length
		expect(sent).toBe(2)
		expect(wrapper.find('[data-test="undo-button"]').exists()).toBe(false)
	})

	it("says so when the server refuses, and the page is not told it was undone", async () => {
		const wrapper = screen(KDSOrderCard, {
			order: kitchenOrder(),
			showStationBadge: false,
		})
		await press(wrapper, '[data-test="ticket-main"]')
		call.mockImplementation(async () => {
			throw new Error("refused")
		})

		await press(wrapper, '[data-test="undo-button"]')

		expect(showError).toHaveBeenCalledWith("Failed to update item status")
		expect(undone).not.toHaveBeenCalled()
	})

	it("is offered for a dish made ready from its own menu too, with the dish named", async () => {
		const wrapper = screen(KDSOrderCard, {
			order: kitchenOrder(["Preparing", "Preparing"]),
			showStationBadge: false,
		})

		await wrapper.get('[data-test="ticket-line"]').trigger("click")
		const menu = wrapper.get('[data-test="ticket-line-menu"]')
		await menu
			.findAll("button")
			.find((button) => button.text() === "Mark ready")
			.trigger("click")
		await flushPromises()

		expect(wrapper.get('[data-test="undo-message"]').text()).toBe(
			"Table 15 · Dish 1 · Ready",
		)
		call.mockClear()
		await press(wrapper, '[data-test="undo-button"]')
		expect(call.mock.calls).toEqual([
			[
				UPDATE,
				{ invoice_name: "SINV-1", item_code: "ITEM-0", status: "Preparing" },
			],
		])
	})

	it("is not offered for starting a ticket: it costs no ticket", async () => {
		const wrapper = screen(KDSOrderCard, {
			order: kitchenOrder(["Pending", "Pending"], { kds_status: "Pending" }),
			showStationBadge: false,
		})

		await press(wrapper, '[data-test="ticket-main"]')

		expect(toast(wrapper).exists()).toBe(false)
	})

	it("is not offered when the server refuses the move itself", async () => {
		call.mockImplementation(async () => {
			throw new Error("refused")
		})
		const wrapper = screen(KDSOrderCard, {
			order: kitchenOrder(),
			showStationBadge: false,
		})

		await press(wrapper, '[data-test="ticket-main"]')

		expect(toast(wrapper).exists()).toBe(false)
	})
})

describe("after « Deliver »", () => {
	it("on a ticket whose cook delivers (no runner): « Table 15 · Delivered », and the dishes go back to Preparing", async () => {
		const wrapper = screen(KDSOrderCard, {
			order: kitchenOrder(),
			useRunner: false,
			showStationBadge: false,
		})
		await press(wrapper, '[data-test="ticket-main"]')
		expect(wrapper.get('[data-test="undo-message"]').text()).toBe(
			"Table 15 · Delivered",
		)
		call.mockClear()

		await press(wrapper, '[data-test="undo-button"]')

		expect(call.mock.calls.map(([, params]) => params.status)).toEqual([
			"Preparing",
			"Preparing",
		])
	})

	it("on the runner's card: the dishes go back to Ready, in the invoice they were delivered from", async () => {
		const card = {
			key: "SINV-7",
			title: "Table 7",
			subtitle: "#SINV-7",
			invoiceName: "SINV-7",
			creation: "2026-10-30 12:00:00",
			modified: "2026-10-30 12:00:00",
			items: [
				{
					name: "row-1",
					item_code: "SOUP",
					item_name: "Soup",
					qty: 1,
					kds_status: "Ready",
				},
				{
					name: "row-2",
					item_code: "STEAK",
					item_name: "Steak",
					qty: 2,
					kds_status: "Ready",
				},
			],
			stationGroups: [],
		}
		const wrapper = screen(RunnerOrderCard, { card, viewMode: "table" })

		await press(wrapper, '[data-test="ticket-main"]')

		expect(call).toHaveBeenCalledWith(MARK, {
			invoice_name: "SINV-7",
			item_names: JSON.stringify(["row-1", "row-2"]),
		})
		expect(wrapper.get('[data-test="undo-message"]').text()).toBe(
			"Table 7 · Delivered",
		)
		call.mockClear()
		await press(wrapper, '[data-test="undo-button"]')
		expect(call.mock.calls).toEqual([
			[UPDATE, { invoice_name: "SINV-7", item_code: "SOUP", status: "Ready" }],
			[UPDATE, { invoice_name: "SINV-7", item_code: "STEAK", status: "Ready" }],
		])
		expect(undone).toHaveBeenCalledTimes(1)
	})

	it("on the runner's card: puts back the state the dishes had when it was pressed, even when the objects the card holds change before the answer comes", async () => {
		// The card holds the very objects the page read; a screen that updates them while the call is on its way (a refresh, an optimistic update) must not
		// make the dishes look as if they had always been delivered
		const card = {
			key: "SINV-8",
			title: "Table 8",
			subtitle: "#SINV-8",
			invoiceName: "SINV-8",
			creation: "2026-10-30 12:00:00",
			modified: "2026-10-30 12:00:00",
			items: [
				{
					name: "row-1",
					item_code: "SOUP",
					item_name: "Soup",
					qty: 1,
					kds_status: "Ready",
				},
			],
			stationGroups: [],
		}
		call.mockImplementation(async () => {
			for (const item of card.items) item.kds_status = "Delivered"
			return { status: "success" }
		})
		const wrapper = screen(RunnerOrderCard, { card, viewMode: "table" })

		await press(wrapper, '[data-test="ticket-main"]')
		expect(wrapper.find('[data-test="undo-toast"]').exists()).toBe(true)
		call.mockClear()
		await press(wrapper, '[data-test="undo-button"]')

		expect(call.mock.calls).toEqual([
			[UPDATE, { invoice_name: "SINV-8", item_code: "SOUP", status: "Ready" }],
		])
	})

	it("on a station's card, a table's group: each order's dishes go back under their own invoice", async () => {
		const card = {
			key: "kit",
			title: "Cuisine",
			subtitle: "3 items",
			creation: "2026-10-30 12:00:00",
			modified: "2026-10-30 12:00:00",
			items: [],
			tableGroups: [
				{
					tableName: "T1",
					invoiceName: "SINV-1",
					items: [
						{
							name: "r1",
							item_code: "SOUP",
							item_name: "Soup",
							qty: 1,
							kds_status: "Ready",
							_invoiceName: "SINV-1",
						},
						{
							name: "r2",
							item_code: "STEAK",
							item_name: "Steak",
							qty: 1,
							kds_status: "Ready",
							_invoiceName: "SINV-2",
						},
					],
				},
			],
		}
		const wrapper = screen(RunnerOrderCard, { card, viewMode: "station" })

		await press(wrapper, '[data-test="group-deliver"]')
		expect(wrapper.get('[data-test="undo-message"]').text()).toBe(
			"T1 · Delivered",
		)
		call.mockClear()
		await press(wrapper, '[data-test="undo-button"]')

		expect(call.mock.calls).toEqual([
			[UPDATE, { invoice_name: "SINV-1", item_code: "SOUP", status: "Ready" }],
			[UPDATE, { invoice_name: "SINV-2", item_code: "STEAK", status: "Ready" }],
		])
	})
})

describe("two moves in a row", () => {
	it("offer only the last: a new toast replaces the one before, which simply runs out", async () => {
		const first = screen(KDSOrderCard, {
			order: kitchenOrder(),
			showStationBadge: false,
		})
		await press(first, '[data-test="ticket-main"]')
		expect(first.get('[data-test="undo-message"]').text()).toBe(
			"Table 15 · Ready",
		)

		const second = screen(KDSOrderCard, {
			order: kitchenOrder(["Preparing"], { table_display_name: "Table 3" }),
			showStationBadge: false,
		})
		await press(second, '[data-test="ticket-main"]')

		expect(second.get('[data-test="undo-message"]').text()).toBe(
			"Table 3 · Ready",
		)
		expect(first.get('[data-test="undo-message"]').text()).toBe(
			"Table 3 · Ready",
		)
	})
})
