/**
 * //// Neoffice — added file (no upstream equivalent). The anatomy of a kitchen card (NeoResto lot 1, task 38a-1, rulings 107,
 * //// 122, 125, 126, 127): ONE line for the header (the room's code, the table big and bold, the ticket's number, the timer at the
 * //// right), the main button right under it and never scrolling, the dishes below inside the card, and NOTHING at the bottom.
 * //// The invoice's own name is not a ticket number and is never shown; the state is not written in a band's header (the left
 * //// border carries it). jsdom has no layout engine: the order of the parts and their classes are what is read.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))
const restaurantStore = vi.hoisted(() => ({ runnerEnabled: false }))

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

const { default: KDSOrderCard } = await import("../KDSOrderCard.vue")

let opened = []
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	opened = []
	vi.restoreAllMocks()
})

function order(extra = {}, statuses = ["Preparing", "Pending"]) {
	return {
		name: "SINV-2026-02689",
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
	}
}
function show(props = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: { order: order(), showStationBadge: false, ...props },
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
const part = (wrapper, name) => wrapper.get(`[data-test="${name}"]`)

describe("the header of a card is ONE line", () => {
	it("holds the room's code, the table, the ticket's number and the timer, in that order, in one row", () => {
		const wrapper = show({
			roomName: "Salle 1",
			order: order({ ticket_no: "0007" }),
		})
		const header = part(wrapper, "ticket-header")

		const room = part(wrapper, "ticket-room")
		const title = part(wrapper, "ticket-title")
		const number = part(wrapper, "ticket-number")
		const timer = part(wrapper, "ticket-timer")
		expect(room.text()).toBe("S01")
		expect(title.text()).toBe("Table 15")
		expect(number.text()).toBe("0007")

		// One row: they all hang from the same flex line, in reading order
		const row = header.element.firstElementChild
		expect(row.className).toContain("flex")
		expect(row.className).not.toContain("flex-col")
		for (const element of [room, title, number, timer]) {
			expect(row.contains(element.element), element.html()).toBe(true)
		}
		const order_ = [room, title, number, timer].map((element) =>
			[...header.element.querySelectorAll("*")].indexOf(element.element),
		)
		expect(order_).toEqual([...order_].sort((a, b) => a - b))
		// And the header has no second row of its own
		expect(header.element.children).toHaveLength(1)
	})

	it("makes the table the big word and the room and the number small beside it", () => {
		const wrapper = show({
			roomName: "Salle 2",
			order: order({ ticket_no: "0016" }),
		})

		expect(part(wrapper, "ticket-title").classes()).toEqual(
			expect.arrayContaining(["font-bold", "whitespace-nowrap"]),
		)
		// The table never gets an ellipsis: the number may drop below it, the name never shrinks
		expect(part(wrapper, "ticket-title").html()).not.toMatch(
			/truncate|ellipsis/,
		)
		expect(part(wrapper, "ticket-ref").classes()).toContain("flex-wrap")
		expect(part(wrapper, "ticket-room").classes().join(" ")).toMatch(
			/text-\[length:var\(--kds-fs-ref/,
		)
	})

	it("keeps the timer at the right of the line", () => {
		const wrapper = show({ roomName: "Salle 1" })

		const ref = part(wrapper, "ticket-ref")
		expect(ref.classes()).toContain("flex-1")
		const timer = part(wrapper, "ticket-timer")
		expect(ref.element.contains(timer.element)).toBe(false)
		expect(timer.classes()).toContain("whitespace-nowrap")
	})

	it("writes the second timer only as far as the size says: it is hidden by a variable the size sets", () => {
		const total = part(show(), "ticket-total-time")

		expect(total.classes().join(" ")).toContain(
			"[display:var(--kds-tt-d,none)]",
		)
		expect(total.attributes("title")).toBe("Total time")
	})
})

describe("the room's code", () => {
	it("is derived from the room's name: Salle 1 is S01, Terrasse is TER", () => {
		expect(part(show({ roomName: "Salle 1" }), "ticket-room").text()).toBe(
			"S01",
		)
		expect(part(show({ roomName: "Terrasse" }), "ticket-room").text()).toBe(
			"TER",
		)
	})

	it("is not drawn when the room is not known: no chip rather than a guess", () => {
		expect(show().find('[data-test="ticket-room"]').exists()).toBe(false)
		expect(
			show({ roomName: "  " }).find('[data-test="ticket-room"]').exists(),
		).toBe(false)
	})
})

describe("the room's chip takes the code the server tells (task 38b)", () => {
	it("is the order's area_code, the one typed on the room, before the one made from the room's name", () => {
		const wrapper = show({
			roomName: "Salle 1",
			order: order({ area_code: "RDC" }),
		})

		expect(part(wrapper, "ticket-room").text()).toBe("RDC")
	})

	it("is made from the room's name when the server told none", () => {
		const wrapper = show({ roomName: "Salle 2", order: order({ area_code: "" }) })

		expect(part(wrapper, "ticket-room").text()).toBe("S02")
	})

	it("is not drawn for a takeaway, whose title says it, even though the server tells EMP", () => {
		const wrapper = show({
			order: order({ is_takeaway: 1, area_code: "EMP", restaurant_table: null }),
		})

		expect(wrapper.find('[data-test="ticket-room"]').exists()).toBe(false)
	})
})

describe("the ticket's number", () => {
	it("is the order's ticket_no when it has one", () => {
		const wrapper = show({ order: order({ ticket_no: "T0042" }) })

		expect(part(wrapper, "ticket-number").text()).toBe("T0042")
	})

	it("is written with the digits the server tells (task 38b): the whole number 7 and 4 digits read 0007", () => {
		const wrapper = show({ order: order({ ticket_no: 7, ticket_digits: 4 }) })

		expect(part(wrapper, "ticket-number").text()).toBe("0007")
		expect(
			part(show({ order: order({ ticket_no: 12, ticket_digits: 2 }) }), "ticket-number").text(),
		).toBe("12")
	})

	it("is NEVER the Sales Invoice's name: an order with no ticket number shows none at all", () => {
		const wrapper = show({ roomName: "Salle 1" })

		expect(wrapper.find('[data-test="ticket-number"]').exists()).toBe(false)
		// Nowhere on the card, in any form
		expect(wrapper.text()).not.toMatch(/SINV|FA-|2026-02689|#/)
	})

	it("is the counter a takeaway has had until then, after « Takeaway », with no room chip", () => {
		const wrapper = show({
			roomName: "Salle 1",
			order: order({
				is_takeaway: 1,
				takeaway_number: "T-001",
				restaurant_table: null,
				table_display_name: null,
			}),
		})

		expect(part(wrapper, "ticket-title").text()).toBe("Takeaway")
		expect(part(wrapper, "ticket-number").text()).toBe("· T-001")
		expect(wrapper.find('[data-test="ticket-room"]').exists()).toBe(false)
		expect(wrapper.text()).not.toContain("SINV")
	})
})

describe("the state of the ticket", () => {
	it("is not written in the header of a card in a band: the left border carries it, and the card says it on its root", () => {
		const wrapper = show()

		expect(wrapper.find('[data-test="ticket-status"]').exists()).toBe(false)
		expect(part(wrapper, "ticket").attributes("data-state")).toBe("Preparing")
		expect(part(wrapper, "ticket").classes()).toContain("border-blue-400")
	})

	it("is written beside the timer where states mix (placement A), as a small word", () => {
		const wrapper = show({ showState: true })

		const header = part(wrapper, "ticket-header")
		expect(
			header.element.contains(part(wrapper, "ticket-status").element),
		).toBe(true)
		expect(part(wrapper, "ticket-status").text()).toBe("Preparing")
		// Still one line
		expect(header.element.children).toHaveLength(1)
	})
})

describe("the main button", () => {
	it("is right under the header, before the dishes, and takes the width of the card", () => {
		const wrapper = show()
		const root = part(wrapper, "ticket").element

		const children = [...root.children].map((child) =>
			child.getAttribute("data-test"),
		)
		expect(children).toEqual([
			"ticket-header",
			"ticket-actions",
			"ticket-scroll-area",
		])
		const actions = part(wrapper, "ticket-actions")
		expect(actions.classes()).toContain("flex-shrink-0")
		expect(actions.get("button").classes()).toContain("flex-1")
	})

	it("never scrolls with the dishes: it is outside the body that scrolls, and outside the area that holds it", () => {
		const wrapper = show({ order: order({}, Array(25).fill("Pending")) })

		const body = part(wrapper, "ticket-body").element
		const area = part(wrapper, "ticket-scroll-area").element
		const actions = part(wrapper, "ticket-actions").element
		expect(body.contains(actions)).toBe(false)
		expect(area.contains(actions)).toBe(false)
		expect(body.classList.contains("overflow-y-auto")).toBe(true)
		// And the header neither
		expect(body.contains(part(wrapper, "ticket-header").element)).toBe(false)
	})

	it("is at least as high as the size says, 44 px by default, and its text follows the size too", () => {
		const names = part(show(), "ticket-actions").get("button").classes()

		expect(names).toContain("!h-[var(--kds-btn-h,44px)]")
		expect(names).toContain("!text-[length:var(--kds-fs-btn,14px)]")
	})
})

describe("the print button's slot", () => {
	it("is not drawn while the screen cannot print (the default)", () => {
		expect(show().find('[data-test="ticket-print"]').exists()).toBe(false)
	})

	it("is a 44 px square at the right of the main button when the screen can print, and says so to a screen reader", async () => {
		const wrapper = show({ canPrint: true })

		const print = part(wrapper, "ticket-print")
		const actions = part(wrapper, "ticket-actions").element
		expect(actions.contains(print.element)).toBe(true)
		// After the main button, in the same row
		const kids = [...actions.children]
		expect(kids.indexOf(print.element)).toBeGreaterThan(
			kids.indexOf(part(wrapper, "ticket-actions").get("button").element),
		)
		expect(print.classes()).toEqual(
			expect.arrayContaining([
				"h-[var(--kds-btn-h,44px)]",
				"w-[var(--kds-btn-h,44px)]",
				"flex-none",
			]),
		)
		expect(print.attributes("aria-label")).toBe("Print a copy of this ticket")

		await print.trigger("click")
		expect(wrapper.emitted("print")).toHaveLength(1)
		// Pressing it does not press the dish under it, nor anything else: no call to the server
		expect(call).not.toHaveBeenCalled()
	})
})

describe("the bottom of the card", () => {
	it("holds the dishes and, at its foot, the « View all » strip and nothing else (kitchen test, 01.11)", () => {
		const wrapper = show()
		const root = part(wrapper, "ticket").element

		const last = root.lastElementChild
		expect(last.getAttribute("data-test")).toBe("ticket-scroll-area")
		const buttons = [...last.querySelectorAll("button")]
		expect(buttons.map((button) => button.getAttribute("data-test"))).toEqual(["ticket-more-strip"])
	})
})

describe("the second timer gives way before the number drops to a second line", () => {
	/** jsdom has no layout: the boxes of the header's parts are given by hand. */
	function boxes({ line = 24, ref = 24 } = {}) {
		vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
			function height() {
				const name = this.getAttribute?.("data-test")
				if (name === "ticket-title") return line
				if (name === "ticket-ref") return ref
				return 0
			},
		)
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320)
	}

	it("is hidden when the room, the table and the number need a second line, so that the number stays beside the table", async () => {
		boxes({ line: 24, ref: 48 })
		const wrapper = show({
			roomName: "Salle 1",
			order: order({ ticket_no: "0007" }),
		})
		await nextTick()
		await nextTick()

		expect(part(wrapper, "ticket-total-time").element.style.display).toBe(
			"none",
		)
	})

	it("stays when the line fits: nothing is hidden that has room", async () => {
		boxes({ line: 24, ref: 24 })
		const wrapper = show({
			roomName: "Salle 1",
			order: order({ ticket_no: "0007" }),
		})
		await nextTick()
		await nextTick()

		expect(part(wrapper, "ticket-total-time").element.style.display).toBe("")
	})
})
