//// Neoffice — added file (no upstream equivalent). The banners of the packages of the customer, under the customer (NeoSalon lots G11, voie 1; the board « Use a package at the till »): title,
//// sessions left and until when, a « Use » that hands the package and its line to the cart, greyed with no line, one banner per package in the site's order, none for an empty package.
// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	globalThis.__ = (text, args = []) =>
		(args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text);
});

vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }));
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: { isOffline: false } }));

const { default: PackageBanners } = await import("../PackageBanners.vue");

const brushing = {
	package: "CPK-1",
	title: "Forfait 10 brushings",
	remaining: 7,
	total: 10,
	valid_till: "2027-11-10",
	items: ["BRUSHING"],
	item_groups: [],
};
const massage = {
	package: "CPK-2",
	title: "Forfait massages",
	remaining: 1,
	total: 6,
	valid_till: null,
	items: ["MASSAGE"],
	item_groups: [],
};
const empty = {
	package: "CPK-3",
	title: "Forfait vide",
	remaining: 0,
	total: 5,
	valid_till: null,
	items: ["BRUSHING"],
	item_groups: [],
};
const line = { item_code: "BRUSHING", quantity: 1 };

const mountIt = (props = {}) =>
	mount(PackageBanners, {
		props: { packages: [brushing], rows: [line], ...props },
		global: { mocks: { __: globalThis.__ } },
	});

describe("the banner of a package", () => {
	it("says the title, the sessions left and until when, as the board does", () => {
		const wrapper = mountIt();

		expect(wrapper.get('[data-test="package-banner-title"]').text()).toBe(
			"Forfait 10 brushings"
		);
		expect(wrapper.get('[data-test="package-banner-left"]').text()).toBe(
			"7 sessions left · until 10-11-2027"
		);
	});

	it("says one session left in the singular, and no end when the package has none", () => {
		const wrapper = mountIt({
			packages: [massage],
			rows: [{ item_code: "MASSAGE", quantity: 1 }],
		});

		expect(wrapper.get('[data-test="package-banner-left"]').text()).toBe("1 session left");
	});

	it("hands the package and the line it would pay to the cart when « Use » is pressed", async () => {
		const wrapper = mountIt();

		await wrapper.get('[data-test="package-banner-use"]').trigger("click");

		expect(wrapper.emitted("use")[0][0]).toEqual({ pack: brushing, row: line });
	});

	it("greys « Use » when no line of the cart is covered, and says why on hover", () => {
		const wrapper = mountIt({ rows: [{ item_code: "SHAMPOO", quantity: 1 }] });
		const button = wrapper.get('[data-test="package-banner-use"]');

		expect(button.attributes("disabled")).toBeDefined();
		expect(button.attributes("title")).toBe("No line of the cart is paid by this package.");
	});

	it("greys « Use » while the site is asked about this package", () => {
		const wrapper = mountIt({ busy: "CPK-1" });

		expect(
			wrapper.get('[data-test="package-banner-use"]').attributes("disabled")
		).toBeDefined();
	});

	it("pays the line the cashier chose, not the first one, when the package covers both", async () => {
		const second = { item_code: "BRUSHING", quantity: 1, note: "second" };
		const wrapper = mountIt({ rows: [line, second], chosen: second });

		await wrapper.get('[data-test="package-banner-use"]').trigger("click");

		expect(wrapper.emitted("use")[0][0].row.note).toBe("second");
	});

	it("shows one banner per package in the order the site gave, none for a package with nothing left", () => {
		const wrapper = mountIt({
			packages: [massage, empty, brushing],
			rows: [line, { item_code: "MASSAGE", quantity: 1 }],
		});

		expect(
			wrapper
				.findAll('[data-test^="package-banner-CPK"]')
				.map((node) => node.attributes("data-test"))
		).toEqual(["package-banner-CPK-2", "package-banner-CPK-1"]);
	});

	it("shows the words of the site under the banner it refused", () => {
		const wrapper = mountIt({ refusals: { "CPK-1": "This package has expired." } });

		expect(wrapper.get('[data-test="package-banner-why"]').text()).toBe(
			"This package has expired."
		);
	});

	it("shows nothing for a customer with no package", () => {
		expect(mountIt({ packages: [] }).find('[data-test="package-banners"]').exists()).toBe(
			false
		);
	});
});
