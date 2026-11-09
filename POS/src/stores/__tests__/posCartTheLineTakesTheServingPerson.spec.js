//// Neoffice — added file (no upstream equivalent). « Who did the work? » above the cart gives its person to each line added (NeoSalon, lot G1, product owner, 09.11.2026).
// Luc serves: the cut he adds is his; the same cut done by Sonia is another line, with its own commission, not a second unit on Luc's line (the line merge ignored the person);
// a product asks for nobody while the till does not follow the products by person; a person the cashier chose for a line is never taken off; the next sale starts again with the
// account's own person.
// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? `${s} ${args.join(" ")}` : s)
	return {}
})
const settings = vi.hoisted(() => ({
	enableSalesPersons: true,
	trackProductSalesByPerson: false,
	shouldEnforceStockValidation: () => false,
}))
const call = vi.hoisted(() => vi.fn())

vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => {
		Object.assign(toast, {
			showSuccess: vi.fn(),
			showError: vi.fn(),
			showWarning: vi.fn(),
			showInfo: vi.fn(),
		})
		return toast
	},
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => false,
	getCachedItem: vi.fn(),
}))
vi.mock("@/stores/posSettings", () => ({ usePOSSettingsStore: () => settings }))
vi.mock("@/utils/apiWrapper", () => ({ call }))

const { usePOSCartStore } = await import("../posCart")
const { useWhoServesStore } = await import("../whoServes")
const { forgetItemKinds } = await import("@/utils/itemKinds")

const base = { uom: "Nos", stock_uom: "Nos", conversion_factor: 1 }
const cut = {
	...base,
	item_code: "CUT",
	item_name: "Cut",
	rate: 60,
	price_list_rate: 60,
}
const shampoo = {
	...base,
	item_code: "SHAMPOO",
	item_name: "Shampoo",
	rate: 30,
	price_list_rate: 30,
}
const luc = { sales_person: "Luc", sales_person_name: "Luc" }
const sonia = { sales_person: "Sonia", sales_person_name: "Sonia" }

describe("the cart gives each line the person who serves", () => {
	let cart
	let who
	beforeEach(() => {
		setActivePinia(createPinia())
		forgetItemKinds()
		call.mockReset()
		Object.assign(settings, {
			enableSalesPersons: true,
			trackProductSalesByPerson: false,
		})
		cart = usePOSCartStore()
		cart.setPosProfile("Till")
		who = useWhoServesStore()
		who.person = luc
	})

	const lines = () => cart.invoiceItems.filter((line) => !line.is_free_item)

	it("gives the new line the person who serves", () => {
		cart.addItem({ ...cut })
		expect(lines()).toHaveLength(1)
		expect(lines()[0].sales_person).toBe("Luc")
		expect(lines()[0].sales_person_name).toBe("Luc")
	})

	it("adds a unit to the line of the same person", () => {
		cart.addItem({ ...cut })
		cart.addItem({ ...cut })
		expect(lines()).toHaveLength(1)
		expect(lines()[0].quantity).toBe(2)
	})

	it("makes another line of the same article done by another person", () => {
		cart.addItem({ ...cut })
		who.person = sonia
		cart.addItem({ ...cut })
		expect(lines().map((line) => [line.sales_person, line.quantity])).toEqual([
			["Luc", 1],
			["Sonia", 1],
		])
	})

	it("keeps the person a line already has when it is added again", () => {
		cart.addItem({ ...cut, ...sonia })
		expect(lines()[0].sales_person).toBe("Sonia")
	})

	it("gives no person while nobody serves", () => {
		who.person = null
		cart.addItem({ ...cut })
		expect(lines()[0].sales_person).toBeNull()
	})

	it("changes nothing while the option is off: no person, one line", () => {
		settings.enableSalesPersons = false
		cart.addItem({ ...cut })
		cart.addItem({ ...cut })
		expect(lines()).toHaveLength(1)
		expect(lines()[0].quantity).toBe(2)
		expect(lines()[0].sales_person).toBeNull()
	})

	it("asks for the kind of the article once and does not ask when the option is off", async () => {
		call.mockResolvedValue({
			message: { told: true, kinds: { CUT: "service" } },
		})
		const asked = () =>
			call.mock.calls.filter(([method]) => method.endsWith("item_kinds"))
		cart.addItem({ ...cut })
		cart.addItem({ ...cut })
		await vi.waitFor(() => expect(asked()).toHaveLength(1))
		expect(asked()[0][1].item_codes).toEqual(["CUT"])
		call.mockClear()
		settings.enableSalesPersons = false
		cart.addItem({ ...shampoo })
		expect(asked()).toHaveLength(0)
	})

	it("takes the person off a product as soon as the site says it is one, products not being followed", async () => {
		call.mockResolvedValue({
			message: { told: true, kinds: { SHAMPOO: "product" } },
		})
		cart.addItem({ ...shampoo })
		expect(lines()[0].sales_person).toBe("Luc")
		await vi.waitFor(() => expect(lines()[0].sales_person).toBeNull())
		expect(lines()[0].sales_person_name).toBeNull()
	})

	it("gives a product of a kind already known no person at all, then asks no more", async () => {
		call.mockResolvedValue({
			message: { told: true, kinds: { SHAMPOO: "product" } },
		})
		cart.addItem({ ...shampoo })
		await vi.waitFor(() => expect(lines()[0].sales_person).toBeNull())
		await cart.clearCart()
		who.person = luc
		cart.addItem({ ...shampoo })
		expect(lines()[0].sales_person).toBeNull()
	})

	it("keeps the person on a product when the products are followed by person", async () => {
		settings.trackProductSalesByPerson = true
		call.mockResolvedValue({
			message: { told: true, kinds: { SHAMPOO: "product" } },
		})
		cart.addItem({ ...shampoo })
		await vi.waitFor(() => expect(call).toHaveBeenCalled())
		await Promise.resolve()
		expect(lines()[0].sales_person).toBe("Luc")
	})

	it("never takes off a person the cashier chose for the line", async () => {
		let answer
		call.mockReturnValue(
			new Promise((resolve) => {
				answer = resolve
			}),
		)
		cart.addItem({ ...shampoo })
		await cart.updateItemDetails("SHAMPOO", { ...sonia })
		answer({ message: { told: true, kinds: { SHAMPOO: "product" } } })
		await vi.waitFor(() => expect(call).toHaveBeenCalled())
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(lines()[0].sales_person).toBe("Sonia")
		expect(lines()[0].sales_person_posed).toBe(false)
	})

	it("starts the next sale with the account's own person again", async () => {
		who.persons = [
			{ name: "Luc", sales_person_name: "Luc", is_mine: 1 },
			{ name: "Sonia", sales_person_name: "Sonia", is_mine: 0 },
		]
		who.forProfile = "Till"
		who.person = sonia
		await cart.clearCart()
		expect(who.person).toEqual(luc)
	})
})
