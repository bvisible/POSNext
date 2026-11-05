/**
 * //// Neoffice — added file (no upstream equivalent). « How many people? » (NeoResto lot 1, covers): the dialog that asks the number of people seated at a table, by itself the first time a table is opened empty and from the
 * //// header's pastille afterwards. It starts at the people already counted, else at the table's seats; big − / + buttons and a field keep it between 1 and 99; « Confirm » is the ink button of the neighbouring dialogs; the other
 * //// answer is « Later » when the question came by itself (the number stays unset, ordering is never blocked) and « Cancel » when it came from the header. Wired as the page wires it, confirming saves the number on the server only
 * //// when the order already exists.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, nextTick } from "vue"

const server = vi.hoisted(() => ({ calls: [], fail: false }))

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})
vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({})),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => {
		server.calls.push([method, args])
		if (server.fail) throw new Error("offline")
		return { covers: args.covers }
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showError: vi.fn(),
		showSuccess: vi.fn(),
		showWarning: vi.fn(),
	}),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ askCoversOnOpen: true }),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => false,
	getCachedItem: vi.fn(),
}))

const { default: CoversDialog } = await import("../CoversDialog.vue")
const { useCovers } = await import("@/composables/useCovers")
const { usePOSCartStore } = await import("@/stores/posCart")

let wrapper
function dialog(props = {}) {
	wrapper = mount(CoversDialog, {
		props: { mode: "open", ...props },
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	return wrapper
}
const find = (name) => wrapper.find(`[data-test="covers-${name}"]`)
const field = () => find("input").element
const typeNumber = async (text) => {
	await find("input").setValue(text)
}

beforeEach(() => {
	server.calls = []
	server.fail = false
})
afterEach(() => {
	wrapper?.unmount()
	wrapper = undefined
})

describe("the dialog « How many people? »", () => {
	it("asks the question in its title and is a dialog", () => {
		dialog()

		expect(find("title").text()).toBe("How many people?")
		expect(wrapper.get('[data-test="covers-dialog"]').attributes("role")).toBe(
			"dialog",
		)
		expect(
			wrapper.get('[data-test="covers-dialog"]').attributes("aria-modal"),
		).toBe("true")
	})

	it("starts at the table's seats when nobody is counted yet, and says how many seats it has", () => {
		dialog({ seats: 4 })

		expect(field().value).toBe("4")
		expect(find("seats").text()).toBe("4 seats")
	})

	it("starts at the people already counted, whatever the seats", () => {
		dialog({ seats: 4, current: 3 })

		expect(field().value).toBe("3")
		expect(find("seats").text()).toBe("4 seats")
	})

	it("starts at a couple when it knows neither, and says nothing of seats", () => {
		dialog({ seats: null, current: null })

		expect(field().value).toBe("2")
		expect(find("seats").exists()).toBe(false)
	})

	it("treats a table with no seats set (0) as one whose seats are unknown", () => {
		dialog({ seats: 0 })

		expect(field().value).toBe("2")
		expect(find("seats").exists()).toBe(false)
	})

	it("says « 1 seat » for a table of one", () => {
		dialog({ seats: 1 })

		expect(find("seats").text()).toBe("1 seat")
	})

	it("is a number field from 1 to 99 with a finger-sized stepper on each side", () => {
		dialog({ seats: 4 })

		expect(find("input").attributes("type")).toBe("number")
		expect(find("input").attributes("min")).toBe("1")
		expect(find("input").attributes("max")).toBe("99")
		for (const name of ["less", "more", "confirm"]) {
			expect(find(name).classes().join(" ")).toMatch(
				/h-\[56px\]|min-h-\[48px\]/,
			)
		}
		expect(find("less").attributes("aria-label")).toBe("One less")
		expect(find("more").attributes("aria-label")).toBe("One more")
	})
})

describe("the stepper and the field", () => {
	it("steps one by one with + and −", async () => {
		dialog({ seats: 4 })

		await find("more").trigger("click")
		expect(field().value).toBe("5")
		await find("less").trigger("click")
		await find("less").trigger("click")
		expect(field().value).toBe("3")
	})

	it("stops at 1: the − button is disabled there", async () => {
		dialog({ current: 2 })

		await find("less").trigger("click")

		expect(field().value).toBe("1")
		expect(find("less").attributes("disabled")).toBeDefined()
		await find("less").trigger("click")
		expect(field().value).toBe("1")
	})

	it("stops at 99: the + button is disabled there", async () => {
		dialog({ current: 98 })

		await find("more").trigger("click")

		expect(field().value).toBe("99")
		expect(find("more").attributes("disabled")).toBeDefined()
		await find("more").trigger("click")
		expect(field().value).toBe("99")
	})

	it("takes a number typed in the field", async () => {
		dialog({ seats: 4 })

		await typeNumber("12")
		await find("confirm").trigger("click")

		expect(wrapper.emitted("confirm")).toEqual([[12]])
	})

	it("cannot confirm an empty field, 0 or more than 99", async () => {
		dialog({ seats: 4 })

		for (const text of ["", "0", "100", "-3", "2.5"]) {
			await typeNumber(text)
			expect(find("confirm").attributes("disabled"), `"${text}"`).toBeDefined()
			await find("confirm").trigger("click")
		}

		expect(wrapper.emitted("confirm")).toBeUndefined()
	})

	it("brings a field left empty or out of bounds back to a valid number when it loses focus", async () => {
		dialog({ seats: 4 })

		await typeNumber("250")
		await find("input").trigger("blur")
		expect(field().value).toBe("99")

		await typeNumber("")
		await find("input").trigger("blur")
		expect(field().value).toBe("4")
	})

	it("steps from the number typed, and recovers from an empty field", async () => {
		dialog({ seats: 4 })

		await typeNumber("9")
		await find("more").trigger("click")
		expect(field().value).toBe("10")

		await typeNumber("")
		await find("more").trigger("click")
		expect(field().value).toBe("5")
	})

	it("confirms on Enter in the field", async () => {
		dialog({ seats: 4 })

		await typeNumber("6")
		await find("input").trigger("keydown", { key: "Enter" })

		expect(wrapper.emitted("confirm")).toEqual([[6]])
	})
})

describe("the answers", () => {
	it("confirms the number as a number", async () => {
		dialog({ seats: 4 })

		await find("confirm").trigger("click")

		expect(wrapper.emitted("confirm")).toEqual([[4]])
		expect(typeof wrapper.emitted("confirm")[0][0]).toBe("number")
	})

	it("offers « Later » when the question came by itself, and not « Cancel »", async () => {
		dialog({ mode: "open" })

		expect(find("later").text()).toBe("Later")
		expect(find("cancel").exists()).toBe(false)
		await find("later").trigger("click")

		expect(wrapper.emitted("later")).toHaveLength(1)
		expect(wrapper.emitted("confirm")).toBeUndefined()
	})

	it("offers « Cancel » when the question came from the header, and not « Later »", async () => {
		dialog({ mode: "change", current: 3 })

		expect(find("cancel").text()).toBe("Cancel")
		expect(find("later").exists()).toBe(false)
		await find("cancel").trigger("click")

		expect(wrapper.emitted("cancel")).toHaveLength(1)
		expect(wrapper.emitted("confirm")).toBeUndefined()
	})

	it("is dismissed by a tap beside it and by Escape as « Later » on a first opening: ordering is never blocked", async () => {
		dialog({ mode: "open" })

		await wrapper.get('[data-test="covers-dialog"]').trigger("click")
		await wrapper
			.get('[data-test="covers-dialog"]')
			.trigger("keydown", { key: "Escape" })

		expect(wrapper.emitted("later")).toHaveLength(2)
		expect(wrapper.emitted("cancel")).toBeUndefined()
	})

	it("is dismissed by a tap beside it and by Escape as « Cancel » when asked from the header", async () => {
		dialog({ mode: "change", current: 3 })

		await wrapper.get('[data-test="covers-dialog"]').trigger("click")
		await wrapper
			.get('[data-test="covers-dialog"]')
			.trigger("keydown", { key: "Escape" })

		expect(wrapper.emitted("cancel")).toHaveLength(2)
		expect(wrapper.emitted("later")).toBeUndefined()
		expect(wrapper.emitted("confirm")).toBeUndefined()
	})

	it("is not dismissed by a tap inside the card", async () => {
		dialog({ mode: "open" })

		await find("title").trigger("click")

		expect(wrapper.emitted("later")).toBeUndefined()
	})

	it("waits for the server while the number is being saved: nothing can be pressed", async () => {
		dialog({ seats: 4, mode: "change", busy: true })

		for (const name of ["less", "more", "cancel", "confirm", "input"]) {
			expect(find(name).attributes("disabled"), name).toBeDefined()
		}
		await find("confirm").trigger("click")
		expect(wrapper.emitted("confirm")).toBeUndefined()
	})

	it("puts the focus on the ink button, as the neighbouring dialogs do, so that Enter confirms", async () => {
		dialog({ seats: 4 })
		await nextTick()
		await nextTick()

		expect(document.activeElement).toBe(find("confirm").element)
	})

	it("wears the ink and paper of the design system: the primary button is the dark one, never the brand colour", () => {
		dialog({ seats: 4 })

		expect(find("confirm").classes()).toEqual(
			expect.arrayContaining(["bg-[#141414]", "text-[#FFFDF8]"]),
		)
		expect(wrapper.html()).not.toMatch(
			/\b(?:bg|text|border)-(?:blue|indigo|violet|purple|sky|cyan)/,
		)
	})
})

describe("the dialog wired as the page wires it", () => {
	// The page mounts the dialog while the cart's question is open and hands the composable's answers to it
	const Page = defineComponent({
		components: { CoversDialog },
		setup() {
			const covers = useCovers()
			const cart = usePOSCartStore()
			return { covers, cart }
		},
		template: `<CoversDialog v-if="covers.asking.value" :mode="covers.mode.value" :seats="Number(cart.restaurantTable?.capacity) || null"
			:current="cart.restaurantCovers" :busy="covers.busy.value" @confirm="covers.confirm" @later="covers.later" @cancel="covers.cancel" />`,
	})

	let cart
	let covers
	function page() {
		wrapper = mount(Page, {
			attachTo: document.body,
			global: { mocks: { __: globalThis.__ } },
		})
		return wrapper
	}
	const flush = async () => {
		for (let turn = 0; turn < 5; turn += 1) await nextTick()
		await new Promise((resolve) => setTimeout(resolve, 0))
	}

	beforeEach(() => {
		setActivePinia(createPinia())
		cart = usePOSCartStore()
		covers = useCovers()
		cart.setRestaurantTable({ name: "T1", table_name: "T1", capacity: 4 })
	})

	it("is not on screen until the question is asked", () => {
		page()

		expect(wrapper.find('[data-test="covers-dialog"]').exists()).toBe(false)
	})

	it("starts at the seats of the open table, and keeps the number in the cart without calling the server when the order is not saved", async () => {
		page()
		covers.ask("open")
		await nextTick()
		expect(field().value).toBe("4")

		await typeNumber("3")
		await find("confirm").trigger("click")
		await flush()

		expect(cart.restaurantCovers).toBe(3)
		expect(server.calls).toEqual([])
		expect(wrapper.find('[data-test="covers-dialog"]').exists()).toBe(false)
	})

	it("saves the number on the order when it already exists, and starts at the people already counted", async () => {
		cart.$patch({ currentDraftId: "SINV-0007" })
		cart.setRestaurantCovers(2)
		page()
		covers.ask("change")
		await nextTick()
		expect(field().value).toBe("2")

		await find("more").trigger("click")
		await find("confirm").trigger("click")
		await flush()

		expect(server.calls).toEqual([
			[
				"pos_next.api.restaurant.set_table_covers",
				{ invoice: "SINV-0007", covers: 3 },
			],
		])
		expect(cart.restaurantCovers).toBe(3)
		expect(wrapper.find('[data-test="covers-dialog"]').exists()).toBe(false)
	})

	it("keeps the previous number and stays open when the server refuses", async () => {
		cart.$patch({ currentDraftId: "SINV-0007" })
		cart.setRestaurantCovers(2)
		server.fail = true
		vi.spyOn(console, "error").mockImplementation(() => {})
		page()
		covers.ask("change")
		await nextTick()

		await find("more").trigger("click")
		await find("confirm").trigger("click")
		await flush()

		expect(cart.restaurantCovers).toBe(2)
		expect(wrapper.find('[data-test="covers-dialog"]').exists()).toBe(true)
		expect(find("confirm").attributes("disabled")).toBeUndefined()
	})

	it("« Later » leaves the number unset and the dialog gone, with nothing sent", async () => {
		page()
		covers.ask("open")
		await nextTick()

		await find("later").trigger("click")
		await flush()

		expect(cart.restaurantCovers).toBeNull()
		expect(server.calls).toEqual([])
		expect(wrapper.find('[data-test="covers-dialog"]').exists()).toBe(false)
	})

	it("« Cancel » leaves the number as it was", async () => {
		cart.setRestaurantCovers(5)
		page()
		covers.ask("change")
		await nextTick()

		await find("less").trigger("click")
		await find("cancel").trigger("click")
		await flush()

		expect(cart.restaurantCovers).toBe(5)
		expect(server.calls).toEqual([])
		expect(wrapper.find('[data-test="covers-dialog"]').exists()).toBe(false)
	})
})
