/**
 * //// Neoffice — added file (no upstream equivalent). The service family of a cart line (NeoResto lot 1): a line takes the
 * //// family of its article's group when it is added, the waiter may give one line another until the line has left for the
 * //// kitchen, and the family rides with the line to the server. The till never walks the group tree: it is handed the
 * //// resolved family of every group once (get_group_families).
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
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
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))

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

describe("the service family of a cart line", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		setGroupFamilies({
			Soups: "Starter",
			Pasta: "Main",
			Cakes: "Dessert",
			Wine: "Drink",
		})
		cart = usePOSCartStore()
	})
	afterEach(() => setGroupFamilies({}))

	describe("where it comes from", () => {
		it("is the family of the article's group, whichever way the line is added", () => {
			cart.addItem(dish("SOUP", "Soups"))
			cart.addItem(dish("PENNE", "Pasta"))
			cart.addItem(dish("TART", "Cakes"))
			cart.addItem(dish("RED", "Wine"))

			expect(cart.invoiceItems.map((line) => line.service_family)).toEqual([
				"Starter",
				"Main",
				"Dessert",
				"Drink",
			])
		})

		it("is none for a group that has no family: the article is never held", () => {
			cart.addItem(dish("GUM", "Shop"))
			cart.addItem(dish("NOGROUP", undefined))

			expect(cart.invoiceItems.map((line) => line.service_family)).toEqual([
				"",
				"",
			])
		})

		it("is the one the item already carries, over its group's", () => {
			cart.addItem(dish("SOUP", "Soups", { service_family: "Main" }))

			expect(cart.invoiceItems[0].service_family).toBe("Main")
		})

		it("is none when the site sets no family", () => {
			setGroupFamilies({})

			cart.addItem(dish("SOUP", "Soups"))

			expect(cart.invoiceItems[0].service_family).toBe("")
		})

		it("is read back from the order of a table, as the server holds it", () => {
			cart.replaceAllItems([
				{
					item_code: "SOUP",
					item_name: "Soup",
					qty: 1,
					rate: 10,
					kds_status: "Pending",
					service_family: "Starter",
				},
				{
					item_code: "PENNE",
					item_name: "Penne",
					qty: 1,
					rate: 10,
					kds_status: "Waiting",
					service_family: "Main",
				},
				{
					item_code: "OLD",
					item_name: "Old line",
					qty: 1,
					rate: 10,
					kds_status: "Pending",
				},
			])

			expect(cart.invoiceItems.map((line) => line.service_family)).toEqual([
				"Starter",
				"Main",
				"",
			])
		})

		it("goes to the extra unit of a line that has left, which is a line of its own", () => {
			cart.addItem(dish("RED", "Wine", { kds_status: "Pending" }), 2)

			cart.updateItemQuantity("RED", 3, "Unit", cart.invoiceItems[0])

			expect(cart.invoiceItems).toHaveLength(2)
			expect(cart.invoiceItems[1].service_family).toBe("Drink")
			expect(cart.invoiceItems[1].kds_status).toBe("")
		})
	})

	describe("the waiter's own choice for one line", () => {
		it("changes the family of a line not sent yet, and of that line only", () => {
			cart.addItem(dish("SOUP", "Soups"))
			cart.addItem(dish("SALAD", "Soups"))
			const [soup, salad] = cart.invoiceItems

			const changed = cart.setServiceFamily(soup, "Main")

			expect(changed).toBe(true)
			expect([soup.service_family, salad.service_family]).toEqual([
				"Main",
				"Starter",
			])
		})

		it("changes the family of a line that is held back", () => {
			cart.addItem(dish("PENNE", "Pasta", { kds_status: "Waiting" }))

			expect(cart.setServiceFamily(cart.invoiceItems[0], "Dessert")).toBe(true)
			expect(cart.invoiceItems[0].service_family).toBe("Dessert")
		})

		it("leaves a line the kitchen has as it was ordered", () => {
			cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))

			expect(cart.setServiceFamily(cart.invoiceItems[0], "Main")).toBe(false)
			expect(cart.invoiceItems[0].service_family).toBe("Starter")
		})

		it("takes no family nobody knows", () => {
			cart.addItem(dish("SOUP", "Soups"))

			expect(cart.setServiceFamily(cart.invoiceItems[0], "Cheese")).toBe(false)
			expect(cart.invoiceItems[0].service_family).toBe("Starter")
		})

		it("is a change the kitchen has not heard of yet", () => {
			cart.addItem(dish("SOUP", "Soups"))
			cart.markChangesSent()
			expect(cart.hasUnsentChanges).toBe(false)

			cart.setServiceFamily(cart.invoiceItems[0], "Main")

			expect(cart.hasUnsentChanges).toBe(true)
		})

		it("does nothing for a line that is not in the cart", () => {
			expect(cart.setServiceFamily({ item_code: "GHOST" }, "Main")).toBe(false)
		})
	})

	describe("what the server is sent", () => {
		it("is each line with its family", () => {
			cart.addItem(dish("SOUP", "Soups"))
			cart.addItem(dish("GUM", "Shop"))

			const lines = cart.buildOfferEvaluationPayload({}).items

			expect(lines.map((line) => line.service_family)).toEqual(["Starter", ""])
		})

		it("is a line with no decision when the caller asks to keep it undecided, so that the server decides", () => {
			cart.addItem(dish("SOUP", "Soups"))
			cart.addItem(dish("PENNE", "Pasta", { kds_status: "Waiting" }))
			cart.addItem(dish("RED", "Wine", { kds_status: "Pending" }))

			const lines = cart.buildOfferEvaluationPayload(
				{},
				{ keepUndecided: true },
			).items

			expect(lines.map((line) => line.kds_status)).toEqual([
				"",
				"Waiting",
				"Pending",
			])
		})

		it("is still Pending for a line with no decision when nobody asks, as before", () => {
			cart.addItem(dish("SOUP", "Soups"))

			expect(cart.buildOfferEvaluationPayload({}).items[0].kds_status).toBe(
				"Pending",
			)
		})
	})

	//// Neoffice — where the kitchen prepares ahead (NeoResto lot 1, the service rhythm, Daniel, 01.11): a line carries whether it left ahead of its course and when the room called it
	describe("the lines sent ahead of their course", () => {
		it("are read back from the order of a table, with the call the room made", () => {
			cart.replaceAllItems([
				{ item_code: "SOUP", item_name: "Soup", qty: 1, rate: 10, kds_status: "Pending", service_family: "Starter" },
				{
					item_code: "PENNE",
					item_name: "Penne",
					qty: 1,
					rate: 10,
					kds_status: "Pending",
					service_family: "Main",
					kds_ahead: 1,
					kds_called_at: "2026-11-01 19:00:00.000000",
				},
				{ item_code: "TART", item_name: "Tart", qty: 1, rate: 10, kds_status: "Pending", service_family: "Dessert", kds_ahead: 1, kds_called_at: null },
			])

			expect(cart.invoiceItems.map((line) => Boolean(line.kds_ahead))).toEqual([false, true, true])
			expect(cart.invoiceItems.map((line) => line.kds_called_at || null)).toEqual([null, "2026-11-01 19:00:00.000000", null])
		})

		it("are kept by a line added with them, whichever way it is added", () => {
			cart.addItem(dish("PENNE", "Pasta", { kds_status: "Pending", kds_ahead: 1, kds_called_at: "2026-11-01 19:00:00.000000" }))
			cart.addItem(dish("TART", "Cakes", { kds_status: "Pending", kds_ahead: 1 }))
			cart.addItem(dish("SOUP", "Soups"))

			expect(cart.invoiceItems.map((line) => Boolean(line.kds_ahead))).toEqual([true, true, false])
			expect(cart.invoiceItems[0].kds_called_at).toBe("2026-11-01 19:00:00.000000")
			expect(cart.invoiceItems[1].kds_called_at || null).toBeNull()
		})

		it("go to the server only as a mark, never as a call: the server alone stamps the call", () => {
			cart.addItem(dish("PENNE", "Pasta", { kds_status: "Pending", kds_ahead: 1, kds_called_at: "2026-11-01 19:00:00.000000" }))
			cart.addItem(dish("SOUP", "Soups", { kds_status: "Pending" }))

			const lines = cart.buildOfferEvaluationPayload({}, { keepUndecided: true }).items

			expect(lines.map((line) => line.kds_ahead)).toEqual([1, 0])
			expect(lines.every((line) => !("kds_called_at" in line))).toBe(true)
		})
	})
})

