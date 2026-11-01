/**
 * //// Neoffice — added file (no upstream equivalent). A line of several units can be marked ready for SOME of them (NeoRestau lot 1, kitchen test of 01.11: « six of
 * //// the same dish, and four are done »). The status menu of a dish with more than one unit left to cook gets a stepper - n + beside « ready », starting on ALL that is
 * //// left so that one tap is what it always was; the ticket shows the units still to cook as the line's quantity and a pill « 4 of 6 sent » for what left; and the toast of
 * //// the five seconds puts the line back to the counters it had. jsdom has no layout engine: the boxes of the elements are given by hand.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"
import { dismissUndo, useUndoToast } from "@/composables/useUndoToast"
import { kitchenView, readyForTheRunner } from "@/utils/kitchenRunner"

const call = vi.hoisted(() => vi.fn())
const showError = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({ runnerEnabled: true }))

vi.hoisted(() => {
	// The app's `__`: indexed placeholders
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

// The REAL Button, reached by its path (the package's `exports` map does not offer the file)
vi.mock("frappe-ui", async () => {
	const { default: Button } = await import(
		"../../../../node_modules/frappe-ui/src/components/Button/Button.vue"
	)
	return { Button }
})
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))

const { default: KDSOrderCard } = await import("../KDSOrderCard.vue")

const STATIONS = [{ name: "kit", station_name: "Kitchen", use_runner: 1 }]

/** A line of the order, as `get_kds_orders` sends it. */
const line = (code, qty, status, ready = 0, delivered = 0, extra = {}) => ({
	item_code: code,
	item_name: `Dish ${code}`,
	qty,
	kds_status: status,
	kds_batch: 1,
	kds_ready_qty: ready,
	kds_delivered_qty: delivered,
	preparation_station: "kit",
	...extra,
})
const ticket = (items, extra = {}) => ({
	name: "SINV-PART",
	restaurant_table: "T1",
	table_display_name: "T1",
	kds_status: "Preparing",
	creation: "2026-11-01 12:00:00",
	modified: "2026-11-01 12:05:00",
	items,
	...extra,
})

const rect = (left, top, width, height) => ({
	left,
	top,
	width,
	height,
	right: left + width,
	bottom: top + height,
	x: left,
	y: top,
	toJSON() {},
})

/** The dishes are 48 px high, one under the other, from y = 300. */
function layout() {
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
		function box() {
			if (this.matches?.('[data-test="ticket-line"]')) {
				const all = [
					...this.closest('[data-test="ticket-body"]').querySelectorAll(
						'[data-test="ticket-line"]',
					),
				]
				return rect(100, 300 + all.indexOf(this) * 48, 300, 48)
			}
			return rect(0, 0, 0, 0)
		},
	)
}

let opened = []
function show(order, props = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: { order, stations: STATIONS, ...props },
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}

const lines = (wrapper) => wrapper.findAll('[data-test="ticket-line"]')
const menuOf = (wrapper) => wrapper.find('[data-test="ticket-line-menu"]')
const open = (wrapper, index = 0) => lines(wrapper)[index].trigger("click")
const picker = (wrapper) => wrapper.find('[data-test="ticket-line-picker"]')
const count = (wrapper) => wrapper.get('[data-test="picker-count"]').text()
const readyButton = (wrapper) => wrapper.get('[data-test="menu-ready"]')
const label = (button) => button.text().replace(/\s+/g, " ").trim()

beforeEach(() => {
	opened = []
	call.mockReset()
	call.mockResolvedValue({ status: "success" })
	showError.mockReset()
	dismissUndo()
	window.innerWidth = 1280
	window.innerHeight = 800
	layout()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	dismissUndo()
	vi.restoreAllMocks()
})

describe("the quantity picker of a dish's menu", () => {
	it("is not drawn for a dish of one unit: its menu is what it always was", async () => {
		const wrapper = show(ticket([line("A", 1, "Preparing")]))

		await open(wrapper)

		expect(picker(wrapper).exists()).toBe(false)
		expect(label(readyButton(wrapper))).toBe("Mark ready")
	})

	it("is drawn for a dish of several units, starting on ALL of them: one tap is the whole line", async () => {
		const wrapper = show(ticket([line("A", 6, "Preparing")]))

		await open(wrapper)

		expect(picker(wrapper).exists()).toBe(true)
		expect(count(wrapper)).toBe("6")
		expect(label(readyButton(wrapper))).toBe("Mark ready")
		expect(
			wrapper.get('[data-test="picker-more"]').attributes("disabled"),
		).toBeDefined()
		expect(
			wrapper.get('[data-test="picker-less"]').attributes("disabled"),
		).toBeUndefined()
	})

	it("steps down and up within 1 and what is left, and the button says how many it marks", async () => {
		const wrapper = show(ticket([line("A", 6, "Preparing")]))
		await open(wrapper)

		await wrapper.get('[data-test="picker-less"]').trigger("click")
		await wrapper.get('[data-test="picker-less"]').trigger("click")
		expect(count(wrapper)).toBe("4")
		expect(label(readyButton(wrapper))).toBe("Mark ready · 4 of 6")

		await wrapper.get('[data-test="picker-more"]').trigger("click")
		expect(count(wrapper)).toBe("5")

		for (let tap = 0; tap < 8; tap += 1)
			await wrapper.get('[data-test="picker-less"]').trigger("click")
		expect(count(wrapper)).toBe("1")
		expect(
			wrapper.get('[data-test="picker-less"]').attributes("disabled"),
		).toBeDefined()
		expect(label(readyButton(wrapper))).toBe("Mark ready · 1 of 6")
	})

	it("stays open while the cook steps: a tap on the stepper is no tap outside", async () => {
		const wrapper = show(ticket([line("A", 6, "Preparing")]))
		await open(wrapper)

		await wrapper.get('[data-test="picker-less"]').trigger("click")
		document.body.click()

		// The page closes a menu on a click on the document; the stepper's click stopped before it
		expect(menuOf(wrapper).exists()).toBe(true)
	})

	it("starts again on all that is left each time the menu opens", async () => {
		const wrapper = show(
			ticket([line("A", 6, "Preparing"), line("B", 3, "Preparing")]),
		)
		await open(wrapper, 0)
		await wrapper.get('[data-test="picker-less"]').trigger("click")
		expect(count(wrapper)).toBe("5")

		await open(wrapper, 1)
		expect(count(wrapper)).toBe("3")
		await open(wrapper, 0)
		expect(count(wrapper)).toBe("6")
	})

	it("counts what is left to cook, not the line's quantity: a line with four cooked has two to mark", async () => {
		const wrapper = show(ticket([line("A", 6, "Preparing", 4)]))

		await open(wrapper)

		expect(count(wrapper)).toBe("2")
		await wrapper.get('[data-test="picker-less"]').trigger("click")
		expect(label(readyButton(wrapper))).toBe("Mark ready · 1 of 2")
	})

	it("is drawn on a line with one unit left only if the item has other units to cook on another line", async () => {
		const lastUnit = show(ticket([line("A", 6, "Preparing", 5)]))
		await open(lastUnit)
		expect(picker(lastUnit).exists()).toBe(false)

		const together = show(
			ticket([line("A", 3, "Preparing", 2), line("A", 2, "Preparing")]),
		)
		await open(together, 0)
		// 1 left on the first line and 2 on the second: the server fills them in the order of the lines, so the picker reaches 3
		expect(count(together)).toBe("3")
	})

	it("is not drawn for a dish that is already ready, one held back, or in the list of what waits at the pass", async () => {
		const ready = show(ticket([line("A", 6, "Ready", 6)]), { useRunner: true })
		await open(ready)
		expect(picker(ready).exists()).toBe(false)

		const list = show(ticket([line("A", 6, "Ready", 6)]), {
			mode: "ready-list",
		})
		await open(list)
		expect(picker(list).exists()).toBe(false)
		expect(
			list
				.findAll('[data-test="ticket-line-menu"] button:not([data-test="menu-close"])')
				.map((button) => label(button)),
		).toEqual(["Preparing"])
	})

	it("is not drawn for a station with no runner: the cook delivers there, there is no « ready » to mark in part", async () => {
		const wrapper = show(ticket([line("A", 6, "Preparing")]), {
			useRunner: false,
		})

		await open(wrapper)

		expect(picker(wrapper).exists()).toBe(false)
	})

	it("has buttons a finger can hit (64 px square, far over the 44 a finger needs) and the dark mode's classes of the menu's other buttons", async () => {
		const wrapper = show(ticket([line("A", 6, "Preparing")]))
		await open(wrapper)

		for (const test of ["picker-less", "picker-more"]) {
			const classes = wrapper.get(`[data-test="${test}"]`).classes()
			expect(classes, test).toContain("h-16")
			expect(classes, test).toContain("w-16")
			expect(
				classes.some((name) => name.startsWith("dark:bg-")),
				test,
			).toBe(true)
			expect(
				classes.some((name) => name.startsWith("dark:text-")),
				test,
			).toBe(true)
			expect(
				classes.some((name) => name.startsWith("dark:border-")),
				test,
			).toBe(true)
		}
		expect(
			wrapper
				.get('[data-test="picker-count"]')
				.classes()
				.some((n) => n.startsWith("dark:text-")),
		).toBe(true)
		expect(readyButton(wrapper).classes()).toContain("min-h-[64px]")
	})

	it("widens the menu so that the button's words stay on one line, and places it with that width", async () => {
		const wrapper = show(ticket([line("A", 6, "Preparing")]))

		await open(wrapper)

		const menu = menuOf(wrapper)
		expect(menu.classes()).toContain("w-80")
		// The dish ends at x = 400: the menu hangs from its right edge, 320 wide (Daniel, 01.11: much bigger)
		expect(menu.element.style.left).toBe(`${400 - 320}px`)
	})

	it("leaves the plain menu 288 px wide", async () => {
		const wrapper = show(ticket([line("A", 1, "Preparing")]))

		await open(wrapper)

		expect(menuOf(wrapper).classes()).toContain("w-72")
		expect(menuOf(wrapper).element.style.left).toBe(`${400 - 288}px`)
	})

	it("names the dish in its head with the units still to cook", async () => {
		const wrapper = show(ticket([line("A", 6, "Preparing", 4)]))

		await open(wrapper)

		expect(wrapper.get('[data-test="ticket-line-menu-dish"]').text()).toBe(
			"2× Dish A",
		)
	})
})

describe("marking some units ready", () => {
	it("sends the quantity with the status, and reads the orders again", async () => {
		const wrapper = show(ticket([line("A", 6, "Preparing")]))
		await open(wrapper)
		await wrapper.get('[data-test="picker-less"]').trigger("click")
		await wrapper.get('[data-test="picker-less"]').trigger("click")

		await readyButton(wrapper).trigger("click")
		await flushPromises()

		expect(call).toHaveBeenCalledTimes(1)
		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{
				invoice_name: "SINV-PART",
				item_code: "A",
				status: "Ready",
				qty: 4,
			},
		)
		expect(wrapper.emitted("status-updated")).toHaveLength(1)
	})

	it("shows nothing before the server has answered: the units a line shows are worked out from its counters", async () => {
		const order = ticket([line("A", 6, "Preparing")])
		const wrapper = show(order)
		await open(wrapper)
		await wrapper.get('[data-test="picker-less"]').trigger("click")
		let answer
		call.mockReturnValue(
			new Promise((resolve) => {
				answer = resolve
			}),
		)

		await readyButton(wrapper).trigger("click")

		expect(order.items[0].kds_status).toBe("Preparing")
		answer({ status: "success" })
		await flushPromises()
		expect(order.items[0].kds_status).toBe("Preparing")
	})

	it("is what it always was with the default: no quantity is sent, the whole line is Ready at once", async () => {
		const order = ticket([line("A", 6, "Preparing")])
		const wrapper = show(order)
		await open(wrapper)

		await readyButton(wrapper).trigger("click")
		await flushPromises()

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{
				invoice_name: "SINV-PART",
				item_code: "A",
				status: "Ready",
			},
		)
		expect(order.items[0].kds_status).toBe("Ready")
	})

	it("sends no quantity when the picked number is all that is left, after stepping down and back up", async () => {
		const wrapper = show(ticket([line("A", 6, "Preparing", 4)]))
		await open(wrapper)
		await wrapper.get('[data-test="picker-less"]').trigger("click")
		await wrapper.get('[data-test="picker-more"]').trigger("click")

		await readyButton(wrapper).trigger("click")
		await flushPromises()

		expect(call.mock.calls[0][1]).not.toHaveProperty("qty")
	})

	it("tells the cook when the server refuses, and offers no undo", async () => {
		call.mockRejectedValue(new Error("refused"))
		const wrapper = show(ticket([line("A", 6, "Preparing")]))
		await open(wrapper)
		await wrapper.get('[data-test="picker-less"]').trigger("click")

		await readyButton(wrapper).trigger("click")
		await flushPromises()

		expect(showError).toHaveBeenCalledWith("Failed to update item status")
		expect(useUndoToast().offer.value).toBeNull()
		expect(wrapper.emitted("status-updated")).toBeUndefined()
	})
})

describe("the toast puts a line back exactly", () => {
	async function markAndUndo(order, steps) {
		const wrapper = show(order)
		await open(wrapper)
		for (let tap = 0; tap < steps; tap += 1)
			await wrapper.get('[data-test="picker-less"]').trigger("click")
		await readyButton(wrapper).trigger("click")
		await flushPromises()
		call.mockClear()
		const { undoNow } = useUndoToast()
		await undoNow()
		return wrapper
	}

	it("restores the counters a line had when four of six were marked ready on a line not begun", async () => {
		await markAndUndo(ticket([line("A", 6, "Pending")]), 2)

		expect(call).toHaveBeenCalledTimes(1)
		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{
				invoice_name: "SINV-PART",
				item_code: "A",
				status: "Pending",
				restore: JSON.stringify({ ready_qty: 0, delivered_qty: 0 }),
			},
		)
	})

	it("restores a line that was Preparing with two cooked, its status unchanged by the move", async () => {
		await markAndUndo(ticket([line("A", 6, "Preparing", 2)]), 1)

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{
				invoice_name: "SINV-PART",
				item_code: "A",
				status: "Preparing",
				restore: JSON.stringify({ ready_qty: 2, delivered_qty: 0 }),
			},
		)
	})

	it("says in its message which dish, the state it came to and how many", async () => {
		const wrapper = show(ticket([line("A", 6, "Preparing")]))
		await open(wrapper)
		await wrapper.get('[data-test="picker-less"]').trigger("click")
		await wrapper.get('[data-test="picker-less"]').trigger("click")

		await readyButton(wrapper).trigger("click")
		await flushPromises()

		expect(useUndoToast().offer.value.message).toBe(
			"T1 · Dish A · Ready · 4 of 6",
		)
	})

	it("restores the whole line to the counters it had after a tap on the whole line", async () => {
		const wrapper = show(ticket([line("A", 6, "Preparing", 4, 1)]))
		await open(wrapper)
		await readyButton(wrapper).trigger("click")
		await flushPromises()
		call.mockClear()

		await useUndoToast().undoNow()

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{
				invoice_name: "SINV-PART",
				item_code: "A",
				status: "Preparing",
				restore: JSON.stringify({ ready_qty: 4, delivered_qty: 1 }),
			},
		)
	})

	it("restores each dish the main button moved, a line cooked in part to its own counters", async () => {
		// The ticket is being cooked and the cook presses the main button: « Ready » for every dish that is not
		const order = ticket([
			line("A", 6, "Preparing", 4),
			line("B", 1, "Pending"),
		])
		const wrapper = show(order)

		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await flushPromises()
		call.mockClear()
		await useUndoToast().undoNow()

		const sent = call.mock.calls.map(([, params]) => [
			params.item_code,
			params.status,
			params.restore,
		])
		expect(sent).toEqual([
			["A", "Preparing", JSON.stringify({ ready_qty: 4, delivered_qty: 0 })],
			["B", "Pending", JSON.stringify({ ready_qty: 0, delivered_qty: 0 })],
		])
	})

	it("says only the status for a line of a server that sends no counters", async () => {
		const bare = {
			item_code: "A",
			item_name: "Dish A",
			qty: 1,
			kds_status: "Preparing",
			preparation_station: "kit",
		}
		const wrapper = show(ticket([bare]))
		await open(wrapper)
		await readyButton(wrapper).trigger("click")
		await flushPromises()
		call.mockClear()

		await useUndoToast().undoNow()

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{
				invoice_name: "SINV-PART",
				item_code: "A",
				status: "Preparing",
			},
		)
	})
})

describe("the ticket with a line cooked in part", () => {
	const view = (items) =>
		kitchenView([ticket(items)], { stations: STATIONS, runnerEnabled: true })[0]

	it("shows the units still to cook as the line's quantity, and a pill for what already left", () => {
		const wrapper = show(view([line("A", 6, "Preparing", 4)]))

		expect(wrapper.get('[data-test="ticket-qty"]').text()).toBe("2×")
		const pill = wrapper.get('[data-test="ticket-line-sent"]')
		expect(pill.text()).toBe("4 of 6 sent")
		// Struck through and faded like a delivered dish, and in the dark mode's classes
		expect(pill.classes()).toContain("line-through")
		expect(pill.classes().some((name) => name.startsWith("opacity-"))).toBe(
			true,
		)
		expect(
			pill.classes().some((name) => name.startsWith("dark:opacity-")),
		).toBe(true)
	})

	it("shows the same from the order itself, a card that is handed no view of it", () => {
		const wrapper = show(ticket([line("A", 6, "Preparing", 4)]))

		expect(wrapper.get('[data-test="ticket-qty"]').text()).toBe("2×")
		expect(wrapper.get('[data-test="ticket-line-sent"]').text()).toBe(
			"4 of 6 sent",
		)
	})

	it("has no pill on a line nothing has left from, nor on a line sent in full", () => {
		const wrapper = show(
			view([
				line("A", 6, "Preparing", 0),
				line("B", 2, "Ready", 2),
				line("C", 1, "Preparing", 0, 0, { item_name: "Plain" }),
			]),
		)

		expect(wrapper.findAll('[data-test="ticket-line-sent"]')).toHaveLength(0)
		// (The ticket may order its dishes, the ones still to cook before the ones already sent: the quantities are compared whatever the order)
		expect(
			wrapper
				.findAll('[data-test="ticket-qty"]')
				.map((one) => one.text())
				.sort(),
		).toEqual(["1×", "2×", "6×"])
	})

	it("keeps the line a live one: it is tapped, it has a menu, and the strike-through is the pill's alone", async () => {
		const wrapper = show(view([line("A", 6, "Preparing", 4)]))
		const first = lines(wrapper)[0]

		expect(first.classes()).not.toContain("line-through")
		expect(first.classes()).toContain("cursor-pointer")
		await first.trigger("click")
		expect(menuOf(wrapper).exists()).toBe(true)
		expect(count(wrapper)).toBe("2")
	})

	it("sends the item with what is left to cook when the cook marks the rest from a view of the order", async () => {
		const wrapper = show(view([line("A", 6, "Preparing", 4)]))
		await open(wrapper)
		await wrapper.get('[data-test="picker-less"]').trigger("click")

		await readyButton(wrapper).trigger("click")
		await flushPromises()

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{
				invoice_name: "SINV-PART",
				item_code: "A",
				status: "Ready",
				qty: 1,
			},
		)
		expect(useUndoToast().offer.value.message).toBe(
			"T1 · Dish A · Ready · 1 of 2",
		)
	})

	it("holds the dishes of a line cooked in part in the full-screen panel too", async () => {
		const wrapper = show(view([line("A", 6, "Preparing", 4)]), {
			fullscreen: true,
		})

		expect(wrapper.get('[data-test="ticket-qty"]').text()).toBe("2×")
		expect(wrapper.get('[data-test="ticket-line-sent"]').text()).toBe(
			"4 of 6 sent",
		)
	})
})

describe("the list of what waits at the pass, with a line cooked in part", () => {
	const waiting = (items) =>
		readyForTheRunner([ticket(items)], {
			stations: STATIONS,
			runnerEnabled: true,
		})[0]

	it("shows the units at the pass as the quantity of the line", () => {
		const wrapper = show(waiting([line("A", 6, "Preparing", 4)]), {
			mode: "ready-list",
		})

		expect(wrapper.get('[data-test="ticket-qty"]').text()).toBe("4×")
	})

	it("calls the units back to preparation: the item is sent back, as for any dish of the list", async () => {
		const wrapper = show(waiting([line("A", 6, "Preparing", 4)]), {
			mode: "ready-list",
		})

		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await flushPromises()

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{
				invoice_name: "SINV-PART",
				item_code: "A",
				status: "Preparing",
			},
		)
	})

	it("keeps the menu of a dish of the list to « Preparing » alone", async () => {
		const wrapper = show(waiting([line("A", 6, "Ready", 6, 4)]), {
			mode: "ready-list",
		})

		await open(wrapper)

		expect(
			wrapper
				.findAll('[data-test="ticket-line-menu"] button:not([data-test="menu-close"])')
				.map((button) => label(button)),
		).toEqual(["Preparing"])
		expect(picker(wrapper).exists()).toBe(false)
		await nextTick()
	})
})
