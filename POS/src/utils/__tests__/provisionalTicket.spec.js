/**
 * //// Neoffice — added file (no upstream equivalent). The provisional ticket prints where the till prints its receipts
 * //// (NeoResto lot 1, task 28a). On the restaurant till of a site, the printer button of the cart opened the browser's
 * //// print window although the till had a CloudPRNT receipt printer. Round 2 (ruling 93): one tap sends the order as
 * //// the screen shows it, shaped as the PAYMENT sends it, to the server, which prices and prints it WITHOUT saving
 * //// anything; the till never saves the order to print it. Ruling 97: the button shows where the ticket stands
 * //// (sending, printing, printed, printer offline, not printed). The browser prints it only when the till has no
 * //// ticket printer or the server cannot be reached; a refusal of the server is shown, never printed. The real cart
 * //// store and the real CloudPRNT store run against a fake server that only answers (it works no amount out: the
 * //// amounts are ERPNext's, tested on the server); window.print is stubbed, so nothing reaches a printer.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => {
	globalThis.__ = (text, args) =>
		args ? text.replace(/\{(\d+)\}/g, (_, i) => String(args[i])) : text;
	return { calls: [], fail: {}, answers: {}, statuses: [] };
});
const toasts = vi.hoisted(() => []);

function answer(method, args) {
	const name = method.split(".").pop();
	server.calls.push({ name, args });
	if (server.fail[name]) throw server.fail[name];
	if (name === "print_provisional_ticket")
		return {
			success: true,
			message: "Provisional ticket sent to Star Bar",
			printer: "Star Bar",
			printer_online: true,
			valid_minutes: 15,
			job_token: "job-1",
			...server.answers.print,
		};
	if (name === "ticket_status")
		return (
			server.statuses.shift() || {
				status: "Pending",
				printer_online: true,
				reason: "",
			}
		);
	if (name === "get_till_printing") {
		if (server.fail.config) throw server.fail.config;
		return server.answers.config;
	}
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
const {
	POLL_MS,
	SHOWN_MS,
	orderToPrint,
	printProvisionalTicketFromTill,
	ticketState,
} = await import("@/utils/provisionalTicket");

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
const sentOrder = () =>
	JSON.parse(named("print_provisional_ticket").at(-1).args.order);
const saves = () =>
	server.calls.filter((call) =>
		["update_invoice", "submit_invoice", "save_draft"].includes(call.name),
	);
const refusal = (excType, message) =>
	Object.assign(new Error(`print_provisional_ticket ${excType}`), {
		exc_type: excType,
		messages: [message],
	});

describe("the provisional ticket prints where the till prints its receipts, and saves nothing", () => {
	let cart;
	let cloudPrnt;
	let printWindow;

	beforeEach(async () => {
		setActivePinia(createPinia());
		server.calls = [];
		server.fail = {};
		server.answers = {};
		server.statuses = [];
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
		cart.setTaxInclusive(true);
		cart.setRestaurantTable({ name: "t5h4sh", table_name: "Table 5" });
		cart.customer = "Walk-in";
		// A steak served (sent earlier) and a coffee added since, not sent to the kitchen yet
		cart.addItem(dish("STEAK", 12.35), 3);
		cart.addItem(dish("COFFEE", 4.5), 1);
		cart.invoiceItems[0].kds_status = "Delivered";
		await cart.updateItemDetails("STEAK", { discount_percentage: 10 }, "Nos");
		cart.$patch({ currentDraftId: "SINV-TABLE-0001" });
		toasts.length = 0;

		cloudPrnt = useCloudPrntStore();
		cloudPrnt.config = {
			receipt_printer: "p1r2n3t4r5",
			printers: [{ name: "p1r2n3t4r5", label: "Star Bar", online: 1 }],
		};
		ticketState.phase = "idle";
		ticketState.text = "";
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	const print = () =>
		printProvisionalTicketFromTill({
			cartStore: cart,
			cloudPrntStore: cloudPrnt,
			shiftStore,
			printInBrowser: printProvisionalTicket,
		});

	it("sends the order shaped as the payment sends it, saves nothing, and opens no window", async () => {
		const how = await print();

		expect(how).toBe("cloudprnt");
		expect(saves()).toEqual([]);
		expect(server.calls.map((call) => call.name)).toEqual([
			"print_provisional_ticket",
		]);
		const order = sentOrder();
		expect(order).toMatchObject({
			pos_profile: PROFILE.name,
			customer: "Walk-in",
			restaurant_table: "t5h4sh",
			is_takeaway: 0,
			draft: "SINV-TABLE-0001",
			discount_amount: 0,
		});
		// The lines are the payment's own (formatItemsForSubmission): the discounted line at its rate after the
		// discount, never at its price before it (C1); the coffee not sent yet is on the bill as it is
		expect(order.items).toEqual(
			cart.formatItemsForSubmission(cart.invoiceItems),
		);
		// 3 x 12.35 at 10 %: the payment sends 11.12 a unit, its rate after the discount rounded per unit (what ERPNext then
		// charges: 33.36). The cart takes 3.69 off the line to come to it (01fab002: the till's totals are ERPNext's, to the
		// cent); before it took 3.70 off (37.05 x 10 % is 3.70499... in floating point) and showed 33.35
		const steak = order.items.find((line) => line.item_code === "STEAK");
		expect(steak).toMatchObject({
			qty: 3,
			rate: 11.12,
			price_list_rate: 12.35,
			discount_percentage: 10,
			discount_amount: 3.69,
		});
		expect(order.items.map((line) => line.item_code)).toEqual([
			"STEAK",
			"COFFEE",
		]);
		expect(window.open).not.toHaveBeenCalled();
		expect(window.__printed).toBeUndefined();
		// The cart is untouched: the coffee waits for « Validate »
		expect(cart.invoiceItems.map((line) => line.kds_status || "")).toEqual([
			"Delivered",
			"",
		]);
	});

	it("sends the order's discount as the payment applies it, a whole-cart coupon included", async () => {
		cart.applyDiscountToCart({ name: "Ten off", code: "TENOFF", amount: 10 });

		await print();

		expect(sentOrder().discount_amount).toBe(10);
		expect(sentOrder().discount_amount).toBe(cart.effectiveHeaderDiscount);
	});

	it("a dish removed from the screen is simply not on the bill: nothing is saved for it", async () => {
		cart.removeItem(cart.invoiceItems[1]);

		await print();

		expect(sentOrder().items.map((line) => line.item_code)).toEqual(["STEAK"]);
		expect(saves()).toEqual([]);
	});

	it("a takeaway order is sent with its number", async () => {
		cart.setRestaurantTable(null);
		cart.$patch({
			isTakeaway: true,
			takeawayNumber: "T-012",
			currentDraftId: null,
		});

		await print();

		expect(sentOrder()).toMatchObject({
			restaurant_table: null,
			is_takeaway: 1,
			takeaway_number: "T-012",
			draft: null,
		});
	});

	it("the button follows the ticket: sending, printing, then printed", async () => {
		vi.useFakeTimers();
		server.statuses = [
			{ status: "Pending", printer_online: true },
			{ status: "Fetched", printer_online: true },
			{ status: "Printed", printer_online: true },
		];
		const printing = print();
		expect(ticketState).toMatchObject({ phase: "sending", text: "Sending…" });
		await printing;
		expect(ticketState).toMatchObject({ phase: "printing", text: "Printing…" });
		await vi.advanceTimersByTimeAsync(POLL_MS * 2);
		expect(ticketState.phase).toBe("printing");
		await vi.advanceTimersByTimeAsync(POLL_MS);
		expect(ticketState).toMatchObject({ phase: "printed", text: "Printed" });
		expect(named("ticket_status").map((call) => call.args)).toEqual([
			{ job: "job-1" },
			{ job: "job-1" },
			{ job: "job-1" },
		]);
		await vi.advanceTimersByTimeAsync(SHOWN_MS);
		expect(ticketState.phase).toBe("idle");
		expect(toasts).toEqual([]);
	});

	it("the button says when the printer is offline: the ticket comes out when it is back", async () => {
		vi.useFakeTimers();
		server.answers.print = { printer_online: false };
		server.statuses = [{ status: "Pending", printer_online: false }];

		await print();

		expect(ticketState).toMatchObject({
			phase: "offline",
			text: "Printer offline: the ticket will come out when it is back (15 min)",
		});
		await vi.advanceTimersByTimeAsync(POLL_MS);
		expect(ticketState.phase).toBe("offline");
		expect(window.open).not.toHaveBeenCalled();
	});

	it("the button says when the printer did not print it, and why", async () => {
		vi.useFakeTimers();
		server.statuses = [
			{ status: "Failed", printer_online: true, reason: "Paper out" },
		];

		await print();
		await vi.advanceTimersByTimeAsync(POLL_MS);

		expect(ticketState).toMatchObject({
			phase: "failed",
			text: "Not printed: Paper out",
		});
		expect(toasts).toEqual([
			{ type: "error", message: "Not printed: Paper out" },
		]);
	});

	it("a refusal of the server is shown, and the browser prints nothing (M3)", async () => {
		server.fail.print_provisional_ticket = refusal(
			"ValidationError",
			"<b>SINV-TABLE-0001</b> is no longer an open order",
		);

		const how = await print();

		expect(how).toBe("refused");
		expect(window.open).not.toHaveBeenCalled();
		expect(ticketState).toMatchObject({
			phase: "failed",
			text: "Not printed: SINV-TABLE-0001 is no longer an open order",
		});
		expect(toasts).toEqual([
			{
				type: "error",
				message: "Not printed: SINV-TABLE-0001 is no longer an open order",
			},
		]);
		for (const excType of ["PermissionError", "DoesNotExistError"]) {
			server.fail.print_provisional_ticket = refusal(excType, "Not permitted");
			expect(await print()).toBe("refused");
		}
		expect(window.open).not.toHaveBeenCalled();
	});

	it("too many tickets in a minute is a refusal that is shown, not a reason to print from the browser", async () => {
		server.fail.print_provisional_ticket = refusal(
			"RateLimitExceededError",
			"Too many tickets in a minute: wait a moment before printing another",
		);

		const how = await print();

		expect(how).toBe("refused");
		expect(window.open).not.toHaveBeenCalled();
		expect(ticketState).toMatchObject({
			phase: "failed",
			text: "Not printed: Too many tickets in a minute: wait a moment before printing another",
		});
	});

	it("when the server cannot be reached, the browser prints it, and says why", async () => {
		server.fail.print_provisional_ticket = new TypeError("Failed to fetch");

		const how = await print();

		expect(how).toBe("browser");
		expect(window.open).toHaveBeenCalledTimes(1);
		expect(printWindow.document.write.mock.calls[0][0]).toContain("Table 5");
		expect(ticketState.phase).toBe("idle");
		expect(toasts).toEqual([
			{
				type: "warning",
				message:
					"The ticket printer could not be reached: the provisional ticket prints from the browser",
			},
		]);
	});

	it("when the server finds no ticket printer for the till, the browser prints it", async () => {
		server.fail.print_provisional_ticket = refusal(
			"NoTicketPrinter",
			"No CloudPRNT printer prints the receipts of the till Restaurant till",
		);

		expect(await print()).toBe("browser");
		expect(window.open).toHaveBeenCalledTimes(1);
	});

	//// Neoffice — the bill of a group of the table says which group it is (NeoResto lot 1, notes): « Table 5.2 · Dupont » once the table has several groups, « Table 5 » as ever while it has one.
	it("without a CloudPRNT printer: names the group of the table on the ticket the browser prints, when the table has several", async () => {
		cloudPrnt.config = { receipt_printer: null, printers: [] };
		cart.setRestaurantNotes([
			{ name: "SINV-1", note: 1 },
			{ name: "SINV-2", note: 2 },
		]);
		cart.setRestaurantNote(2);
		cart.setRestaurantNoteName("Dupont");

		expect(await print()).toBe("browser");

		expect(printWindow.document.write.mock.calls[0][0]).toContain(
			"Table 5.2 · Dupont",
		);
	});

	it("without a CloudPRNT printer: names the table alone on the ticket of a table with one group", async () => {
		cloudPrnt.config = { receipt_printer: null, printers: [] };
		cart.setRestaurantNotes([{ name: "SINV-1", note: 1 }]);

		expect(await print()).toBe("browser");

		const html = printWindow.document.write.mock.calls[0][0];
		expect(html).toContain("Table 5");
		expect(html).not.toContain("Table 5.1");
	});

	it("without a CloudPRNT printer: prints from the browser, as before, and says why", async () => {
		cloudPrnt.config = { receipt_printer: null, printers: [] };

		expect(await print()).toBe("browser");

		expect(server.calls).toEqual([]);
		expect(window.open).toHaveBeenCalledTimes(1);
		expect(window.open.mock.calls[0][1]).toBe("_blank");
		expect(toasts).toEqual([
			{
				type: "info",
				message:
					"This till has no ticket printer: the provisional ticket prints from the browser",
			},
		]);
	});

	it("a second tap while the first is on its way asks for one ticket", async () => {
		const [first, second] = await Promise.all([print(), print()]);

		expect(first).toBe("cloudprnt");
		expect(second).toBe("cloudprnt");
		expect(named("print_provisional_ticket")).toHaveLength(1);
		// Once it is done, the next tap prints again
		await print();
		expect(named("print_provisional_ticket")).toHaveLength(2);
	});

	it("the order it sends is the cart's, and only the cart's", () => {
		expect(orderToPrint(cart, PROFILE)).toEqual({
			pos_profile: PROFILE.name,
			customer: "Walk-in",
			restaurant_table: "t5h4sh",
			is_takeaway: 0,
			takeaway_number: "",
			draft: "SINV-TABLE-0001",
			discount_amount: 0,
			items: cart.formatItemsForSubmission(cart.invoiceItems),
		});
	});

	it("is the till's printer button: POSSale.vue hands the ticket to it, and the button shows its state", () => {
		const source = readFileSync(
			path.resolve(__dirname, "../../pages/POSSale.vue"),
			"utf8",
		);
		const start = source.indexOf("function handlePrintProvisionalTicket(");
		expect(start).toBeGreaterThan(0);
		const handler = source.slice(start, source.indexOf("\n}\n", start));
		expect(handler).toContain("printProvisionalTicketFromTill(");
		expect(handler).toContain("printInBrowser: printProvisionalTicket");
		expect(handler).not.toMatch(/update_invoice|window\.open/);
		const cartSource = readFileSync(
			path.resolve(__dirname, "../../components/sale/InvoiceCart.vue"),
			"utf8",
		);
		expect(cartSource).toContain(
			'import { ticketState } from "@/utils/provisionalTicket"',
		);
		expect(cartSource).toContain("{{ ticketState.text }}");
	});
});

describe("the till keeps knowing its printer when a refresh fails (M4)", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		server.calls = [];
		server.fail = {};
		server.answers = {
			config: {
				receipt_printer: "p1r2n3t4r5",
				printers: [{ name: "p1r2n3t4r5", label: "Star Bar", online: 1 }],
			},
		};
	});

	it("a refresh that fails keeps what was read for the same till", async () => {
		const store = useCloudPrntStore();
		await store.load("Restaurant till");
		expect(store.receiptPrinter?.label).toBe("Star Bar");

		server.fail.config = new TypeError("Failed to fetch");
		await store.load("Restaurant till");

		expect(store.receiptPrinter?.label).toBe("Star Bar");
	});

	it("another till's printer is not kept", async () => {
		const store = useCloudPrntStore();
		await store.load("Restaurant till");
		server.fail.config = new TypeError("Failed to fetch");

		await store.load("Bar till");

		expect(store.receiptPrinter).toBeNull();
	});
});
