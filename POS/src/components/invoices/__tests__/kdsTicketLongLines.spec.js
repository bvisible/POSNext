/**
 * //// Neoffice — added file (no upstream equivalent). A kitchen ticket can hold twenty-five dishes with options and
 * //// remarks (NeoRestau lot 1, task 23). It must never grow past its band: its dishes scroll inside it, by touch, while
 * //// its head (table, number, timer) and its main button stay where they are; a fade and a count ("+22 lines") say that
 * //// more dishes follow; no dish is ever cut without saying so. The status menu of a dish opens on the screen, not inside
 * //// the scrolling body that would cut it. jsdom has no layout engine: the boxes of the elements are given by hand.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({ runnerEnabled: false }))

vi.hoisted(() => {
	// The app's `__`: indexed placeholders
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
const { TICKET_FRAME } = await import("@/utils/ticketLayout")

const tokens = (classes) => classes.split(/\s+/).filter(Boolean)

/** An order with `count` dishes, each with a modifier and a remark, as a long ticket has. */
function longOrder(count, { waiting = 0, status = "Preparing" } = {}) {
	const items = Array.from({ length: count }, (_, index) => ({
		item_code: `ITEM-${index}`,
		item_name: `Dish ${index + 1}`,
		qty: 1 + (index % 3),
		kds_status: index % 2 ? "Preparing" : "Pending",
		kds_batch: 1 + Math.floor(index / 10),
		preparation_station: "kit",
		posa_item_modifiers: JSON.stringify([
			{ options: [{ name: "Medium" }, { name: "No onion" }] },
		]),
		posa_special_instructions: "Allergy: nuts",
	}))
	for (let index = 0; index < waiting; index += 1) {
		items.push({
			item_code: `NEXT-${index}`,
			item_name: `Coming ${index + 1}`,
			qty: 1,
			kds_status: "Waiting",
		})
	}
	return {
		name: "SINV-LONG",
		restaurant_table: "T1",
		table_display_name: "T1",
		kds_status: status,
		creation: "2026-10-30 12:00:00",
		modified: "2026-10-30 12:05:00",
		items,
	}
}

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

/**
 * Lays the boxes out by hand: the body of the ticket shows `viewport` px of its dishes, each dish is `lineHeight` px
 * high, and `state.scrolled` px have been scrolled by. Returns the state to move.
 */
function layout({ viewport = 150, lineHeight = 48 } = {}) {
	const state = { scrolled: 0, viewport }
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
		function box() {
			if (this.matches?.('[data-test="ticket-body"]'))
				return rect(100, 300, 300, state.viewport)
			if (this.matches?.("[data-ticket-line]")) {
				const body = this.closest('[data-test="ticket-body"]')
				const all = [...body.querySelectorAll("[data-ticket-line]")]
				return rect(
					100,
					300 + all.indexOf(this) * lineHeight - state.scrolled,
					300,
					lineHeight,
				)
			}
			if (this.matches?.('[data-test="ticket-line"]'))
				return rect(100, 500, 300, lineHeight)
			return rect(0, 0, 0, 0)
		},
	)
	return state
}

let opened = []
function show(order, props = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: { order, stations: [], ...props },
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}

beforeEach(() => {
	opened = []
	call.mockReset()
	window.innerWidth = 1280
	window.innerHeight = 800
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

describe("a long ticket stays inside its band", () => {
	it("is a column that gives way before it grows: bounded by its band, the head and the foot never shrink, the dishes take what is left", () => {
		const wrapper = show(longOrder(25))
		const root = wrapper.get('[data-test="ticket"]')

		expect(root.classes()).toEqual(
			expect.arrayContaining(["flex", "flex-col", "min-h-0"]),
		)
		// The cap a column of tickets sets for its tickets (a lane stretches them to its height instead)
		expect(root.classes()).toContain("max-h-[var(--ticket-max-h,none)]")

		for (const part of ["ticket-header", "ticket-actions"]) {
			expect(wrapper.get(`[data-test="${part}"]`).classes(), part).toContain(
				"flex-shrink-0",
			)
		}
		const body = wrapper.get('[data-test="ticket-body"]')
		expect(body.classes()).toEqual(
			expect.arrayContaining(["flex-1", "min-h-0", "overflow-y-auto"]),
		)
		// And the shared frame is still the body's padding
		expect(body.classes()).toEqual(
			expect.arrayContaining(tokens(TICKET_FRAME.body)),
		)
	})

	it("keeps its head and its main button OUTSIDE the part that scrolls: they stay in view while the dishes go by", () => {
		const wrapper = show(longOrder(25))
		const body = wrapper.get('[data-test="ticket-body"]').element

		expect(
			body.contains(wrapper.get('[data-test="ticket-header"]').element),
		).toBe(false)
		expect(
			body.contains(wrapper.get('[data-test="ticket-actions"]').element),
		).toBe(false)
		// The main button is there for a long ticket, as for a short one
		expect(wrapper.get('[data-test="ticket-actions"]').text()).toContain(
			"Ready",
		)
	})

	it("passes the scroll on to its band when its dishes reach their end: a ticket that fills a column must not trap it", () => {
		// A long ticket in a column one ticket wide takes the whole column. If its dishes kept every swipe that starts on
		// them, even at their end, the tickets behind it could only be reached by a swipe that starts on its head or its
		// button. The band (a lane or a column) is what stops the scroll from reaching the page.
		const body = show(longOrder(25)).get('[data-test="ticket-body"]')
		expect(body.classes().some((c) => c.startsWith("overscroll"))).toBe(false)
	})

	it("never cuts a dish silently: all 25 are in the ticket, whole, with their options and remarks", () => {
		const wrapper = show(longOrder(25))

		expect(wrapper.findAll('[data-test="ticket-line"]')).toHaveLength(25)
		expect(wrapper.text()).toContain("Dish 25")
		// Options and remarks wrap, they are not truncated
		expect(wrapper.html()).not.toMatch(/\btruncate\b|line-clamp|text-ellipsis/)
		expect(wrapper.text()).toContain("Medium, No onion")
		expect(wrapper.text()).toContain("Allergy: nuts")
	})
})

describe("the hint that more dishes follow", () => {
	it("is a fade at the foot of the dishes and a count: 25 dishes, 3 in view, so +22 lines", async () => {
		layout({ viewport: 150 })
		const wrapper = show(longOrder(25))
		await nextTick()

		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+22 lines")
		expect(wrapper.find('[data-test="ticket-more-fade"]').exists()).toBe(true)
	})

	it("sits over the dishes without taking a touch from them: the dish under the fade can still be pressed", async () => {
		layout({ viewport: 150 })
		const wrapper = show(longOrder(25))
		await nextTick()

		for (const part of ["ticket-more", "ticket-more-fade"]) {
			expect(wrapper.get(`[data-test="${part}"]`).classes(), part).toContain(
				"pointer-events-none",
			)
		}
	})

	it("stays out of the way of the dishes: it is inside the area of the dishes, not in the head or the foot", async () => {
		layout({ viewport: 150 })
		const wrapper = show(longOrder(25))
		await nextTick()

		const area = wrapper.get('[data-test="ticket-scroll-area"]').element
		expect(
			area.contains(wrapper.get('[data-test="ticket-more"]').element),
		).toBe(true)
		expect(
			area.contains(wrapper.get('[data-test="ticket-more-fade"]').element),
		).toBe(true)
		expect(
			area.contains(wrapper.get('[data-test="ticket-actions"]').element),
		).toBe(false)
	})

	it("counts fewer as the cook scrolls, and goes when the last dish is in view", async () => {
		const state = layout({ viewport: 150 })
		const wrapper = show(longOrder(25))
		await nextTick()
		const body = wrapper.get('[data-test="ticket-body"]')

		state.scrolled = 48 * 10
		await body.trigger("scroll")
		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+12 lines")

		state.scrolled = 48 * 25 - 150
		await body.trigger("scroll")
		expect(wrapper.find('[data-test="ticket-more"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="ticket-more-fade"]').exists()).toBe(false)
	})

	it("counts the dish that is only partly in view", async () => {
		// 150 px = 3 dishes and 6 px of the fourth
		layout({ viewport: 150 })
		const wrapper = show(longOrder(4))
		await nextTick()

		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+1 lines")
	})

	it("counts the dishes announced under Coming Next as dishes: they are cut like the others", async () => {
		layout({ viewport: 150 })
		// 2 dishes in view-ish, then 3 announced ones further down
		const wrapper = show(longOrder(2, { waiting: 3 }))
		await nextTick()

		expect(wrapper.findAll("[data-ticket-line]")).toHaveLength(5)
		// 150 px: dishes 1-3 in view (2 sent + the first announced), 2 announced ones out of view
		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+2 lines")
	})

	it("says nothing for a ticket whose dishes all fit", async () => {
		layout({ viewport: 400 })
		const wrapper = show(longOrder(3))
		await nextTick()

		expect(wrapper.find('[data-test="ticket-more"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="ticket-more-fade"]').exists()).toBe(false)
	})

	it("follows the ticket when its band changes size, as when the tablet is turned", async () => {
		let notify
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(callback) {
					notify = callback
				}
				observe() {}
				disconnect() {}
			},
		)
		const state = layout({ viewport: 150 })
		const wrapper = show(longOrder(25))
		await nextTick()
		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+22 lines")

		// The ticket grows: 7 dishes in view
		state.viewport = 7 * 48
		notify()
		await nextTick()

		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+18 lines")
	})

	it("follows the dishes when a refresh brings more of them", async () => {
		layout({ viewport: 150 })
		const wrapper = show(longOrder(5))
		await nextTick()
		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+2 lines")

		await wrapper.setProps({ order: longOrder(9) })
		await nextTick()

		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+6 lines")
	})

	it("stops watching the ticket's size when it is taken away", async () => {
		const disconnect = vi.fn()
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {
					disconnect()
				}
			},
		)
		const wrapper = show(longOrder(5))
		wrapper.unmount()
		opened = []

		expect(disconnect).toHaveBeenCalled()
	})
})

describe("the status menu of a dish", () => {
	async function openMenu(wrapper, index = 0) {
		await wrapper.findAll('[data-test="ticket-line"]')[index].trigger("click")
	}

	it("opens on the screen, not inside the scrolling body that would cut it", async () => {
		layout({ viewport: 150 })
		const wrapper = show(longOrder(25))
		await nextTick()

		await openMenu(wrapper)

		const menu = wrapper.get('[data-test="ticket-line-menu"]')
		expect(menu.classes()).toContain("fixed")
		// Under the dish: the dish box is 300 x 48 at (100, 500), so the menu starts at 548 + 4 and ends at the dish's right edge
		expect(menu.element.style.top).toBe("552px")
		expect(menu.element.style.left).toBe(`${400 - 160}px`)
	})

	it("opens above the dish when the foot of the screen leaves no room under it", async () => {
		layout({ viewport: 150 })
		window.innerHeight = 600
		const wrapper = show(longOrder(25))
		await nextTick()

		await openMenu(wrapper)

		const menu = wrapper.get('[data-test="ticket-line-menu"]')
		// 500 - 4 - 140
		expect(menu.element.style.top).toBe("356px")
	})

	it("offers the three statuses as buttons a finger can hit: 44 px high at least", async () => {
		layout()
		const wrapper = show(longOrder(25))
		await openMenu(wrapper, 0)

		const buttons = wrapper
			.get('[data-test="ticket-line-menu"]')
			.findAll("button")
		expect(buttons.map((b) => b.text().replace(/\s+/g, " ").trim())).toEqual([
			"Preparing",
			"Ready",
			"Delivered",
		])
		for (const button of buttons) {
			expect(button.classes()).toContain("min-h-[44px]")
		}
	})

	it("closes when the ticket's dishes are scrolled: a menu on the screen does not follow the dish that moved", async () => {
		layout()
		const wrapper = show(longOrder(25))
		await openMenu(wrapper)
		expect(wrapper.find('[data-test="ticket-line-menu"]').exists()).toBe(true)

		await wrapper.get('[data-test="ticket-body"]').trigger("scroll")

		expect(wrapper.find('[data-test="ticket-line-menu"]').exists()).toBe(false)
	})

	it("closes when anything else on the screen is scrolled, the lane of tickets sideways for one", async () => {
		layout()
		const wrapper = show(longOrder(25))
		await openMenu(wrapper)
		expect(wrapper.find('[data-test="ticket-line-menu"]').exists()).toBe(true)

		// A scroll does not bubble, but it crosses the window in the capture phase on its way to the element
		const lane = document.createElement("div")
		document.body.appendChild(lane)
		lane.dispatchEvent(new Event("scroll"))
		await nextTick()

		expect(wrapper.find('[data-test="ticket-line-menu"]').exists()).toBe(false)
		lane.remove()
	})

	it("listens to the page's scrolls only while a menu is open: forty-five tickets must not all listen all the time", async () => {
		layout()
		const add = vi.spyOn(window, "addEventListener")
		const remove = vi.spyOn(window, "removeEventListener")
		const wrapper = show(longOrder(25))
		const scrollListeners = () =>
			add.mock.calls.filter(([type]) => type === "scroll").length

		expect(scrollListeners()).toBe(0)
		await openMenu(wrapper)
		expect(scrollListeners()).toBe(1)

		await openMenu(wrapper)
		await nextTick()
		expect(remove.mock.calls.filter(([type]) => type === "scroll").length).toBe(
			1,
		)
	})

	it("is closed by a second press on the same dish, and by a press anywhere else", async () => {
		layout()
		const wrapper = show(longOrder(25))
		await openMenu(wrapper)
		await openMenu(wrapper)
		expect(wrapper.find('[data-test="ticket-line-menu"]').exists()).toBe(false)

		await openMenu(wrapper)
		document.body.click()
		await nextTick()
		expect(wrapper.find('[data-test="ticket-line-menu"]').exists()).toBe(false)
	})

	it("still sets the status of the dish", async () => {
		layout()
		call.mockResolvedValue({ status: "success" })
		const wrapper = show(longOrder(25))
		await openMenu(wrapper, 0)

		await wrapper
			.get('[data-test="ticket-line-menu"]')
			.findAll("button")[1]
			.trigger("click")

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{ invoice_name: "SINV-LONG", item_code: "ITEM-0", status: "Ready" },
		)
	})
})

describe("a ticket on a touch screen", () => {
	const source = Object.values(
		import.meta.glob("/src/components/invoices/KDSOrderCard.vue", {
			query: "?raw",
			import: "default",
			eager: true,
		}),
	)[0]

	it("has nothing that waits for a mouse: no hover state to stay stuck on after a tap", () => {
		expect(source).not.toMatch(/\bhover:/)
	})

	it("shows a press instead: a dish and the buttons answer a touch", () => {
		expect(source).toMatch(/\bactive:bg-/)
	})
})
