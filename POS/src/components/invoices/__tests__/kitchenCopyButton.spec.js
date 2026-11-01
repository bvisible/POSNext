/**
 * //// Neoffice — added file (no upstream equivalent). The printer button on the kitchen's card AND the runner's card (NeoRestau lot 1, task 44): beside the
 * //// ticket's main button, the same square on the button height (`--kds-btn-h`, which the text size and the full-screen panel change), drawn only when the
 * //// screen says it can print; one tap asks the screen to print (the card calls nothing itself); the button says where the copy stands as the bill's printer
 * //// button does (a spinner, a tick, a warning, and the words under it); it cannot be pressed again while a copy is on its way. jsdom has no layout engine:
 * //// the order of the parts and their classes are what is read.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))

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
	useRestaurantStore: () => ({ runnerEnabled: false }),
}))

const { default: KDSOrderCard } = await import("../KDSOrderCard.vue")
const { default: RunnerOrderCard } = await import("../RunnerOrderCard.vue")

const kitchenOrder = {
	name: "SINV-2026-02689",
	restaurant_table: "t15",
	table_display_name: "Table 15",
	kds_status: "Preparing",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:05:00",
	items: [
		{ item_code: "A", item_name: "Steak", qty: 1, kds_status: "Pending", kds_batch: 1, preparation_station: "kit" },
	],
}
const runnerCard = {
	key: "SINV-0042",
	title: "Table 22",
	invoiceName: "SINV-0042",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:00:00",
	items: [{ name: "a", item_name: "Steak", qty: 1, preparation_station: "kit", station_name: "Cuisine" }],
	stationGroups: [],
}

const CARDS = {
	"the kitchen's card": {
		component: KDSOrderCard,
		props: { order: kitchenOrder, showStationBadge: false },
		subject: kitchenOrder,
	},
	"the runner's card": {
		component: RunnerOrderCard,
		props: { card: runnerCard, viewMode: "table" },
		subject: runnerCard,
	},
}

let opened = []
function show(kind, props = {}) {
	const { component, props: base } = CARDS[kind]
	const wrapper = mount(component, {
		props: { ...base, ...props },
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
const part = (wrapper, name) => wrapper.get(`[data-test="${name}"]`)
const print = (wrapper) => part(wrapper, "ticket-print")

beforeEach(() => {
	opened = []
	call.mockClear()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.restoreAllMocks()
})

describe.each(Object.keys(CARDS))("the printer button of %s", (kind) => {
	it("is not drawn while the screen cannot print: no printer for the station, or the setting is off", () => {
		const wrapper = show(kind)

		expect(wrapper.find('[data-test="ticket-print"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="ticket-print-state"]').exists()).toBe(false)
	})

	it("stands beside the main button, in the action row, once the screen can print", () => {
		const wrapper = show(kind, { canPrint: true })

		const row = part(wrapper, "ticket-actions").element
		const names = [...row.children].map((element) => element.getAttribute("data-test"))
		expect(names).toEqual(["ticket-main", "ticket-print"])
		expect(print(wrapper).attributes("aria-label")).toBe("Print a copy of this ticket")
	})

	it("is a square on the button height at every size: it follows --kds-btn-h, as the main button does", () => {
		const wrapper = show(kind, { canPrint: true })

		expect(print(wrapper).classes()).toEqual(
			expect.arrayContaining(["h-[var(--kds-btn-h,44px)]", "w-[var(--kds-btn-h,44px)]", "flex-none"]),
		)
		expect(part(wrapper, "ticket-main").classes()).toContain("!h-[var(--kds-btn-h,44px)]")
	})

	it("asks the screen to print on a tap, once, and calls nothing itself", async () => {
		const wrapper = show(kind, { canPrint: true })

		await print(wrapper).trigger("click")

		const emitted = wrapper.emitted("print")
		expect(emitted).toHaveLength(1)
		expect(emitted[0][0]).toEqual(CARDS[kind].subject)
		expect(call).not.toHaveBeenCalled()
		expect(wrapper.emitted("delivered")).toBeUndefined()
		expect(wrapper.emitted("status-updated")).toBeUndefined()
	})

	it("shows the printer and no words while nothing is on its way", () => {
		const wrapper = show(kind, { canPrint: true })

		expect(wrapper.find('[data-test="ticket-print-state"]').exists()).toBe(false)
		expect(print(wrapper).get('[data-icon="printer"]').exists()).toBe(true)
		expect(print(wrapper).attributes("disabled")).toBeUndefined()
	})

	it.each([
		["sending", "Sending…", "spinner", true],
		["printing", "Printing…", "spinner", true],
		["printed", "Printed", "tick", false],
		["offline", "Printer offline: the ticket will come out when it is back (15 min)", "warning", true],
		["failed", "Not printed: Paper empty", "warning", false],
	])("says %s in words under the button, with its icon, and presses only when no copy is on its way", async (phase, text, icon, busy) => {
		const wrapper = show(kind, { canPrint: true, printState: { phase, text } })

		const bubble = part(wrapper, "ticket-print-state")
		expect(bubble.text()).toBe(text)
		expect(bubble.attributes("role")).toBe("status")
		expect(bubble.attributes("data-print-state")).toBe(phase)
		// the words are not inside the square: the square keeps its size
		expect(print(wrapper).element.contains(bubble.element)).toBe(false)
		expect(print(wrapper).get(`[data-icon="${icon}"]`).exists()).toBe(true)
		expect(print(wrapper).attributes("data-print-state")).toBe(phase)
		expect(print(wrapper).attributes("disabled") !== undefined).toBe(busy)
		// and it keeps the size the text size gives, whatever it says
		expect(print(wrapper).classes()).toEqual(
			expect.arrayContaining(["h-[var(--kds-btn-h,44px)]", "w-[var(--kds-btn-h,44px)]"]),
		)
		await print(wrapper).trigger("click")
		expect(wrapper.emitted("print") || []).toHaveLength(busy ? 0 : 1)
	})

	it("is the same button in the ticket opened full screen, with its state, between the main button and the ×", () => {
		const wrapper = show(kind, { canPrint: true, fullscreen: true, printState: { phase: "printed", text: "Printed" } })

		const names = [...part(wrapper, "ticket-actions").element.children].map((element) =>
			element.getAttribute("data-test"),
		)
		expect(names).toEqual(["ticket-main", "ticket-print", "ticket-print-state", "ticket-close"])
		expect(print(wrapper).classes()).toContain("h-[var(--kds-btn-h,44px)]")
	})
})

describe("the kitchen card's printer button next to its confirmation", () => {
	it("is not drawn over the question « the runner is active » that takes the row", () => {
		const wrapper = mount(KDSOrderCard, {
			props: { order: kitchenOrder, showStationBadge: false, canPrint: true },
			global: { mocks: { __: globalThis.__ } },
		})
		opened.push(wrapper)
		wrapper.vm.showDeliveredConfirm = true

		return wrapper.vm.$nextTick().then(() => {
			expect(wrapper.find('[data-test="ticket-print"]').exists()).toBe(false)
		})
	})
})
