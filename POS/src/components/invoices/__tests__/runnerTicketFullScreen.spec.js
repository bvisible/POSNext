/**
 * //// Neoffice — added file (no upstream equivalent). The runner's ticket opened FULL SCREEN over the board (NeoResto lot 1, task 38a-3, ruling 107 layer 3, ruling 130): the card has the kitchen's
 * //// anatomy, so it has the kitchen's way out of a long ticket. A tap on the « +N lines » strip opens the same card in a panel that takes the screen, with « Deliver » at the TOP, the dishes in
 * //// large text in columns side by side, closed by an ×, a tap outside or Escape; the board keeps updating behind it. jsdom has no layout engine: the boxes are given by hand.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick, ref } from "vue"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

vi.mock("frappe-ui", () => ({
	Button: {
		props: ["loading"],
		emits: ["click"],
		template:
			'<button :disabled="loading" @click="$emit(\'click\')"><slot /></button>',
	},
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

const { default: RunnerOrderCard } = await import("../RunnerOrderCard.vue")
const { TEXT_SIZE_KEY } = await import("@/utils/kitchenTextSize")

const dish = (index, extra = {}) => ({
	name: `row-${index}`,
	item_code: `ITEM-${index}`,
	item_name: `Dish ${index + 1}`,
	qty: 1,
	kds_status: "Ready",
	preparation_station: "kit",
	station_name: "Cuisine",
	station_color: "#F55D1A",
	...extra,
})
const card = (count, extra = {}) => ({
	key: "SINV-0042",
	title: "Table 22",
	subtitle: "#SINV-0042",
	invoiceName: "SINV-0042",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:00:00",
	roomName: "Salle 1",
	roomCode: "S01",
	ticketNo: "0014",
	items: Array.from({ length: count }, (_, index) => dish(index)),
	stationGroups: [],
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
/** The board's card shows 4 of its dishes of 40 px. */
function boardLayout() {
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
		function box() {
			const body = this.closest?.('[data-test="ticket-body"]')
			if (this.matches?.('[data-test="ticket-body"]'))
				return rect(0, 0, 300, 160)
			if (this.matches?.("[data-ticket-line]") && body) {
				const all = [...body.querySelectorAll("[data-ticket-line]")]
				return rect(0, all.indexOf(this) * 40, 300, 40)
			}
			return rect(0, 0, 0, 0)
		},
	)
}

let opened = []
function show(props, size) {
	const wrapper = mount(RunnerOrderCard, {
		props: { card: card(24), viewMode: "table", ...props },
		attachTo: document.body,
		global: {
			mocks: { __: globalThis.__ },
			provide: size ? { [TEXT_SIZE_KEY]: ref(size) } : {},
		},
	})
	opened.push(wrapper)
	return wrapper
}
async function openIt(wrapper) {
	await nextTick()
	await wrapper.get('[data-test="ticket-more-strip"]').trigger("click")
	await nextTick()
}
const scrim = () =>
	document.body.querySelector('[data-test="fullscreen-scrim"]')
const dialog = () =>
	document.body.querySelector('[data-test="ticket-fullscreen"]')
const panel = () => document.body.querySelector('[data-test="ticket-panel"]')
const part = (name) => panel()?.querySelector(`[data-test="${name}"]`)

beforeEach(() => {
	opened = []
	call.mockClear()
	boardLayout()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.restoreAllMocks()
	document.body.innerHTML = ""
})

describe("opening the runner's ticket full screen", () => {
	it("is also a tap on the foot strip of a SHORT ticket (kitchen test, 01.11)", async () => {
		const wrapper = show({ card: card(3) })
		await nextTick()
		expect(wrapper.find('[data-test="ticket-more"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="ticket-expand"]').exists()).toBe(false)

		await wrapper.get('[data-test="ticket-more-strip"]').trigger("click")
		await nextTick()

		expect(panel()).not.toBeNull()
		expect(part("ticket-more-strip")).toBeNull()
		expect(part("ticket-close")).not.toBeNull()
	})

	it("is a tap on the « +N lines » strip, over the board, in a dialog teleported to the body", async () => {
		const wrapper = show()
		await nextTick()
		expect(dialog()).toBeNull()

		await openIt(wrapper)

		expect(panel()).not.toBeNull()
		expect(wrapper.element.contains(dialog())).toBe(false)
		expect(dialog().getAttribute("role")).toBe("dialog")
		expect(dialog().getAttribute("aria-label")).toBe("Table 22")
	})

	it("has the same header, with the state in words (« Ready ») and the length", async () => {
		await openIt(show())

		expect(part("ticket-room").textContent.trim()).toBe("S01")
		expect(part("ticket-title").textContent.trim()).toBe("Table 22")
		expect(part("ticket-number").textContent.trim()).toBe("0014")
		expect(part("ticket-timer")).not.toBeNull()
		expect(
			part("ticket-fs-state").textContent.replace(/\s+/g, " ").trim(),
		).toBe("Ready · 24 lines")
	})

	it("says « Hand over · … » for a takeaway, which is handed over and not delivered to a table", async () => {
		await openIt(
			show({ card: card(24, { takeaway: true, title: "Takeaway" }) }),
		)

		expect(part("ticket-main").textContent.trim()).toBe("Hand over")
		expect(dialog().getAttribute("aria-label")).toBe("Takeaway")
	})
})

describe("the action row of the runner's panel", () => {
	it("is at the TOP: the header, then « Deliver », then the dishes, so the runner acts without closing", async () => {
		await openIt(show())

		const order = [...panel().querySelectorAll("[data-test]")]
			.map((element) => element.getAttribute("data-test"))
			.filter((name) =>
				[
					"ticket-header",
					"ticket-actions",
					"ticket-main",
					"ticket-body",
				].includes(name),
			)
		expect(order).toEqual([
			"ticket-header",
			"ticket-actions",
			"ticket-main",
			"ticket-body",
		])
		expect(part("ticket-main").textContent.trim()).toBe("Deliver")
		expect(part("ticket-body").contains(part("ticket-actions"))).toBe(false)
	})

	it("triggers the SAME handler as the card's button: every dish of the ticket delivered in one call, and the panel closes", async () => {
		const wrapper = show()
		await openIt(wrapper)

		part("ticket-main").click()
		await flushPromises()

		expect(call).toHaveBeenCalledTimes(1)
		const [method, payload] = call.mock.calls[0]
		expect(method).toBe("pos_next.api.restaurant.mark_items_delivered")
		expect(payload.invoice_name).toBe("SINV-0042")
		expect(JSON.parse(payload.item_names)).toHaveLength(24)
		expect(dialog()).toBeNull()
		// The screen is told, as for the card's own button, so that it reads its tickets again
		expect(wrapper.emitted("delivered")).toHaveLength(1)
	})

	it("stays open when the server refuses: nothing was delivered, and the runner can try again", async () => {
		call.mockRejectedValueOnce(new Error("refused"))
		vi.spyOn(console, "error").mockImplementation(() => {})
		const wrapper = show()
		await openIt(wrapper)

		part("ticket-main").click()
		await flushPromises()

		expect(dialog()).not.toBeNull()
		expect(wrapper.emitted("delivered")).toBeUndefined()
	})

	it("has the print button beside « Deliver » when the screen can print, and the × in the corner of the header, away from the buttons", async () => {
		await openIt(show({ canPrint: true }))

		const names = [...part("ticket-actions").children].map((element) =>
			element.getAttribute("data-test"),
		)
		expect(names).toEqual(["ticket-main", "ticket-print"])
		// Same place as on the kitchen's ticket: the top-right corner of the header
		expect(part("ticket-header").contains(part("ticket-close"))).toBe(true)
		expect(part("ticket-actions").contains(part("ticket-close"))).toBe(false)
		expect(part("ticket-close").className).toContain("absolute")
	})
})

describe("the dishes of the runner's panel", () => {
	it("are in LARGE text on a Compact screen and one step bigger on a Large one", async () => {
		await openIt(show({}, "compact"))
		expect(panel().style.getPropertyValue("--kds-fs")).toBe("18px")
		opened.pop().unmount()

		await openIt(show({}, "large"))
		expect(panel().style.getPropertyValue("--kds-fs")).toBe("22px")
	})

	it("stand in one column that scrolls up and down, none is cut: 24 of 24, with no strip (Daniel, 01.11)", async () => {
		await openIt(show())

		const body = part("ticket-body")
		expect(body.className).toContain("overflow-y-auto")
		expect(body.className).not.toContain("[column-fill:auto]")
		expect(panel().querySelectorAll("[data-ticket-line]")).toHaveLength(24)
		expect(part("ticket-more-strip")).toBeNull()
		expect(part("ticket-line").className).toContain("!min-h-[44px]")
	})

	it("carry the station's dot on each dish, as on the card", async () => {
		await openIt(show())

		expect(
			panel().querySelectorAll('[data-test="ticket-station-dot"]'),
		).toHaveLength(24)
	})

	it("are grouped by table in the station view, each group with its own « Deliver »", async () => {
		const first = Array.from({ length: 12 }, (_, i) =>
			dish(i, { _invoiceName: "A" }),
		)
		const second = Array.from({ length: 12 }, (_, i) =>
			dish(i + 12, { _invoiceName: "B" }),
		)
		const wrapper = show({
			viewMode: "station",
			card: card(24, {
				title: "Cuisine",
				items: [...first, ...second],
				tableGroups: [
					{ tableName: "Table 1", invoiceName: "A", items: first },
					{ tableName: "Table 2", invoiceName: "B", items: second },
				],
			}),
		})
		await openIt(wrapper)

		expect(panel().querySelectorAll('[data-test="ticket-group"]')).toHaveLength(
			2,
		)
		expect(
			panel().querySelectorAll('[data-test="group-deliver"]'),
		).toHaveLength(2)
		expect(panel().querySelectorAll('[data-test="ticket-line"]')).toHaveLength(
			24,
		)
	})
})

describe("closing the runner's panel", () => {
	it("by the ×, by a tap on the scrim, by Escape; not by a tap inside it", async () => {
		const wrapper = show()
		await openIt(wrapper)
		part("ticket-body").click()
		part("ticket-header").click()
		await nextTick()
		expect(dialog()).not.toBeNull()

		part("ticket-close").click()
		await nextTick()
		expect(dialog()).toBeNull()

		await wrapper.get('[data-test="ticket-more-strip"]').trigger("click")
		await nextTick()
		scrim().click()
		await nextTick()
		expect(dialog()).toBeNull()

		await wrapper.get('[data-test="ticket-more-strip"]').trigger("click")
		await nextTick()
		document.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		)
		await nextTick()
		expect(dialog()).toBeNull()
	})

	it("hands the focus back to the strip that opened it", async () => {
		const wrapper = show()
		await nextTick()
		const strip = wrapper.get('[data-test="ticket-more-strip"]').element
		strip.focus()
		await wrapper.get('[data-test="ticket-more-strip"]').trigger("click")
		await nextTick()
		expect(dialog().contains(document.activeElement)).toBe(true)

		part("ticket-close").click()
		await nextTick()

		expect(document.activeElement).toBe(strip)
	})
})

describe("the board behind the runner's panel keeps updating", () => {
	it("follows the card while it is open: a dish more, the new number", async () => {
		const wrapper = show()
		await openIt(wrapper)

		await wrapper.setProps({ card: card(25, { ticketNo: "0015" }) })
		await nextTick()

		expect(dialog()).not.toBeNull()
		expect(panel().querySelectorAll('[data-test="ticket-line"]')).toHaveLength(
			25,
		)
		expect(part("ticket-number").textContent.trim()).toBe("0015")
		expect(part("ticket-fs-state").textContent).toContain("25 lines")
	})

	it("closes with its card: when the ticket leaves the board the panel goes with it", async () => {
		const wrapper = show()
		await openIt(wrapper)
		expect(dialog()).not.toBeNull()

		wrapper.unmount()
		opened = []
		await nextTick()

		expect(dialog()).toBeNull()
		expect(scrim()).toBeNull()
	})
})
