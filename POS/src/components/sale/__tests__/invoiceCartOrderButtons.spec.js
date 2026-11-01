/**
 * //// Neoffice — added file (no upstream equivalent). The two buttons that order the next course, as Daniel asked on his phone (NeoRestau lot 1, 01.11: « il faut mettre les 2 boutons de commande plus
 * //// visibles »): « Commander la suite » is a SOLID ink button, « Tout commander » keeps a white face under a thick ink outline, both 48 px high with bold words, stacked at full width on a phone and side by
 * //// side from 640px. The cart is mounted for real, with the stores of the sale page; jsdom has no media queries, so the phone rules are read from the classes they ride on (`sm:` starts at 640px).
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

describe("the cart of a table's order, the buttons that order", () => {
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
		cart.setRestaurantTable({ name: "T2" })
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
	const nextCourseButton = () => wrapper.find("[data-order-next-course]")
	const everythingButton = () => wrapper.find("[data-order-everything]")

	// Daniel's table 2: the starters and the mains are delivered, the desserts are held back
	const tableTwo = () => {
		cart.addItem(dish("SOUP", "Soups", { kds_status: "Delivered", ...price(12) }))
		cart.addItem(dish("PENNE", "Pasta", { kds_status: "Delivered", ...price(24) }))
		cart.addItem(dish("PANNA COTTA", "Cakes", { kds_status: "Waiting", ...price(8) }))
		cart.addItem(dish("TIRAMISU", "Cakes", { kds_status: "Waiting", ...price(9) }))
	}

	describe("the two buttons", () => {
		beforeEach(() => {
			tableTwo()
			mountCart()
		})

		it("makes « Order the next course » a solid ink button with white bold words", () => {
			expect(nextCourseButton().classes()).toEqual(
				expect.arrayContaining([
					"bg-[#141414]",
					"text-white",
					"font-bold",
					"hover:bg-[#2B2B2B]",
					"active:bg-black",
				]),
			)
		})

		it("makes « Order everything » a secondary button with a thick ink outline", () => {
			expect(everythingButton().classes()).toEqual(
				expect.arrayContaining([
					"border-2",
					"border-[#141414]",
					"bg-white",
					"text-[#141414]",
					"font-bold",
				]),
			)
		})

		it("gives both 48 px, the corners of the buttons beside them, and the touch behaviour", () => {
			for (const button of [nextCourseButton(), everythingButton()]) {
				expect(button.classes()).toEqual(
					expect.arrayContaining([
						"min-h-[48px]",
						"rounded-neo-md",
						"touch-manipulation",
					]),
				)
			}
		})

		it("stacks them at full width on a phone, the ink one first, and sets them side by side from 640px", () => {
			const row = nextCourseButton().element.parentElement

			expect(row.classList).toContain("flex-col")
			expect(row.classList).toContain("sm:flex-row")
			expect(nextCourseButton().classes()).toEqual(
				expect.arrayContaining(["w-full", "sm:flex-1"]),
			)
			expect(everythingButton().classes()).toEqual(
				expect.arrayContaining(["w-full", "sm:w-auto"]),
			)
			expect(row.firstElementChild).toBe(nextCourseButton().element)
			expect(row.lastElementChild).toBe(everythingButton().element)
		})

		it("stays readable in dark mode: paper on ink turns to ink on paper, and the outline turns to paper", () => {
			expect(nextCourseButton().classes()).toEqual(
				expect.arrayContaining(["dark:bg-ds-paper", "dark:text-ds-ink"]),
			)
			expect(everythingButton().classes()).toEqual(
				expect.arrayContaining(["dark:border-ds-paper", "dark:text-ds-paper"]),
			)
		})

		it("uses no accent colour: every action is ink", () => {
			for (const button of [nextCourseButton(), everythingButton()]) {
				expect(button.classes().join(" ")).not.toMatch(
					/orange|signal|F55D1A|clay|blue|green|amber/i,
				)
			}
		})

		it("keeps its words, its data attributes and its actions", async () => {
			expect(nextCourseButton().text()).toBe("Order the next course · the desserts")
			expect(everythingButton().text()).toBe("Order everything")
			await nextCourseButton().trigger("click")
			await everythingButton().trigger("click")

			expect(wrapper.emitted("order-next-course")).toHaveLength(1)
			expect(wrapper.emitted("order-everything")).toHaveLength(1)
		})
	})
})
