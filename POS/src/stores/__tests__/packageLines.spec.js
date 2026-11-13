/**
 * //// Neoffice — added file (no upstream equivalent). A line paid by a session of a package of sessions (NeoSalon lots G11, voie 1): the cart gives the line its package at
 * //// 100 % off (the price stays, struck through, the line is worth 0.00), sends the package with the line, never merges a new unit into it, and gives the package back when
 * //// the quantity changes or the cashier gives the session back. The site counts the session when the invoice is submitted.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? String(s).replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s;
	return { sent: [], promotion: 0 };
});
const auth = vi.hoisted(() => ({ required: false, grant: null, calls: [] }));
const net = vi.hoisted(() => ({ offline: false }));
const settings = vi.hoisted(() => ({ allowItemDiscount: true }));
const toast = vi.hoisted(() => ({ warnings: [], successes: [] }));

vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: (options = {}) => ({
		submit: vi.fn(async (params) => {
			const body = options.makeParams ? options.makeParams(params) : params;
			if (String(options.url || "").includes("apply_offers")) {
				// The server receives what makeParams sends, and answers its items in the same order
				const data = JSON.parse(body.invoice_data);
				server.sent.push(data);
				return {
					items: data.items.map((item) => ({
						...item,
						discount_percentage: server.promotion,
						pricing_rules: server.promotion ? "PROMO10" : "",
					})),
					free_items: [],
					applied_pricing_rules: server.promotion ? ["PROMO10"] : [],
				};
			}
			return {};
		}),
		reload: vi.fn(),
		fetch: vi.fn(),
	}),
}));
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: (m) => toast.successes.push(m),
		showError: (m) => toast.warnings.push(m),
		showWarning: (m) => toast.warnings.push(m),
		showInfo: vi.fn(),
	}),
}));
vi.mock("@/utils/offline", () => ({
	isOffline: () => net.offline,
	getCachedItem: vi.fn(),
}));
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({
		shouldEnforceStockValidation: () => false,
		get allowItemDiscount() {
			return settings.allowItemDiscount;
		},
	}),
}));
vi.mock("@/composables/useAuthorization", () => ({
	useAuthorization: () => ({
		isAuthorizationRequired: () => auth.required,
		requireAuthorization: async (action, context, options) => {
			auth.calls.push({ action, context, options });
			return auth.grant;
		},
	}),
}));
vi.mock("@/data/session", () => ({ sessionUser: () => "cashier@example.com" }));
// The real cart pulls the offline layer in through the offers store and the network state. Left real, it starts a
// worker, a Dexie database that does not exist in jsdom, a restart timer (4 s) and a network ping, and every one of
// them logs after the file has finished: vitest then fails the whole run with "Closing rpc while onUserConsoleLog was
// pending" although all the tests passed (CI frontend-tests, 2026-11-05). Doubles keep this file to the cart.
vi.mock("@/utils/offline/offlineState", () => ({
	offlineState: { isOffline: false, getConnectionQuality: () => "good", subscribe: vi.fn() },
}));
vi.mock("@/utils/offline/workerClient", () => ({
	offlineWorker: new Proxy({}, { get: () => vi.fn(async () => null) }),
}));
vi.mock("@/utils/offline/db", () => ({
	db: {},
	getOneTimeRedemptions: vi.fn(async () => []),
	setOneTimeRedemptions: vi.fn(async () => {}),
	addOneTimeRedemptions: vi.fn(async () => {}),
}));
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}));

const { usePOSCartStore } = await import("../posCart");
const { useOfferedItemsStore } = await import("../offeredItems");
const { isOfferedRow, nestOfferedRows } = await import("@/utils/offeredRows");
const { nestFreeRows } = await import("@/utils/gwpSameItemFreeRows");
const { dropGrant } = await import("@/utils/offerApproval");

const tiramisu = {
	item_code: "TIRAMISU",
	item_name: "Tiramisu",
	rate: 9.5,
	price_list_rate: 9.5,
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
};
const espresso = {
	item_code: "ESPRESSO",
	item_name: "Espresso",
	rate: 4.2,
	price_list_rate: 4.2,
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
};
const GRANT = {
	authorized: true,
	grant_token: "TOKEN-1",
	expires_in: 900,
	approved_by: "manager@example.com",
};

function rowsOf(cart) {
	return cart.invoiceItems.map((r) => [
		r.item_code,
		r.quantity,
		isOfferedRow(r) ? "offered" : "paid",
	]);
}

const pack = { package: "CPK-1", label: "Settled by the package · 1 session", remaining_after: 6 };

describe("a line paid by a session of a package", () => {
	let cart;

	beforeEach(() => {
		setActivePinia(createPinia());
		Object.assign(settings, { allowItemDiscount: true });
		Object.assign(auth, { required: false, grant: null, calls: [] });
		Object.assign(net, { offline: false });
		toast.warnings.length = 0;
		toast.successes.length = 0;
		cart = usePOSCartStore();
		cart.setPosProfile("Till");
		cart.customer = "Mme Dupont";
		cart.addItem(tiramisu, 1);
	});

	const pay = (row = cart.invoiceItems[0]) =>
		cart.updateItemDetails(
			row.item_code,
			{
				customer_package: pack.package,
				package_label: pack.label,
				package_remaining: pack.remaining_after,
				discount_percentage: 100,
			},
			null,
			row
		);

	it("is worth 0.00, its price kept (struck through) and its words shown", async () => {
		await pay();

		expect(cart.invoiceItems[0]).toMatchObject({
			customer_package: "CPK-1",
			package_label: "Settled by the package · 1 session",
			discount_percentage: 100,
			price_list_rate: 9.5,
		});
		expect(cart.grandTotal).toBe(0);
		expect(cart.subtotal).toBe(9.5);
	});

	it("gives the session back: the line is a paid one again", async () => {
		await pay();
		await cart.updateItemDetails(
			"TIRAMISU",
			{ customer_package: null, discount_percentage: 0 },
			null,
			cart.invoiceItems[0]
		);

		expect(cart.invoiceItems[0].customer_package).toBeNull();
		expect(cart.grandTotal).toBe(9.5);
	});

	it("loses its package when its quantity changes (the site agreed to one quantity)", async () => {
		await pay();
		cart.updateItemQuantity("TIRAMISU", 2, null, cart.invoiceItems[0]);

		expect(cart.invoiceItems[0].customer_package).toBeNull();
		expect(cart.invoiceItems[0].discount_percentage).toBe(0);
		expect(cart.grandTotal).toBe(19);
	});

	it("never takes a unit added to the cart: it is a paid line of its own", async () => {
		await pay();
		cart.addItem(tiramisu, 1);

		expect(
			cart.invoiceItems.map((row) => [
				row.item_code,
				row.quantity,
				row.customer_package || null,
			])
		).toEqual([
			["TIRAMISU", 1, "CPK-1"],
			["TIRAMISU", 1, null],
		]);
		expect(cart.grandTotal).toBe(9.5);
	});

	it("reaches the server with its package, and a paid line with none", async () => {
		await pay();
		cart.addItem(espresso, 1);

		const sent = cart.formatItemsForSubmission(cart.invoiceItems);

		expect(sent.map((row) => [row.item_code, row.customer_package])).toEqual([
			["TIRAMISU", "CPK-1"],
			["ESPRESSO", null],
		]);
		expect(sent[0].discount_percentage).toBe(100);
	});

	it("stays paid by its package when a held cart brings it back", () => {
		cart.addItem(
			{
				...espresso,
				customer_package: "CPK-2",
				package_label: "Settled by the package · 1 session",
			},
			1
		);

		const back = cart.invoiceItems.find((row) => row.item_code === "ESPRESSO");
		expect(back).toMatchObject({ customer_package: "CPK-2", discount_percentage: 100 });
	});
});
