// //// Neoffice — added file (no upstream equivalent).
/**
 * What a row of the invoice history says about its ticket (NeoRestau lot 1, task 29).
 *
 * The server sends the first three lines (`items_preview`) and the number of lines (`items_count`); a row
 * held on the device (an offline sale) carries its lines itself and gets the same preview.
 */
import { describe, expect, it } from "vitest";
import { PREVIEW_NAME_MAX, invoicePreview, truncateName } from "@/utils/invoicePreview";

const line = (item_name, qty, uom = null) => ({ item_name, qty, uom });

describe("invoicePreview", () => {
	it("joins the first three lines, quantity first, and counts what is left", () => {
		const preview = invoicePreview({
			items_preview: [
				line("Pizza Margherita", 2),
				line("Coca-Cola 33 cl", 1),
				line("Tiramisu", 1),
			],
			items_count: 5,
		});
		expect(preview.text).toBe("2× Pizza Margherita · 1× Coca-Cola 33 cl · 1× Tiramisu");
		expect(preview.hidden).toBe(2);
	});

	it("has nothing left over when the ticket has three lines or fewer", () => {
		const three = invoicePreview({
			items_preview: [line("A", 1), line("B", 1), line("C", 1)],
			items_count: 3,
		});
		expect(three.hidden).toBe(0);
		const one = invoicePreview({ items_preview: [line("Espresso", 1)], items_count: 1 });
		expect(one.text).toBe("1× Espresso");
		expect(one.hidden).toBe(0);
	});

	it("counts a single line left over as one", () => {
		const preview = invoicePreview({
			items_preview: [line("A", 1), line("B", 1), line("C", 1)],
			items_count: 4,
		});
		expect(preview.hidden).toBe(1);
	});

	it("keeps a quantity as the invoice holds it", () => {
		expect(invoicePreview({ items_preview: [line("Salmon fillet", 0.35)], items_count: 1 }).text).toBe(
			"0.35× Salmon fillet",
		);
		expect(invoicePreview({ items_preview: [line("Water", 2.0)], items_count: 1 }).text).toBe("2× Water");
		expect(invoicePreview({ items_preview: [line("Water", "3.0000")], items_count: 1 }).text).toBe(
			"3× Water",
		);
		expect(invoicePreview({ items_preview: [line("Water", 10)], items_count: 1 }).text).toBe("10× Water");
	});

	it("names the unit only when the server sends one", () => {
		const preview = invoicePreview({
			items_preview: [line("Wine", 0.75, "Litre"), line("Bread", 1)],
			items_count: 2,
		});
		expect(preview.text).toBe("0.75 Litre Wine · 1× Bread");
	});

	it("truncates a long name with an ellipsis and keeps the whole name for the tooltip", () => {
		const long = "Spaghetti alle vongole veraci con pomodorini del Piennolo e bottarga di muggine";
		const preview = invoicePreview({ items_preview: [line(long, 1), line("Cola", 2)], items_count: 2 });
		const [first] = preview.text.split(" · ");
		expect(first.startsWith("1× Spaghetti alle vongole")).toBe(true);
		expect(first.endsWith("…")).toBe(true);
		expect(first.length).toBeLessThanOrEqual(PREVIEW_NAME_MAX + 3); // "1× ", then the name, ellipsis included
		expect(preview.title).toContain(long);
		expect(preview.title).toContain("2× Cola");
	});

	it("shows nothing for a ticket with no line", () => {
		expect(invoicePreview({ items_preview: [], items_count: 0 }).text).toBe("");
		expect(invoicePreview({ items_preview: [], items_count: 0 }).hidden).toBe(0);
		expect(invoicePreview({}).text).toBe("");
		expect(invoicePreview({ items: [] }).text).toBe("");
		expect(invoicePreview(null).text).toBe("");
	});

	it("never claims more than it was told", () => {
		const preview = invoicePreview({ items_preview: [line("A", 1), line("B", 1)], items_count: 1 });
		expect(preview.hidden).toBe(0);
		const noCount = invoicePreview({ items_preview: [line("A", 1)] });
		expect(noCount.hidden).toBe(0);
	});

	it("shows a return's negative quantities as they are", () => {
		expect(invoicePreview({ items_preview: [line("Pizza", -1)], items_count: 1 }).text).toBe("-1× Pizza");
	});

	describe("a sale held on the device", () => {
		const local = [
			{ item_name: "Burger", qty: 2, uom: "Nos", stock_uom: "Nos" },
			{ item_name: "Fries", quantity: 1, uom: "Nos", stock_uom: "Nos" },
			{ item_code: "COLA", qty: 1, uom: "Box", stock_uom: "Nos" },
			{ item_name: "Pie", qty: 1, uom: "Nos", stock_uom: "Nos" },
		];

		it("takes its preview from its own lines", () => {
			const preview = invoicePreview({ name: "pos_offline_1f3a", items: local });
			expect(preview.text).toBe("2× Burger · 1× Fries · 1 Box COLA");
			expect(preview.hidden).toBe(1);
		});

		it("takes it from the queued payload when the lines sit under data", () => {
			const preview = invoicePreview({ name: "pos_offline_1f3a", data: { items: local } });
			expect(preview.text).toBe("2× Burger · 1× Fries · 1 Box COLA");
			expect(preview.hidden).toBe(1);
		});

		it("prefers what the server sent over lines it also holds", () => {
			const preview = invoicePreview({
				items: local,
				items_preview: [line("Soup", 1)],
				items_count: 1,
			});
			expect(preview.text).toBe("1× Soup");
		});
	});
});

describe("truncateName", () => {
	it("leaves a short name alone", () => {
		expect(truncateName("Tiramisu")).toBe("Tiramisu");
	});

	it("cuts at the limit, ellipsis included, without leaving a space before it", () => {
		const cut = truncateName("a".repeat(10) + " " + "b".repeat(40), 12);
		expect(cut.length).toBeLessThanOrEqual(12);
		expect(cut.endsWith("…")).toBe(true);
		expect(cut.endsWith(" …")).toBe(false);
	});

	it("tolerates a missing name", () => {
		expect(truncateName(undefined)).toBe("");
		expect(truncateName(null)).toBe("");
	});
});
