/**
 * //// Neoffice — added file (no upstream equivalent). A dish that is Delivered on the kitchen ticket is done: it is INERT
 * //// (NeoRestau lot 1, task 42). It used to be a tap target like the others and its status menu offered "Preparing" and
 * //// "Ready", i.e. it let a cook put a delivered dish back; and the menu hung inside the line's wrapper, which carried the
 * //// fade of a delivered dish, so the menu inherited the 40 % opacity and was painted UNDER the next lines. Now the fade and
 * //// the strike-through sit on the line's content alone, a delivered dish takes no touch at all, and the menu of any other
 * //// dish is fully opaque and drawn above the ticket. jsdom has no layout engine: the boxes of the elements are given by hand.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick, reactive } from "vue"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({ runnerEnabled: false }))

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
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))

const { default: KDSOrderCard } = await import("../KDSOrderCard.vue")

/** A ticket whose dishes are at the statuses given, in the order given (one send). */
function ticket(statuses) {
	return {
		name: "SINV-INERT",
		restaurant_table: "T1",
		table_display_name: "T1",
		kds_status: "Preparing",
		creation: "2026-10-30 12:00:00",
		modified: "2026-10-30 12:05:00",
		items: statuses.map((status, index) => ({
			item_code: `ITEM-${index}`,
			item_name: `Dish ${index + 1}`,
			qty: 1,
			kds_status: status,
			kds_batch: 1,
			preparation_station: "kit",
			posa_special_instructions: index === 2 ? "No salt" : null,
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
		props: { order, stations: [], ...props },
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}

const lines = (wrapper) => wrapper.findAll('[data-test="ticket-line"]')
const menuOf = (wrapper) => wrapper.find('[data-test="ticket-line-menu"]')
/** Every element from `element` (included) up to the ticket (excluded). */
function chain(wrapper, element) {
	const root = wrapper.get('[data-test="ticket"]').element
	const found = []
	for (let node = element; node && node !== root; node = node.parentElement)
		found.push(node)
	return found
}
const classesOfElement = (element) =>
	(element.getAttribute("class") || "").split(/\s+/).filter(Boolean)
/** A class that fades what it is on: opacity-0 to opacity-95 (opacity-100 is no fade). */
const fades = (name) =>
	/^opacity-(?!100$)\d+$/.test(name) || /\bopacity-\[/.test(name)
/** A class that makes a stacking context of its own, which would trap a menu's z-index. */
const traps = (name) =>
	fades(name) ||
	/^(isolate|transform|will-change|backdrop-|blur|filter|contain-)/.test(name)

beforeEach(() => {
	opened = []
	call.mockReset()
	window.innerWidth = 1280
	window.innerHeight = 800
	layout()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.restoreAllMocks()
})

describe("a delivered dish is inert (task 42)", () => {
	// Dish 1 is being prepared, dish 2 is delivered and sits in the MIDDLE, dish 3 is waiting, dish 4 is ready
	const middle = () => ticket(["Preparing", "Delivered", "Pending", "Ready"])

	it("opens no menu when it is tapped: what is done is done", async () => {
		const wrapper = show(middle())

		await lines(wrapper)[1].trigger("click")

		expect(menuOf(wrapper).exists()).toBe(false)
	})

	it("cannot be put back to Preparing or Ready: no button anywhere on the ticket offers it, and the server hears nothing", async () => {
		const wrapper = show(middle())

		await lines(wrapper)[1].trigger("click")

		const labels = wrapper
			.findAll('[data-test="ticket-line-menu"] button')
			.map((button) => button.text())
		expect(labels).toEqual([])
		expect(call).not.toHaveBeenCalled()
		expect(wrapper.emitted("status-updated")).toBeUndefined()
	})

	it("changes nothing when it is tapped: not its status, nor the other dishes'", async () => {
		const order = reactive(middle())
		const wrapper = show(order)

		await lines(wrapper)[1].trigger("click")
		await nextTick()

		expect(order.items.map((item) => item.kds_status)).toEqual([
			"Preparing",
			"Delivered",
			"Pending",
			"Ready",
		])
	})

	it("is not a target for a finger: no pointer, no pressed state, no transition, and not a button for the keyboard either", () => {
		const wrapper = show(middle())

		const delivered = lines(wrapper)[1]
		const names = delivered.classes()
		expect(names).not.toContain("cursor-pointer")
		expect(names).toContain("cursor-default")
		expect(names.filter((name) => name.includes("active:"))).toEqual([])
		expect(names).not.toContain("transition-colors")
		expect(delivered.attributes("role")).toBeUndefined()
		expect(delivered.attributes("tabindex")).toBeUndefined()
		// Nothing inside it is a button or a link, and its status pill does not ask for a pointer either
		expect(
			delivered.findAll("button, a, [role=button], [tabindex]"),
		).toHaveLength(0)
		for (const element of delivered.element.querySelectorAll("*"))
			expect(classesOfElement(element)).not.toContain("cursor-pointer")
	})

	it("leaves the dishes around it as tappable as they were: pointer and pressed state", () => {
		const wrapper = show(middle())

		for (const index of [0, 2, 3]) {
			const names = lines(wrapper)[index].classes()
			expect(names, `dish ${index + 1}`).toContain("cursor-pointer")
			expect(
				names.some((name) => name.startsWith("active:bg-")),
				`dish ${index + 1}`,
			).toBe(true)
		}
	})

	it("is closed over: a tap on it while the menu of another dish is open closes that menu and opens nothing", async () => {
		const wrapper = show(middle())
		await lines(wrapper)[0].trigger("click")
		expect(menuOf(wrapper).exists()).toBe(true)

		await lines(wrapper)[1].trigger("click")

		expect(menuOf(wrapper).exists()).toBe(false)
		expect(call).not.toHaveBeenCalled()
	})

	it("loses the menu it had if a refresh delivers it while the menu is open: a dish delivered elsewhere is done here too", async () => {
		const order = reactive(middle())
		const wrapper = show(order)
		await lines(wrapper)[2].trigger("click")
		expect(menuOf(wrapper).exists()).toBe(true)

		order.items[2].kds_status = "Delivered"
		await nextTick()

		expect(menuOf(wrapper).exists()).toBe(false)
	})

	it("does not get the menu back if the dish returns to a live status later with no tap in between: the open menu is forgotten, not just hidden", async () => {
		const order = reactive(middle())
		const wrapper = show(order)
		await lines(wrapper)[2].trigger("click")
		expect(menuOf(wrapper).exists()).toBe(true)

		// A refresh delivers the dish while its menu is open ...
		order.items[2].kds_status = "Delivered"
		await nextTick()
		expect(menuOf(wrapper).exists()).toBe(false)

		// ... and a later refresh brings it back to a live status: nobody touched the screen, so no menu may show
		order.items[2].kds_status = "Preparing"
		await nextTick()

		expect(menuOf(wrapper).exists()).toBe(false)
	})
})

describe("what is faded holds nothing that can be touched (task 42)", () => {
	const middle = () => ticket(["Preparing", "Delivered", "Pending", "Ready"])

	it("fades and strikes through the content of a delivered dish, on the dish itself, and on nothing around it", () => {
		const wrapper = show(middle())

		const delivered = lines(wrapper)[1]
		expect(delivered.classes()).toContain("line-through")
		expect(delivered.classes().some(fades)).toBe(true)
		// The wrapper of the line (it holds the status menu of a dish that has one) is neither faded nor struck through
		const wrapperOfLine = delivered.element.closest("[data-ticket-line]")
		expect(wrapperOfLine).not.toBe(null)
		expect(classesOfElement(wrapperOfLine).some(fades)).toBe(false)
		expect(classesOfElement(wrapperOfLine)).not.toContain("line-through")
		// Nor anything higher up, to the ticket's own frame
		for (const element of chain(wrapper, wrapperOfLine.parentElement)) {
			expect(
				classesOfElement(element).some(fades),
				element.outerHTML.slice(0, 80),
			).toBe(false)
			expect(classesOfElement(element)).not.toContain("line-through")
		}
	})

	it("leaves the dishes that are not delivered at full strength and unstruck", () => {
		const wrapper = show(middle())

		for (const index of [0, 2, 3]) {
			expect(lines(wrapper)[index].classes().some(fades)).toBe(false)
			expect(lines(wrapper)[index].classes()).not.toContain("line-through")
		}
	})

	it("opens a menu that is inside nothing faded and nothing that traps its z-index, whichever dish is pressed", async () => {
		const wrapper = show(middle())

		for (let index = 0; index < 4; index += 1) {
			await lines(wrapper)[index].trigger("click")
			const menu = menuOf(wrapper)
			if (menu.exists()) {
				for (const element of chain(wrapper, menu.element)) {
					expect(
						classesOfElement(element).filter(traps),
						`dish ${index + 1}: ${element.outerHTML.slice(0, 70)}`,
					).toEqual([])
				}
			}
			// Back to a closed menu for the next dish
			document.body.click()
			await nextTick()
		}
	})
})

describe("the menu of a dish is above the ticket (task 42)", () => {
	// The dish above a delivered one: its menu hangs over the delivered dish and the ones after it
	const middle = () => ticket(["Preparing", "Delivered", "Pending", "Ready"])

	it("is fully opaque: neither the menu nor any element around it fades", async () => {
		const wrapper = show(middle())

		await lines(wrapper)[0].trigger("click")

		const menu = menuOf(wrapper)
		expect(menu.exists()).toBe(true)
		for (const element of chain(wrapper, menu.element))
			expect(classesOfElement(element).some(fades)).toBe(false)
	})

	it("is drawn above the dishes after it: fixed on the screen, with a z-index over everything in the ticket", async () => {
		const wrapper = show(middle())

		await lines(wrapper)[0].trigger("click")

		const menu = menuOf(wrapper)
		expect(menu.classes()).toContain("fixed")
		const z = (element) => {
			const found = classesOfElement(element).find((name) =>
				/^z-\d+$/.test(name),
			)
			return found ? Number(found.slice(2)) : 0
		}
		const above = Math.max(
			0,
			...[...wrapper.get('[data-test="ticket"]').element.querySelectorAll("*")]
				.filter(
					(element) =>
						element !== menu.element && !menu.element.contains(element),
				)
				.map(z),
		)
		expect(z(menu.element)).toBeGreaterThan(above)
		expect(z(menu.element)).toBeGreaterThanOrEqual(30)
	})

	it("still offers the statuses the dish is not at, and sets the one chosen", async () => {
		call.mockResolvedValue({ status: "success" })
		const wrapper = show(middle())
		await lines(wrapper)[0].trigger("click")

		const buttons = menuOf(wrapper).findAll("button")
		expect(buttons.map((button) => button.text())).toEqual([
			"Ready",
			"Delivered",
		])
		await buttons[0].trigger("click")

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.update_item_kds_status",
			{ invoice_name: "SINV-INERT", item_code: "ITEM-0", status: "Ready" },
		)
	})

	it("opens where it did: under the dish, and over it when there is no room below", async () => {
		const wrapper = show(middle())

		// Dish 1 is at y = 300..348 here: room below on an 800 px screen
		await lines(wrapper)[0].trigger("click")
		expect(menuOf(wrapper).element.style.top).toBe("352px")

		// The same dish on a screen with no room below it: held by its lower edge, 4 px over the dish
		await lines(wrapper)[0].trigger("click")
		window.innerHeight = 400
		await lines(wrapper)[0].trigger("click")
		expect(menuOf(wrapper).element.style.bottom).toBe("104px")
		expect(menuOf(wrapper).element.style.top).toBe("")
	})
})
