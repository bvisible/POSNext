/**
 * //// Neoffice — added file (no upstream equivalent). The sales person a sale starts with: the cashier's own, when he has one.
 */
import { describe, expect, it } from "vitest";
import { mySalesPerson } from "@/utils/mySalesPerson";

const luc = { name: "Luc", sales_person_name: "Luc", is_mine: 1 };
const sonia = { name: "Sonia", sales_person_name: "Sonia", is_mine: 0 };

describe("mySalesPerson", () => {
	it("chooses the cashier's own sales person", () => {
		expect(mySalesPerson({ enabled: true, selected: [], persons: [sonia, luc] })).toBe(luc);
	});

	it("chooses no one when the cashier is no one's sales person", () => {
		expect(
			mySalesPerson({
				enabled: true,
				selected: [],
				persons: [sonia, { ...luc, is_mine: 0 }],
			})
		).toBeNull();
	});

	it("chooses no one when the option is off", () => {
		expect(mySalesPerson({ enabled: false, selected: [], persons: [luc] })).toBeNull();
	});

	it("never replaces a person the cashier already chose", () => {
		const chosen = [{ sales_person: "Sonia", allocated_percentage: 100 }];
		expect(
			mySalesPerson({ enabled: true, selected: chosen, persons: [sonia, luc] })
		).toBeNull();
	});

	it("copes with a list that is not loaded yet", () => {
		expect(mySalesPerson({ enabled: true, selected: [], persons: undefined })).toBeNull();
		expect(mySalesPerson({ enabled: true, selected: undefined, persons: [] })).toBeNull();
	});

	it("does not read the cashier from a cached row without the flag", () => {
		// the offline cache drops `is_mine`: whoever opens the till next is not the one who loaded the list
		const cached = { name: "Luc", sales_person_name: "Luc" };
		expect(mySalesPerson({ enabled: true, selected: [], persons: [cached] })).toBeNull();
	});
});
