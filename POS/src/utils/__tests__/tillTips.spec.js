/**
 * //// Neoffice — added file (no upstream equivalent). Which tip settings a payment dialog follows: a restaurant till its
 * restaurant's, a shop till its own.
 */
import { describe, expect, it } from "vitest";
import { tipRules } from "@/utils/tillTips";

const off = {
	restaurantMode: false,
	restaurantTips: false,
	restaurantAutoDetect: true,
	tillTips: false,
	tillAutoDetect: false,
};

describe("tipRules", () => {
	it("offers no tip to a shop till that did not ask for them", () => {
		expect(tipRules(off)).toEqual({ available: false, autoDetect: false });
	});

	it("offers the change as a tip to a shop till that asked for them, by a button", () => {
		expect(tipRules({ ...off, tillTips: true })).toEqual({
			available: true,
			autoDetect: false,
		});
	});

	it("turns the change into the tip by itself when the shop till says so", () => {
		expect(tipRules({ ...off, tillTips: true, tillAutoDetect: true })).toEqual({
			available: true,
			autoDetect: true,
		});
	});

	it("never detects a tip on a shop till whose tips are off, whatever its detection says", () => {
		expect(tipRules({ ...off, tillTips: false, tillAutoDetect: true }).autoDetect).toBe(false);
	});

	it("follows the restaurant on a restaurant till, and ignores the till's own tip settings", () => {
		const restaurant = { ...off, restaurantMode: true, tillTips: true, tillAutoDetect: true };
		expect(tipRules(restaurant)).toEqual({ available: false, autoDetect: true });
		expect(tipRules({ ...restaurant, restaurantTips: true })).toEqual({
			available: true,
			autoDetect: true,
		});
		expect(
			tipRules({ ...restaurant, restaurantTips: true, restaurantAutoDetect: false })
		).toEqual({
			available: true,
			autoDetect: false,
		});
	});
});
