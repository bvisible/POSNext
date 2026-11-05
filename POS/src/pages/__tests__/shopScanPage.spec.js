/**
 * //// Neoffice — added file (no upstream equivalent). The page a shop's fixed QR code opens (ShopScan.vue): a refusal is
 * //// said politely, a cart that waits for the till shows its code at once, a scanned article is said added, and a
 * //// session the server no longer takes is opened again. Paying on the phone (lot 4): the page leaves for the payment
 * //// page, and back from it shows the cart paid on the server's word, or says the payment failed.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	globalThis.__ = (msgid, args) =>
		args ? msgid.replace(/\{(\d+)\}/g, (_match, index) => args[Number(index)]) : msgid;
});

const route = vi.hoisted(() => ({ params: { key: "KEY" }, query: {}, replace: null }));
vi.mock("vue-router", () => ({
	useRoute: () => route,
	useRouter: () => ({ replace: (...args) => route.replace?.(...args) }),
}));

const server = vi.hoisted(() => ({
	openShop: vi.fn(),
	scanItem: vi.fn(),
	setLineQty: vi.fn(),
	finishCart: vi.fn(),
	payCart: vi.fn(),
	confirmPayment: vi.fn(),
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
		route.query = {};
		route.replace = vi.fn();
	});

	it("says politely that the shop does not let customers scan", async () => {
		server.openShop.mockRejectedValue(
			new ShopRefusal("Scanning in the shop is not available here.")
		);

		const text = (await page()).text();

		expect(text).toContain("Scanning in the shop is not available here.");
		expect(text).toContain("Please ask a member of our team.");
	});

	it("shows the shop's own logo top left, and its name where it has none", async () => {
		server.openShop.mockResolvedValue({
			token: "T1",
			shopName: "The shop",
			shopLogo: "/files/logo.png",
			cart: EMPTY,
		});
		const logo = (await page()).find(".shop-head__logo");
		expect(logo.attributes("src")).toBe("/files/logo.png");
		expect(logo.attributes("alt")).toBe("The shop");

		server.openShop.mockResolvedValue({ token: "T1", shopName: "The shop", shopLogo: "", cart: EMPTY });
		const named = await page();
		expect(named.find(".shop-head__logo").exists()).toBe(false);
		expect(named.find(".shop-head__name").text()).toBe("The shop");
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

	it("leaves for the payment page of the cart", async () => {
		const assign = vi.fn();
		vi.stubGlobal("location", { ...window.location, assign });
		server.openShop.mockResolvedValue({
			token: "T1",
			shopName: "The shop",
			cart: { ...EMPTY, lines: [TEA], grand_total: 10, can_pay: true },
		});
		server.payCart.mockResolvedValue({ payment_url: "https://pay.example.test/1", intent_name: "PI-1" });
		const wrapper = await page();
		await wrapper.find(".shop-head__cart").trigger("click");

		await wrapper.find(".shop-button--ink").trigger("click");
		await flushPromises();

		expect(server.payCart).toHaveBeenCalledWith("T1");
		expect(assign).toHaveBeenCalledWith("https://pay.example.test/1");
		vi.unstubAllGlobals();
	});

	it("back from the payment page, shows the cart paid on the server's word", async () => {
		route.query = { payment: "done" };
		const paid = { ...EMPTY, status: "Paid", code: "K7Q-24M", lines: [TEA], grand_total: 10, paid_amount: 10 };
		server.openShop.mockResolvedValue({ token: "T1", shopName: "The shop", cart: { ...paid, status: "At the counter" } });
		server.confirmPayment.mockResolvedValue({ status: "paid", cart: paid });

		const text = (await page()).text();

		expect(server.confirmPayment).toHaveBeenCalledWith("T1");
		expect(route.replace).toHaveBeenCalledWith({ query: {} });
		expect(text).toContain("Go to the reception to have your cart validated");
		expect(text).toContain("Paid · CHF");
		expect(text).toContain("K7Q-24M");
	});

	it("says a payment that failed, and the cart stays to pay at the till", async () => {
		route.query = { payment: "failed" };
		server.openShop.mockResolvedValue({
			token: "T1",
			shopName: "The shop",
			cart: { ...EMPTY, status: "At the counter", code: "K7Q-24M", lines: [TEA], grand_total: 10 },
		});

		const text = (await page()).text();

		expect(server.confirmPayment).not.toHaveBeenCalled();
		expect(text).toContain("The payment did not go through.");
		expect(text).toContain("Show this code to the seller");
	});
});
