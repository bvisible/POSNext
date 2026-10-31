/**
 * //// Neoffice — added file (no upstream equivalent). A quantity typed on a line that has left for the kitchen is applied
 * //// when the waiter leaves the field, not on every keystroke (NeoRestau lot 1, task 22, fix round 2). The field fires
 * //// on each key: on a sent line at 4, typing « 12 » lowered the line to 1 with the first key, then raised it to 12 with
 * //// the second, and the raise went on a new line of 11 units: the bill said 12, the kitchen had made 4 and would get 11
 * //// more (15). The cart is mounted for real and the keys are typed into its quantity field.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

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
		settings: {},
	}),
}))

const { usePOSCartStore } = await import("@/stores/posCart")
const { default: InvoiceCart } = await import("../InvoiceCart.vue")

const WINE = {
	item_code: "wine",
	item_name: "Wine",
	rate: 29,
	price_list_rate: 29,
	uom: "Unit",
	stock_uom: "Unit",
	conversion_factor: 1,
	item_uoms: [],
	is_stock_item: 0,
}

describe("a quantity typed on a sent line", () => {
	let cart
	let wrapper
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		cart.addItem({ ...WINE, kds_status: "Pending" }, 4)
		wrapper = mount(InvoiceCart, {
			attachTo: document.body,
			props: {
				items: cart.invoiceItems,
				// The sale page wires the cart's events to the store like this
				"onUpdate-quantity": cart.updateItemQuantity,
				"onRemove-item": (row) => cart.removeItem(row),
			},
			global: { mocks: { __: (s) => s }, stubs: { EditItemDialog: true } },
		})
	})

	const inputs = () => wrapper.findAll('input[aria-label="Quantity"]')
	// The field of the line that holds this quantity right now (the cart may list the newest line first)
	const fieldHolding = (quantity) =>
		inputs().find((field) => field.element.value === String(quantity))
	const quantities = () => cart.invoiceItems.map((line) => line.quantity)

	const statuses = () => cart.invoiceItems.map((line) => line.kds_status)

	it("changes nothing while the keys are pressed: « 1 » does not lower the line the kitchen has", async () => {
		const field = inputs()[0]

		await field.setValue("1")
		expect(quantities()).toEqual([4])

		await field.setValue("12")
		expect(quantities()).toEqual([4])
	})

	it("adds the difference on a line of its own when the waiter leaves the field", async () => {
		const field = inputs()[0]

		await field.setValue("1")
		await field.setValue("12")
		await field.trigger("blur")

		expect(quantities()).toEqual([4, 8])
		expect(statuses()).toEqual(["Pending", ""])
	})

	it("does the same on Enter", async () => {
		const field = inputs()[0]
		field.element.focus()

		await field.setValue("1")
		await field.setValue("12")
		await field.trigger("keydown", { key: "Enter" })

		expect(quantities()).toEqual([4, 8])
	})

	it("shows the quantity of the sent line again, not the one that was typed", async () => {
		const field = inputs()[0]

		await field.setValue("12")
		await field.trigger("blur")

		// The sent line shows 4 and the new line 8: neither shows the 12 that was typed
		expect(inputs().map((input) => input.element.value).sort()).toEqual([
			"4",
			"8",
		])
	})

	it("lowers the sent line when a lower quantity is typed and the field left, as the minus button does", async () => {
		const field = inputs()[0]

		await field.setValue("3")
		await field.trigger("blur")

		expect(quantities()).toEqual([3])
	})

	it("removes the line when 0 is typed and the field left, as the bin does", async () => {
		const field = inputs()[0]

		await field.setValue("0")
		expect(quantities()).toEqual([4])
		await field.trigger("blur")

		expect(quantities()).toEqual([])
	})

	it("changes nothing for an empty field that is left", async () => {
		const field = inputs()[0]

		await field.setValue("")
		await field.trigger("blur")

		expect(quantities()).toEqual([4])
		expect(inputs()[0].element.value).toBe("4")
	})

	it("leaves a line that waits as it was: each key applies at once", async () => {
		cart.addItem({ ...WINE, kds_status: "" }, 1)
		await wrapper.vm.$nextTick()
		const waiting = fieldHolding(1)

		await waiting.setValue("2")
		expect(quantities()).toEqual([4, 2])
		await waiting.setValue("12")
		expect(quantities()).toEqual([4, 12])
	})

	it("types on the line that waits without touching the sent one that comes first", async () => {
		cart.addItem({ ...WINE, kds_status: "" }, 1)
		await wrapper.vm.$nextTick()

		const waiting = fieldHolding(1)
		await waiting.setValue("5")
		await waiting.trigger("blur")

		expect(quantities()).toEqual([4, 5])
	})
})
