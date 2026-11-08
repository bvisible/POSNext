/**
 * //// Neoffice — added file (no upstream equivalent). The tickets held on the device, to look at and to delete by choice (NeoResto lot 1, the product owner, 08.11.2026: « savoir ce qu'on veut
 * //// supprimer, garder ou cocher, décocher »): a checkbox on each, one to select all, a deletion that asks a second tap, and the ones left unchecked stay.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const world = vi.hoisted(() => ({
	deleted: [],
	returned: [],
	loaded: 0,
	cartDraft: null,
	fail: false,
	toasts: { success: [], error: [] },
}))

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

vi.mock("@/utils/draftManager", () => ({
	deleteDraft: vi.fn(async (id) => {
		if (world.fail) throw new Error("down")
		world.deleted.push(id)
	}),
}))
vi.mock("@/stores/posCart", () => ({
	usePOSCartStore: () => ({
		get currentDraftId() {
			return world.cartDraft
		},
	}),
}))
vi.mock("@/stores/posDrafts", () => ({
	usePOSDraftsStore: () => ({
		returnDraftSerials: (draft) => world.returned.push(draft.draft_id),
		loadDrafts: async () => {
			world.loaded += 1
		},
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: (text) => world.toasts.success.push(text),
		showError: (text) => world.toasts.error.push(text),
	}),
}))

import HeldTicketsList from "../HeldTicketsList.vue"

const ticket = (id, extra = {}) => ({
	id,
	table: "",
	customer: "",
	lines: 2,
	total: 12.5,
	since: "2026-11-08T12:00:00",
	draft: { draft_id: id },
	...extra,
})

const show = async (tickets = [ticket("A"), ticket("B"), ticket("C")]) => {
	const wrapper = mount(HeldTicketsList, {
		props: { tickets, formatMoney: (value) => `CHF ${value}`, tableLabel: (table) => `Table ${table}` },
		global: { mocks: { __ } },
	})
	await flushPromises()
	return wrapper
}
const checks = (wrapper) => wrapper.findAll('[data-test="held-ticket-check"]')
const deleteButton = (wrapper) => wrapper.get('[data-test="held-ticket-delete"]')

beforeEach(() => {
	Object.assign(world, { deleted: [], returned: [], loaded: 0, cartDraft: null, fail: false, toasts: { success: [], error: [] } })
})

describe("the list", () => {
	it("shows each ticket with its lines and its total, named by its table or its customer or Walk-in", async () => {
		const wrapper = await show([
			ticket("A", { table: "T4" }),
			ticket("B", { customer: "Madame Test" }),
			ticket("C"),
		])
		const rows = wrapper.findAll('[data-test="held-ticket"]')

		expect(rows[0].text()).toContain("Table T4")
		expect(rows[0].text()).toContain("2 lines")
		expect(rows[0].text()).toContain("CHF 12.5")
		expect(rows[1].text()).toContain("Madame Test")
		expect(rows[2].text()).toContain("Walk-in")
	})

	it("shows nothing for no ticket", async () => {
		const wrapper = await show([])

		expect(wrapper.find('[data-test="held-tickets-list"]').exists()).toBe(false)
	})

	it("says the tickets left unchecked stay on the device", async () => {
		expect((await show()).text()).toContain("The tickets left unchecked stay on this device.")
	})
})

describe("choosing", () => {
	it("starts with nothing chosen, so that nothing can be deleted by a stray tap", async () => {
		const wrapper = await show()

		expect(checks(wrapper).every((box) => !box.element.checked)).toBe(true)
		expect(deleteButton(wrapper).attributes("disabled")).toBeDefined()
	})

	it("chooses one ticket, then another, and unchecks", async () => {
		const wrapper = await show()

		await checks(wrapper)[0].setValue(true)
		await checks(wrapper)[2].setValue(true)
		expect(checks(wrapper).map((box) => box.element.checked)).toEqual([true, false, true])
		await checks(wrapper)[0].setValue(false)
		expect(checks(wrapper).map((box) => box.element.checked)).toEqual([false, false, true])
	})

	it("chooses all of them at once, and none", async () => {
		const wrapper = await show()

		await wrapper.get('[data-test="held-ticket-all"]').setValue(true)
		expect(checks(wrapper).every((box) => box.element.checked)).toBe(true)
		await wrapper.get('[data-test="held-ticket-all"]').setValue(false)
		expect(checks(wrapper).every((box) => !box.element.checked)).toBe(true)
	})
})

describe("deleting the choice", () => {
	it("asks a second tap, and deletes only the tickets chosen", async () => {
		const wrapper = await show()
		await checks(wrapper)[0].setValue(true)
		await checks(wrapper)[1].setValue(true)

		await deleteButton(wrapper).trigger("click")
		expect(deleteButton(wrapper).text()).toBe("Confirm: delete 2")
		expect(world.deleted).toEqual([])

		await deleteButton(wrapper).trigger("click")
		await flushPromises()

		expect(world.deleted).toEqual(["A", "B"])
		expect(world.returned).toEqual(["A", "B"])
		expect(world.loaded).toBe(1)
		expect(world.toasts.success).toEqual(["2 held tickets deleted"])
		expect(wrapper.emitted("changed")).toHaveLength(1)
	})

	it("asks again when the choice changes after the first tap", async () => {
		const wrapper = await show()
		await checks(wrapper)[0].setValue(true)
		await deleteButton(wrapper).trigger("click")

		await checks(wrapper)[1].setValue(true)

		expect(deleteButton(wrapper).text()).toBe("Delete the selection")
		expect(world.deleted).toEqual([])
	})

	it("keeps the serials of the ticket open in the cart in the cart", async () => {
		world.cartDraft = "A"
		const wrapper = await show()
		await checks(wrapper)[0].setValue(true)
		await checks(wrapper)[1].setValue(true)

		await deleteButton(wrapper).trigger("click")
		await deleteButton(wrapper).trigger("click")
		await flushPromises()

		expect(world.deleted).toEqual(["A", "B"])
		expect(world.returned).toEqual(["B"])
	})

	it("says it failed, and tells the parent nothing changed", async () => {
		world.fail = true
		const wrapper = await show()
		await checks(wrapper)[0].setValue(true)

		await deleteButton(wrapper).trigger("click")
		await deleteButton(wrapper).trigger("click")
		await flushPromises()

		expect(world.toasts.error).toEqual(["Failed to delete draft"])
		expect(wrapper.emitted("changed")).toBeUndefined()
	})

	it("drops a ticket deleted elsewhere from the choice", async () => {
		const wrapper = await show()
		await checks(wrapper)[0].setValue(true)

		await wrapper.setProps({ tickets: [ticket("B"), ticket("C")] })

		expect(deleteButton(wrapper).attributes("disabled")).toBeDefined()
	})
})
