/**
 * //// Neoffice — added file (no upstream equivalent). A quantity typed on a line that has left for the kitchen is applied
 * //// when the waiter leaves the field, not on every keystroke (NeoRestau lot 1, task 22, fix round 2). The field fires
 * //// on each key: on a sent line at 4, typing « 12 » lowered the line to 1 with the first key, then raised it to 12 with
 * //// the second, and the raise went on a new line of 11 units: the bill said 12, the kitchen had made 4 and would get 11
 * //// more (15). The cart is mounted for real and the keys are typed into its quantity field.
 * //// Fix round 3: the pending quantity is committed by every way out of the field (a button tap that does not blur it, a
 * //// keyboard shortcut from the focused field), dropped by Escape, applied only once, and the rows of one dish and one unit
 * //// have keys of their own.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
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

// ----------------------------------------------------------------------------------------------------------------------
// Fix round 3
// ----------------------------------------------------------------------------------------------------------------------

describe("a quantity typed on a sent line, round 3", () => {
	let cart
	let wrapper
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		// A table's cart: a line the kitchen has, and a line held back that the waiter can still send
		cart.setRestaurantTable({ name: "T1", table_name: "Table 1" })
		cart.addItem({ ...WINE, kds_status: "Pending" }, 4)
		cart.addItem({ ...WINE, kds_status: "Waiting" }, 1)
	})

	const mountCart = (listeners = {}) => {
		wrapper = mount(InvoiceCart, {
			attachTo: document.body,
			props: {
				items: cart.invoiceItems,
				"onUpdate-quantity": cart.updateItemQuantity,
				"onRemove-item": (row) => cart.removeItem(row),
				...listeners,
			},
			global: { mocks: { __: (s) => s }, stubs: { EditItemDialog: true } },
		})
		return wrapper
	}
	const inputs = () => wrapper.findAll('input[aria-label="Quantity"]')
	const fieldHolding = (quantity) =>
		inputs().find((field) => field.element.value === String(quantity))
	const billed = () =>
		cart.invoiceItems.reduce((sum, line) => sum + line.quantity, 0)
	const sentLine = () => cart.invoiceItems.find((line) => line.kds_status === "Pending")

	describe("applied once", () => {
		it("Enter and then a second blur apply the typed quantity once", async () => {
			mountCart()
			const field = fieldHolding(4)
			field.element.focus()

			await field.setValue("12")
			await field.trigger("keydown", { key: "Enter" })
			expect(billed()).toBe(13)

			await field.trigger("blur")
			expect(billed()).toBe(13)
			expect(sentLine().quantity).toBe(4)
		})

		it("a commit by the page and then the blur of the field apply it once", async () => {
			mountCart()
			const field = fieldHolding(4)
			field.element.focus()

			await field.setValue("12")
			wrapper.vm.commitTypedQuantity()
			wrapper.vm.commitTypedQuantity()
			await field.trigger("blur")

			expect(billed()).toBe(13)
		})

		it("leaving the field twice more adds nothing", async () => {
			mountCart()
			const field = fieldHolding(4)

			await field.setValue("12")
			await field.trigger("blur")
			for (let times = 0; times < 2; times++) {
				field.element.focus()
				await field.trigger("blur")
			}

			expect(billed()).toBe(13)
		})
	})

	describe("Escape", () => {
		it("drops what was typed and shows the quantity again", async () => {
			mountCart()
			const field = fieldHolding(4)
			field.element.focus()

			await field.setValue("12")
			await field.trigger("keydown", { key: "Escape" })

			expect(field.element.value).toBe("4")
			expect(billed()).toBe(5)
		})

		it("so that leaving the field afterwards changes nothing", async () => {
			mountCart()
			const field = fieldHolding(4)

			await field.setValue("12")
			await field.trigger("keydown", { key: "Escape" })
			await field.trigger("blur")

			expect(billed()).toBe(5)
			expect(sentLine().quantity).toBe(4)
		})
	})

	describe("committed by every way out of the field, with no blur (a button tap on a phone does not always blur it)", () => {
		const buttonBy = (label) =>
			wrapper.find(`button[aria-label="${label}"]`)

		it.each([
			["Validate", "open-kitchen-dialog", () => buttonBy("Send order")],
			["Pay", "proceed-to-payment", () => buttonBy("Proceed to payment")],
			["the provisional ticket", "print-provisional-ticket", () => buttonBy("Print provisional ticket")],
			["the send button of a line held back", "send-item-to-kitchen", () => buttonBy("Send to kitchen")],
		])("%s", async (_label, event, button) => {
			const seen = []
			mountCart({ [`on${event.replace(/(^|-)(\w)/g, (_m, _d, c) => c.toUpperCase())}`]: () => seen.push(billed()) })
			const field = fieldHolding(4)
			field.element.focus()
			await field.setValue("12")
			expect(billed()).toBe(5)

			// A click that does not blur the field
			await button().trigger("click")

			// What the page handling the event sees: the typed quantity is already in the cart
			expect(seen).toEqual([13])
			expect(sentLine().quantity).toBe(4)
		})

		it.each([
			["F9", { key: "F9" }, "Win32"],
			["Ctrl+Enter", { key: "Enter", ctrlKey: true }, "Win32"],
			["Cmd+Enter", { key: "Enter", metaKey: true }, "MacIntel"],
		])("the keyboard shortcut %s, from the focused field", async (_label, key, platform) => {
			const spy = vi.spyOn(navigator, "platform", "get").mockReturnValue(platform)
			mountCart()
			const seen = []
			// The page's shortcuts: the same listener, the handler the page gives to the payment shortcuts
			const listener = createKeydownListener(() => false, {
				F9: () => {
					wrapper.vm.commitTypedQuantity()
					seen.push(billed())
				},
				"Mod+Enter": () => {
					wrapper.vm.commitTypedQuantity()
					seen.push(billed())
				},
			})
			window.addEventListener("keydown", listener)
			try {
				const field = fieldHolding(4)
				field.element.focus()
				await field.setValue("12")

				field.element.dispatchEvent(
					new KeyboardEvent("keydown", { ...key, bubbles: true, cancelable: true }),
				)

				expect(seen).toEqual([13])
			} finally {
				window.removeEventListener("keydown", listener)
				spy.mockRestore()
			}
		})

		it("commits every field that has something pending, and only those", async () => {
			cart.addItem({ ...WINE, item_code: "water", item_name: "Water", kds_status: "Pending" }, 2)
			mountCart()
			const wine = fieldHolding(4)
			const water = fieldHolding(2)

			await wine.setValue("6")
			await water.setValue("5")
			wrapper.vm.commitTypedQuantity()

			expect(cart.invoiceItems.map((line) => [line.item_code, line.kds_status, line.quantity])).toEqual([
				["wine", "Pending", 4],
				["wine", "Waiting", 3],
				["water", "Pending", 2],
				["water", "", 3],
			])
		})

		it("has nothing to commit when nothing was typed", async () => {
			mountCart()

			wrapper.vm.commitTypedQuantity()

			expect(billed()).toBe(5)
		})
	})

	describe("the rows of one dish and one unit have keys of their own", () => {
		// Every list of sibling vnodes that holds the same key twice
		function duplicateKeys(vnode, found = []) {
			if (!vnode) return found
			if (vnode.component) duplicateKeys(vnode.component.subTree, found)
			if (Array.isArray(vnode.children)) {
				const keys = vnode.children
					.filter((child) => child && typeof child === "object" && child.key != null)
					.map((child) => String(child.key))
				for (const key of new Set(keys.filter((key, at) => keys.indexOf(key) !== at))) {
					found.push(key)
				}
				for (const child of vnode.children) duplicateKeys(child, found)
			}
			return found
		}

		it("renders no key twice", () => {
			mountCart()

			expect(duplicateKeys(wrapper.vm.$.subTree)).toEqual([])
		})

		it("removing the first row leaves the second row its own field", async () => {
			mountCart()
			const waitingField = fieldHolding(1).element

			cart.removeItem(sentLine())
			await wrapper.vm.$nextTick()

			expect(inputs()).toHaveLength(1)
			expect(inputs()[0].element).toBe(waitingField)
		})
	})
})
