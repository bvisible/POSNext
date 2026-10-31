/**
 * //// Neoffice — added file (no upstream equivalent). A kitchen ticket can hold twenty-five dishes with options and
 * //// remarks (NeoRestau lot 1, task 23). It must never grow past its band: its dishes scroll inside it, by touch, while
 * //// its head (table, number, timer) and its main button stay where they are; a fade and a count ("+22 lines") say that
 * //// more dishes follow; no dish is ever cut without saying so. The status menu of a dish opens on the screen, not inside
 * //// the scrolling body that would cut it. jsdom has no layout engine: the boxes of the elements are given by hand.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick, reactive } from "vue"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({ runnerEnabled: false }))

vi.hoisted(() => {
	// The app's `__`: indexed placeholders
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

// The REAL Button: the height of the main buttons is a matter of the classes it renders (fix round 1, ruling 72). The
// package's `exports` map does not offer the file, so it is reached by its path.
vi.mock("frappe-ui", async () => {
	const { default: Button } = await import(
		"../../../../node_modules/frappe-ui/src/components/Button/Button.vue"
	)
	return { Button }
})
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
const source = Object.values(
	import.meta.glob("/src/components/invoices/KDSOrderCard.vue", {
		query: "?raw",
		import: "default",
		eager: true,
	}),
)[0]

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

/**
 * An order as the server sends it: the dishes at the statuses given (and the station of each), the order at its own. The
 * server leaves the order's own status alone while its dishes are cooked (`update_item_kds_status`), so "Pending" with a
 * dish "Preparing" is the everyday state.
 */
function ticket(
	statuses,
	{ order = "Pending", stations = [], name = "SINV-REAL" } = {},
) {
	return {
		name,
		restaurant_table: "T1",
		table_display_name: "T1",
		kds_status: order,
		creation: "2026-10-30 12:00:00",
		modified: "2026-10-30 12:05:00",
		items: statuses.map((status, index) => ({
			item_code: `ITEM-${index}`,
			item_name: `Dish ${index + 1}`,
			qty: 1,
			kds_status: status,
			kds_batch: 1,
			preparation_station: stations[index] ?? "kit",
		})),
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
		// The dishes only: frappe-ui's Button truncates its own label, which is not a dish
		expect(wrapper.get('[data-test="ticket-body"]').html()).not.toMatch(
			/\btruncate\b|line-clamp|text-ellipsis/,
		)
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

	it("says line in the singular for one dish and lines for more: two words, not a '+1 lines'", async () => {
		layout({ viewport: 150 })
		const one = show(longOrder(4))
		await nextTick()
		expect(one.get('[data-test="ticket-more"]').text()).toBe("+1 line")

		const two = show(longOrder(5))
		await nextTick()
		expect(two.get('[data-test="ticket-more"]').text()).toBe("+2 lines")
	})

	it("keeps the status of the last dish readable: the pill sits UNDER the line below the dishes, in room kept for it, and the fade is short", async () => {
		// The pill used to cover the lower right of the dishes, where each dish carries its status; the fade, 56 px high,
		// greyed it. Straddling the line below the dishes still covered 8 badges out of 97 (measured). The pill is now wholly
		// under the line, in the top of the foot, which gives it the room (8 px more, only while the hint shows)
		layout({ viewport: 150 })
		const wrapper = show(longOrder(25))
		await nextTick()

		const pill = wrapper.get('[data-test="ticket-more"]')
		expect(pill.classes()).toEqual(
			expect.arrayContaining(["absolute", "top-full"]),
		)
		expect(pill.classes()).not.toContain("bottom-0")
		expect(wrapper.get('[data-test="ticket-actions"]').classes()).toContain(
			"pt-5",
		)
		const fade = wrapper.get('[data-test="ticket-more-fade"]')
		expect(fade.classes()).toContain("h-3")
		expect(fade.classes()).not.toContain("h-14")
	})

	it("gives the foot its usual room when nothing follows: the extra room is for the pill only", async () => {
		layout({ viewport: 400 })
		const wrapper = show(longOrder(3))
		await nextTick()

		expect(wrapper.find('[data-test="ticket-more"]').exists()).toBe(false)
		expect(wrapper.get('[data-test="ticket-actions"]').classes()).not.toContain(
			"pt-5",
		)
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

		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+1 line")
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

	it("opens above the dish when the foot of the screen leaves no room under it, held by its LOWER edge", async () => {
		layout({ viewport: 150 })
		window.innerHeight = 600
		const wrapper = show(longOrder(25))
		await nextTick()

		await openMenu(wrapper)

		const menu = wrapper.get('[data-test="ticket-line-menu"]')
		// 600 (the window) - 500 (the dish's top) + 4: its lower edge is 4 px over the dish, whatever its height
		expect(menu.element.style.bottom).toBe("104px")
		expect(menu.element.style.top).toBe("")
	})

	it("touches the dish when it opens upward from a dish being prepared: two buttons, not a gap of 44 px", async () => {
		// Dish 2 is Preparing: its menu offers Ready and Delivered, 98 px, where a waiting dish's offers three, 142 px. The
		// menu was placed with the height of the larger one and floated 44 px over the smaller
		layout({ viewport: 150 })
		window.innerHeight = 600
		const wrapper = show(longOrder(25))
		await nextTick()

		await openMenu(wrapper, 1)

		const menu = wrapper.get('[data-test="ticket-line-menu"]')
		expect(
			menu.findAll("button").map((b) => b.text().replace(/\s+/g, " ").trim()),
		).toEqual(["Ready", "Delivered"])
		expect(menu.element.style.bottom).toBe("104px")
	})

	it("counts the room the menu really needs: where two buttons fit under the dish and three do not", async () => {
		// The dish ends at 548: with a window 660 px high there are 100 px under it, 98 of them are needed for two buttons
		layout({ viewport: 150 })
		window.innerHeight = 660
		const wrapper = show(longOrder(25))
		await nextTick()

		await openMenu(wrapper, 1)
		expect(
			wrapper.get('[data-test="ticket-line-menu"]').element.style.top,
		).toBe("552px")
		await openMenu(wrapper, 1)

		await openMenu(wrapper, 0)
		const menu = wrapper.get('[data-test="ticket-line-menu"]')
		expect(menu.element.style.bottom).toBe("164px")
		expect(menu.element.style.top).toBe("")
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

describe("a ticket looks like the dishes it shows (fix round 1, ruling 78)", () => {
	const badge = (wrapper) => wrapper.get('[data-test="ticket-status"]').text()
	const button = (wrapper) =>
		wrapper.get('[data-test="ticket-actions"] button').text()
	const classesOf = (wrapper) => wrapper.get('[data-test="ticket"]').classes()

	it("keeps the waiting look and Start while no dish shown is begun, whatever the order's own status says", () => {
		const wrapper = show(ticket(["Pending", "Pending"], { order: "Preparing" }))

		expect(badge(wrapper)).toBe("Pending")
		expect(classesOf(wrapper)).toContain("border-yellow-400")
		expect(button(wrapper)).toBe("Start")
	})

	it("takes the preparation look and Ready as soon as a dish is begun, the order's own status still Pending", () => {
		// What update_item_kds_status leaves: a dish Preparing, the order Pending. The ticket used to keep its yellow border,
		// its PENDING badge and its Start button while it sat in the "in preparation" band
		const wrapper = show(ticket(["Preparing", "Pending"], { order: "Pending" }))

		expect(badge(wrapper)).toBe("Preparing")
		expect(classesOf(wrapper)).toContain("border-blue-400")
		expect(classesOf(wrapper)).not.toContain("border-yellow-400")
		expect(button(wrapper)).toBe("Ready")
	})

	it("takes the ready look and Delivered when every dish shown is ready, the order's own status still Preparing", () => {
		const wrapper = show(ticket(["Ready", "Ready"], { order: "Preparing" }))

		expect(badge(wrapper)).toBe("Ready")
		expect(classesOf(wrapper)).toContain("border-green-500")
		expect(button(wrapper)).toBe("Delivered")
		expect(wrapper.get('[data-test="ticket-timer"]').classes()).toContain(
			"text-green-600",
		)
	})

	it("looks at the dishes of ITS station: a bar tablet is sent the bar's dishes only, and its ready drinks make a ready ticket", () => {
		// The server sends a station's tablet that station's dishes, the order still "Pending" because the plates are not ready
		const wrapper = show(
			ticket(["Ready"], { order: "Pending", stations: ["bar"] }),
		)

		expect(badge(wrapper)).toBe("Ready")
		expect(button(wrapper)).toBe("Delivered")
	})

	it("is waiting again for a second round: the first one delivered, the new dishes only sent", () => {
		const wrapper = show(ticket(["Delivered", "Delivered", "Pending"]))

		expect(badge(wrapper)).toBe("Pending")
		expect(button(wrapper)).toBe("Start")
	})

	it("shows a delivered order with no main button", () => {
		const wrapper = show(
			ticket(["Delivered", "Delivered"], { order: "Delivered" }),
		)

		expect(badge(wrapper)).toBe("Delivered")
		expect(wrapper.find('[data-test="ticket-actions"] button').exists()).toBe(
			false,
		)
	})

	it("moves its look with the press at once, before the server answers: Start turns into Ready and the dishes into Preparing", async () => {
		let release
		call.mockReturnValue(
			new Promise((resolve) => {
				release = resolve
			}),
		)
		// The orders of the screen are reactive (a ref), the ticket sees its own changes
		const order = reactive(ticket(["Pending", "Pending"]))
		const wrapper = show(order)

		await wrapper.get('[data-test="ticket-actions"] button').trigger("click")

		expect(badge(wrapper)).toBe("Preparing")
		expect(button(wrapper)).toBe("Ready")
		expect(order.items.map((i) => i.kds_status)).toEqual([
			"Preparing",
			"Preparing",
		])
		expect(order.kds_status).toBe("Preparing")
		release({ status: "success" })
		await flushPromises()
	})

	it("never moves a dish backward nor wakes a held back one, as the server does not", async () => {
		call.mockResolvedValue({ status: "success" })
		const order = reactive(
			ticket(["Ready", "Waiting", "Pending"], { order: "Preparing" }),
		)
		const wrapper = show(order)

		await wrapper.get('[data-test="ticket-actions"] button').trigger("click")
		await flushPromises()

		// The main button of a ticket that is in preparation says Ready: the pending dish gets there, the ready one stays
		expect(order.items.map((i) => i.kds_status)).toEqual([
			"Ready",
			"Waiting",
			"Ready",
		])
	})

	it("puts everything back when the server refuses: the dishes, the order, the look", async () => {
		call.mockRejectedValue(new Error("refused"))
		const order = reactive(
			ticket(["Pending", "Preparing"], { order: "Pending" }),
		)
		const wrapper = show(order)
		expect(button(wrapper)).toBe("Ready")

		await wrapper.get('[data-test="ticket-actions"] button').trigger("click")
		await flushPromises()

		expect(order.items.map((i) => i.kds_status)).toEqual([
			"Pending",
			"Preparing",
		])
		expect(order.kds_status).toBe("Pending")
		expect(badge(wrapper)).toBe("Preparing")
		expect(button(wrapper)).toBe("Ready")
	})
})

describe("the main button acts on the station chosen (fix round 1, ruling 79)", () => {
	const press = (wrapper) =>
		wrapper.get('[data-test="ticket-actions"] button').trigger("click")

	it("names the station when the screen is opened on one: the server then moves the dishes of that station only", async () => {
		call.mockResolvedValue({ status: "success" })
		const wrapper = show(ticket(["Pending"], { stations: ["bar"] }), {
			station: "bar",
		})

		await press(wrapper)

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_kds_status",
			{ invoice_name: "SINV-REAL", status: "Preparing", station: "bar" },
		)
	})

	it("names no station with every station: the server moves every dish, as it always did", async () => {
		call.mockResolvedValue({ status: "success" })
		const wrapper = show(ticket(["Pending", "Pending"]))

		await press(wrapper)

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_kds_status",
			{ invoice_name: "SINV-REAL", status: "Preparing" },
		)
		expect(call.mock.calls[0][1]).not.toHaveProperty("station")
	})

	it("leaves the order's own status to the server when a station is chosen: it follows the dishes of every station, the screen sees one", async () => {
		call.mockResolvedValue({ status: "success" })
		const order = reactive(
			ticket(["Pending"], { order: "Pending", stations: ["bar"] }),
		)
		const wrapper = show(order, { station: "bar" })

		await press(wrapper)

		expect(order.items[0].kds_status).toBe("Preparing")
		expect(order.kds_status).toBe("Pending")
		// Its look is that of its dishes all the same
		expect(wrapper.get('[data-test="ticket-status"]').text()).toBe("Preparing")
	})

	it("takes the order to the status asked with every station, as it always did", async () => {
		call.mockResolvedValue({ status: "success" })
		const order = reactive(ticket(["Pending", "Pending"]))
		const wrapper = show(order)

		await press(wrapper)

		expect(order.kds_status).toBe("Preparing")
	})
})

describe("telling the screen to read again (fix round 1)", () => {
	const press = (wrapper) =>
		wrapper.get('[data-test="ticket-actions"] button').trigger("click")

	it("is done once the server has answered, by the function the band hands over, even when the press moved the ticket out from under the card", async () => {
		// A press that changes the band unmounts the card (its ticket is drawn in the other band) before the server
		// answers, and Vue drops the events of a component that is gone: the screen then waited for its 15 s poll
		const refresh = vi.fn()
		let release
		call.mockReturnValue(
			new Promise((resolve) => {
				release = resolve
			}),
		)
		const wrapper = show(reactive(ticket(["Pending"])), { refresh })
		await press(wrapper)

		wrapper.unmount()
		opened = []
		expect(refresh).not.toHaveBeenCalled()
		release({ status: "success" })
		await flushPromises()

		expect(refresh).toHaveBeenCalledTimes(1)
	})

	it("is done after a dish's own press as well", async () => {
		const refresh = vi.fn()
		call.mockResolvedValue({ status: "success" })
		layout()
		const wrapper = show(longOrder(4), { refresh })
		await wrapper.findAll('[data-test="ticket-line"]')[0].trigger("click")

		await wrapper
			.get('[data-test="ticket-line-menu"]')
			.findAll("button")[0]
			.trigger("click")
		await flushPromises()

		expect(refresh).toHaveBeenCalledTimes(1)
	})

	it("falls back to the card's own event when nobody handed it a function", async () => {
		call.mockResolvedValue({ status: "success" })
		const wrapper = show(reactive(ticket(["Pending"])))

		await press(wrapper)
		await flushPromises()

		expect(wrapper.emitted("status-updated")).toHaveLength(1)
	})

	it("says nothing when the server refuses: nothing changed over there", async () => {
		const refresh = vi.fn()
		call.mockRejectedValue(new Error("refused"))
		const wrapper = show(reactive(ticket(["Pending"])), { refresh })

		await press(wrapper)
		await flushPromises()

		expect(refresh).not.toHaveBeenCalled()
		expect(wrapper.emitted("status-updated")).toBeUndefined()
	})
})

describe("the main buttons (fix round 1, ruling 72)", () => {
	const SHORTER = ["h-5", "h-6", "h-7", "h-8", "h-9"]

	it("are 40 px high, whatever the status: one height class, h-10, and none of the shorter ones frappe-ui puts on its own", () => {
		// With frappe-ui's default size the Button renders its own `h-7` beside the card's `h-10`, and the later of the two
		// in the stylesheet wins: 28 px. The size the Button is asked for is the one that is 40 px.
		for (const dishes of [["Pending"], ["Preparing"], ["Ready"]]) {
			const button = show(ticket(dishes)).get(
				'[data-test="ticket-actions"] button',
			)

			expect(button.classes(), dishes.join()).toContain("h-10")
			for (const shorter of SHORTER) {
				expect(button.classes(), `${dishes} ${shorter}`).not.toContain(shorter)
			}
		}
	})

	it("do not win by !important", () => {
		expect(source).not.toMatch(/!h-\d|!important/)
	})
})

describe("a ticket on a touch screen", () => {
	it("has nothing that waits for a mouse: no hover state to stay stuck on after a tap", () => {
		expect(source).not.toMatch(/\bhover:/)
	})

	it("shows a press instead: a dish and the buttons answer a touch", () => {
		expect(source).toMatch(/\bactive:bg-/)
	})
})
