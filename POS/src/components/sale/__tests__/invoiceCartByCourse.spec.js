/**
 * //// Neoffice — added file (no upstream equivalent). The cart of a table's order, drawn by course like the kitchen's ticket (NeoResto lot 1, Daniel, 01.11: « il faut la même logique que dans la cuisine sur le
 * //// ticket de la table, il faut barrer et réduire pour laisser que ce qu'il reste visible »): a header per course, the courses that are all delivered folded into one row, the lines held back in a last group,
 * //// and a device switch that turns it all off. The cart is mounted for real, with the stores of the sale page.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
	// jsdom has no CSS.escape, which the cart calls to scroll to the line it flashes
	globalThis.CSS = { ...globalThis.CSS, escape: (value) => value }
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
	FeatherIcon: { template: "<i />" },
	Button: { template: "<button><slot /></button>" },
	Dialog: {
		template: "<div><slot name='body-content' /><slot name='actions' /></div>",
	},
}))
vi.mock("@/utils/offline/workerClient", () => ({
	offlineWorker: new Proxy({}, { get: () => vi.fn(async () => null) }),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => false,
	getCachedItem: vi.fn(),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showWarning: vi.fn(),
		showInfo: vi.fn(),
	}),
}))
// A restaurant till: the kitchen buttons of the cart are shown
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({
		shouldEnforceStockValidation: () => false,
		settings: { enable_restaurant_mode: 1 },
	}),
}))

const { usePOSCartStore } = await import("@/stores/posCart")
const { setGroupFamilies } = await import("@/utils/serviceFamilies")
const { useFoldDelivered } = await import("@/composables/useFoldDelivered")
const { FOLD_DELIVERED_KEY } = await import("@/utils/foldDelivered")
const { default: InvoiceCart } = await import("../InvoiceCart.vue")

const dish = (code, group, more = {}) => ({
	item_code: code,
	item_name: code,
	item_group: group,
	rate: 10,
	price_list_rate: 10,
	uom: "Unit",
	stock_uom: "Unit",
	conversion_factor: 1,
	item_uoms: [],
	is_stock_item: 0,
	...more,
})

// The till prices a dish from its list price
const price = (amount) => ({ rate: amount, price_list_rate: amount })

describe("the cart of a table's order, by course", () => {
	let cart
	let wrapper
	beforeEach(() => {
		setActivePinia(createPinia())
		window.localStorage.clear()
		useFoldDelivered().setFoldDelivered(true)
		window.localStorage.clear()
		setGroupFamilies({
			Wine: "Drink",
			Soups: "Starter",
			Pasta: "Main",
			Cakes: "Dessert",
		})
		cart = usePOSCartStore()
		cart.setRestaurantTable({ name: "T2" })
	})
	afterEach(() => {
		setGroupFamilies({})
		wrapper?.unmount()
	})

	const mountCart = (props = {}) => {
		wrapper = mount(InvoiceCart, {
			attachTo: document.body,
			props: { items: cart.invoiceItems, ...props },
			global: { mocks: { __: globalThis.__ }, stubs: { EditItemDialog: true } },
		})
		return wrapper
	}
	const nextCourseButton = () => wrapper.find("[data-order-next-course]")
	const everythingButton = () => wrapper.find("[data-order-everything]")
	const headers = () => wrapper.findAll("[data-cart-course]")
	const headerKeys = () => headers().map((h) => h.attributes("data-course-key"))
	const foldButton = (key) =>
		wrapper.find(`[data-cart-course][data-course-key="${key}"] [data-cart-course-fold]`)
	const lineNamed = (name) =>
		wrapper.findAll("h4").find((h) => h.text() === name)
	const switchButton = () => wrapper.find('[data-test="fold-delivered-switch"]')

	// Daniel's table 2: the starters and the mains are delivered, the desserts are held back
	const tableTwo = () => {
		cart.addItem(dish("SOUP", "Soups", { kds_status: "Delivered", ...price(12) }))
		cart.addItem(dish("SALAD", "Soups", { kds_status: "Delivered", ...price(9) }))
		cart.addItem(dish("PENNE", "Pasta", { kds_status: "Delivered", ...price(24) }))
		cart.addItem(dish("PANNA COTTA", "Cakes", { kds_status: "Waiting", ...price(8) }))
		cart.addItem(dish("TIRAMISU", "Cakes", { kds_status: "Waiting", ...price(9) }))
	}

	describe("the lines under a header per course", () => {
		it("draws the courses in the order of the meal, whatever the order the lines were added in", () => {
			cart.addItem(dish("TART", "Cakes", { kds_status: "Pending" }))
			cart.addItem(dish("PENNE", "Pasta", { kds_status: "Pending" }))
			cart.addItem(dish("RED", "Wine", { kds_status: "Pending" }))
			cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))
			mountCart()

			expect(headerKeys()).toEqual(["Drink", "Starter", "Main", "Dessert"])
			expect(headers().map((h) => h.text())).toEqual([
				"Drinks",
				"Starters",
				"Mains",
				"Desserts",
			])
		})

		it("draws the lines of a course under its header, and the lines of no course after the courses with no header", () => {
			cart.addItem(dish("BREAD", "Bakery", { kds_status: "Pending" }))
			cart.addItem(dish("PENNE", "Pasta", { kds_status: "Pending" }))
			cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))
			mountCart()

			const order = wrapper
				.findAll("[data-cart-course], h4")
				.map((node) => node.text() || node.attributes("data-course-key"))
			expect(order).toEqual(["Starters", "SOUP", "Mains", "PENNE", "BREAD"])
		})

		it("draws the held lines in a last group, titled as the kitchen's ticket titles it, just above the buttons", () => {
			tableTwo()
			cart.addItem(dish("BREAD", "Bakery", { kds_status: "Pending" }))
			mountCart()

			expect(headerKeys().at(-1)).toBe("held")
			expect(headers().at(-1).text()).toBe("Coming Next")
			// the cart shows the newest line first, in a course as in the flat list
			const held = wrapper.findAll("h4").map((h) => h.text())
			expect(held.slice(-2)).toEqual(["TIRAMISU", "PANNA COTTA"])
			const lastLine = wrapper.findAll("h4").at(-1).element
			const buttons = nextCourseButton().element
			expect(
				lastLine.compareDocumentPosition(buttons) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy()
		})

		it("keeps a course that still has something to do open, delivered lines greyed and struck among the others", () => {
			cart.addItem(dish("SOUP", "Soups", { kds_status: "Delivered" }))
			cart.addItem(dish("SALAD", "Soups", { kds_status: "Preparing" }))
			mountCart()

			expect(foldButton("Starter").exists()).toBe(false)
			expect(lineNamed("SOUP").exists()).toBe(true)
			expect(lineNamed("SALAD").exists()).toBe(true)
			expect(lineNamed("SOUP").classes()).toContain("line-through")
			expect(lineNamed("SALAD").classes()).not.toContain("line-through")
		})
	})

	describe("a course that is all delivered", () => {
		beforeEach(() => {
			tableTwo()
			mountCart()
		})

		it("folds into one row, and its lines are not drawn", () => {
			expect(foldButton("Starter").exists()).toBe(true)
			expect(foldButton("Main").exists()).toBe(true)
			expect(foldButton("Starter").attributes("aria-expanded")).toBe("false")
			expect(lineNamed("SOUP")).toBeUndefined()
			expect(lineNamed("SALAD")).toBeUndefined()
			expect(lineNamed("PENNE")).toBeUndefined()
			expect(lineNamed("PANNA COTTA")).toBeDefined()
		})

		it("says the course, a check mark, how many lines and what they come to", () => {
			const starters = foldButton("Starter")

			expect(starters.text()).toContain("Starters")
			expect(starters.text()).toContain("2")
			expect(starters.text()).toMatch(/21\.00/)
			expect(starters.find("[data-cart-course-done]").exists()).toBe(true)
			const mains = foldButton("Main")
			expect(mains.text()).toMatch(/24\.00/)
		})

		it("gives the chevron button a touch target of 44 px", () => {
			expect(foldButton("Starter").classes()).toEqual(
				expect.arrayContaining(["min-h-[44px]", "touch-manipulation"]),
			)
			expect(foldButton("Starter").element.tagName).toBe("BUTTON")
		})

		it("shows its lines again, struck through and muted, on a press, and folds them back on a second", async () => {
			await foldButton("Starter").trigger("click")

			expect(foldButton("Starter").attributes("aria-expanded")).toBe("true")
			expect(lineNamed("SOUP").classes()).toContain("line-through")
			expect(lineNamed("SALAD").classes()).toContain("line-through")
			expect(
				lineNamed("SOUP").element.closest("[data-line-key]").classList,
			).toContain("opacity-50")
			// the other course stays folded
			expect(lineNamed("PENNE")).toBeUndefined()

			await foldButton("Starter").trigger("click")

			expect(foldButton("Starter").attributes("aria-expanded")).toBe("false")
			expect(lineNamed("SOUP")).toBeUndefined()
		})

		it("drops what was opened when another table opens", async () => {
			await foldButton("Starter").trigger("click")
			expect(lineNamed("SOUP")).toBeDefined()

			cart.setRestaurantTable({ name: "T7" })
			await wrapper.vm.$nextTick()

			expect(foldButton("Starter").attributes("aria-expanded")).toBe("false")
			expect(lineNamed("SOUP")).toBeUndefined()
		})

		it("does not open again when the same table is shown again", async () => {
			await foldButton("Starter").trigger("click")

			cart.setRestaurantTable({ name: "T2" })
			await wrapper.vm.$nextTick()

			expect(lineNamed("SOUP")).toBeDefined()
		})
	})

	describe("the bill", () => {
		const totals = () =>
			wrapper
				.text()
				.replace(/\s+/g, " ")
				.match(/Total Quantity.*?Grand Total\S+ \S+/)?.[0]

		it("does not change when the courses fold: a delivered line is still billed", async () => {
			tableTwo()
			mountCart({ subtotal: 62, taxAmount: 4.77, grandTotal: 66.77 })
			const folded = totals()
			expect(folded).toMatch(/Subtotal\$ 62\.00/)
			expect(folded).toMatch(/Tax\$ 4\.77/)
			expect(folded).toMatch(/Grand Total\$ 66\.77/)
			expect(folded).toMatch(/Total Quantity5/)

			await switchButton().trigger("click")

			expect(totals()).toBe(folded)
		})
	})

	describe("the device's choice to fold", () => {
		beforeEach(() => {
			tableTwo()
		})

		it("is a small switch in the cart's header row, on by default, with a touch target of 44 px", () => {
			mountCart()

			expect(switchButton().exists()).toBe(true)
			expect(switchButton().attributes("role")).toBe("switch")
			expect(switchButton().attributes("aria-checked")).toBe("true")
			expect(switchButton().attributes("aria-label")).toBe("Fold delivered courses")
			expect(switchButton().classes()).toEqual(
				expect.arrayContaining(["min-h-[44px]", "min-w-[44px]"]),
			)
			const headerRow = wrapper.find("h2").element.parentElement
			expect(headerRow.contains(switchButton().element)).toBe(true)
			// next to « Sort »
			const sort = wrapper.find('button[aria-label="Sort cart items"]').element
			expect(switchButton().element.parentElement).toBe(
				sort.closest(".relative").parentElement,
			)
		})

		it("turned off, gives back today's flat list: no header, the delivered lines greyed in their place and not struck", async () => {
			mountCart()

			await switchButton().trigger("click")

			expect(switchButton().attributes("aria-checked")).toBe("false")
			expect(headers()).toHaveLength(0)
			expect(lineNamed("SOUP")).toBeDefined()
			expect(lineNamed("PENNE")).toBeDefined()
			expect(lineNamed("SOUP").classes()).not.toContain("line-through")
			expect(
				lineNamed("SOUP").element.closest("[data-line-key]").classList,
			).toContain("opacity-50")
			expect(wrapper.findAll("h4").map((h) => h.text())).toEqual([
				"TIRAMISU",
				"PANNA COTTA",
				"PENNE",
				"SALAD",
				"SOUP",
			])
		})

		it("turned back on, folds again", async () => {
			mountCart()
			await switchButton().trigger("click")

			await switchButton().trigger("click")

			expect(foldButton("Starter").exists()).toBe(true)
			expect(lineNamed("SOUP")).toBeUndefined()
		})

		it("is kept on the device", async () => {
			mountCart()

			await switchButton().trigger("click")

			expect(window.localStorage.getItem(FOLD_DELIVERED_KEY)).toBe("0")
		})

		it("starts from what the device kept", () => {
			useFoldDelivered().setFoldDelivered(false)
			mountCart()

			expect(switchButton().attributes("aria-checked")).toBe("false")
			expect(headers()).toHaveLength(0)
		})

		it("leaves the two buttons that order as they are when it is off", async () => {
			mountCart()
			await switchButton().trigger("click")

			expect(nextCourseButton().exists()).toBe(true)
			expect(nextCourseButton().classes()).toContain("bg-[#141414]")
		})
	})

	describe("what is not a table's order of a restaurant that uses courses", () => {
		it("is untouched on a takeaway: no header, no switch, the flat list", () => {
			tableTwo()
			cart.isTakeaway = true
			mountCart()

			expect(headers()).toHaveLength(0)
			expect(switchButton().exists()).toBe(false)
			expect(lineNamed("SOUP")).toBeDefined()
			expect(lineNamed("SOUP").classes()).not.toContain("line-through")
		})

		it("is untouched at the counter", () => {
			tableTwo()
			cart.setRestaurantTable(null)
			mountCart()

			expect(headers()).toHaveLength(0)
			expect(switchButton().exists()).toBe(false)
			expect(lineNamed("SOUP")).toBeDefined()
		})

		it("is untouched on a site that sets no family", () => {
			tableTwo()
			setGroupFamilies({})
			mountCart()

			expect(headers()).toHaveLength(0)
			expect(switchButton().exists()).toBe(false)
			expect(lineNamed("SOUP")).toBeDefined()
		})
	})
})
