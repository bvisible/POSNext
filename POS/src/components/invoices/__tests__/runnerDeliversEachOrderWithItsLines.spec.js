/**
 * //// Neoffice — added file (no upstream equivalent). The pass delivers each order with its own lines: a table can
 * //// hold two drafts, and the server delivers only lines of the invoice it is given (NeoRestau lot 1, task 3).
 * //// Delivering a table's group sends one call per invoice; until then the group went out under its first order's
 * //// invoice with every order's lines, which the server now refuses whole.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({ Button: { template: "<button @click=\"$emit('click')\"><slot /></button>" } }))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))

const { default: RunnerOrderCard } = await import("../RunnerOrderCard.vue")

// A kitchen station's card: table T1 holds two orders, table T2 one
const STATION_CARD = {
	key: "kitchen",
	title: "Kitchen",
	subtitle: "4 items",
	stationColor: "#d68a59",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:00:00",
	items: [],
	tableGroups: [
		{
			tableName: "T1",
			invoiceName: "SINV-1",
			items: [
				{ name: "line-1a", item_name: "Soup", qty: 1, _invoiceName: "SINV-1" },
				{ name: "line-2a", item_name: "Steak", qty: 1, _invoiceName: "SINV-2" },
				{ name: "line-1b", item_name: "Bread", qty: 1, _invoiceName: "SINV-1" },
			],
		},
		{
			tableName: "T2",
			invoiceName: "SINV-3",
			items: [{ name: "line-3a", item_name: "Salad", qty: 1, _invoiceName: "SINV-3" }],
		},
	],
}

function delivered() {
	return call.mock.calls
		.filter(([method]) => method === "pos_next.api.restaurant.mark_items_delivered")
		.map(([, params]) => [params.invoice_name, JSON.parse(params.item_names)])
		.sort(([a], [b]) => a.localeCompare(b))
}

describe("the pass delivers each order with its own lines", () => {
	beforeEach(() => {
		call.mockClear()
	})

	it("delivers a table's group invoice by invoice", async () => {
		const wrapper = mount(RunnerOrderCard, {
			props: { card: STATION_CARD, viewMode: "station" },
			global: { mocks: { __: globalThis.__ } },
		})
		// The first "Deliver" of the card is table T1's
		await wrapper.findAll("button").find((button) => button.text() === "Deliver").trigger("click")
		await flushPromises()

		expect(delivered()).toEqual([
			["SINV-1", ["line-1a", "line-1b"]],
			["SINV-2", ["line-2a"]],
		])
	})

	it("delivers a whole station card invoice by invoice", async () => {
		const wrapper = mount(RunnerOrderCard, {
			props: { card: STATION_CARD, viewMode: "station" },
			global: { mocks: { __: globalThis.__ } },
		})
		await wrapper.vm.markDelivered()
		await flushPromises()

		expect(delivered()).toEqual([
			["SINV-1", ["line-1a", "line-1b"]],
			["SINV-2", ["line-2a"]],
			["SINV-3", ["line-3a"]],
		])
	})

	it("delivers a line that names no invoice with its group's", async () => {
		const wrapper = mount(RunnerOrderCard, {
			props: { card: STATION_CARD, viewMode: "station" },
			global: { mocks: { __: globalThis.__ } },
		})
		await wrapper.vm.deliverTableGroup({ tableName: "T9", invoiceName: "SINV-9", items: [{ name: "line-9" }] })
		await flushPromises()

		expect(delivered()).toEqual([["SINV-9", ["line-9"]]])
	})
})
