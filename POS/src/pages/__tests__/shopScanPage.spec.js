/**
 * //// Neoffice — added file (no upstream equivalent). The page a shop's fixed QR code opens (ShopScan.vue): a refusal is
 * //// said politely, a cart that waits for the till shows its code at once, a scanned article is said added, and a
 * //// session the server no longer takes is opened again.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	globalThis.__ = (msgid, args) =>
		args ? msgid.replace(/\{(\d+)\}/g, (_match, index) => args[Number(index)]) : msgid;
});

vi.mock("vue-router", () => ({ useRoute: () => ({ params: { key: "KEY" } }) }));

const server = vi.hoisted(() => ({
	openShop: vi.fn(),
	scanItem: vi.fn(),
	setLineQty: vi.fn(),
	finishCart: vi.fn(),
}));
vi.mock("@/utils/shopScan", async (original) => ({ ...(await original()), ...server }));

const { ShopRefusal } = await import("@/utils/shopScan");
const { default: ShopScan } = await import("../ShopScan.vue");

const EMPTY = {
	status: "Scanning",
	code: null,
	lines: [],
	total: 0,
	discount: 0,
	grand_total: 0,
	currency: "CHF",
};
const TEA = {
	line: "L1",
	item_name: "Tea",
	qty: 1,
	price_list_rate: 10,
	rate: 10,
	amount: 10,
	discount_percentage: 0,
	is_free_item: 0,
};

async function page() {
	const wrapper = mount(ShopScan, {
		global: {
			mocks: { __: globalThis.__ },
			// The camera is not under test here: the scanner is a stub that hands its codes to the page
			stubs: {
				ShopScanner: {
					name: "ShopScanner",
					props: ["added", "message"],
					emits: ["code", "cart"],
					template:
						"<div class='scanner'>{{ added && added.item_name }}|{{ message }}</div>",
				},
			},
		},
	});
	await flushPromises();
	return wrapper;
}

describe("the shop's page", () => {
	beforeEach(() => {
		Object.values(server).forEach((mock) => mock.mockReset());
	});

	it("says politely that the shop does not let customers scan", async () => {
		server.openShop.mockRejectedValue(
			new ShopRefusal("Scanning in the shop is not available here.")
		);

		const text = (await page()).text();

		expect(text).toContain("Scanning in the shop is not available here.");
		expect(text).toContain("Please ask a member of our team.");
	});

	it("shows the code at once for a cart that waits for the till", async () => {
		server.openShop.mockResolvedValue({
			token: "T1",
			shopName: "The shop",
			cart: {
				...EMPTY,
				status: "At the counter",
				code: "K7Q-24M",
				lines: [TEA],
				grand_total: 10,
			},
		});

		const text = (await page()).text();

		expect(text).toContain("Show this code to the seller");
		expect(text).toContain("K7Q-24M");
	});

	it("says the article it added, and a refusal in the server's words", async () => {
		server.openShop.mockResolvedValue({ token: "T1", shopName: "The shop", cart: EMPTY });
		server.scanItem
			.mockResolvedValueOnce({ ...EMPTY, lines: [TEA], grand_total: 10 })
			.mockRejectedValueOnce(new ShopRefusal("This article is not sold here."));
		const wrapper = await page();
		await wrapper.find(".shop-button--ink").trigger("click");

		wrapper.findComponent({ name: "ShopScanner" }).vm.$emit("code", "7612345678900");
		await flushPromises();
		expect(server.scanItem).toHaveBeenCalledWith("T1", "7612345678900", 1);
		expect(wrapper.find(".scanner").text()).toContain("Tea");

		wrapper.findComponent({ name: "ShopScanner" }).vm.$emit("code", "000");
		await flushPromises();
		expect(wrapper.find(".scanner").text()).toContain("This article is not sold here.");
	});

	it("opens the session again when the server no longer takes it", async () => {
		server.openShop
			.mockResolvedValueOnce({ token: "OLD", shopName: "The shop", cart: EMPTY })
			.mockResolvedValueOnce({ token: "NEW", shopName: "The shop", cart: EMPTY });
		server.scanItem.mockRejectedValueOnce(
			new ShopRefusal("This session has expired or is no longer active.", "expired")
		);
		const wrapper = await page();
		await wrapper.find(".shop-button--ink").trigger("click");

		wrapper.findComponent({ name: "ShopScanner" }).vm.$emit("code", "7612345678900");
		await flushPromises();

		expect(server.openShop).toHaveBeenCalledTimes(2);
	});
});
