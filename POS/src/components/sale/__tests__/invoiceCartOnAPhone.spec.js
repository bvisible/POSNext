/**
 * //// Neoffice — added file (no upstream equivalent). The cart on a phone (NeoRestau lot 1, kitchen test of 01.11): the cart tab was forced 75px wider than a
 * //// 375px screen (a 450px minimum meant for the desktop panel), a dish with no photo drew a grey square, « 1 × CHF 21.50 » repeated the line's total, and the
 * //// quantity, the subtotal and the tax took three rows. jsdom has no media queries, so the phone rules are read from the classes they ride on (`max-sm:` is
 * //// under 640px); the page's own minimum width is read from its source.
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
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({
		shouldEnforceStockValidation: () => false,
		settings: { enable_restaurant_mode: 1 },
	}),
}))

const { usePOSCartStore } = await import("@/stores/posCart")
const { default: InvoiceCart } = await import("../InvoiceCart.vue")
const { default: salePageSource } = await import("../../../pages/POSSale.vue?raw")

const dish = (code, more = {}) => ({
	item_code: code,
	item_name: code,
	item_group: "Food",
	rate: 10,
	price_list_rate: 10,
	uom: "Unit",
	stock_uom: "Unit",
	conversion_factor: 1,
	item_uoms: [],
	is_stock_item: 0,
	...more,
})

describe("the cart on a phone", () => {
	let cart
	let wrapper
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		cart.setRestaurantTable({ name: "T1" })
	})
	afterEach(() => wrapper?.unmount())

	const mountCart = () => {
		wrapper = mount(InvoiceCart, {
			attachTo: document.body,
			props: { items: cart.invoiceItems },
			global: { mocks: { __: globalThis.__ }, stubs: { EditItemDialog: true } },
		})
		return wrapper
	}
	const lineOf = (code) =>
		wrapper
			.findAll("[data-line-key]")
			.find((line) => line.find("h4").text() === code)
	const thumbnail = (line) => line.find(".rounded-lg.flex-shrink-0")
	const unitPrice = (line) => line.find("span.inline-flex.tabular-nums")

	it("draws no thumbnail for a dish with no photo, and keeps the photo of one that has it", () => {
		cart.addItem(dish("PLAIN"))
		cart.addItem(dish("PHOTO", { image: "/files/photo.jpg" }))
		mountCart()

		expect(thumbnail(lineOf("PLAIN")).classes()).toContain("max-sm:hidden")
		expect(thumbnail(lineOf("PHOTO")).classes()).not.toContain("max-sm:hidden")
	})

	it("says « 1 × price » only when it is not the line's total over again", () => {
		cart.addItem(dish("ONE"))
		cart.addItem(dish("TWO"))
		cart.addItem(dish("TWO"))
		mountCart()

		expect(unitPrice(lineOf("ONE")).classes()).toContain("max-sm:hidden")
		expect(unitPrice(lineOf("TWO")).classes()).not.toContain("max-sm:hidden")
	})

	it("keeps the line's total at the right of its name, on one row", () => {
		cart.addItem(dish("ONE"))
		mountCart()

		const header = lineOf("ONE").find("h4").element.parentElement
		expect(header.className).toContain("flex-row")
		expect(header.className).toContain("sm:flex-col")
		const total = header.children[1]
		expect(total.className).toContain("max-sm:text-end")
	})

	it("sets the quantity, the subtotal and the tax in one row of three cells, and nothing changes from 640px up", () => {
		cart.addItem(dish("ONE"))
		mountCart()

		const cells = wrapper.find(".max-sm\\:grid-cols-3")
		expect(cells.exists()).toBe(true)
		expect(cells.classes()).toContain("sm:contents")
		const labels = cells.findAll("span.font-medium").map((s) => s.text())
		expect(labels).toEqual(["Total Quantity", "Subtotal", "Tax"])
	})
})

describe("the panel that holds the cart", () => {
	it("takes the width a phone has: a 450px minimum would push the cart 75px off a 375px screen", () => {
		expect(salePageSource).toContain("min-width: min(450px, 100%)")
		expect(salePageSource).not.toContain('style="min-width: 450px')
	})
})
