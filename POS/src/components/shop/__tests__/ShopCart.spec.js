/**
 * //// Neoffice — added file (no upstream equivalent). The cart of a customer scanning in the shop (ShopCart.vue): its
 * //// lines, the till's offers, the amount to pay, and the changes it asks of the server.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	globalThis.__ = (msgid, args) =>
		args ? msgid.replace(/\{(\d+)\}/g, (_match, index) => args[Number(index)]) : msgid;
});

const { default: ShopCart } = await import("../ShopCart.vue");

const CART = {
	currency: "CHF",
	total: 41,
	discount: 2,
	grand_total: 39,
	needs_validation: false,
	lines: [
		{
			line: "L1",
			item_name: "Tea",
			qty: 2,
			price_list_rate: 10,
			rate: 9,
			amount: 18,
			discount_percentage: 10,
			is_free_item: 0,
		},
		{
			line: "L2",
			item_name: "Cup",
			qty: 1,
			price_list_rate: 21,
			rate: 21,
			amount: 21,
			discount_percentage: 0,
			is_free_item: 0,
		},
		{
			line: "L3",
			item_name: "Spoon",
			qty: 1,
			price_list_rate: 3,
			rate: 0,
			amount: 0,
			discount_percentage: 100,
			is_free_item: 1,
		},
	],
};

function cart(props = {}) {
	return mount(ShopCart, {
		props: { cart: CART, ...props },
		global: { mocks: { __: globalThis.__ } },
	});
}

describe("the cart of the shop's page", () => {
	it("shows each line, the offers and the amount to pay", () => {
		const text = cart().text();

		expect(text).toContain("Tea");
		expect(text).toContain("Offer −10 %");
		expect(text).toContain("Offered");
		expect(text).toContain("The till's offers");
		expect(text).toContain("You will pay");
		expect(text).toMatch(/39[.,]00/);
	});

	it("asks one more, and one less, of a line", async () => {
		const wrapper = cart();
		const [less, more] = wrapper.findAll(".shop-line")[0].findAll("button");

		await more.trigger("click");
		await less.trigger("click");

		expect(wrapper.emitted("qty")).toEqual([
			["L1", 3],
			["L1", 1],
		]);
	});

	it("gives a free line no stepper", () => {
		expect(cart().findAll(".shop-line")[2].findAll("button")).toHaveLength(0);
	});

	it("finishes a cart that has a line, and not an empty one", async () => {
		const full = cart();
		await full.find(".shop-button--ink").trigger("click");
		expect(full.emitted("finish")).toHaveLength(1);

		const empty = cart({
			cart: { ...CART, lines: [], total: 0, discount: 0, grand_total: 0 },
		});
		expect(empty.find(".shop-button--ink").attributes("disabled")).toBeDefined();
		expect(empty.text()).toContain("Your cart is empty.");
	});

	it("says that a seller checks an article of the cart", () => {
		expect(cart({ cart: { ...CART, needs_validation: true } }).text()).toContain(
			"A seller checks an article of your cart at the counter."
		);
	});
});
