//// Neoffice — added file (no upstream equivalent). The till's copy of the portions the kitchen made (NeoResto lot 1, Daniel, 02.11.2026).
// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.fn()
vi.mock("@/utils/apiWrapper", () => ({ call }))

const { usePortionsStore } = await import("../portions")

describe("the portions the till knows of", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		call.mockReset()
	})

	it("reads the products it names, the order on its screen left out", async () => {
		call.mockResolvedValue({ message: { SOUP: { made: 5, sold: 2, left: 3 } } })
		const store = usePortionsStore()

		await store.refresh(["SOUP", "COLA"], "ACC-SINV-1")

		expect(call).toHaveBeenCalledWith("pos_next.api.portions.get_portions", {
			item_codes: JSON.stringify(["SOUP", "COLA"]),
			exclude_invoice: "ACC-SINV-1",
		})
		expect(store.isCounted("SOUP")).toBe(true)
		expect(store.isCounted("COLA")).toBe(false)
		expect(store.leftOf("SOUP", 1)).toBe(2)
		expect(store.leftOf("COLA", 1)).toBeNull()
	})

	it("forgets a product the server no longer counts", async () => {
		const store = usePortionsStore()
		store.take(["SOUP"], { SOUP: { made: 5, sold: 0, left: 5 } })

		call.mockResolvedValue({ message: {} })
		await store.refresh(["SOUP"])

		expect(store.isCounted("SOUP")).toBe(false)
	})

	it("asks for nothing when no product is named", async () => {
		await usePortionsStore().refresh([])
		expect(call).not.toHaveBeenCalled()
	})

	it("keeps what it knew when the server does not answer", async () => {
		const store = usePortionsStore()
		store.take(["SOUP"], { SOUP: { made: 5, sold: 0, left: 5 } })

		call.mockRejectedValue(new Error("offline"))
		await store.refresh(["SOUP"])

		expect(store.leftOf("SOUP")).toBe(5)
	})

	it("adds portions and takes the new count the server gives", async () => {
		const store = usePortionsStore()
		store.take(["SOUP"], { SOUP: { made: 5, sold: 5, left: 0 } })
		call.mockResolvedValue({ message: { made: 8, sold: 5, left: 3 } })

		await store.add("SOUP", 3)

		expect(call).toHaveBeenCalledWith("pos_next.api.portions.add_portions", { item: "SOUP", quantity: 3 })
		expect(store.leftOf("SOUP")).toBe(3)
	})

	it("lets a refused addition through to the screen, and changes nothing", async () => {
		const store = usePortionsStore()
		store.take(["SOUP"], { SOUP: { made: 5, sold: 5, left: 0 } })
		call.mockRejectedValue(new Error("refused"))

		await expect(store.add("SOUP", 3)).rejects.toThrow("refused")

		expect(store.leftOf("SOUP")).toBe(0)
	})
})
