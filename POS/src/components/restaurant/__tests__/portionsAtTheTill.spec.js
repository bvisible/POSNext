/**
 * //// Neoffice — added file (no upstream equivalent). The portions the kitchen made, at the till (NeoResto lot 1, Daniel, 02.11.2026:
 * //// « quand un plat compté est épuisé, pouvoir augmenter la quantité […] la cuisine dit tu peux encore en faire 2, 3, 5 », and the
 * //// restaurant decides whether a sold-out dish is greyed out): the dialog that adds portions, the tile of a counted product, and the
 * //// section of the card editor that counts a product.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }))

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_m, i) => args[i]) : text)
})

vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))

const { default: AddPortionsDialog } = await import("../AddPortionsDialog.vue")
const { default: RestaurantCardGrid } = await import("../RestaurantCardGrid.vue")
const { default: ItemPortionsSection } = await import("../ItemPortionsSection.vue")
const { usePortionsStore } = await import("@/stores/portions")

const mocks = { __: globalThis.__ }

beforeEach(() => {
	setActivePinia(createPinia())
	call.mockReset()
	toast.showError.mockReset()
})

describe("the dialog that adds portions", () => {
	const mountDialog = (item = { code: "SOUP", name: "Soup", left: 0 }) =>
		mount(AddPortionsDialog, { props: { item }, global: { mocks } })

	it("says the dish is sold out and offers the quick quantities", () => {
		const wrapper = mountDialog()

		expect(wrapper.get("[data-test=add-portions-title]").text()).toBe("Soup")
		expect(wrapper.get("[data-test=add-portions-left]").text()).toBe("Sold out")
		for (const quantity of [1, 2, 3, 5]) {
			expect(wrapper.find(`[data-test=add-portions-choice-${quantity}]`).exists()).toBe(true)
		}
	})

	it("says how many are left when some are", () => {
		const wrapper = mountDialog({ code: "SOUP", name: "Soup", left: 2 })

		expect(wrapper.get("[data-test=add-portions-left]").text()).toBe("2 left")
	})

	it("adds the quantity of the button tapped and closes", async () => {
		call.mockResolvedValue({ message: { made: 8, sold: 5, left: 3 } })
		const wrapper = mountDialog()

		await wrapper.get("[data-test=add-portions-choice-3]").trigger("click")
		await flushPromises()

		expect(call).toHaveBeenCalledWith("pos_next.api.portions.add_portions", { item: "SOUP", quantity: 3 })
		expect(usePortionsStore().leftOf("SOUP")).toBe(3)
		expect(wrapper.emitted("close")).toHaveLength(1)
		expect(wrapper.emitted("added")[0][0]).toEqual({ code: "SOUP", quantity: 3 })
	})

	it("adds another number from the field, a whole number above zero only", async () => {
		call.mockResolvedValue({ message: { made: 12, sold: 5, left: 7 } })
		const wrapper = mountDialog()
		const confirm = wrapper.get("[data-test=add-portions-confirm]")
		expect(confirm.attributes("disabled")).toBeDefined()

		await wrapper.get("[data-test=add-portions-other]").setValue("2.5")
		expect(confirm.attributes("disabled")).toBeDefined()

		await wrapper.get("[data-test=add-portions-other]").setValue("7")
		expect(confirm.attributes("disabled")).toBeUndefined()
		await wrapper.get("form").trigger("submit")
		await flushPromises()

		expect(call).toHaveBeenCalledWith("pos_next.api.portions.add_portions", { item: "SOUP", quantity: 7 })
	})

	it("stays open and says why when the server refuses", async () => {
		call.mockRejectedValue(new Error("The stock of this product is managed"))
		const wrapper = mountDialog()

		await wrapper.get("[data-test=add-portions-choice-2]").trigger("click")
		await flushPromises()

		expect(wrapper.get("[data-test=add-portions-error]").text()).toBe("The stock of this product is managed")
		expect(wrapper.emitted("close")).toBeUndefined()
	})

	it("shows nothing without a product", () => {
		expect(mountDialog(null).find("[data-test=add-portions-dialog]").exists()).toBe(false)
	})
})

describe("the tile of a counted product", () => {
	const groups = [
		{
			category: null,
			items: [
				{ item_type: "Item", item: "SOUP", item_name: "Soup", price: 9.5 },
				{ item_type: "Item", item: "COLA", item_name: "Cola", price: 4.9 },
			],
		},
	]
	const mountGrid = (extra = {}) =>
		mount(RestaurantCardGrid, {
			props: {
				groups,
				stockOf: (item) => (item.item === "SOUP" ? 0 : null),
				countedBy: (item) => item.item === "SOUP",
				...extra,
			},
			global: { mocks },
		})
	const tile = (wrapper, index) => wrapper.findAll("[data-card-tile]")[index]

	it("has a « + » that adds portions, and a product that is not counted has none", async () => {
		const wrapper = mountGrid()

		expect(tile(wrapper, 1).find("[data-add-portions]").exists()).toBe(false)
		await tile(wrapper, 0).get("[data-add-portions]").trigger("click")

		expect(wrapper.emitted("add-portions")[0][0].item).toBe("SOUP")
		expect(wrapper.emitted("pick")).toBeUndefined()
	})

	it("is greyed out and marked sold out where the restaurant greys sold-out dishes out", () => {
		const wrapper = mountGrid()

		expect(tile(wrapper, 0).classes()).toContain("opacity-50")
		expect(tile(wrapper, 0).find("[data-sold-out]").exists()).toBe(true)
		expect(tile(wrapper, 1).classes()).not.toContain("opacity-50")
	})

	it("stays as it was, only marked sold out, where the restaurant does not grey out", () => {
		const wrapper = mountGrid({ greyOut: false })

		expect(tile(wrapper, 0).classes()).not.toContain("opacity-50")
		expect(tile(wrapper, 0).find("[data-sold-out]").exists()).toBe(true)
	})

	it("is picked by a tap, whatever is left (the page decides what a sold-out dish does)", async () => {
		const wrapper = mountGrid()

		await tile(wrapper, 0).trigger("click")

		expect(wrapper.emitted("pick")[0][0].item).toBe("SOUP")
	})
})

describe("the card editor's section of a product", () => {
	const answer = (more = {}) => ({ counted: false, made: null, left: null, managed_by_stock: false, ...more })
	const mountSection = async (first) => {
		call.mockResolvedValue(first)
		const wrapper = mount(ItemPortionsSection, { props: { itemCode: "SOUP" }, global: { mocks } })
		await flushPromises()
		return wrapper
	}

	it("offers to count a product that is not", async () => {
		const wrapper = await mountSection(answer())

		expect(wrapper.find("[data-test=portions-counted]").element.checked).toBe(false)
		expect(wrapper.find("[data-test=portions-made]").exists()).toBe(false)
	})

	it("counts it at once when the box is ticked", async () => {
		const wrapper = await mountSection(answer())
		call.mockResolvedValue(answer({ counted: true }))

		await wrapper.get("[data-test=portions-counted]").setValue(true)
		await flushPromises()

		expect(call).toHaveBeenLastCalledWith("pos_next.api.portions.set_portions", {
			item: "SOUP",
			counted: 1,
			made: undefined,
		})
		expect(wrapper.find("[data-test=portions-made]").exists()).toBe(true)
		expect(wrapper.get("[data-test=portions-left]").text()).toContain("nothing limits")
	})

	it("sets the portions made today and says what is left", async () => {
		const wrapper = await mountSection(answer({ counted: true }))
		call.mockResolvedValue(answer({ counted: true, made: 12, left: 12 }))

		await wrapper.get("[data-test=portions-made]").setValue("12")
		await wrapper.get("form").trigger("submit")
		await flushPromises()

		expect(call).toHaveBeenLastCalledWith("pos_next.api.portions.set_portions", {
			item: "SOUP",
			counted: 1,
			made: 12,
		})
		expect(wrapper.get("[data-test=portions-left]").text()).toBe("12 left")
	})

	it("leaves a product whose stock is managed to its stock", async () => {
		const wrapper = await mountSection(answer({ managed_by_stock: true }))

		expect(wrapper.find("[data-test=portions-by-stock]").exists()).toBe(true)
		expect(wrapper.find("[data-test=portions-counted]").exists()).toBe(false)
	})
})
