/**
 * //// Neoffice — added file (no upstream equivalent). « Put the order back as it was » reads the table again, and the lines added and not sent are not on the server: they are kept aside and put back on the order read again
 * //// (NeoResto lot 1, product owner, 03.11.2026: « remettre la commande comme avant perd toujours ses lignes, on vient de régler ça, non ? »). The real cart.
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
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() }),
}))
vi.mock("@/utils/offline", () => ({ isOffline: () => false, getCachedItem: vi.fn() }))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))

const { usePOSCartStore } = await import("@/stores/posCart")
const { putUnsentLinesBack, takeUnsentLines } = await import("../keepUnsentLines")
const { linesNotSentYet } = await import("../removedSentLines")

const dish = (code, extra = {}) => ({ item_code: code, item_name: code.toLowerCase(), rate: 10, price_list_rate: 10, uom: "Nos", stock_uom: "Nos", conversion_factor: 1, ...extra })

describe("the lines added and not sent, kept across a reading of the table", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
	})

	// What « put back » does: the table is read again (the cart is cleared and the sent lines come back from the server)
	async function readTheTableAgain() {
		await cart.clearCart()
		cart.addItem(dish("SOUP", { kds_status: "Pending" }))
	}

	it("puts back what the waiter had added, with its quantity and its remark, as a line not sent", async () => {
		cart.addItem(dish("SOUP", { kds_status: "Pending" }))
		cart.addItem(dish("STEAK", { posa_special_instructions: "no onion" }), 2)
		const kept = takeUnsentLines(cart.invoiceItems)

		await readTheTableAgain()
		putUnsentLinesBack(cart, kept)

		const steak = cart.invoiceItems.find((line) => line.item_code === "STEAK")
		expect(steak.quantity).toBe(2)
		expect(steak.posa_special_instructions).toBe("no onion")
		expect(steak.kds_status || "").toBe("")
		expect(linesNotSentYet(cart.invoiceItems).map((line) => line.item_code)).toEqual(["STEAK"])
		expect(cart.hasUnsentChanges).toBe(true)
	})

	it("leaves the sent lines as the table gave them", async () => {
		cart.addItem(dish("SOUP", { kds_status: "Pending" }))
		cart.addItem(dish("STEAK"))
		const kept = takeUnsentLines(cart.invoiceItems)

		await readTheTableAgain()
		putUnsentLinesBack(cart, kept)

		const soup = cart.invoiceItems.find((line) => line.item_code === "SOUP")
		expect(soup.kds_status).toBe("Pending")
		expect(soup.quantity).toBe(1)
	})

	it("keeps a dish added again apart from the line the kitchen has, never on it", async () => {
		cart.addItem(dish("SOUP", { kds_status: "Pending" }))
		cart.addItem(dish("SOUP"))
		const kept = takeUnsentLines(cart.invoiceItems)

		await readTheTableAgain()
		putUnsentLinesBack(cart, kept)

		const soups = cart.invoiceItems.filter((line) => line.item_code === "SOUP")
		expect(soups).toHaveLength(2)
		expect(soups.find((line) => line.kds_status === "Pending").quantity).toBe(1)
		expect(soups.find((line) => !line.kds_status).quantity).toBe(1)
	})

	it("keeps nothing, and changes nothing, when every line was sent", async () => {
		cart.addItem(dish("SOUP", { kds_status: "Pending" }))
		const kept = takeUnsentLines(cart.invoiceItems)

		await readTheTableAgain()
		cart.markChangesSent()
		putUnsentLinesBack(cart, kept)

		expect(kept).toEqual([])
		expect(cart.invoiceItems).toHaveLength(1)
		expect(cart.hasUnsentChanges).toBe(false)
	})

	it("is not fooled by no lines at all", () => {
		expect(takeUnsentLines(undefined)).toEqual([])
		expect(() => putUnsentLinesBack(cart, undefined)).not.toThrow()
	})
})
