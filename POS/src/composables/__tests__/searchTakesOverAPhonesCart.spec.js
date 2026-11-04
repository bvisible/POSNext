/**
 * //// Neoffice — added file (no upstream equivalent). Scanning in the shop (lot 3): the code a customer's phone shows,
 * //// scanned or typed in the till's search, is the cart the till takes over (useShopCart); the article lookup then does
 * //// not run. Any other code is looked up as an article, as before.
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest"
import { reactive } from "vue"
import { useSearchInput } from "@/composables/useSearchInput"

vi.hoisted(() => {
	globalThis.__ = (s, args) => s.replace(/{(\d+)}/g, (_, n) => args?.[n] ?? _)
})

const oil = { item_code: "OIL", item_name: "Oil" }

function setup(onCartCode) {
	const itemStore = reactive({
		searchTerm: "",
		filteredItems: [],
		setSearchTerm: vi.fn(),
		clearSearch: vi.fn(),
		searchByBarcode: vi.fn(async () => oil),
	})
	const onItemFound = vi.fn(() => true)
	const search = useSearchInput({
		itemStore,
		onItemFound,
		showWarning: vi.fn(),
		isAnyDialogOpen: { value: false },
		onCartCode,
	})
	const input = document.createElement("input")
	document.body.appendChild(input)
	search.searchInputRef.value = input
	const scan = (text) => {
		input.value = text
		search.handleSearchInput({ target: input })
		search.handleKeyDown(new KeyboardEvent("keydown", { key: "Enter" }))
	}
	return { itemStore, onItemFound, scan }
}

describe("the till's search and the cart of a phone", () => {
	it("takes the phone's cart over and looks no article up", async () => {
		const onCartCode = vi.fn(async () => true)
		const { itemStore, onItemFound, scan } = setup(onCartCode)

		scan("K7Q-24M")

		await vi.waitFor(() => expect(onCartCode).toHaveBeenCalledWith("K7Q-24M"))
		expect(itemStore.searchByBarcode).not.toHaveBeenCalled()
		expect(onItemFound).not.toHaveBeenCalled()
	})

	it("looks the code up as an article when it is no phone's cart", async () => {
		const { itemStore, onItemFound, scan } = setup(vi.fn(async () => false))

		scan("7612345678900")

		await vi.waitFor(() => expect(onItemFound).toHaveBeenCalledWith(oil, false))
		expect(itemStore.searchByBarcode).toHaveBeenCalledWith("7612345678900")
	})

	it("still looks the article up when taking a cart over fails", async () => {
		const { onItemFound, scan } = setup(
			vi.fn(async () => Promise.reject(new Error("offline"))),
		)

		scan("7612345678900")

		await vi.waitFor(() => expect(onItemFound).toHaveBeenCalledWith(oil, false))
	})

	it("works as before with no cart to take over", async () => {
		const { onItemFound, scan } = setup(null)

		scan("7612345678900")

		await vi.waitFor(() => expect(onItemFound).toHaveBeenCalledWith(oil, false))
	})
})
