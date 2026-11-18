//// Neoffice — added file (no upstream equivalent). The banners of the packages of the customer, under the customer (NeoSalon lots G11, voie 1; the board « Use a package at the till »): title,
//// sessions left and until when, a « Use » that hands the package and its line to the cart, greyed with no line, one banner per package in the site's order, none for an empty package.
// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

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

	it("shows one banner per package in the order the site gives, none for a package with nothing left", () => {
		const wrapper = mountIt({
			packages: [brushing, empty, massage],
			rows: [line, { item_code: "MASSAGE", quantity: 1 }],
		});

		expect(
			wrapper
				.findAll('[data-test^="package-banner-CPK"]')
				.map((node) => node.attributes("data-test"))
		).toEqual(["package-banner-CPK-1", "package-banner-CPK-2"]);
	});

	// The contract of the site (note 21, one writer: the reservation): the packages come by end date, the first to end first, the ones with no end last. The till sorts
	// nothing: this holds the first banner to the first to end, against data in the contract's order, never against a list the test sorts itself.
	it("puts the first package to end on top, as the contract of the site gives them", () => {
		const soon = { ...brushing, package: "CPK-A", title: "Ends soon", valid_till: "2026-12-01" };
		const late = { ...brushing, package: "CPK-B", title: "Ends late", valid_till: "2027-06-01" };
		const never = { ...massage, package: "CPK-C", title: "Never ends", items: ["BRUSHING"] };
		const wrapper = mountIt({ packages: [soon, late, never] });

		const titles = wrapper.findAll('[data-test="package-banner-title"]').map((node) => node.text());
		expect(titles).toEqual(["Ends soon", "Ends late", "Never ends"]);
		expect(titles[0]).toBe("Ends soon");
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

//// Neoffice — the audit of 18.11 (NeoSalon lots G11, voie 4)
describe("the banner of a package and what the cart already takes", () => {
	afterEach(() => vi.useRealTimers());

	it("counts the sessions the lines of the cart already take", () => {
		const paid = { item_code: "BRUSHING", quantity: 1, customer_package: "CPK-1" };
		const wrapper = mountIt({ rows: [paid, line] });

		expect(wrapper.get('[data-test="package-banner-left"]').text()).toBe(
			"6 sessions left after this cart · until 10-11-2027"
		);
	});

	it("says one session left after the cart in the singular, and keeps « Use » greyed when the cart takes them all", () => {
		const twoLeft = { ...brushing, remaining: 2 };
		const paid = { item_code: "BRUSHING", quantity: 1, customer_package: "CPK-1" };
		expect(
			mountIt({ packages: [twoLeft], rows: [paid, line] })
				.get('[data-test="package-banner-left"]')
				.text()
		).toContain("1 session left after this cart");

		const allTaken = mountIt({ packages: [twoLeft], rows: [{ ...paid, quantity: 2 }, line] });
		expect(allTaken.get('[data-test="package-banner-left"]').text()).toContain(
			"0 sessions left after this cart"
		);
		expect(allTaken.get('[data-test="package-banner-use"]').attributes("disabled")).toBeDefined();
	});

	it("shows no banner for a package past its last day, and one on its last day", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 10, 18, 9, 0));

		expect(mountIt({ packages: [{ ...brushing, valid_till: "2026-11-17" }] }).find('[data-test="package-banners"]').exists()).toBe(false);
		expect(mountIt({ packages: [{ ...brushing, valid_till: "2026-11-18" }] }).find('[data-test="package-banners"]').exists()).toBe(true);
	});

	it("is drawn for a touch surface: the button 44 px high on one line, the words 14 px or more", () => {
		const wrapper = mountIt();
		const button = wrapper.get('[data-test="package-banner-use"]');

		expect(button.classes()).toEqual(expect.arrayContaining(["min-h-[44px]", "whitespace-nowrap", "text-[14px]"]));
		// frappe-ui's text-sm is 13 px, under the touch surface's minimum: the size is written
		expect(wrapper.get('[data-test="package-banner-title"]').classes()).toContain("text-[14px]");
		expect(wrapper.get('[data-test="package-banner-left"]').classes()).toContain("text-[14px]");
	});

	it("never cuts the end date across two lines: it stands in a span that does not break", () => {
		const wrapper = mountIt({ rows: [{ item_code: "BRUSHING", quantity: 1, customer_package: "CPK-1" }, line] });

		expect(wrapper.get('[data-test="package-banner-left"] span.whitespace-nowrap').text()).toBe("10-11-2027");
		expect(wrapper.get('[data-test="package-banner-left"]').text()).toBe("6 sessions left after this cart · until 10-11-2027");
	});
});
