//// Neoffice — added file (no upstream equivalent). The total of a cart line keeps an ink of its own in the dark theme (13.11.2026): it was a fixed dark blue, the colour of the dark panel behind it,
//// and the total of every line vanished (seen at the till with a line paid by a package). The cart is read as text: its rendering needs a browser, this needs only the rule.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../InvoiceCart.vue", import.meta.url), "utf8");

describe("the total of a cart line", () => {
	it("has a dark-theme ink next to its fixed dark one", () => {
		const total = source.match(
			/<div data-cart-total[^>]*>\s*(?:<!--[\s\S]*?-->\s*)?<div class="([^"]*)"/
		);

		expect(total, "the total of a cart line is no longer where the test looks").not.toBeNull();
		expect(total[1]).toContain("text-[#1d2433]");
		expect(total[1]).toMatch(/\bdark:text-/);
	});
});
