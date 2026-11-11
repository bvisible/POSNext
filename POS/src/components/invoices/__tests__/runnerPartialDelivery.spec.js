/**
 * //// Neoffice — added file (no upstream equivalent). The runner carries the units at the pass of a line the kitchen marked ready in part (NeoResto lot 1, kitchen
 * //// test of 01.11: « six of the same dish, and four are done »). The server tells the card the units to carry as the line's quantity (`qty`) and the line's own quantity
 * //// beside it (`ordered_qty`): the card says « 4× » and « (4 of 6) », delivers the line, and the toast of the five seconds puts the counters back as they were.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { dismissUndo, useUndoToast } from "@/composables/useUndoToast"
import { stateAfterDelivery } from "@/utils/kitchenRunner"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))
const showError = vi.hoisted(() => vi.fn())

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

const { default: RunnerOrderCard } = await import("../RunnerOrderCard.vue")

/** A line of `get_runner_orders`: `qty` is what waits at the pass, `ordered_qty` the line's own quantity. */
const line = (name, qty, ordered, status, ready, delivered, extra = {}) => ({
	name,
	item_code: `CODE-${name}`,
	item_name: `Dish ${name}`,
	qty,
	ordered_qty: ordered,
	kds_status: status,
	kds_ready_qty: ready,
	kds_delivered_qty: delivered,
	preparation_station: "kit",
	station_name: "Cuisine",
	station_color: "#F55D1A",
	...extra,
})
const card = (items, extra = {}) => ({
	key: "SINV-0042",
	title: "Table 22",
	subtitle: "#SINV-0042",
	invoiceName: "SINV-0042",
	creation: "2026-11-01 12:00:00",
	modified: "2026-11-01 12:00:00",
	roomName: "Salle 1",
	ticketNo: "0014",
	items,
	stationGroups: [],
	...extra,
})

let opened = []
function show(props = {}) {
	const wrapper = mount(RunnerOrderCard, {
		props: { card: card([]), viewMode: "table", ...props },
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
const quantities = (wrapper) =>
	wrapper.findAll('[data-test="ticket-qty"]').map((one) => one.text())
const ofTheLine = (wrapper) =>
	wrapper.findAll('[data-test="ticket-qty-of"]').map((one) => one.text())

beforeEach(() => {
	opened = []
	call.mockClear()
	showError.mockClear()
	dismissUndo()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	dismissUndo()
	vi.restoreAllMocks()
})

describe("the units a line holds at the pass", () => {
	it("are the quantity of the line, with « (4 of 6) » beside it when the line is bigger", () => {
		const wrapper = show({
			card: card([
				line("a", 4, 6, "Preparing", 4, 0),
				line("b", 2, 2, "Ready", 2, 0),
			]),
		})

		expect(quantities(wrapper)).toEqual(["4×", "2×"])
		expect(ofTheLine(wrapper)).toEqual(["(4 of 6)"])
	})

	it("say the same in the station view, under each table of the station", () => {
		const items = [
			line("a", 4, 6, "Preparing", 4, 0, { _invoiceName: "SINV-0042" }),
		]
		const wrapper = show({
			viewMode: "station",
			card: card(items, {
				tableGroups: [
					{ tableName: "Table 22", invoiceName: "SINV-0042", items },
				],
			}),
		})

		expect(quantities(wrapper)).toEqual(["4×"])
		expect(ofTheLine(wrapper)).toEqual(["(4 of 6)"])
	})

	it("say nothing more for a line a server that sends no ordered quantity delivers whole", () => {
		const wrapper = show({
			card: card([
				{ name: "a", item_name: "Plain", qty: 3, preparation_station: "kit" },
			]),
		})

		expect(quantities(wrapper)).toEqual(["3×"])
		expect(ofTheLine(wrapper)).toEqual([])
	})

	it("count the rest of a Ready line when some units were delivered before", () => {
		const wrapper = show({ card: card([line("a", 2, 6, "Ready", 6, 4)]) })

		expect(quantities(wrapper)).toEqual(["2×"])
		expect(ofTheLine(wrapper)).toEqual(["(2 of 6)"])
	})
})

describe("what the runner's delivery leaves a line in", () => {
	it("is Delivered, every unit counted, for a line that is Ready", () => {
		expect(stateAfterDelivery(line("a", 6, 6, "Ready", 6, 0))).toEqual({
			kds_status: "Delivered",
			kds_ready_qty: 6,
			kds_delivered_qty: 6,
		})
	})

	it("is the same status with the delivered units caught up with the cooked ones, for a line cooked in part", () => {
		expect(stateAfterDelivery(line("a", 4, 6, "Preparing", 4, 0))).toEqual({
			kds_status: "Preparing",
			kds_ready_qty: 4,
			kds_delivered_qty: 4,
		})
	})

	it("is only the status for a line the server sent no counters for", () => {
		expect(
			stateAfterDelivery({ name: "a", kds_status: "Ready", qty: 2 }),
		).toEqual({ kds_status: "Delivered" })
	})
})

describe("delivering a line cooked in part", () => {
	it("sends the lines of the card, by their row names, as it always did", async () => {
		const wrapper = show({ card: card([line("a", 4, 6, "Preparing", 4, 0)]) })

		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await flushPromises()

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.mark_items_delivered",
			{
				invoice_name: "SINV-0042",
				item_names: JSON.stringify(["a"]),
			},
		)
		// (The Button of this spec is a stub that emits `click` and lets the native click through: a press may run the handler twice)
		expect(wrapper.emitted("delivered")).toBeTruthy()
	})

	it("offers to take the delivery back to the counters the line had: a status that did not move still has a delivery to undo", async () => {
		const wrapper = show({ card: card([line("a", 4, 6, "Preparing", 4, 0)]) })
		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await flushPromises()
		call.mockClear()

		await useUndoToast().undoNow()

		expect(call).toHaveBeenCalledTimes(1)
		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{
				invoice_name: "SINV-0042",
				item_code: "CODE-a",
				status: "Preparing",
				//// Neoffice — the line by its id (maintenance#2075)
				row: "a",
				restore: JSON.stringify({ ready_qty: 4, delivered_qty: 0 }),
			},
		)
	})

	it("takes a Ready line with units already delivered back to Ready with those units", async () => {
		const wrapper = show({ card: card([line("a", 2, 6, "Ready", 6, 4)]) })
		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await flushPromises()
		call.mockClear()

		await useUndoToast().undoNow()

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{
				invoice_name: "SINV-0042",
				item_code: "CODE-a",
				status: "Ready",
				row: "a",
				restore: JSON.stringify({ ready_qty: 6, delivered_qty: 4 }),
			},
		)
	})

	it("puts back each line of the card to its own state, in one call each", async () => {
		const wrapper = show({
			card: card([
				line("a", 4, 6, "Preparing", 4, 0),
				line("b", 2, 2, "Ready", 2, 0),
			]),
		})
		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await flushPromises()
		call.mockClear()

		await useUndoToast().undoNow()

		expect(
			call.mock.calls.map(([, params]) => [
				params.item_code,
				params.status,
				params.restore,
			]),
		).toEqual([
			[
				"CODE-a",
				"Preparing",
				JSON.stringify({ ready_qty: 4, delivered_qty: 0 }),
			],
			["CODE-b", "Ready", JSON.stringify({ ready_qty: 2, delivered_qty: 0 })],
		])
	})

	it("puts back a line of a server that sends no counters by its status alone, as before", async () => {
		const wrapper = show({
			card: card([
				{
					name: "a",
					item_code: "SOUP",
					item_name: "Soup",
					qty: 1,
					kds_status: "Ready",
					preparation_station: "kit",
				},
			]),
		})
		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await flushPromises()
		call.mockClear()

		await useUndoToast().undoNow()

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{
				invoice_name: "SINV-0042",
				item_code: "SOUP",
				status: "Ready",
				row: "a",
			},
		)
	})
})
