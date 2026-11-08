/**
 * //// Neoffice — added file (no upstream equivalent). Where the kitchen stands on a line of a paid table (NeoResto lot 1, the product owner, 08.11.2026: « une table payée n'est pas une table où les gens
 * //// sont partis », « on doit voir la table, ce qui est en cours »): the dialog of the table names, beside each line, what is cooking, what waits at the pass and what is on the table.
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text) => text
})

import { KITCHEN_TONES, isStillToServe, kitchenStateOfLine, stillToServeCount } from "../paidTableLineState"

describe("the state of a line", () => {
	it("says the kitchen's own words for the four states it knows", () => {
		expect(kitchenStateOfLine("Pending")).toMatchObject({ label: "Pending", tone: "cooking" })
		expect(kitchenStateOfLine("Preparing")).toMatchObject({ label: "Preparing", tone: "cooking" })
		expect(kitchenStateOfLine("Ready")).toMatchObject({ label: "Ready", tone: "pass" })
		expect(kitchenStateOfLine("Delivered")).toMatchObject({ label: "Delivered", tone: "done" })
	})

	it("says nothing of a line the kitchen has not received, or of a state it does not know", () => {
		for (const nothing of [undefined, null, "", "Waiting", "Cancelled", 3]) {
			expect(kitchenStateOfLine(nothing)).toBeNull()
		}
	})

	it("gives every state a look", () => {
		for (const status of ["Pending", "Preparing", "Ready", "Delivered"]) {
			expect(KITCHEN_TONES[kitchenStateOfLine(status).tone]).toEqual(expect.any(String))
		}
	})
})

describe("what is still to come", () => {
	it("is what was sent to the kitchen and not delivered", () => {
		expect(["Pending", "Preparing", "Ready"].every(isStillToServe)).toBe(true)
		expect(["Delivered", "", null, undefined, "Waiting"].some(isStillToServe)).toBe(false)
	})
})


describe("how many lines of the summary are still to come", () => {
	const line = (kds_status, preparation_station = "Kitchen") => ({ kds_status, preparation_station })

	it("counts the lines sent and not delivered, from the summary just fetched rather than from the floor's last read", () => {
		const items = [line("Delivered"), line("Pending"), line("Ready"), line("Preparing")]

		// The floor said 4 when the table was touched; a dish was delivered since
		expect(stillToServeCount(items, 4)).toBe(3)
	})

	it("is zero when the last dish has been delivered since", () => {
		expect(stillToServeCount([line("Delivered"), line("Delivered")], 2)).toBe(0)
	})

	it("does not count a line of a station that works on paper alone", () => {
		const items = [line("Pending", "Pass"), line("Pending", "Kitchen")]

		expect(stillToServeCount(items, 2, (station) => station === "Pass")).toBe(1)
	})

	it("keeps the floor's count while there is no summary", () => {
		expect(stillToServeCount(null, 2)).toBe(2)
		expect(stillToServeCount([], 2)).toBe(2)
		expect(stillToServeCount(undefined, 0)).toBe(0)
	})
})
