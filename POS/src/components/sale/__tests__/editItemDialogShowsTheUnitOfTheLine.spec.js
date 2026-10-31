/**
 * //// Neoffice — added file (no upstream equivalent). The unit select of « Edit Item Details » (NeoRestau lot 1, task 22).
 * //// A dish added from a restaurant card opened the dialog with « Nos » in the header and an EMPTY unit select: the card
 * //// entry carried no unit, the cart line was born without one, the dialog listed `undefined` as the only option and
 * //// invented « Nos » as the current value. Whatever path added a line, the select shows the unit the line is in and lists
 * //// the item's other units, and no option is ever empty.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
	return { submit: vi.fn() }
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	FeatherIcon: { template: "<i />" },
	call: vi.fn(async () => ({})),
	createResource: () => ({
		submit: mocks.submit,
		reload: vi.fn(),
		fetch: vi.fn(),
	}),
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
const { default: SelectInput } = await import(
	"@/components/common/SelectInput.vue"
)
const { usePOSCartStore } = await import("@/stores/posCart")
const { cardItemToCartItem } = await import("@/utils/cartLineUnits")

// Item entries of a card, as get_active_cards answers them
const WINE = {
	item_type: "Item",
	item: "wine",
	item_name: "Wine",
	item_group: "Drinks",
	price: 29,
	default_price: 29,
	stock_uom: "Unit",
	item_uoms: [],
}
const WATER = {
	item_type: "Item",
	item: "water",
	item_name: "Water",
	item_group: "Drinks",
	price: 4.5,
	default_price: 4.5,
	stock_uom: "Bottle",
	item_uoms: [{ uom: "Case", conversion_factor: 6 }],
}

let cart
beforeEach(() => {
	setActivePinia(createPinia())
	cart = usePOSCartStore()
	mocks.submit.mockReset()
})

// The line the till puts in the cart for what a card entry says, through the function the till calls
const lineFromCard = (cardItem) => {
	cart.addItem(cardItemToCartItem(cardItem), 1)
	return cart.invoiceItems.at(-1)
}

async function open(line) {
	const wrapper = mount(EditItemDialog, {
		props: { modelValue: true, item: line, warehouses: [], currency: "CHF" },
		global: { stubs: { teleport: true }, mocks: { __: globalThis.__ } },
	})
	await flushPromises()
	const unitLabel = wrapper
		.findAll("label")
		.find((label) => label.text().startsWith("UOM"))
	const unitSelect = wrapper
		.findAllComponents(SelectInput)
		.find(
			(select) =>
				select.element.parentElement === unitLabel.element.parentElement,
		)
	return {
		wrapper,
		unitSelect,
		shown: () => unitSelect.find("button").text(),
		options: () => unitSelect.props("options"),
		header: () =>
			wrapper.find("p.text-sm.text-gray-500").text().replace(/\s+/g, " "),
	}
}

describe("« Edit Item Details » shows the unit of a line added from a restaurant card", () => {
	it("the unit select shows the unit of the item, and the header names the same unit", async () => {
		const dialog = await open(lineFromCard(WINE))

		expect(dialog.shown()).toBe("Unit")
		expect(dialog.header()).toContain("/ Unit")
		expect(dialog.header()).not.toContain("Nos")
		expect(dialog.unitSelect.props("disabled")).toBe(false)
	})

	it("lists the other units of the item, the unit of the line selected", async () => {
		const dialog = await open(lineFromCard(WATER))

		expect(dialog.shown()).toBe("Bottle")
		expect(dialog.options().map((option) => option.value)).toEqual([
			"Bottle",
			"Case",
		])
	})

	it("changing the unit keeps working for an item with several units", async () => {
		mocks.submit.mockResolvedValue({ price_list_rate: 27 })
		const dialog = await open(lineFromCard(WATER))

		dialog.unitSelect.vm.$emit("update:modelValue", "Case")
		await flushPromises()
		const update = dialog.wrapper
			.findAll("button")
			.find((button) => button.text() === "Update Item")
		await update.trigger("click")

		const [line] = dialog.wrapper.emitted("update-item")[0]
		expect(line).toMatchObject({
			uom: "Case",
			conversion_factor: 6,
			rate: 27,
			stock_uom: "Bottle",
		})
		expect(mocks.submit).toHaveBeenCalledWith(
			expect.objectContaining({ item_code: "water", uom: "Case" }),
		)
	})

	it("confirming the dialog without touching the unit keeps the unit of the line, not an invented one", async () => {
		const dialog = await open(lineFromCard(WINE))

		const update = dialog.wrapper
			.findAll("button")
			.find((button) => button.text() === "Update Item")
		await update.trigger("click")

		const [line] = dialog.wrapper.emitted("update-item")[0]
		expect(line.uom).toBe("Unit")
	})
})

describe("« Edit Item Details » changes the unit of an item the price list has no price for", () => {
	// The card says 4.50 for a kilo; nobody priced the box of ten kilos in the price list
	const TOMATO = {
		item_type: "Item",
		item: "tomato",
		item_name: "Tomato",
		item_group: "Vegetables",
		price: 4.5,
		default_price: 4.5,
		stock_uom: "Kg",
		item_uoms: [{ uom: "Box", conversion_factor: 10 }],
	}

	async function changeUnit(dialog, unit) {
		dialog.unitSelect.vm.$emit("update:modelValue", unit)
		await flushPromises()
		const update = dialog.wrapper
			.findAll("button")
			.find((button) => button.text() === "Update Item")
		await update.trigger("click")
		const updates = dialog.wrapper.emitted("update-item")
		return updates.at(-1)[0]
	}

	it("scales the rate by the factors of the two units when the lookup answers 0", async () => {
		mocks.submit.mockResolvedValue({ price_list_rate: 0, rate: 0 })
		const dialog = await open(lineFromCard(TOMATO))

		const line = await changeUnit(dialog, "Box")

		expect(line).toMatchObject({
			uom: "Box",
			conversion_factor: 10,
			rate: 45,
			price_list_rate: 45,
		})
	})

	it("does the same when the lookup fails (the till is offline)", async () => {
		mocks.submit.mockRejectedValue(new Error("offline"))
		const dialog = await open(lineFromCard(TOMATO))

		const line = await changeUnit(dialog, "Box")

		expect(line).toMatchObject({ uom: "Box", rate: 45, price_list_rate: 45 })
	})

	it("scales back when the unit goes back to the first", async () => {
		mocks.submit.mockResolvedValue({ price_list_rate: 0 })
		cart.addItem(
			{
				...cardItemToCartItem(TOMATO),
				uom: "Box",
				conversion_factor: 10,
				rate: 45,
				price_list_rate: 45,
			},
			1,
		)
		const dialog = await open(cart.invoiceItems.at(-1))

		const line = await changeUnit(dialog, "Kg")

		expect(line).toMatchObject({ uom: "Kg", conversion_factor: 1, rate: 4.5 })
	})

	it("takes the price of the price list when it has one for the unit", async () => {
		mocks.submit.mockResolvedValue({ price_list_rate: 40 })
		const dialog = await open(lineFromCard(TOMATO))

		const line = await changeUnit(dialog, "Box")

		expect(line).toMatchObject({ uom: "Box", rate: 40 })
	})
})

describe("« Edit Item Details » shows the unit of a line however it was added", () => {
	// What each path hands to the cart for the same item: a table's order read back from the server carries the unit
	// the line is in (the invoice row's) and nothing about the item's other units
	const ORDER_ROW = {
		item_code: "wine",
		item_name: "Wine",
		rate: 29,
		uom: "Unit",
		conversion_factor: 1,
	}
	// A menu course item, as get_active_menus answers it
	const MENU_ITEM = {
		item_code: "wine",
		item_name: "Wine",
		stock_uom: "Unit",
		item_uoms: [],
	}
	// A grid item (a shop), as get_items answers it
	const GRID_ITEM = {
		item_code: "water",
		item_name: "Water",
		rate: 4.5,
		uom: "Bottle",
		stock_uom: "Bottle",
		item_uoms: [{ uom: "Case", conversion_factor: 6 }],
	}

	it.each([
		["a table's order read back from the server", ORDER_ROW, "Unit"],
		["a menu course item", MENU_ITEM, "Unit"],
		["a grid item", GRID_ITEM, "Bottle"],
	])("%s", async (_path, source, unit) => {
		cart.addItem({ ...source }, 1)
		const dialog = await open(cart.invoiceItems.at(-1))

		expect(dialog.shown()).toBe(unit)
		expect(dialog.options().map((option) => option.value)).toContain(unit)
	})

	it("never lists an empty option, whatever the line knows of its units", async () => {
		const lines = [
			lineFromCard(WINE),
			lineFromCard(WATER),
			// A line that knows nothing of its units (a draft held before units travelled with the line)
			{ item_code: "x", item_name: "X", rate: 1, quantity: 1 },
		]
		for (const line of lines) {
			const dialog = await open(line)
			for (const option of dialog.options()) {
				expect(option.value).toBeTruthy()
				expect(option.label).toBeTruthy()
			}
		}
	})
})

describe("« Edit Item Details » for a line that knows no unit at all", () => {
	// A held ticket from before units travelled with the line: nobody can tell the unit, so the dialog says none
	const NO_UNIT = {
		item_code: "wine",
		item_name: "Wine",
		rate: 29,
		quantity: 1,
	}

	it("never invents « Nos »: no unit in the header, an empty select with nothing to choose, nothing written on the line", async () => {
		cart.addItem({ ...NO_UNIT }, 1)
		const dialog = await open(cart.invoiceItems.at(-1))

		expect(dialog.shown()).toBe("")
		expect(dialog.header()).toBe("CHF 29.00")
		expect(dialog.options()).toEqual([])
		// Nothing to choose from: the select does not open on « No results found »
		expect(dialog.unitSelect.props("disabled")).toBe(true)

		const update = dialog.wrapper
			.findAll("button")
			.find((button) => button.text() === "Update Item")
		await update.trigger("click")
		const [line] = dialog.wrapper.emitted("update-item")[0]
		expect(line.uom).toBeFalsy()
	})
})

// Fix round 3: a double tap on « Update Item » (the leave animation of the dialog leaves the button there for a moment) sent the same
// change twice, each time as a new object, and a raise of a sent line added its units twice.
describe("« Update Item » is confirmed once per opening (task 22, fix round 3)", () => {
	const updateButton = (wrapper) =>
		wrapper.findAll("button").find((button) => button.text() === "Update Item")

	it("a second tap on the button sends nothing more", async () => {
		const dialog = await open(lineFromCard(WINE))
		const update = updateButton(dialog.wrapper)

		await update.trigger("click")
		await update.trigger("click")

		expect(dialog.wrapper.emitted("update-item")).toHaveLength(1)
	})

	it("nor does a confirmation that does not come from the button (the keyboard)", async () => {
		const dialog = await open(lineFromCard(WINE))

		dialog.wrapper.vm.updateItem()
		dialog.wrapper.vm.updateItem()

		expect(dialog.wrapper.emitted("update-item")).toHaveLength(1)
	})

	it("the button is disabled once it has been tapped", async () => {
		const dialog = await open(lineFromCard(WINE))
		const update = updateButton(dialog.wrapper)

		await update.trigger("click")

		expect(update.attributes("disabled")).toBeDefined()
	})

	it("the dialog opened again on a line confirms again", async () => {
		const dialog = await open(lineFromCard(WINE))
		await updateButton(dialog.wrapper).trigger("click")

		await dialog.wrapper.setProps({ item: { ...cart.invoiceItems.at(-1) } })
		await flushPromises()
		await updateButton(dialog.wrapper).trigger("click")

		expect(dialog.wrapper.emitted("update-item")).toHaveLength(2)
	})

	it("a change refused for a missing price does not use up the confirmation", async () => {
		const line = lineFromCard({ ...WINE, price: 0, default_price: 0 })
		const dialog = await open(line)

		await updateButton(dialog.wrapper).trigger("click")
		expect(dialog.wrapper.emitted("update-item")).toBeUndefined()
		expect(updateButton(dialog.wrapper).attributes("disabled")).toBeUndefined()
	})
})
