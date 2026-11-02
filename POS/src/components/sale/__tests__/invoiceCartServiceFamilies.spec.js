/**
 * //// Neoffice — added file (no upstream equivalent). The cart of a table's order shows the course of each line as a small chip
 * //// the waiter can tap to give the line another course, and offers « Commander la suite » when courses are held back
 * //// (NeoResto lot 1, service families). Only a table's order: a takeaway, a counter order and a site with no family show
 * //// none of it. The cart is mounted for real, with the stores of the sale page.
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
const { useRestaurantStore } = await import("@/stores/restaurant")
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

describe("the cart of a table's order, for the rhythm of the meal", () => {
	let cart
	let wrapper
	beforeEach(() => {
		setActivePinia(createPinia())
		setGroupFamilies({
			Wine: "Drink",
			Soups: "Starter",
			Pasta: "Main",
			Cakes: "Dessert",
		})
		cart = usePOSCartStore()
	})
	afterEach(() => {
		setGroupFamilies({})
		wrapper?.unmount()
	})

	const mountCart = () => {
		wrapper = mount(InvoiceCart, {
			attachTo: document.body,
			props: { items: cart.invoiceItems },
			global: { mocks: { __: globalThis.__ }, stubs: { EditItemDialog: true } },
		})
		return wrapper
	}
	const chips = () => wrapper.findAll("[data-service-family-chip]")
	const nextCourseButton = () => wrapper.find("[data-order-next-course]")
	const everythingButton = () => wrapper.find("[data-order-everything]")

	describe("the chip of a line", () => {
		beforeEach(() => {
			cart.setRestaurantTable({ name: "T1" })
			cart.addItem(dish("RED", "Wine"))
			cart.addItem(dish("SOUP", "Soups"))
			cart.addItem(dish("PENNE", "Pasta"))
		})

		it("names the course of each line of a table's order", () => {
			mountCart()

			expect(
				chips()
					.map((chip) => chip.text())
					.sort(),
			).toEqual(["Drink", "Main", "Starter"])
		})

		it("shows none on a takeaway order", () => {
			cart.isTakeaway = true
			mountCart()

			expect(chips()).toHaveLength(0)
		})

		it("shows none at the counter", () => {
			cart.setRestaurantTable(null)
			mountCart()

			expect(chips()).toHaveLength(0)
		})

		it("shows none on a site that sets no family", () => {
			setGroupFamilies({})
			mountCart()

			expect(chips()).toHaveLength(0)
		})

		it("gives a line another course when the waiter taps its chip and chooses one", async () => {
			mountCart()
			const soup = cart.invoiceItems.find((line) => line.item_code === "SOUP")
			const chip = chips().find((c) => c.text() === "Starter")

			await chip.trigger("click")
			await wrapper.find('[data-family="Main"]').trigger("click")

			expect(soup.service_family).toBe("Main")
			expect(
				cart.invoiceItems.find((line) => line.item_code === "RED")
					.service_family,
			).toBe("Drink")
		})

		it("shows the new course on the chip", async () => {
			mountCart()
			const chip = chips().find((c) => c.text() === "Starter")
			await chip.trigger("click")

			await wrapper.find('[data-family="Main"]').trigger("click")

			expect(
				chips()
					.map((c) => c.text())
					.sort(),
			).toEqual(["Drink", "Main", "Main"])
		})

		it("leaves a line the kitchen has as a label that cannot be tapped", () => {
			cart.invoiceItems.find((line) => line.item_code === "SOUP").kds_status =
				"Pending"
			mountCart()

			const soup = chips().find((c) => c.text() === "Starter")
			expect(soup.element.tagName).toBe("SPAN")
			const penne = chips().find((c) => c.text() === "Main")
			expect(penne.element.tagName).toBe("BUTTON")
		})
	})

	describe("the button that orders the next course", () => {
		const heldTable = () => {
			cart.setRestaurantTable({ name: "T1" })
			cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))
			cart.addItem(dish("PENNE", "Pasta", { kds_status: "Waiting" }))
			cart.addItem(dish("TART", "Cakes", { kds_status: "Waiting" }))
		}

		it("names the next course held back: the mains first", () => {
			heldTable()
			mountCart()

			expect(nextCourseButton().text()).toBe(
				"Order the next course · the mains",
			)
		})

		it("names the desserts once the mains have left", () => {
			heldTable()
			cart.invoiceItems[1].kds_status = "Pending"
			mountCart()

			expect(nextCourseButton().text()).toBe(
				"Order the next course · the desserts",
			)
		})

		it("is not there when nothing is held back", () => {
			cart.setRestaurantTable({ name: "T1" })
			cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))
			mountCart()

			expect(nextCourseButton().exists()).toBe(false)
			expect(everythingButton().exists()).toBe(false)
		})

		it("is not there for a held drink, which is no course", () => {
			cart.setRestaurantTable({ name: "T1" })
			cart.addItem(dish("RED", "Wine", { kds_status: "Waiting" }))
			mountCart()

			expect(nextCourseButton().exists()).toBe(false)
		})

		it("is not there on a takeaway or at the counter", () => {
			heldTable()
			cart.isTakeaway = true
			mountCart()

			expect(nextCourseButton().exists()).toBe(false)
		})

		it("tells the page to order the next course", async () => {
			heldTable()
			mountCart()

			await nextCourseButton().trigger("click")

			expect(wrapper.emitted("order-next-course")).toHaveLength(1)
		})

		it("offers a second small action that orders everything held, for a table in a hurry", async () => {
			heldTable()
			mountCart()

			expect(everythingButton().text()).toBe("Order everything")
			await everythingButton().trigger("click")

			expect(wrapper.emitted("order-everything")).toHaveLength(1)
			expect(wrapper.emitted("order-next-course")).toBeUndefined()
		})

		// The two buttons were 48 px for a day (Daniel, 01.11, « plus visibles »), then took the height of « Validate » and « Pay » under them (« aligne les boutons sur la taille Valider / Payer »);
		// invoiceCartOrderButtons.spec.js holds the look and the height
		it("gives both the padding and the text of the buttons under them, so that the rows are one height", () => {
			heldTable()
			mountCart()

			expect(nextCourseButton().classes()).toEqual(expect.arrayContaining(["py-2.5", "text-xs"]))
			expect(everythingButton().classes()).toEqual(expect.arrayContaining(["py-2", "border-2", "text-xs"]))
			expect(nextCourseButton().classes()).not.toContain("min-h-[48px]")
			expect(everythingButton().classes()).not.toContain("min-h-[48px]")
		})
	})

	//// Neoffice — where the kitchen prepares ahead (NeoResto lot 1, the service rhythm, Daniel, 01.11): the later courses are not held, they left ahead; the same button calls the next one
	describe("the button where the kitchen prepares ahead", () => {
		const aheadTable = (extra = {}) => {
			cart.setRestaurantTable({ name: "T1" })
			cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))
			cart.addItem(dish("PENNE", "Pasta", { kds_status: "Pending", kds_ahead: 1, ...extra }))
			cart.addItem(dish("TART", "Cakes", { kds_status: "Pending", kds_ahead: 1 }))
		}
		const prepareAhead = (rhythm = "Prepared ahead") => {
			const store = useRestaurantStore()
			store.restaurantSettings = { ...store.restaurantSettings, service_rhythm: rhythm }
		}

		it("names the next course sent ahead and not called: the mains first", () => {
			prepareAhead()
			aheadTable()
			mountCart()

			expect(nextCourseButton().text()).toBe("Order the next course · the mains")
			expect(everythingButton().exists()).toBe(true)
		})

		it("names the desserts once the mains are called", () => {
			prepareAhead()
			aheadTable({ kds_called_at: "2026-11-01 19:00:00.000000" })
			mountCart()

			expect(nextCourseButton().text()).toBe("Order the next course · the desserts")
		})

		it("is not there once every course is called", () => {
			prepareAhead()
			aheadTable({ kds_called_at: "2026-11-01 19:00:00.000000" })
			cart.invoiceItems[2].kds_called_at = "2026-11-01 19:10:00.000000"
			mountCart()

			expect(nextCourseButton().exists()).toBe(false)
		})

		it("is not there in the room's rhythm for lines sent ahead: the room cannot call a line it never held", () => {
			prepareAhead("Called by the room")
			aheadTable()
			mountCart()

			expect(nextCourseButton().exists()).toBe(false)
		})

		it("is not there on a takeaway order", () => {
			prepareAhead()
			aheadTable()
			cart.isTakeaway = true
			mountCart()

			expect(nextCourseButton().exists()).toBe(false)
		})

		it("tells the page to order the next course, as it always did", async () => {
			prepareAhead()
			aheadTable()
			mountCart()

			await nextCourseButton().trigger("click")

			expect(wrapper.emitted("order-next-course")).toHaveLength(1)
		})
	})
})

