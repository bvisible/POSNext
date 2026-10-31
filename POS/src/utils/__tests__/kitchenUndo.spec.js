/**
 * //// Neoffice — added file (no upstream equivalent). The five seconds in which a mis-tap on « Ready » or « Deliver » can be taken back (NeoRestau lot 1, task 38a-2,
 * //// ruling 112): WHAT is put back, read without a screen. Each dish that moved goes back to the state it had, one call per item.
 */
import { describe, expect, it, vi } from "vitest"
import {
	dishesToPutBack,
	putBack,
	putBackCalls,
	UNDOABLE_STATUSES,
} from "@/utils/kitchenUndo"

describe("the dishes to put back", () => {
	it("are the ones that moved, each in the state it had before", () => {
		const dishes = [
			{ item_code: "A", kds_status: "Ready" },
			{ item_code: "B", kds_status: "Ready" },
			{ item_code: "C", kds_status: "Ready" },
		]

		expect(
			dishesToPutBack([
				{
					invoice: "SINV-1",
					dishes,
					before: ["Preparing", "Ready", "Pending"],
				},
			]),
		).toEqual([
			{ invoice: "SINV-1", item_code: "A", status: "Preparing" },
			{ invoice: "SINV-1", item_code: "C", status: "Pending" },
		])
	})

	it("leave out a dish with no item code or no state before: there is nothing to say about it", () => {
		const dishes = [
			{ kds_status: "Ready" },
			{ item_code: "B", kds_status: "Ready" },
		]

		expect(
			dishesToPutBack([
				{ invoice: "SINV-1", dishes, before: ["Preparing", undefined] },
			]),
		).toEqual([])
	})

	it("put the lines of one item back together, to the state of the first: the server moves them together", () => {
		const dishes = [
			{ item_code: "A", kds_status: "Ready" },
			{ item_code: "A", kds_status: "Ready" },
		]

		expect(
			dishesToPutBack([
				{ invoice: "SINV-1", dishes, before: ["Preparing", "Pending"] },
			]),
		).toEqual([{ invoice: "SINV-1", item_code: "A", status: "Preparing" }])
	})

	it("keep an item of two invoices apart", () => {
		const moves = ["SINV-1", "SINV-2"].map((invoice) => ({
			invoice,
			dishes: [{ item_code: "A", kds_status: "Delivered" }],
			before: ["Ready"],
		}))

		expect(dishesToPutBack(moves).map((entry) => entry.invoice)).toEqual([
			"SINV-1",
			"SINV-2",
		])
	})

	it("say nothing when nothing is given", () => {
		expect(dishesToPutBack()).toEqual([])
		expect(dishesToPutBack([{ invoice: "SINV-1" }])).toEqual([])
	})
})

describe("the calls that put them back", () => {
	const entries = [
		{ invoice: "SINV-1", item_code: "A", status: "Preparing" },
		{ invoice: "SINV-1", item_code: "B", status: "Ready" },
	]

	it("are one per item, to update_item_kds_status, which moves back as well as forward", () => {
		expect(putBackCalls(entries)).toEqual([
			[
				"pos_next.api.restaurant.update_item_kds_status",
				{ invoice_name: "SINV-1", item_code: "A", status: "Preparing" },
			],
			[
				"pos_next.api.restaurant.update_item_kds_status",
				{ invoice_name: "SINV-1", item_code: "B", status: "Ready" },
			],
		])
	})

	it("are sent in order, and stop at the first refusal by throwing", async () => {
		const call = vi.fn(async (method, params) => {
			if (params.item_code === "A") throw new Error("refused")
		})

		await expect(putBack(call, entries)).rejects.toThrow("refused")
		expect(call).toHaveBeenCalledTimes(1)
	})
})

describe("what is worth an undo", () => {
	it("is a dish that became ready or delivered, not one that was started", () => {
		expect(UNDOABLE_STATUSES).toEqual(["Ready", "Delivered"])
	})
})
