/**
 * //// Neoffice — added file (no upstream equivalent). Where the kitchen stands on a line of a paid table (NeoResto lot 1, the product owner, 08.11.2026: « une table payée n'est pas une table où les gens
 * //// sont partis », « on doit voir la table, ce qui est en cours »): the dialog of the table names, beside each line, what is cooking, what waits at the pass and what is on the table.
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text) => text
})

import { KITCHEN_TONES, isStillToServe, kitchenStateOfLine } from "../paidTableLineState"

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
