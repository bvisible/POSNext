/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen ticket opened FULL SCREEN over the board (NeoRestau lot 1, task 38a-3, ruling 107 layer 3: « on force par-dessus »). A tap on the
 * //// card's « +N lines » strip opens the same ticket in a panel that takes the screen: the same header, the SAME action row with the main button at the TOP (the cook acts without closing), the
 * //// dishes in large text in as many columns as they need, side by side. It is closed by an ×, a tap outside, or Escape; it follows the theme; the board behind keeps updating (the panel
 * //// follows its ticket, and closes with it when the ticket leaves); the focus stays inside and goes back where it was. A dish line keeps opening its own status menu. jsdom has no layout engine: the
 * //// boxes of the elements are given by hand, the panel is read from its classes and its CSS variables.
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
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ runnerEnabled: false }),
}))

const { default: KDSOrderCard } = await import("../KDSOrderCard.vue")
const { FULLSCREEN_FRAME } = await import("@/utils/ticketLayout")
const { TEXT_SIZE_KEY } = await import("@/utils/kitchenTextSize")

const tokens = (classes) => classes.split(/\s+/).filter(Boolean)

/** An order with `count` dishes of the kitchen's station, the first `started` of them being prepared. */
function longOrder(count, { status = "Pending", name = "SINV-LONG" } = {}) {
	return {
		name,
		restaurant_table: "T12",
		table_display_name: "Table 12",
		area_code: "S01",
		ticket_no: 13,
		ticket_digits: 4,
		kds_status: status,
		creation: "2026-10-30 12:00:00",
		modified: "2026-10-30 12:05:00",
		items: Array.from({ length: count }, (_, index) => ({
			item_code: `ITEM-${index}`,
			item_name: `Dish ${index + 1}`,
			qty: 1,
			kds_status: status,
			kds_batch: 1,
			preparation_station: "kit",
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

/** The body of the board's card shows 150 px of its dishes of 48 px: the rest is « +N lines ». */
function boardLayout() {
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
		function box() {
			const body = this.closest?.('[data-test="ticket-body"]')
			if (this.matches?.('[data-test="ticket-body"]'))
				return rect(100, 300, 300, 150)
			if (this.matches?.("[data-ticket-line]") && body) {
				const all = [...body.querySelectorAll("[data-ticket-line]")]
				return rect(100, 300 + all.indexOf(this) * 48, 300, 48)
			}
			return rect(0, 0, 0, 0)
		},
	)
}

let opened = []
function show(order, { size, props = {} } = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: { order, stations: [], ...props },
		attachTo: document.body,
		global: {
			mocks: { __: globalThis.__ },
			provide: size ? { [TEXT_SIZE_KEY]: ref(size) } : {},
		},
	})
	opened.push(wrapper)
	return wrapper
}

/** Opens the full-screen ticket the way a cook does: a tap on the strip. */
async function openIt(wrapper) {
	await nextTick()
	await wrapper.get('[data-test="ticket-more-strip"]').trigger("click")
	await nextTick()
	return panel()
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
	opened = []
	document.documentElement.classList.remove("dark")
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
	document.body.innerHTML = ""
})

describe("opening the ticket full screen", () => {
	it("is also a button on every ticket, short or long: « Full screen » opens it without a strip to tap (kitchen test, 01.11)", async () => {
		// Three dishes of 48 px fit the 150 px of the card: nothing scrolls, so there is no « +N lines » strip
		const wrapper = show(longOrder(3))
		await nextTick()
		expect(wrapper.find('[data-test="ticket-more-strip"]').exists()).toBe(false)

		const button = wrapper.get('[data-test="ticket-expand"]')
		expect(button.attributes("aria-label")).toBe("Open the ticket full screen")
		expect(button.classes()).toContain("w-[var(--kds-btn-h,44px)]")
		await button.trigger("click")
		await nextTick()

		expect(panel()).not.toBeNull()
		// Inside the panel there is the way out, not a second way in
		expect(part("ticket-expand")).toBeNull()
		expect(part("ticket-close")).not.toBeNull()
	})

	it("is the same button on a ticket that scrolls", async () => {
		const wrapper = show(longOrder(24))
		await nextTick()

		await wrapper.get('[data-test="ticket-expand"]').trigger("click")
		await nextTick()

		expect(panel()).not.toBeNull()
	})

	it("is a tap on the « +N lines » strip: the ticket opens over the board, and not before", async () => {
		const wrapper = show(longOrder(24))
		await nextTick()
		expect(dialog()).toBeNull()

		await wrapper.get('[data-test="ticket-more-strip"]').trigger("click")
		await nextTick()

		expect(dialog()).not.toBeNull()
		expect(panel()).not.toBeNull()
	})

	it("is a tap on the « +N lines » count itself: the pill sits in the strip and the tap goes through it", async () => {
		const wrapper = show(longOrder(24))
		await nextTick()

		await wrapper.get('[data-test="ticket-more"]').trigger("click")
		await nextTick()

		expect(panel()).not.toBeNull()
	})

	it("is NOT a tap on a dish: a dish line keeps opening its own status menu", async () => {
		const wrapper = show(longOrder(24))
		await nextTick()

		await wrapper.get('[data-test="ticket-line"]').trigger("click")
		await nextTick()

		expect(dialog()).toBeNull()
		expect(wrapper.find('[data-test="ticket-line-menu"]').exists()).toBe(true)
	})

	it("is a dialog over the whole screen: teleported to the page's body, so no lane or snap point of the board cuts it, and under the undo toast", async () => {
		const wrapper = show(longOrder(24))
		await openIt(wrapper)

		// Not inside the card that opened it
		expect(wrapper.element.contains(dialog())).toBe(false)
		expect(dialog().parentElement).toBe(scrim())
		expect(scrim().parentElement).toBe(document.body)
		expect(dialog().getAttribute("role")).toBe("dialog")
		expect(dialog().getAttribute("aria-modal")).toBe("true")
		expect(dialog().getAttribute("aria-label")).toBe("Table 12")
		expect(scrim().className).toContain("fixed")
		// z-40: under the toast of the undo (z-50), over the screen's own parts
		expect(tokens(scrim().className)).toContain("z-40")
	})

	it("has the same header as the card: the room's chip, the table, the number, the timer, and its state and length in words", async () => {
		const wrapper = show(longOrder(24))
		await openIt(wrapper)

		expect(part("ticket-room").textContent.trim()).toBe("S01")
		expect(part("ticket-title").textContent.trim()).toBe("Table 12")
		expect(part("ticket-number").textContent.trim()).toBe("0013")
		// The fixture is dated: it ages from « mm:ss » into « 46 h 08 » (utils/elapsedLabel)
		expect(part("ticket-timer").textContent).toMatch(/^(\d+:\d\d|\d+ h \d\d)$/)
		expect(
			part("ticket-fs-state").textContent.replace(/\s+/g, " ").trim(),
		).toBe("Pending · 24 lines")
	})

	it("says « 1 line » in the singular", async () => {
		const wrapper = show(longOrder(1))
		// One dish never has a strip: the panel is opened from the card's own state
		await wrapper.setProps({ order: longOrder(24) })
		await openIt(wrapper)
		await wrapper.setProps({ order: longOrder(1) })
		await nextTick()

		expect(
			part("ticket-fs-state").textContent.replace(/\s+/g, " ").trim(),
		).toBe("Pending · 1 line")
	})
})

describe("the action row of the panel", () => {
	it("is at the TOP, with the main button: the header, then the buttons, then the dishes, so the cook acts without closing", async () => {
		const wrapper = show(longOrder(24))
		await openIt(wrapper)

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
		expect(part("ticket-actions").contains(part("ticket-main"))).toBe(true)
		expect(part("ticket-actions").classList.contains("flex-shrink-0")).toBe(
			true,
		)
		expect(part("ticket-body").contains(part("ticket-actions"))).toBe(false)
		expect(part("ticket-main").textContent.trim()).toBe("Start cooking")
	})

	it("triggers the SAME handler as the card's button: the same call, with the same payload, and the panel then closes", async () => {
		// What the card's own button sends, on a ticket of its own
		const board = show(longOrder(24))
		await nextTick()
		await board.get('[data-test="ticket-main"]').trigger("click")
		await flushPromises()
		const fromTheCard = call.mock.calls.map((args) =>
			JSON.parse(JSON.stringify(args)),
		)
		expect(fromTheCard).toEqual([
			[
				"pos_next.api.restaurant.update_kds_status",
				{ invoice_name: "SINV-LONG", status: "Preparing" },
			],
		])
		board.unmount()
		opened = []
		call.mockClear()

		// What the panel's button sends, on the same ticket
		const wrapper = show(longOrder(24))
		await openIt(wrapper)
		part("ticket-main").click()
		await flushPromises()

		expect(
			call.mock.calls.map((args) => JSON.parse(JSON.stringify(args))),
		).toEqual(fromTheCard)
		expect(dialog()).toBeNull()
	})

	it("acts on a station's own dishes when the screen is opened on a station, as the card's button does", async () => {
		const wrapper = show(longOrder(24), { props: { station: "kit" } })
		await openIt(wrapper)

		part("ticket-main").click()
		await flushPromises()

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_kds_status",
			{
				invoice_name: "SINV-LONG",
				status: "Preparing",
				station: "kit",
			},
		)
	})

	it("stays open when the server refuses: the move is put back, and the cook can try again", async () => {
		call.mockRejectedValueOnce(new Error("refused"))
		const order = longOrder(24)
		const wrapper = show(order)
		await openIt(wrapper)

		part("ticket-main").click()
		await flushPromises()

		expect(dialog()).not.toBeNull()
		expect(order.items.every((dish) => dish.kds_status === "Pending")).toBe(
			true,
		)
		expect(wrapper.exists()).toBe(true)
	})

	it("has the print button at the right of the main one when the screen can print, and the × at the far right", async () => {
		const wrapper = show(longOrder(24), { props: { canPrint: true } })
		await openIt(wrapper)

		const names = [...part("ticket-actions").children].map((element) =>
			element.getAttribute("data-test"),
		)
		expect(names).toEqual(["ticket-main", "ticket-print", "ticket-close"])
		expect(part("ticket-close").className).toContain("ml-auto")
	})
})

describe("the dishes of the panel", () => {
	const sizeOf = (screen) => {
		const wrapper = show(longOrder(24), { size: screen })
		return wrapper
	}

	it("are in LARGE text when the screen is Compact: one step above, never below Large", async () => {
		await openIt(sizeOf("compact"))

		expect(panel().style.getPropertyValue("--kds-fs")).toBe("18px")
		expect(panel().style.getPropertyValue("--kds-card-w")).toBe("330px")
	})

	it("are Large when the screen is Normal (one step above) and Extra large when it is Large", async () => {
		await openIt(sizeOf("normal"))
		expect(panel().style.getPropertyValue("--kds-fs")).toBe("18px")
		opened.pop().unmount()

		await openIt(sizeOf("large"))
		expect(panel().style.getPropertyValue("--kds-fs")).toBe("22px")
	})

	it("stay Extra large when the screen is: there is no step above", async () => {
		await openIt(sizeOf("xl"))

		expect(panel().style.getPropertyValue("--kds-fs")).toBe("22px")
	})

	it("are Large when no screen hands a size down (a card drawn on its own is Compact, so one step up is Large)", async () => {
		await openIt(show(longOrder(24)))

		expect(panel().style.getPropertyValue("--kds-fs")).toBe("18px")
	})

	it("have a head that is read from further away: the table at 34 px, the timer at 26 px", async () => {
		await openIt(show(longOrder(24)))

		expect(panel().style.getPropertyValue("--kds-fs-table")).toBe("34px")
		expect(panel().style.getPropertyValue("--kds-fs-timer")).toBe("26px")
		expect(panel().style.getPropertyValue("--kds-btn-h")).toBe("56px")
	})

	it("flow in columns side by side, each dish whole: the body scrolls sideways and a dish is never cut between two columns", async () => {
		await openIt(show(longOrder(24)))

		const body = part("ticket-body")
		expect(body.className).toContain("overflow-x-auto")
		expect(body.className).toContain("overflow-y-hidden")
		expect(body.className).not.toContain("overflow-y-auto")
		expect(
			tokens(FULLSCREEN_FRAME.body).every((token) =>
				body.className.includes(token),
			),
		).toBe(true)
		const lines = [...panel().querySelectorAll("[data-ticket-line]")]
		expect(lines).toHaveLength(24)
		expect(
			lines.every((line) => line.className.includes("break-inside-avoid")),
		).toBe(true)
	})

	it("show every dish, in the same lines as the card (24 of 24: nothing is cut)", async () => {
		const wrapper = show(longOrder(24))
		await openIt(wrapper)

		expect(panel().querySelectorAll('[data-test="ticket-line"]')).toHaveLength(
			24,
		)
		expect(panel().textContent).toContain("Dish 24")
		// No « +N lines » strip in the panel
		expect(part("ticket-more-strip")).toBeNull()
		expect(part("ticket-more-fade")).toBeNull()
	})

	it("are 44 px touch targets: a dish, the main button, the print button, the × and the « More → » chip", async () => {
		const wrapper = show(longOrder(24), { props: { canPrint: true } })
		await openIt(wrapper)

		expect(part("ticket-line").className).toContain("!min-h-[44px]")
		for (const name of ["ticket-main", "ticket-print", "ticket-close"]) {
			const target = part(name)
			// Each is as high as the panel's button height variable, 56 px, which is more than 44
			expect(target.className + target.parentElement.className, name).toMatch(
				/kds-btn-h/,
			)
		}
		expect(
			Number.parseFloat(panel().style.getPropertyValue("--kds-btn-h")),
		).toBeGreaterThanOrEqual(44)
	})
})

describe("« More → » in the panel", () => {
	function overflow(scrollWidth, { scrollLeft = 0, clientWidth = 1000 } = {}) {
		vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
			function () {
				return this.matches?.('[data-test="ticket-body"]') ? scrollWidth : 0
			},
		)
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
			function () {
				return this.matches?.('[data-test="ticket-body"]') ? clientWidth : 0
			},
		)
		vi.spyOn(HTMLElement.prototype, "scrollLeft", "get").mockImplementation(
			function () {
				return this.matches?.('[data-test="ticket-body"]') ? scrollLeft : 0
			},
		)
	}

	it("is there when the columns go on past the right edge, and says so in a chip of 44 px", async () => {
		overflow(1500)
		await openIt(show(longOrder(24)))

		const chip = part("ticket-fs-more")
		expect(chip).not.toBeNull()
		expect(chip.textContent.trim()).toBe("More →")
		expect(chip.className).toContain("min-h-[44px]")
	})

	it("is not there when every column is in view", async () => {
		overflow(1000)
		await openIt(show(longOrder(24)))

		expect(part("ticket-fs-more")).toBeNull()
	})

	it("goes when the last column has been brought in", async () => {
		overflow(1500)
		await openIt(show(longOrder(24)))
		expect(part("ticket-fs-more")).not.toBeNull()

		// The cook has swiped to the end: 500 px scrolled
		vi.restoreAllMocks()
		overflow(1500, { scrollLeft: 500 })
		part("ticket-body").dispatchEvent(new Event("scroll"))
		await nextTick()

		expect(part("ticket-fs-more")).toBeNull()
	})

	it("brings the next columns in when it is tapped", async () => {
		overflow(1500)
		await openIt(show(longOrder(24)))
		const scrollBy = vi.fn()
		part("ticket-body").scrollBy = scrollBy

		part("ticket-fs-more").click()

		expect(scrollBy).toHaveBeenCalledTimes(1)
		expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0)
	})
})

describe("closing the panel", () => {
	it("by the ×", async () => {
		await openIt(show(longOrder(24)))

		part("ticket-close").click()
		await nextTick()

		expect(dialog()).toBeNull()
	})

	it("by a tap outside the panel, on the scrim around it", async () => {
		await openIt(show(longOrder(24)))

		scrim().click()
		await nextTick()

		expect(dialog()).toBeNull()
	})

	it("but not by a tap inside it: on the header, on a dish, or on its body", async () => {
		await openIt(show(longOrder(24)))

		for (const name of ["ticket-header", "ticket-body", "ticket-title"]) {
			part(name).click()
			await nextTick()
			expect(dialog(), name).not.toBeNull()
		}
	})

	it("by Escape, wherever the focus is", async () => {
		await openIt(show(longOrder(24)))

		document.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		)
		await nextTick()

		expect(dialog()).toBeNull()
	})

	it("leaves the board as it was: the card is still there, and the dialog and its listeners are gone", async () => {
		const wrapper = show(longOrder(24))
		const removed = vi.spyOn(document, "removeEventListener")
		await openIt(wrapper)

		part("ticket-close").click()
		await nextTick()

		expect(wrapper.find('[data-test="ticket"]').exists()).toBe(true)
		expect(scrim()).toBeNull()
		expect(removed.mock.calls.some(([type]) => type === "keydown")).toBe(true)
		expect(removed.mock.calls.some(([type]) => type === "focusin")).toBe(true)
	})

	it("can be opened again after it has been closed", async () => {
		const wrapper = show(longOrder(24))
		await openIt(wrapper)
		part("ticket-close").click()
		await nextTick()

		await wrapper.get('[data-test="ticket-more-strip"]').trigger("click")
		await nextTick()

		expect(dialog()).not.toBeNull()
	})
})

describe("the board behind keeps updating", () => {
	it("follows the ticket while it is open: a dish that changes state, a dish that is added", async () => {
		const order = longOrder(24)
		const wrapper = show(order)
		await openIt(wrapper)
		expect(panel().textContent).not.toContain("Dish 25")

		// The screen refreshes its orders every few seconds: a new object for the same ticket, with a dish more, one of them started
		const next = longOrder(25)
		next.items[0].kds_status = "Preparing"
		await wrapper.setProps({ order: next })
		await nextTick()

		expect(dialog()).not.toBeNull()
		expect(panel().querySelectorAll('[data-test="ticket-line"]')).toHaveLength(
			25,
		)
		expect(panel().textContent).toContain("Dish 25")
		expect(part("ticket-fs-state").textContent.replace(/\s+/g, " ")).toContain(
			"25 lines",
		)
	})

	it("follows the ticket's own state: after a dish is made ready the panel's state words and button are the new ones", async () => {
		const order = longOrder(24, { status: "Preparing" })
		const wrapper = show(order)
		await openIt(wrapper)
		expect(part("ticket-main").textContent.trim()).toBe("Mark ready")

		const next = longOrder(24, { status: "Pending" })
		await wrapper.setProps({ order: next })
		await nextTick()

		expect(part("ticket-main").textContent.trim()).toBe("Start cooking")
		expect(part("ticket-fs-state").textContent).toContain("Pending")
	})

	it("closes with its ticket: when the ticket leaves the board the card goes, and the panel with it", async () => {
		const wrapper = show(longOrder(24))
		await openIt(wrapper)
		expect(dialog()).not.toBeNull()

		wrapper.unmount()
		opened = []
		await nextTick()

		expect(dialog()).toBeNull()
		expect(scrim()).toBeNull()
	})

	it("closes with its ticket in a real band: the order is no longer in the band's tickets", async () => {
		const { default: KitchenBand } = await import(
			"@/components/restaurant/KitchenBand.vue"
		)
		const band = mount(KitchenBand, {
			props: {
				band: "production",
				mode: "column",
				label: "In preparation",
				emptyText: "No orders in preparation",
				orders: [
					longOrder(24, { status: "Preparing" }),
					longOrder(3, { status: "Preparing", name: "SINV-OTHER" }),
				],
				stations: [],
			},
			attachTo: document.body,
			global: { mocks: { __: globalThis.__ } },
		})
		opened.push(band)
		await nextTick()
		await band.get('[data-test="ticket-more-strip"]').trigger("click")
		await nextTick()
		expect(dialog()).not.toBeNull()

		await band.setProps({
			orders: [longOrder(3, { status: "Preparing", name: "SINV-OTHER" })],
		})
		await nextTick()

		expect(dialog()).toBeNull()
	})
})

describe("the theme", () => {
	it("is the card's: ink on paper in light, the dark classes of the card and of the scrim in dark, and the panel sits under the page's root, where the colour mode's class is", async () => {
		await openIt(show(longOrder(24)))

		// The mode's class is on <html>: a panel teleported to the body is under it, so every `dark:` class below applies
		document.documentElement.classList.add("dark")
		expect(document.documentElement.contains(dialog())).toBe(true)
		expect(panel().className).toContain("bg-white")
		expect(panel().className).toContain("dark:bg-gray-800")
		// The design system's overlay: ink at 55 % in light, black at 66 % in dark
		expect(scrim().className).toContain("bg-[rgba(24,20,16,0.55)]")
		expect(scrim().className).toContain("dark:bg-[rgba(0,0,0,0.66)]")
		// The buttons keep their dark classes
		expect(part("ticket-main").className).toContain(
			"dark:enabled:text-ink-white",
		)
		expect(part("ticket-close").className).toContain("dark:border-gray-600")
	})
})

describe("the status menu of a dish, in the panel", () => {
	it("opens on a tap of the dish, as on the card, and the panel stays open when a status is chosen", async () => {
		const wrapper = show(longOrder(24, { status: "Preparing" }))
		await openIt(wrapper)

		part("ticket-line").click()
		await nextTick()
		const menu = panel().querySelector('[data-test="ticket-line-menu"]')
		expect(menu).not.toBeNull()
		// The menu is on the screen, not inside the scrolling columns that would cut it
		expect(menu.className).toContain("fixed")
		const ready = [...menu.querySelectorAll("button")].find((b) =>
			/ready/i.test(b.textContent),
		)
		expect(ready).toBeDefined()
		ready.click()
		await flushPromises()

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{
				invoice_name: "SINV-LONG",
				item_code: "ITEM-0",
				status: "Ready",
			},
		)
		expect(dialog()).not.toBeNull()
	})
})

describe("the focus", () => {
	it("goes into the panel when it opens: on the dialog, so that the first Tab reaches the main button", async () => {
		await openIt(show(longOrder(24)))
		await nextTick()

		expect(document.activeElement).toBe(dialog())
	})

	it("stays inside: Tab from the last control goes to the first, Shift+Tab from the first to the last", async () => {
		await openIt(show(longOrder(24)))
		await nextTick()
		const controls = [...dialog().querySelectorAll("button:not([disabled])")]
		const first = controls[0]
		const last = controls[controls.length - 1]
		expect(first).toBe(part("ticket-main"))
		expect(last).toBe(part("ticket-close"))

		last.focus()
		const tab = new KeyboardEvent("keydown", {
			key: "Tab",
			bubbles: true,
			cancelable: true,
		})
		last.dispatchEvent(tab)
		expect(tab.defaultPrevented).toBe(true)
		expect(document.activeElement).toBe(first)

		const back = new KeyboardEvent("keydown", {
			key: "Tab",
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		})
		first.dispatchEvent(back)
		expect(back.defaultPrevented).toBe(true)
		expect(document.activeElement).toBe(last)
	})

	it("is pulled back in when it strays to the board behind", async () => {
		const wrapper = show(longOrder(24))
		await openIt(wrapper)
		await nextTick()
		const behind = wrapper.get('[data-test="ticket-main"]').element

		behind.focus()
		await nextTick()

		expect(dialog().contains(document.activeElement)).toBe(true)
	})

	it("goes back to the strip that opened the panel when it closes", async () => {
		const wrapper = show(longOrder(24))
		await nextTick()
		const strip = wrapper.get('[data-test="ticket-more-strip"]').element
		strip.focus()
		expect(document.activeElement).toBe(strip)
		await wrapper.get('[data-test="ticket-more-strip"]').trigger("click")
		await nextTick()
		expect(dialog().contains(document.activeElement)).toBe(true)

		part("ticket-close").click()
		await nextTick()

		expect(document.activeElement).toBe(strip)
	})
})
