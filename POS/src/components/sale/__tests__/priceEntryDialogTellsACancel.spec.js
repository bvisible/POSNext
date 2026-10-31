/**
 * //// Neoffice — added file (no upstream equivalent). The price of an open-price dish is typed on a numpad
 * //// (PriceEntryDialog). A dish a waiter's long press added on a phone waits in the order at 0.00 for that price: when
 * //// the price is cancelled, the till takes the dish back, as a touch on such a dish never leaves one at 0.00
 * //// (NeoRestau lot 1, task 27, fix round 1). The dialog says so to whoever opened it, and only then.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

vi.hoisted(() => {
	globalThis.__ = (text) => text
})

// frappe-ui's Dialog, reduced to its v-model: what the till does when it closes is what is tested here
vi.mock("frappe-ui", async () => {
	const { defineComponent, h } = await import("vue")
	return {
		Dialog: defineComponent({
			props: { modelValue: Boolean, options: Object },
			emits: ["update:modelValue"],
			setup(props, { slots, emit }) {
				return () =>
					props.modelValue
						? h("div", { "data-dialog": "" }, [
								slots["body-content"]?.(),
								h("button", { "data-dismiss": "", onClick: () => emit("update:modelValue", false) }),
							])
						: null
			},
		}),
	}
})
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileCurrency: "CHF" }) }))

const { default: PriceEntryDialog } = await import("../PriceEntryDialog.vue")

const SOUP = { item_code: "SOUP", item_name: "Soup of the day", rate: 0 }
let wrapper

function dialog() {
	wrapper = mount(PriceEntryDialog, { global: { mocks: { __: globalThis.__ } } })
	return wrapper
}

const key = (text) => wrapper.findAll("button").find((button) => button.text() === text)

afterEach(() => wrapper?.unmount())

describe("the price of an open-price dish", () => {
	it("tells whoever asked when it is closed without a price", async () => {
		dialog()
		const onCancel = vi.fn()
		wrapper.vm.open(SOUP, { onCancel })
		await nextTick()

		await wrapper.find("[data-dismiss]").trigger("click")

		expect(onCancel).toHaveBeenCalledTimes(1)
		expect(wrapper.emitted("price-confirmed")).toBeUndefined()
	})

	it("does not when the price is given", async () => {
		dialog()
		const onCancel = vi.fn()
		wrapper.vm.open(SOUP, { onCancel })
		await nextTick()

		await key("9").trigger("click")
		await key("Add to Cart").trigger("click")
		await nextTick()

		expect(wrapper.emitted("price-confirmed")).toEqual([[{ item: SOUP, price: 9 }]])
		expect(onCancel).not.toHaveBeenCalled()
	})

	it("opened without anyone to tell, closes as before", async () => {
		dialog()
		wrapper.vm.open(SOUP)
		await nextTick()

		await wrapper.find("[data-dismiss]").trigger("click")

		expect(wrapper.find("[data-dialog]").exists()).toBe(false)
	})
})
