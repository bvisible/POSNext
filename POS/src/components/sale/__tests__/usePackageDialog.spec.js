//// Neoffice — added file (no upstream equivalent). « Use a package » at the till (NeoSalon lots G11, voie 1): the packages of the customer that cover the line, the sessions each
//// has left and until when, one button to pay the line with a session; the site's reason when it refuses; nothing to choose when no package covers the line.
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	globalThis.__ = (text, args = []) =>
		(args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text);
});
const site = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("frappe-ui", () => ({
	Dialog: {
		props: ["modelValue", "options"],
		template:
			'<div v-if="modelValue"><h2>{{ options.title }}</h2><slot name="body-content" /></div>',
	},
}));
vi.mock("@/utils/apiWrapper", () => ({ call: (...args) => site.call(...args) }));
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: { isOffline: false } }));

const { useCustomerPackagesStore } = await import("@/stores/customerPackages");
const { offlineState } = await import("@/utils/offline/offlineState");
const { default: UsePackageDialog } = await import("../UsePackageDialog.vue");

const brushing = {
	package: "CPK-1",
	title: "Forfait 10 brushings",
	remaining: 7,
	total: 10,
	valid_till: "2027-11-10",
	items: ["BRUSHING"],
	item_groups: [],
};
const colour = {
	package: "CPK-3",
	title: "Forfait colorations",
	remaining: 0,
	total: 5,
	valid_till: null,
	items: ["BRUSHING"],
	item_groups: [],
};
const other = {
	package: "CPK-4",
	title: "Forfait massages",
	remaining: 4,
	total: 6,
	valid_till: null,
	items: ["MASSAGE"],
	item_groups: [],
};
const line = { item_code: "BRUSHING", item_name: "Brushing", quantity: 1 };

const mountIt = (props = {}) =>
	mount(UsePackageDialog, {
		props: {
			modelValue: true,
			row: line,
			rows: [line],
			posProfile: "Till",
			customerId: "CUST-1",
			customerName: "Camille R.",
			...props,
		},
		global: { mocks: { __: globalThis.__ } },
	});
const find = (wrapper, test) => wrapper.find(`[data-test="${test}"]`);

beforeEach(() => {
	setActivePinia(createPinia());
	site.call.mockReset();
	site.call.mockResolvedValue({
		message: { available: true, packages: [brushing, colour, other] },
	});
});

describe("the use a package dialog", () => {
	it("lists the packages that cover the line, with their sessions left and their end", async () => {
		const wrapper = mountIt();
		await flushPromises();

		expect(find(wrapper, "package-subject").text()).toBe("Camille R.");
		expect(find(wrapper, "package-CPK-1").exists()).toBe(true);
		expect(find(wrapper, "package-left-CPK-1").text()).toBe("7 of 10 sessions left");
		expect(find(wrapper, "package-valid-CPK-1").text()).toBe("Valid until 10-11-2027");
		expect(find(wrapper, "package-valid-CPK-3").text()).toBe("No end date");
		// A package of another service does not pay this line
		expect(find(wrapper, "package-CPK-4").exists()).toBe(false);
	});

	it("hands the agreement to the cart when the site says yes, and closes", async () => {
		const yes = {
			ok: true,
			line: { customer_package: "CPK-1", discount_percentage: 100 },
			remaining_after: 6,
			label: "Settled by the package · 1 session",
		};
		const wrapper = mountIt();
		await flushPromises();
		site.call.mockResolvedValue({ message: yes });

		await find(wrapper, "package-use-CPK-1").trigger("click");
		await flushPromises();

		expect(wrapper.emitted("apply")[0][0]).toMatchObject({
			pack: { package: "CPK-1" },
			answer: { label: "Settled by the package · 1 session", remaining_after: 6 },
		});
		expect(wrapper.emitted("update:modelValue")[0]).toEqual([false]);
	});

	it("says the reason of the site when it refuses, and does not close", async () => {
		const wrapper = mountIt();
		await flushPromises();
		site.call.mockResolvedValue({ message: { ok: false, why: "This package has expired." } });

		await find(wrapper, "package-use-CPK-1").trigger("click");
		await flushPromises();

		expect(find(wrapper, "package-why-CPK-1").text()).toBe("This package has expired.");
		expect(wrapper.emitted("apply")).toBeUndefined();
	});

	it("cannot use a package that has no session left, nor one that has fewer than the line's quantity", async () => {
		const wrapper = mountIt({ row: { ...line, quantity: 8 }, rows: [] });
		await flushPromises();

		expect(find(wrapper, "package-use-CPK-1").attributes("disabled")).toBeDefined();
		expect(find(wrapper, "package-use-CPK-3").attributes("disabled")).toBeDefined();
		expect(find(wrapper, "package-use-CPK-1").text()).toBe("Use 8 sessions");
	});

	it("counts the sessions the other lines of the cart already take", async () => {
		const mine = { ...line };
		const other_line = { item_code: "BRUSHING", quantity: 2, customer_package: "CPK-1" };
		const wrapper = mountIt({ row: mine, rows: [mine, other_line] });
		await flushPromises();
		site.call.mockResolvedValue({ message: { ok: false, why: "x" } });

		await find(wrapper, "package-use-CPK-1").trigger("click");
		await flushPromises();

		// (the packages are read again after a refusal, so it is not the last call)
		expect(site.call).toHaveBeenCalledWith(
			"pos_next.api.packages.check_package_use",
			expect.objectContaining({ in_cart: 2 })
		);
	});

	it("says that no package pays the line when none covers it", async () => {
		const wrapper = mountIt({ row: { ...line, item_code: "COLOUR" } });
		await flushPromises();

		expect(find(wrapper, "package-none").exists()).toBe(true);
		expect(useCustomerPackagesStore().packages.length).toBe(3);
	});
});

//// Neoffice — the audit of 18.11 (NeoSalon lots G11, voie 4)
describe("the use a package dialog, as a cashier reads it", () => {
	afterEach(() => {
		offlineState.isOffline = false;
		vi.useRealTimers();
	});

	it("says it needs the network when it is opened offline, not that no package pays the line", async () => {
		offlineState.isOffline = true;
		const wrapper = mountIt();
		await flushPromises();

		expect(find(wrapper, "package-offline").text()).toBe("The packages are read from the site: they need the network.");
		expect(find(wrapper, "package-none").exists()).toBe(false);
	});

	it("says one session left in the singular", async () => {
		site.call.mockResolvedValue({ message: { available: true, packages: [{ ...brushing, remaining: 1 }] } });
		const wrapper = mountIt();
		await flushPromises();

		expect(find(wrapper, "package-left-CPK-1").text()).toBe("1 of 10 session left");
	});

	it("lists the packages in the order the site gives (the first to end first), the ones with something left before the spent ones, and keeps out a package past its last day", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(2026, 10, 18, 9, 0));
		// The site's contract: by end date, the first to end first, the ones with no end last
		site.call.mockResolvedValue({
			message: {
				available: true,
				packages: [
					{ ...brushing, package: "OLD", valid_till: "2026-11-01" },
					{ ...brushing, package: "SOON", valid_till: "2026-12-01" },
					{ ...brushing, package: "LATE", valid_till: "2027-06-01" },
					{ ...colour, package: "NO-END", remaining: 3 },
					{ ...colour, package: "SPENT", remaining: 0 },
				],
			},
		});
		const wrapper = mountIt();
		await flushPromises();

		const listed = wrapper.findAll("[data-test='package-list'] > li").map((node) => node.attributes("data-test"));
		expect(listed).toEqual(["package-SOON", "package-LATE", "package-NO-END", "package-SPENT"]);
		expect(listed[0]).toBe("package-SOON");
	});

	it("is a window of a touch surface: the sessions left and the reasons 14 px or more", async () => {
		const wrapper = mountIt();
		await flushPromises();

		// frappe-ui's text-sm is 13 px and its gray-600 reads 4.17:1: the size is written and the secondary text is a tone darker
		expect(find(wrapper, "package-left-CPK-1").classes()).toContain("text-[14px]");
		expect(find(wrapper, "package-valid-CPK-1").classes()).toEqual(expect.arrayContaining(["text-[14px]", "text-gray-700"]));
		expect(find(wrapper, "package-use-CPK-1").classes()).toContain("min-h-[48px]");
	});

	it("keeps on the list a package emptied between the list and the click, with the words of the site, greyed", async () => {
		const wrapper = mountIt();
		await flushPromises();
		// The site refuses, and no longer lists the package when the till reads them again
		site.call.mockImplementation(async (method) =>
			method.endsWith("check_package_use")
				? { message: { ok: false, why: "Ce forfait n'a plus aucune séance restante." } }
				: { message: { available: true, packages: [other] } }
		);

		await find(wrapper, "package-use-CPK-1").trigger("click");
		await flushPromises();

		expect(find(wrapper, "package-why-CPK-1").text()).toBe("Ce forfait n'a plus aucune séance restante.");
		expect(find(wrapper, "package-use-CPK-1").attributes("disabled")).toBeDefined();
		expect(find(wrapper, "package-none").exists()).toBe(false);
	});
});
