//// Neoffice — added file (no upstream equivalent). The packages of sessions of the customer of the cart (NeoSalon lots G11, voie 1): the till asks the site, keeps the last answer for
//// the customer it is for, offers nothing offline or for no customer, drops an answer for a customer the cashier has left, and asks whether a line may be paid by a session.
// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	globalThis.__ = (text, args = []) =>
		(args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text);
});
const site = vi.hoisted(() => ({ call: vi.fn(), offline: false, listeners: [] }));
vi.mock("@/utils/apiWrapper", () => ({ call: (...args) => site.call(...args) }));
vi.mock("@/utils/offline/offlineState", () => ({
	offlineState: {
		get isOffline() {
			return site.offline;
		},
		subscribe(listener) {
			site.listeners.push(listener);
			return () => {};
		},
	},
}));

const { covers, useCustomerPackagesStore } = await import("../customerPackages");

const brushing = {
	package: "CPK-1",
	title: "Forfait 10 brushings",
	remaining: 7,
	total: 10,
	valid_till: "2027-11-10",
	items: ["BRUSHING"],
	item_groups: ["Soins"],
};
const spent = { ...brushing, package: "CPK-2", remaining: 0 };

let store;
beforeEach(() => {
	setActivePinia(createPinia());
	site.call.mockReset();
	site.offline = false;
	store = useCustomerPackagesStore();
});

describe("the packages of the customer of the cart", () => {
	it("are read for a named customer, with whether the site sells packages", async () => {
		site.call.mockResolvedValue({ message: { available: true, packages: [brushing] } });

		await store.load("Till", "CUST-1");

		expect(site.call).toHaveBeenCalledWith("pos_next.api.packages.get_customer_packages", {
			pos_profile: "Till",
			customer: "CUST-1",
		});
		expect([store.available, store.usable, store.packages.length]).toEqual([true, true, 1]);
	});

	it("are nothing for no customer, a till with no profile, and offline: nothing is asked", async () => {
		for (const [profile, who, offline] of [
			["Till", "", false],
			["Till", "  ", false],
			["", "CUST-1", false],
			["Till", "CUST-1", true],
		]) {
			site.offline = offline;
			await store.load(profile, who);
			expect(store.usable).toBe(false);
		}
		expect(site.call).not.toHaveBeenCalled();
	});

	it("are not available where the site does not sell them, and not when the site cannot be reached", async () => {
		site.call.mockResolvedValue({ message: { available: false, packages: [] } });
		await store.load("Till", "CUST-1");
		expect(store.available).toBe(false);

		site.call.mockRejectedValue(new Error("boom"));
		await store.load("Till", "CUST-1");
		expect([store.available, store.packages]).toEqual([false, []]);
	});

	it("a customer with no package is available and has an empty list: nothing to offer", async () => {
		site.call.mockResolvedValue({ message: { available: true, packages: [] } });
		await store.load("Till", "CUST-1");

		expect([store.available, store.usable]).toEqual([true, false]);
	});

	it("drops an answer for a customer the cashier has left", async () => {
		let late;
		site.call.mockImplementationOnce(() => new Promise((resolve) => (late = resolve)));
		const first = store.load("Till", "CUST-1");
		await store.load("Till", "");
		late({ message: { available: true, packages: [brushing] } });
		await first;

		expect(store.packages).toEqual([]);
		expect(store.customer).toBe("");
	});

	it("cover a line by its item or by its group, and are offered for a line only while a session is left", async () => {
		expect(covers(brushing, { item_code: "BRUSHING" })).toBe(true);
		expect(covers(brushing, { item_code: "OTHER", item_group: "Soins" })).toBe(true);
		expect(covers(brushing, { item_code: "OTHER", item_group: "Colour" })).toBe(false);
		expect(covers(null, { item_code: "BRUSHING" })).toBe(false);

		site.call.mockResolvedValue({ message: { available: true, packages: [spent, brushing] } });
		await store.load("Till", "CUST-1");
		expect(store.anyCovers({ item_code: "BRUSHING" })).toBe(true);
		site.call.mockResolvedValue({ message: { available: true, packages: [spent] } });
		await store.load("Till", "CUST-1");
		expect(store.anyCovers({ item_code: "BRUSHING" })).toBe(false);
	});
});

describe("whether a line may be paid by a session", () => {
	beforeEach(async () => {
		site.call.mockResolvedValue({ message: { available: true, packages: [brushing] } });
		await store.load("Till", "CUST-1");
		site.call.mockReset();
	});

	it("asks the site with what the till knows, and keeps an agreement only when the site says yes", async () => {
		const yes = {
			ok: true,
			line: { customer_package: "CPK-1", discount_percentage: 100 },
			remaining_after: 6,
			label: "Settled by the package · 1 session",
		};
		site.call.mockResolvedValue({ message: yes });

		const answer = await store.check(
			"Till",
			brushing,
			{ item_code: "BRUSHING", quantity: 2 },
			3
		);

		expect(site.call).toHaveBeenCalledWith("pos_next.api.packages.check_package_use", {
			pos_profile: "Till",
			customer: "CUST-1",
			package: "CPK-1",
			item_code: "BRUSHING",
			qty: 2,
			in_cart: 3,
		});
		expect(answer).toEqual(yes);
	});

	it("says why not, and a failure of the call is a refusal", async () => {
		site.call.mockResolvedValue({ message: { ok: false, why: "This package has expired." } });
		expect(await store.check("Till", brushing, { item_code: "BRUSHING" })).toEqual({
			ok: false,
			why: "This package has expired.",
		});

		site.call.mockRejectedValue(new Error("Not permitted"));
		expect(await store.check("Till", brushing, { item_code: "BRUSHING" })).toEqual({
			ok: false,
			why: "Not permitted",
		});
	});
});

//// Neoffice — the audit of 18.11 (NeoSalon lots G11, voie 4)
describe("what the till does with a slow, a refusing or a returning site", () => {
	it("asks again when the till is back online, for the customer the cart is for, and not before", async () => {
		site.offline = true;
		await store.load("Till", "CUST-1");
		expect(store.usable).toBe(false);

		site.offline = false;
		site.call.mockResolvedValue({ message: { available: true, packages: [brushing] } });
		for (const listener of site.listeners) listener({ isOffline: false, transition: null });
		await Promise.resolve();
		expect(site.call).not.toHaveBeenCalled();

		for (const listener of site.listeners) listener({ isOffline: false, transition: "went-online" });
		await vi.waitFor(() => expect(store.packages).toHaveLength(1));
		expect(site.call).toHaveBeenCalledWith("pos_next.api.packages.get_customer_packages", {
			pos_profile: "Till",
			customer: "CUST-1",
		});
		expect(store.usable).toBe(true);
	});

	it("shows a title the site sent escaped as it is written", async () => {
		site.call.mockResolvedValue({
			message: {
				available: true,
				packages: [{ ...brushing, title: "Coupe &amp; Brushing &#233;t&eacute; &lt;3 &quot;x&quot;" }],
			},
		});
		await store.load("Till", "CUST-1");

		expect(store.packages[0].title).toBe('Coupe & Brushing été <3 "x"');
	});

	it("stops waiting for the site after a while: a question that gets no answer is a refusal that says so", async () => {
		vi.useFakeTimers();
		try {
			site.call.mockResolvedValue({ message: { available: true, packages: [brushing] } });
			await store.load("Till", "CUST-1");
			site.call.mockImplementation(() => new Promise(() => {}));

			const answer = store.check("Till", brushing, { item_code: "BRUSHING" });
			await vi.advanceTimersByTimeAsync(16000);

			expect(await answer).toEqual({ ok: false, why: "The till did not get an answer in time." });
		} finally {
			vi.useRealTimers();
		}
	});

	it("reads the packages again after a refusal (the sessions or the validity may have moved), and keeps what it had when that fails", async () => {
		site.call.mockResolvedValue({ message: { available: true, packages: [brushing] } });
		await store.load("Till", "CUST-1");
		site.call.mockReset();
		site.call.mockImplementation(async (method) =>
			method.endsWith("check_package_use")
				? { message: { ok: false, why: "This package has no session left." } }
				: { message: { available: true, packages: [{ ...brushing, remaining: 0 }] } }
		);

		const answer = await store.check("Till", brushing, { item_code: "BRUSHING" });

		expect(answer.ok).toBe(false);
		expect(store.packages[0].remaining).toBe(0);

		site.call.mockImplementation(async (method) => {
			if (method.endsWith("check_package_use")) return { message: { ok: false, why: "No." } };
			throw new Error("gone");
		});
		await store.check("Till", brushing, { item_code: "BRUSHING" });
		expect(store.packages).toHaveLength(1);
		expect(store.usable).toBe(true);
	});

	it("does not read again after a yes", async () => {
		site.call.mockResolvedValue({ message: { available: true, packages: [brushing] } });
		await store.load("Till", "CUST-1");
		site.call.mockReset();
		site.call.mockResolvedValue({ message: { ok: true, label: "Settled by the package · 1 session", remaining_after: 6 } });

		await store.check("Till", brushing, { item_code: "BRUSHING" });

		expect(site.call).toHaveBeenCalledTimes(1);
	});

	it("offers nothing while the till is offline, and asks again when it is back", async () => {
		site.call.mockResolvedValue({ message: { available: true, packages: [brushing] } });
		await store.load("Till", "CUST-1");
		expect(store.usable).toBe(true);

		for (const listener of site.listeners) listener({ isOffline: true, transition: "went-offline" });
		expect(store.usable).toBe(false);
		expect(store.packages).toEqual([]);

		site.offline = false;
		for (const listener of site.listeners) listener({ isOffline: false, transition: "went-online" });
		await vi.waitFor(() => expect(store.usable).toBe(true));
	});

	it("says the till could not reach the site, in its own words, when the request never got there", async () => {
		site.call.mockResolvedValue({ message: { available: true, packages: [brushing] } });
		await store.load("Till", "CUST-1");
		site.call.mockReset();
		site.call.mockRejectedValue(new TypeError("Failed to fetch"));

		const answer = await store.check("Till", brushing, { item_code: "BRUSHING" });

		expect(answer).toEqual({ ok: false, why: "The till could not reach the site." });
	});
});
