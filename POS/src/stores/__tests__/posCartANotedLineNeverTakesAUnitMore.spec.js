/**
 * //// Neoffice — added file (no upstream equivalent). A unit more of a dish whose line carries a special note goes on a plain line, never on the noted one
 * //// (the product owner, 08.11.2026: « si on met une note sur un article et que l'on en ajoute 1, il ne doit pas faire +1 sur l'article avec la note »).
 * //// « 1× steak saignant » plus a tap on « + » is « 1× saignant, 1× steak », not « 2× saignant »; the plain units go on the one plain line, so that the
 * //// kitchen reads « 3× steak » where nobody asked for anything special, and the dishes with a note stay one line each.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? `${s} ${args.join(" ")}` : s)
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() }))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))
vi.mock("@/utils/offline", () => ({ isOffline: () => false, getCachedItem: vi.fn() }))
const till = vi.hoisted(() => ({ enforcesStock: false }))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => till.enforcesStock }),
}))

const { usePOSCartStore } = await import("../posCart")

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
const steaks = (cart) => cart.invoiceItems.filter((line) => line.item_code === "steak")
const shape = (cart) => steaks(cart).map((line) => [line.quantity, line.posa_special_instructions || ""])

describe("a unit more of a dish with a note", () => {
	let cart
	beforeEach(() => {
		till.enforcesStock = false
		toast.showWarning.mockClear()
		setActivePinia(createPinia())
		cart = usePOSCartStore()
	})

	it("goes on a plain line of its own, and the line with the note keeps its one unit", () => {
		cart.addItem({ ...STEAK, posa_special_instructions: "saignant" }, 1)

		const added = cart.addAPlainUnitOf(cart.invoiceItems[0])

		expect(added).toBe(true)
		expect(shape(cart)).toEqual([
			[1, "saignant"],
			[1, ""],
		])
	})

	it("goes on the plain line that waits when there is one: the plain units are one line", () => {
		cart.addItem({ ...STEAK, posa_special_instructions: "saignant" }, 1)
		cart.addAPlainUnitOf(cart.invoiceItems[0])

		cart.addAPlainUnitOf(cart.invoiceItems[0])
		cart.addAPlainUnitOf(cart.invoiceItems[0])

		expect(shape(cart)).toEqual([
			[1, "saignant"],
			[3, ""],
		])
	})

	it("reads « 3× steak » with a note on each of the two that asked: 2 saignant, 1 well done", () => {
		cart.addItem({ ...STEAK, posa_special_instructions: "saignant" }, 1)
		cart.addItem({ ...STEAK, posa_special_instructions: "bien cuit" }, 1)
		cart.addItem({ ...STEAK, posa_special_instructions: "saignant" }, 1)
		cart.addAPlainUnitOf(cart.invoiceItems[0])

		const total = steaks(cart).reduce((sum, line) => sum + line.quantity, 0)

		expect(total).toBe(4)
		expect(shape(cart).filter(([, note]) => note === "")).toEqual([[1, ""]])
	})

	it("is billed at the dish's own price, the options' adjustment taken off, and keeps no option", () => {
		cart.addItem({ ...STEAK, posa_item_modifiers: '[{"group":"Side","option":"Fries"}]', _modifiers_applied: 2, rate: 32, price_list_rate: 32 }, 1)

		cart.addAPlainUnitOf(cart.invoiceItems[0])

		const plain = steaks(cart).find((line) => !line.posa_item_modifiers)
		expect(plain.rate).toBe(30)
		expect(plain.price_list_rate).toBe(30)
		expect(plain.posa_item_modifiers).toBe("")
		expect(plain._modifiers_applied).toBe(0)
		expect(steaks(cart).find((line) => line.posa_item_modifiers).rate).toBe(32)
	})

	it("is a unit not sent yet, even when the line with the note has left for the kitchen", () => {
		cart.addItem({ ...STEAK, posa_special_instructions: "saignant", kds_status: "Pending" }, 1)

		cart.addAPlainUnitOf(cart.invoiceItems[0])

		expect(steaks(cart).map((line) => [line.quantity, line.kds_status])).toEqual([
			[1, "Pending"],
			[1, ""],
		])
	})

	it("marks the cart as holding changes the kitchen does not have", () => {
		cart.addItem({ ...STEAK, posa_special_instructions: "saignant" }, 1)
		cart.$patch({ hasUnsentChanges: false })

		cart.addAPlainUnitOf(cart.invoiceItems[0])

		expect(cart.hasUnsentChanges).toBe(true)
	})

	it("checks the stock like any unit added, and adds nothing when there is none", () => {
		till.enforcesStock = true
		cart.addItem({ ...STEAK, is_stock_item: 1, actual_qty: 1, original_stock: 1, posa_special_instructions: "saignant" }, 1)

		const added = cart.addAPlainUnitOf(cart.invoiceItems[0])

		expect(added).toBe(false)
		expect(shape(cart)).toEqual([[1, "saignant"]])
		expect(toast.showWarning).toHaveBeenCalled()
	})

	it("tells the cashier when the line is gone (the cart was refreshed) and changes nothing", () => {
		cart.addItem({ ...STEAK, posa_special_instructions: "saignant" }, 1)

		const added = cart.addAPlainUnitOf({ item_code: "steak", posa_special_instructions: "saignant" })

		expect(added).toBe(false)
		expect(shape(cart)).toEqual([[1, "saignant"]])
		expect(toast.showWarning).toHaveBeenCalledTimes(1)
	})

	it("does not change what a plain add does: a plain line takes the unit, a noted line takes none", () => {
		cart.addItem({ ...STEAK, posa_special_instructions: "saignant" }, 1)

		cart.addItem({ ...STEAK }, 1)
		cart.addItem({ ...STEAK }, 1)

		expect(shape(cart)).toEqual([
			[1, "saignant"],
			[2, ""],
		])
	})
})
