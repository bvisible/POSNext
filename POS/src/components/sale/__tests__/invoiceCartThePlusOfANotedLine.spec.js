/**
 * //// Neoffice — added file (no upstream equivalent). The « + » of a cart line that carries a special note adds a plain unit, never one more on that line (the product owner, 08.11.2026:
 * //// « si on met une note sur un article et que l'on en ajoute 1, il ne doit pas faire +1 sur l'article avec la note »). A line without a note keeps its stepper, and a quantity typed in the
 * //// field is the waiter's own choice (« 3 steaks, all saignant »): it is not touched. The cart is mounted for real and the buttons are pressed.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createKeydownListener } from "@/utils/shortcutKeys"

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
const { default: InvoiceCart } = await import("../InvoiceCart.vue")

const STEAK = {
	item_code: "steak",
	item_name: "Steak",
	rate: 30,
	price_list_rate: 30,
	uom: "Unit",
	stock_uom: "Unit",
	conversion_factor: 1,
	item_uoms: [],
	is_stock_item: 0,
}


describe("the plus of a cart line", () => {
	let cart
	let wrapper
	const events = { plain: [], quantity: [] }
	function theCart() {
		wrapper = mount(InvoiceCart, {
			attachTo: document.body,
			props: {
				items: cart.invoiceItems,
				"onUpdate-quantity": (...args) => {
					events.quantity.push(args)
					return cart.updateItemQuantity(...args)
				},
				"onAdd-plain-unit": (row) => {
					events.plain.push(row)
					return cart.addAPlainUnitOf(row)
				},
				"onRemove-item": (row) => cart.removeItem(row),
			},
			global: { mocks: { __: (s) => s }, stubs: { EditItemDialog: true } },
		})
	}
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		events.plain = []
		events.quantity = []
	})
	afterEach(() => wrapper?.unmount())

	const pluses = () => wrapper.findAll('button[aria-label="Increase quantity"]')
	const shape = () => cart.invoiceItems.map((line) => [line.quantity, line.posa_special_instructions || ""])

	it("adds a plain unit when the line carries a note, and the line with the note stays at one", async () => {
		cart.addItem({ ...STEAK, posa_special_instructions: "saignant" }, 1)
		theCart()

		await pluses()[0].trigger("click")

		expect(events.plain).toHaveLength(1)
		expect(events.quantity).toHaveLength(0)
		expect(shape()).toEqual([
			[1, "saignant"],
			[1, ""],
		])
	})

	it("does the same for a line that carries options only", async () => {
		cart.addItem({ ...STEAK, posa_item_modifiers: '[{"group":"Side","option":"Fries"}]' }, 1)
		theCart()

		await pluses()[0].trigger("click")

		expect(events.plain).toHaveLength(1)
		expect(cart.invoiceItems.map((line) => line.quantity).sort()).toEqual([1, 1])
	})

	it("adds one to the plain line as it always did when the line carries no note", async () => {
		cart.addItem({ ...STEAK }, 1)
		theCart()

		await pluses()[0].trigger("click")

		expect(events.plain).toHaveLength(0)
		expect(events.quantity).toHaveLength(1)
		expect(shape()).toEqual([[2, ""]])
	})

	it("leaves a quantity typed on a line with a note as the waiter typed it", async () => {
		cart.addItem({ ...STEAK, posa_special_instructions: "saignant" }, 1)
		theCart()

		const field = wrapper.find('input[aria-label="Quantity"]')
		await field.setValue("3")
		await field.trigger("blur")

		expect(events.plain).toHaveLength(0)
		expect(shape()).toEqual([[3, "saignant"]])
	})
})
