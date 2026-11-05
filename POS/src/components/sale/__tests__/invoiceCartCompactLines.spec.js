/**
 * //// Neoffice — added file (no upstream equivalent). The lines of a restaurant till's cart are compact (NeoResto lot 1; product owner, 05.11.2026: « on voit 3 choses par ticket, c'est pas
 * //// terrible », « la quantité est plus importante visuellement que le texte »): one grid per line whose parts the style places (`data-cart-*`), a thumbnail only for an article that has a
 * //// picture or a colour, two settings of the till to switch the compact lines and the pictures off. jsdom runs no scoped style: the layout is read from the classes and the marks it rides on.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const tillSettings = vi.hoisted(() => ({ value: {} }))

vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? s.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s)
	globalThis.CSS = { ...globalThis.CSS, escape: (value) => value }
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
	FeatherIcon: { template: "<i />" },
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div><slot name='body-content' /><slot name='actions' /></div>" },
}))
vi.mock("@/utils/offline/workerClient", () => ({
	offlineWorker: new Proxy({}, { get: () => vi.fn(async () => null) }),
}))
vi.mock("@/utils/offline", () => ({ isOffline: () => false, getCachedItem: vi.fn() }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() }),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({
		shouldEnforceStockValidation: () => false,
		get settings() {
			return { enable_restaurant_mode: 1, ...tillSettings.value }
		},
	}),
}))

const { usePOSCartStore } = await import("@/stores/posCart")
const { default: InvoiceCart } = await import("../InvoiceCart.vue")
const { cartIsCompact, cartLineClasses, cartShowsPictures, lineShowsThumb, settingIsOn } = await import("@/utils/cartLayout")

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

describe("the rules of the cart's layout", () => {
	it("reads a setting as on unless it was switched off", () => {
		for (const on of [undefined, null, 1, "1", true]) expect(settingIsOn(on)).toBe(true)
		for (const off of [0, "0", false]) expect(settingIsOn(off)).toBe(false)
	})

	it("makes the lines compact only at a restaurant till that did not switch it off", () => {
		expect(cartIsCompact({}, true)).toBe(true)
		expect(cartIsCompact({ cart_compact_lines: 1 }, true)).toBe(true)
		expect(cartIsCompact({ cart_compact_lines: 0 }, true)).toBe(false)
		expect(cartIsCompact({}, false)).toBe(false)
		expect(cartIsCompact(undefined, true)).toBe(true)
	})

	it("shows the pictures unless the till switched them off", () => {
		expect(cartShowsPictures({})).toBe(true)
		expect(cartShowsPictures({ cart_pictures: 0 })).toBe(false)
	})

	it("draws a thumbnail for a picture or a colour when compact, for everything else as it always did, for nothing without pictures", () => {
		const both = { compact: true, pictures: true }
		expect(lineShowsThumb({ image: "/a.jpg" }, both)).toBe(true)
		expect(lineShowsThumb({ custom_color: "#abc" }, both)).toBe(true)
		expect(lineShowsThumb({}, both)).toBe(false)
		expect(lineShowsThumb({}, { compact: false, pictures: true })).toBe(true)
		expect(lineShowsThumb({ image: "/a.jpg" }, { compact: true, pictures: false })).toBe(false)
		expect(lineShowsThumb({ image: "/a.jpg" }, { compact: false, pictures: false })).toBe(false)
	})

	it("gives a card its classes only when compact, and the no-thumbnail one when it has none", () => {
		expect(cartLineClasses({ image: "/a.jpg" }, { compact: true, pictures: true })).toBe("cart-line cart-line--compact")
		expect(cartLineClasses({}, { compact: true, pictures: true })).toBe("cart-line cart-line--compact cart-line--no-thumb")
		expect(cartLineClasses({}, { compact: false, pictures: true })).toBe("")
	})
})

describe("the cart of a restaurant till", () => {
	let cart
	let wrapper
	beforeEach(() => {
		tillSettings.value = {}
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
	const lineOf = (code) => wrapper.findAll("[data-line-key]").find((line) => line.find("h4").text() === code)
	const thumbnail = (line) => line.find("[data-cart-thumb]")

	it("lays a line out as one compact card whose parts are marked", () => {
		cart.addItem(dish("SOUP", { image: "/files/soup.jpg" }))
		mountCart()
		const line = lineOf("SOUP")

		expect(line.classes()).toEqual(expect.arrayContaining(["cart-line", "cart-line--compact"]))
		expect(line.classes()).not.toContain("cart-line--no-thumb")
		for (const mark of ["name", "total", "stepper", "remove", "thumb"]) {
			expect(line.find(`[data-cart-${mark}]`).exists(), mark).toBe(true)
		}
		expect(line.find(".cart-line-body").exists()).toBe(true)
		expect(line.find("[data-cart-stepper]").findAll("button")).toHaveLength(2)
	})

	it("keeps the actions of a line in one group that takes no box of its own until the line is compact", () => {
		cart.addItem(dish("SOUP"))
		mountCart()

		const actions = lineOf("SOUP").find(".cart-line-actions")
		expect(actions.exists()).toBe(true)
		expect(actions.classes()).toContain("contents")
	})

	it("draws a thumbnail only for a dish with a photo or a colour", () => {
		cart.addItem(dish("PLAIN"))
		cart.addItem(dish("PHOTO", { image: "/files/photo.jpg" }))
		cart.addItem(dish("COLOURED", { custom_color: "#E9C5A4" }))
		mountCart()

		expect(thumbnail(lineOf("PLAIN")).exists()).toBe(false)
		expect(lineOf("PLAIN").classes()).toContain("cart-line--no-thumb")
		expect(thumbnail(lineOf("PHOTO")).exists()).toBe(true)
		expect(thumbnail(lineOf("COLOURED")).exists()).toBe(true)
	})

	it("draws the lines as they always were when the till switched the compact lines off", () => {
		tillSettings.value = { cart_compact_lines: 0 }
		cart.addItem(dish("PLAIN"))
		cart.addItem(dish("PHOTO", { image: "/files/photo.jpg" }))
		mountCart()

		expect(lineOf("PLAIN").classes()).not.toContain("cart-line--compact")
		expect(lineOf("PLAIN").classes()).not.toContain("cart-line")
		expect(thumbnail(lineOf("PLAIN")).exists()).toBe(true)
		expect(thumbnail(lineOf("PLAIN")).classes()).toContain("max-sm:hidden")
		expect(thumbnail(lineOf("PHOTO")).classes()).not.toContain("max-sm:hidden")
	})

	it("draws no thumbnail at all when the till switched the pictures off, compact or not", () => {
		for (const compact of [1, 0]) {
			tillSettings.value = { cart_pictures: 0, cart_compact_lines: compact }
			cart.clearCart?.()
			cart.addItem(dish(`PHOTO${compact}`, { image: "/files/photo.jpg" }))
			mountCart()

			expect(thumbnail(lineOf(`PHOTO${compact}`)).exists(), `compact ${compact}`).toBe(false)
			wrapper.unmount()
		}
	})
})
