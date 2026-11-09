//// Neoffice — added file (no upstream equivalent). « Who serves? » above the cart (NeoSalon, lot G1, product owner, 09.11.2026).
// Luc opens his account and Luc is already chosen; the reception's shared till has nobody of its own and remembers the choice for the session of the screen.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import {
	asLinePerson,
	hasOwnPerson,
	pickWhoServes,
	rememberedWhoServes,
	rememberWhoServes,
} from "@/utils/whoServes"

const luc = { name: "Luc", sales_person_name: "Luc M.", is_mine: 1 }
const sonia = { name: "Sonia", sales_person_name: "Sonia", is_mine: 0 }

describe("who a sale starts with", () => {
	beforeEach(() => sessionStorage.clear())

	it("is the cashier's own person when the account has one, whatever was remembered", () => {
		expect(pickWhoServes({ persons: [sonia, luc], remembered: "Sonia" })).toBe(
			luc,
		)
		expect(hasOwnPerson([sonia, luc])).toBe(true)
	})

	it("is the person remembered on a shared till, which has none of its own", () => {
		expect(
			pickWhoServes({
				persons: [sonia, { ...luc, is_mine: 0 }],
				remembered: "Sonia",
			}),
		).toBe(sonia)
		expect(hasOwnPerson([sonia])).toBe(false)
	})

	it("is nobody on a shared till that remembers nobody, or someone who is no longer in the list", () => {
		expect(pickWhoServes({ persons: [sonia], remembered: null })).toBeNull()
		expect(pickWhoServes({ persons: [sonia], remembered: "Gone" })).toBeNull()
		expect(
			pickWhoServes({ persons: undefined, remembered: "Sonia" }),
		).toBeNull()
	})

	it("remembers the choice for this till and for this session of the screen only", () => {
		rememberWhoServes("Till A", "Sonia")
		expect(rememberedWhoServes("Till A")).toBe("Sonia")
		expect(rememberedWhoServes("Till B")).toBeNull()
		rememberWhoServes("Till A", null)
		expect(rememberedWhoServes("Till A")).toBeNull()
	})

	it("copes with a till that has no name yet", () => {
		rememberWhoServes("", "Sonia")
		expect(rememberedWhoServes("")).toBeNull()
	})

	it("gives a cart line the name and the display name, and nothing for nobody", () => {
		expect(asLinePerson(luc)).toEqual({
			sales_person: "Luc",
			sales_person_name: "Luc M.",
		})
		expect(asLinePerson({ name: "Sonia" })).toEqual({
			sales_person: "Sonia",
			sales_person_name: "Sonia",
		})
		expect(asLinePerson(null)).toBeNull()
	})
})
