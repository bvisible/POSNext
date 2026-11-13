//// Neoffice — added file (no upstream equivalent). The line a package pays when « Use » is pressed on its banner (NeoSalon lots G11, voie 1): the chosen line when the package can pay it,
//// else the first covered line that nothing pays; none when none can be paid; the sessions other lines take come off what is left.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }));
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: { isOffline: false } }));

const { canPay, dateOf, takenByOtherLines, targetLine } = await import("../packageTarget");

const pack = { package: "CPK-1", remaining: 3, items: ["BRUSHING"], item_groups: ["Coiffure"] };
const brushing = { item_code: "BRUSHING", quantity: 1 };
const cut = { item_code: "CUT", item_group: "Coiffure", quantity: 1 };
const shampoo = { item_code: "SHAMPOO", item_group: "Produits", quantity: 1 };

describe("the line a package pays", () => {
	it("is the line the cashier chose when the package can pay it", () => {
		expect(targetLine(pack, [brushing, cut], cut)).toBe(cut);
	});

	it("is the first covered line when the chosen one cannot be paid by the package", () => {
		expect(targetLine(pack, [shampoo, brushing, cut], shampoo)).toBe(brushing);
	});

	it("is the first covered line when nothing was chosen, or the chosen line left the cart", () => {
		expect(targetLine(pack, [shampoo, brushing, cut], null)).toBe(brushing);
		expect(targetLine(pack, [brushing, cut], { item_code: "BRUSHING" })).toBe(brushing);
	});

	it("is none when no line is covered, so the button is greyed", () => {
		expect(targetLine(pack, [shampoo], null)).toBeNull();
		expect(targetLine(pack, [], null)).toBeNull();
	});

	it("skips a line a package pays already, and an offered one", () => {
		const paid = { ...brushing, customer_package: "CPK-9" };
		expect(targetLine(pack, [paid, cut], paid)).toBe(cut);
		const offered = { ...brushing, offered: true };
		expect(targetLine(pack, [offered, cut], null, (row) => row.offered)).toBe(cut);
	});

	it("counts what the other lines of the cart take of this package", () => {
		const taken = { ...cut, customer_package: "CPK-1", quantity: 2 };
		expect(takenByOtherLines(pack, [taken, brushing], brushing)).toBe(2);
		expect(canPay(pack, brushing, [taken, brushing])).toBe(true); // 3 left, 2 taken, 1 asked
		const twice = { ...brushing, quantity: 2 };
		expect(canPay(pack, twice, [taken, twice])).toBe(false); // 3 left, 2 taken, 2 asked
	});

	it("needs sessions left", () => {
		expect(canPay({ ...pack, remaining: 0 }, brushing, [brushing])).toBe(false);
	});
});

describe("the end of validity", () => {
	it("reads day first, as the board writes it", () => {
		expect(dateOf("2027-11-10")).toBe("10-11-2027");
		expect(dateOf("2027-11-10 00:00:00")).toBe("10-11-2027");
	});

	it("is nothing for a package with no end", () => {
		expect(dateOf(null)).toBe("");
		expect(dateOf("")).toBe("");
	});
});
