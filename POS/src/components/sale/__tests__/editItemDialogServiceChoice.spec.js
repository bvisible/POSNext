/**
 * //// Neoffice — added file (no upstream equivalent). The « Service » choice of « Edit Item Details » (NeoRestau lot 1, service
 * //// families, the product owner's addition of 01.11): a starter must be able to be served WITH the mains. A line takes the
 * //// family of its article's group, and the waiter, who taps the product in the cart to edit it, can give it another one there
 * //// (Boisson, Entrée, Plat, Dessert); « served with the mains » is simply Plat chosen for a starter. The chip on the line and
 * //// this choice change the same field, `service_family` of the line. Shown only on a table's order of a restaurant that has set
 * //// a family; a line the kitchen already has keeps the family it was sent under.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
})
vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	FeatherIcon: { template: "<i />" },
	call: vi.fn(async () => ({})),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showWarning: vi.fn(),
		showInfo: vi.fn(),
	}),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => false,
	getCachedItem: vi.fn(),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({
		shouldEnforceStockValidation: () => false,
		allowUserToEditRate: false,
		allowItemDiscount: false,
		enableSalesPersons: false,
		maxDiscountAllowed: 0,
		settings: { pos_profile: "Restaurant till" },
	}),
}))
vi.mock("@/stores/posOffers", () => ({
	usePOSOffersStore: () => ({ availableOffers: [] }),
}))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({
		currentProfile: { company: "Test Co" },
		profileCompany: "Test Co",
	}),
}))
vi.mock("@/stores/serialNumber", () => ({
	useSerialNumberStore: () => ({ returnSerials: vi.fn() }),
}))
vi.mock("@/utils/stockValidator", () => ({
	getItemStock: vi.fn(),
	shouldValidateItemStock: () => false,
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn(async () => ({})) }))
vi.mock("@/utils/salesPersonsList", () => ({
	loadSalesPersonsForProfile: vi.fn(async () => []),
}))

const { default: EditItemDialog } = await import("../EditItemDialog.vue")
const { usePOSCartStore } = await import("@/stores/posCart")
const { setGroupFamilies } = await import("@/utils/serviceFamilies")

const dish = (code, group, more = {}) => ({
	item_code: code,
	item_name: code,
	item_group: group,
	rate: 10,
	uom: "Unit",
	stock_uom: "Unit",
	conversion_factor: 1,
	item_uoms: [],
	...more,
})

describe("« Edit Item Details » and the Service choice", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		setGroupFamilies({ Wine: "Drink", Soups: "Starter", Pasta: "Main" })
		cart = usePOSCartStore()
		cart.setRestaurantTable({ name: "T1" })
	})
	afterEach(() => setGroupFamilies({}))

	async function open(line) {
		const wrapper = mount(EditItemDialog, {
			props: {
				modelValue: true,
				item: { ...line },
				warehouses: [],
				currency: "CHF",
			},
			global: { stubs: { teleport: true }, mocks: { __: globalThis.__ } },
		})
		await flushPromises()
		return wrapper
	}
	const choice = (wrapper) => wrapper.find("[data-service-choice]")
	const radios = (wrapper) => choice(wrapper).findAll("[role=radio]")
	const chosen = (wrapper) =>
		radios(wrapper)
			.filter((radio) => radio.attributes("aria-checked") === "true")
			.map((radio) => radio.attributes("data-family"))
	const update = async (wrapper) => {
		await wrapper
			.findAll("button")
			.find((button) => button.text() === "Update Item")
			.trigger("click")
		return wrapper.emitted("update-item")[0][0]
	}

	it("offers the four courses on a table's order, the line's own chosen", async () => {
		cart.addItem(dish("SOUP", "Soups"))

		const wrapper = await open(cart.invoiceItems[0])

		expect(choice(wrapper).exists()).toBe(true)
		expect(
			radios(wrapper).map((radio) => radio.attributes("data-family")),
		).toEqual(["Drink", "Starter", "Main", "Dessert"])
		expect(chosen(wrapper)).toEqual(["Starter"])
	})

	it("is called Service, and tells how to serve a starter with the mains", async () => {
		cart.addItem(dish("SOUP", "Soups"))

		const wrapper = await open(cart.invoiceItems[0])

		expect(choice(wrapper).text()).toContain("Service")
		expect(choice(wrapper).text()).toContain(
			"To serve a starter with the mains, choose Main.",
		)
	})

	it("gives every course a touch target of 44 px", async () => {
		cart.addItem(dish("SOUP", "Soups"))

		const wrapper = await open(cart.invoiceItems[0])

		for (const radio of radios(wrapper))
			expect(radio.classes()).toContain("min-h-[44px]")
	})

	it("is not there at the counter", async () => {
		cart.setRestaurantTable(null)
		cart.addItem(dish("SOUP", "Soups"))

		expect(choice(await open(cart.invoiceItems[0])).exists()).toBe(false)
	})

	it("is not there on a takeaway order", async () => {
		cart.isTakeaway = true
		cart.addItem(dish("SOUP", "Soups"))

		expect(choice(await open(cart.invoiceItems[0])).exists()).toBe(false)
	})

	it("is not there on a site that sets no family", async () => {
		setGroupFamilies({})
		cart.addItem(dish("SOUP", "Soups"))

		expect(choice(await open(cart.invoiceItems[0])).exists()).toBe(false)
	})

	it("hands the course chosen to the cart with the rest of the line: a starter served with the mains", async () => {
		cart.addItem(dish("SOUP", "Soups"))
		const wrapper = await open(cart.invoiceItems[0])

		await radios(wrapper)[2].trigger("click")
		const updated = await update(wrapper)

		expect(updated.service_family).toBe("Main")
	})

	it("changes the line in the cart, which the chip on the line shows too: one field, two ways to change it", async () => {
		cart.addItem(dish("SOUP", "Soups"))
		cart.addItem(dish("SALAD", "Soups"))
		const [soup, salad] = cart.invoiceItems
		const wrapper = await open(soup)
		await radios(wrapper)[2].trigger("click")
		const updated = await update(wrapper)

		await cart.updateItemDetails("SOUP", updated, "Unit", soup)

		expect([soup.service_family, salad.service_family]).toEqual([
			"Main",
			"Starter",
		])
	})

	it("starts a line that has no course on none, and leaves it with none when nothing is chosen", async () => {
		cart.addItem(dish("GUM", "Shop"))
		cart.addItem(dish("SOUP", "Soups"))
		const wrapper = await open(cart.invoiceItems[0])
		expect(chosen(wrapper)).toEqual([])

		const updated = await update(wrapper)

		expect(updated.service_family).toBe("")
	})

	it("shows a line the kitchen has with its course, and no way to change it", async () => {
		cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))
		const wrapper = await open(cart.invoiceItems[0])

		expect(chosen(wrapper)).toEqual(["Starter"])
		expect(
			radios(wrapper).every(
				(radio) => radio.attributes("disabled") !== undefined,
			),
		).toBe(true)
		expect(choice(wrapper).text()).not.toContain(
			"To serve a starter with the mains",
		)
	})

	it("keeps the course of a line the kitchen has, whatever the dialog is handed", async () => {
		cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))
		const [soup] = cart.invoiceItems
		const wrapper = await open(soup)
		const updated = await update(wrapper)

		await cart.updateItemDetails(
			"SOUP",
			{ ...updated, service_family: "Dessert" },
			"Unit",
			soup,
		)

		expect(soup.service_family).toBe("Starter")
	})

	it("changes the course of a line that is held back", async () => {
		cart.addItem(dish("PENNE", "Pasta", { kds_status: "Waiting" }))
		const [penne] = cart.invoiceItems
		const wrapper = await open(penne)

		await radios(wrapper)[3].trigger("click")
		await cart.updateItemDetails("PENNE", await update(wrapper), "Unit", penne)

		expect(penne.service_family).toBe("Dessert")
	})
})
