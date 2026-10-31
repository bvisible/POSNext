// //// Neoffice — added file (no upstream equivalent).
/**
 * Each row of « Historique des factures » says what its ticket holds (NeoRestau lot 1, task 29).
 *
 * The row shows the first three lines of the ticket ("2× Pizza Margherita · 1× Coca-Cola 33 cl · …"), then
 * "+n articles" when there are more, so that one sees at a glance what a sale or a table's order was; the eye
 * icon stays the way to see everything.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	// The till's `__`: the English msgid with its {0} placeholders filled
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, i) => String(args[i])) : text);
});

const state = vi.hoisted(() => ({ options: null }));

vi.mock("frappe-ui", () => ({
	Button: { template: "<button v-bind='$attrs'><slot /></button>" },
	Dialog: { template: "<div><slot name='body-content' /><slot name='actions' /></div>" },
	Input: { template: "<input />" },
	createResource: (options) => {
		state.options = options;
		return { loading: false, reload: vi.fn(), fetch: vi.fn() };
	},
}));
vi.mock("../ReturnInvoiceDialog.vue", () => ({ default: { template: "<div />" } }));
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

const { default: InvoiceHistoryDialog } = await import("../InvoiceHistoryDialog.vue");

const line = (item_name, qty, uom = null) => ({ item_name, qty, uom });

function invoice(name, extra = {}) {
	return {
		name,
		customer: "Passage",
		customer_name: "Passage",
		posting_date: "2026-10-30",
		posting_time: "19:36:00",
		grand_total: 116,
		status: "Draft",
		docstatus: 0,
		is_return: 0,
		payments: [],
		items: [],
		...extra,
	};
}

async function show(rows) {
	const wrapper = mount(InvoiceHistoryDialog, {
		props: { modelValue: true, posProfile: "Caisse", posOpeningShift: "S-1", currency: "CHF" },
		global: { mocks: { __: globalThis.__ } },
	});
	state.options.onSuccess(rows);
	await flushPromises();
	return wrapper;
}

const previews = (wrapper) => wrapper.findAll("[data-testid='invoice-preview']");

describe("InvoiceHistoryDialog — the preview of a ticket", () => {
	beforeEach(() => {
		state.options = null;
	});

	it("shows the first three lines of a table's order and how many more there are", async () => {
		const wrapper = await show([
			invoice("FA-2026-02674", {
				items_preview: [line("Pizza Margherita", 2), line("Coca-Cola 33 cl", 1), line("Tiramisu", 1)],
				items_count: 5,
			}),
		]);
		const [preview] = previews(wrapper);
		expect(preview.text()).toContain("2× Pizza Margherita · 1× Coca-Cola 33 cl · 1× Tiramisu");
		expect(preview.text()).toContain("+2 articles");
	});

	it("says « +1 article » for a single line left over", async () => {
		const wrapper = await show([
			invoice("FA-1", {
				items_preview: [line("A", 1), line("B", 1), line("C", 1)],
				items_count: 4,
			}),
		]);
		const text = previews(wrapper)[0].text();
		expect(text).toContain("+1 article");
		expect(text).not.toContain("+1 articles");
	});

	it("shows no count when the ticket fits the preview", async () => {
		const wrapper = await show([
			invoice("FA-2", {
				status: "Paid",
				docstatus: 1,
				items_preview: [line("Burger", 2), line("Fries", 1)],
				items_count: 2,
			}),
		]);
		const text = previews(wrapper)[0].text();
		expect(text).toBe("2× Burger · 1× Fries");
		expect(text).not.toContain("+");
	});

	it("keeps a weighed quantity and names an unusual unit", async () => {
		const wrapper = await show([
			invoice("FA-3", {
				items_preview: [line("Salmon fillet", 0.35), line("Wine", 0.75, "Litre")],
				items_count: 2,
			}),
		]);
		expect(previews(wrapper)[0].text()).toBe("0.35× Salmon fillet · 0.75 Litre Wine");
	});

	it("truncates a long dish name with an ellipsis, the whole name staying in the tooltip", async () => {
		const long = "Spaghetti alle vongole veraci con pomodorini del Piennolo e bottarga di muggine";
		const wrapper = await show([
			invoice("FA-4", { items_preview: [line(long, 1)], items_count: 1 }),
		]);
		const [preview] = previews(wrapper);
		expect(preview.text()).toContain("…");
		expect(preview.text()).not.toContain("muggine");
		expect(preview.attributes("title")).toContain(long);
	});

	it("limits the preview to two lines of text, whatever the lines", async () => {
		const wrapper = await show([
			invoice("FA-5", { items_preview: [line("Pizza", 1)], items_count: 1 }),
		]);
		expect(wrapper.find("[data-testid='invoice-preview'] p").classes()).toContain("line-clamp-2");
	});

	it("shows nothing, not even an empty line, for a ticket with no line", async () => {
		const wrapper = await show([invoice("FA-6", { items_preview: [], items_count: 0 })]);
		expect(previews(wrapper)).toHaveLength(0);
		// The row itself is there, with its number and amount
		expect(wrapper.text()).toContain("FA-6");
	});

	it("shows nothing for a row from a server that sends no preview and no line", async () => {
		const wrapper = await show([invoice("FA-7")]);
		expect(previews(wrapper)).toHaveLength(0);
	});

	it("gives each row its own preview", async () => {
		const wrapper = await show([
			invoice("FA-8", { items_preview: [line("Soup", 1)], items_count: 1 }),
			invoice("FA-9", { items_preview: [line("Steak", 2)], items_count: 1 }),
		]);
		expect(previews(wrapper).map((p) => p.text())).toEqual(["1× Soup", "2× Steak"]);
	});

	it("keeps the count the server counted (the dialog no longer zeroes it)", async () => {
		const wrapper = await show([
			invoice("FA-10", {
				items_preview: [line("A", 1), line("B", 1), line("C", 1)],
				items_count: 12,
			}),
		]);
		expect(previews(wrapper)[0].text()).toContain("+9 articles");
	});

	it("gives a sale still held on the device the same preview, from its own lines", async () => {
		const wrapper = await show([
			invoice("pos_offline_1f3a9c", {
				status: "Draft",
				items: [
					{ item_name: "Burger", qty: 2, uom: "Nos", stock_uom: "Nos" },
					{ item_name: "Fries", qty: 1, uom: "Nos", stock_uom: "Nos" },
					{ item_name: "Cola", qty: 1, uom: "Nos", stock_uom: "Nos" },
					{ item_name: "Pie", qty: 1, uom: "Nos", stock_uom: "Nos" },
				],
			}),
		]);
		const text = previews(wrapper)[0].text();
		expect(text).toContain("2× Burger · 1× Fries · 1× Cola");
		expect(text).toContain("+1 article");
	});

	it("leaves the row's other lines and its three icons as they were", async () => {
		const wrapper = await show([
			invoice("FA-11", {
				status: "Paid",
				docstatus: 1,
				payments: [{ mode_of_payment: "Cash", amount: 116 }],
				items_preview: [line("Pizza", 1)],
				items_count: 1,
			}),
		]);
		const row = wrapper.text();
		expect(row).toContain("FA-11");
		expect(row).toContain("Passage");
		expect(row).toContain("Cash");
		expect(wrapper.find("[title='View Details']").exists()).toBe(true);
		expect(wrapper.find("[title='Print']").exists()).toBe(true);
		expect(wrapper.find("[title='Create Return']").exists()).toBe(true);
	});
});
