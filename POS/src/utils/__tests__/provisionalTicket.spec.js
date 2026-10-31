/**
 * //// Neoffice — added file (no upstream equivalent). The provisional ticket prints where the till prints its receipts
 * //// (NeoRestau lot 1, task 28a). On the restaurant till of a site, the printer button of the cart opened the browser's
 * //// print window although the till had a CloudPRNT receipt printer: printProvisionalTicket (March) always called
 * //// window.open. A till with a CloudPRNT printer now saves the order as its screen shows it (nothing sent to the kitchen)
 * //// and has the server print it; a till without one, or a failure on the way, prints it from the browser as before,
 * //// with a toast saying why. The real cart store and the real CloudPRNT store run against a fake server; window.print
 * //// is stubbed, so nothing reaches a printer or the operating system.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => {
	globalThis.__ = (text, args) =>
		args ? text.replace(/\{(\d+)\}/g, (_, i) => String(args[i])) : text;
	return { calls: [], fail: {} };
});
const toasts = vi.hoisted(() => []);

function answer(method, args) {
	const name = method.split(".").pop();
	server.calls.push({ name, args });
	if (server.fail[name]) throw server.fail[name];
	if (name === "update_invoice") return { name: "SINV-TABLE-0001" };
	if (name === "print_provisional_ticket")
		return {
			success: true,
			message: "Provisional ticket sent to Star Bar",
			printer: "Star Bar",
		};
	return { valid: true };
}

// The CloudPRNT store calls frappe-ui's call, the till its CSRF wrapper: both reach the same fake server
vi.mock("frappe-ui", () => ({
	call: vi.fn(async (method, args) => answer(method, args)),
	createResource: (options) => ({
		submit: vi.fn(async () => ({
			items: [],
			free_items: [],
			applied_pricing_rules: [],
			discount_amount: 0,
		})),
		reload: vi.fn(),
		fetch: vi.fn(),
		url: options?.url,
	}),
}));
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args) => answer(method, args)),
}));
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: (message) => toasts.push({ type: "success", message }),
		showError: (message) => toasts.push({ type: "error", message }),
		showWarning: (message) => toasts.push({ type: "warning", message }),
		showInfo: (message) => toasts.push({ type: "info", message }),
	}),
}));
vi.mock("@/utils/offline", () => ({
	isOffline: () => false,
	getCachedItem: vi.fn(),
}));
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({ shouldEnforceStockValidation: () => false }),
}));
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}));

const { usePOSCartStore } = await import("@/stores/posCart");
const { useCloudPrntStore } = await import("@/stores/cloudPrnt");
const { printProvisionalTicket } = await import("@/utils/printInvoice");
const { orderAsShown, printProvisionalTicketFromTill } = await import(
	"@/utils/provisionalTicket"
);

const PROFILE = {
	name: "Restaurant till",
	company: "_Test Company",
	customer: "Walk-in",
	currency: "CHF",
	selling_price_list: "Standard Selling",
};
const shiftStore = { currentProfile: PROFILE, profileCompany: PROFILE.company };
const dish = (code, rate) => ({
	item_code: code,
	item_name: code,
	rate,
	price_list_rate: rate,
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
});
const named = (name) => server.calls.filter((call) => call.name === name);
const sentOrder = () => JSON.parse(named("update_invoice").at(-1).args.data);

describe("the provisional ticket prints where the till prints its receipts", () => {
	let cart;
	let cloudPrnt;
	let printWindow;

	beforeEach(() => {
		setActivePinia(createPinia());
		server.calls = [];
		server.fail = {};
		toasts.length = 0;
		// A print must never reach the operating system, whichever path runs
		window.print = () => {
			window.__printed = true;
		};
		printWindow = {
			document: { write: vi.fn(), close: vi.fn() },
			print: vi.fn(),
			onload: null,
		};
		vi.spyOn(window, "open").mockReturnValue(printWindow);

		cart = usePOSCartStore();
		cart.setPosProfile(PROFILE.name);
		cart.setRestaurantTable({ name: "t5h4sh", table_name: "Table 5" });
		cart.customer = "Walk-in";
		// A dish the kitchen has already served, and a coffee added since, not sent to the kitchen yet
		cart.addItem(dish("STEAK", 38.5), 2);
		cart.addItem(dish("COFFEE", 4.5), 1);
		cart.invoiceItems[0].kds_status = "Delivered";
		cart.$patch({ currentDraftId: "SINV-TABLE-0001" });
		cart.setKdsStatus("Delivered");

		cloudPrnt = useCloudPrntStore();
		cloudPrnt.config = {
			receipt_printer: "p1r2n3t4r5",
			printers: [{ name: "p1r2n3t4r5", label: "Star Bar", online: 1 }],
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const print = () =>
		printProvisionalTicketFromTill({
			cartStore: cart,
			cloudPrntStore: cloudPrnt,
			shiftStore,
			printInBrowser: printProvisionalTicket,
		});

	it("with a CloudPRNT printer: saves the order as shown, then has the server print it, and opens no window", async () => {
		await print();

		expect(server.calls.map((call) => call.name)).toEqual([
			"update_invoice",
			"print_provisional_ticket",
		]);
		const order = sentOrder();
		expect(order.name).toBe("SINV-TABLE-0001");
		expect(order.restaurant_table).toBe("t5h4sh");
		expect(order.items.map((line) => [line.item_code, line.qty])).toEqual([
			["STEAK", 2],
			["COFFEE", 1],
		]);
		expect(named("print_provisional_ticket")[0].args).toEqual({
			invoice: "SINV-TABLE-0001",
			printer: "p1r2n3t4r5",
		});
		expect(window.open).not.toHaveBeenCalled();
		expect(window.__printed).toBeUndefined();
		expect(toasts).toEqual([
			{ type: "success", message: "Provisional ticket sent to Star Bar" },
		]);
	});

	it("sends nothing to the kitchen: a line not sent yet is saved held, a served one keeps its state", async () => {
		await print();

		const [steak, coffee] = sentOrder().items;
		expect(steak.kds_status).toBe("Delivered");
		expect(coffee.kds_status).toBe("Waiting");
		// The cart is untouched: Validate still offers the coffee to the kitchen
		expect(cart.invoiceItems.map((line) => line.kds_status || "")).toEqual([
			"Delivered",
			"",
		]);
	});

	it("a table never sent to the kitchen is saved held, the order as a whole too", async () => {
		cart.invoiceItems[0].kds_status = "";
		cart.$patch({ currentDraftId: null });
		cart.setKdsStatus("Pending");

		await print();

		const order = sentOrder();
		expect(order.name).toBeUndefined();
		expect(order.kds_status).toBe("Waiting");
		expect(order.items.every((line) => line.kds_status === "Waiting")).toBe(
			true,
		);
		// The table's order now exists on the server, and the till knows its name
		expect(cart.currentDraftId).toBe("SINV-TABLE-0001");
		expect(named("print_provisional_ticket")[0].args.invoice).toBe(
			"SINV-TABLE-0001",
		);
	});

	it("an order the server already holds as shown is printed without saving it again", async () => {
		cart.invoiceItems[1].kds_status = "Pending";
		cart.markChangesSent();

		await print();

		expect(server.calls.map((call) => call.name)).toEqual([
			"print_provisional_ticket",
		]);
		expect(window.open).not.toHaveBeenCalled();
	});

	it("without a CloudPRNT printer: prints from the browser, as before, and says why", async () => {
		cloudPrnt.config = { receipt_printer: null, printers: [] };

		await print();

		expect(server.calls).toEqual([]);
		expect(window.open).toHaveBeenCalledTimes(1);
		expect(window.open.mock.calls[0][1]).toBe("_blank");
		expect(printWindow.document.write.mock.calls[0][0]).toContain("Table 5");
		expect(toasts).toEqual([
			{
				type: "info",
				message:
					"This till has no ticket printer: the provisional ticket prints from the browser",
			},
		]);
	});

	it("when the server refuses: prints from the browser, with the server's reason", async () => {
		server.fail.print_provisional_ticket = Object.assign(
			new Error("print_provisional_ticket ValidationError"),
			{
				exc_type: "ValidationError",
				messages: [
					"No CloudPRNT printer prints the receipts of the till <b>Restaurant till</b>",
				],
			},
		);

		await print();

		expect(named("print_provisional_ticket")).toHaveLength(1);
		expect(window.open).toHaveBeenCalledTimes(1);
		expect(toasts).toEqual([
			{
				type: "warning",
				message:
					"The ticket printer could not print the provisional ticket (No CloudPRNT printer prints the receipts of the till Restaurant till): it prints from the browser",
			},
		]);
	});

	it("when the order cannot be saved (offline): prints from the browser, and asks the server for no ticket", async () => {
		server.fail.update_invoice = new TypeError("Failed to fetch");

		await print();

		expect(named("print_provisional_ticket")).toHaveLength(0);
		expect(window.open).toHaveBeenCalledTimes(1);
		expect(toasts).toEqual([
			{
				type: "warning",
				message:
					"The ticket printer could not be reached: the provisional ticket prints from the browser",
			},
		]);
	});

	it("the order it saves is the cart's own payload, with the till's shift and draft", () => {
		cart.setPosOpeningShift("POS-OPEN-0001");
		const order = orderAsShown(cart, PROFILE);
		expect(order).toMatchObject({
			doctype: "Sales Invoice",
			pos_profile: PROFILE.name,
			is_pos: 1,
			docstatus: 0,
			posa_pos_opening_shift: "POS-OPEN-0001",
			name: "SINV-TABLE-0001",
		});
	});

	it("is the till's printer button: POSSale.vue hands the provisional ticket to it", () => {
		const source = readFileSync(
			path.resolve(__dirname, "../../pages/POSSale.vue"),
			"utf8",
		);
		const start = source.indexOf("function handlePrintProvisionalTicket(");
		expect(start).toBeGreaterThan(0);
		const handler = source.slice(start, source.indexOf("\n}\n", start));
		expect(handler).toContain("printProvisionalTicketFromTill(");
		expect(handler).toContain("printInBrowser: printProvisionalTicket");
		expect(handler).not.toContain("window.open");
	});
});
