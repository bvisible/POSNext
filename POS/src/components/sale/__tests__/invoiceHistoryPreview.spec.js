// //// Neoffice — added file (no upstream equivalent).
/**
 * Each row of « Historique des factures » says what its ticket holds (NeoRestau lot 1, task 29).
 *
 * The row shows the first three dishes of the ticket ("2× Pizza Margherita · 1× Coca-Cola 33 cl · …"), then
 * "+n items" when there are more, so that one sees at a glance what a sale or a table's order was; the eye
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
// The dishes of a preview, one per line (stacked: no separator, and jsdom has no matchMedia so it is the wide layout)
const dishes = (preview) => preview.findAll("[data-testid='invoice-preview-line']").map((dish) => dish.text());
const more = (preview) => preview.find("[data-testid='invoice-preview-more']");

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
		expect(dishes(preview)).toEqual(["2× Pizza Margherita", "1× Coca-Cola 33 cl", "1× Tiramisu"]);
		expect(more(preview).text()).toBe("+2 items");
	});

	it("says « +1 item » for a single line left over", async () => {
		const wrapper = await show([
			invoice("FA-1", {
				items_preview: [line("A", 1), line("B", 1), line("C", 1)],
				items_count: 4,
			}),
		]);
		const text = previews(wrapper)[0].text();
		expect(text).toContain("+1 item");
		expect(text).not.toContain("+1 items");
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
		const [preview] = previews(wrapper);
		expect(dishes(preview)).toEqual(["2× Burger", "1× Fries"]);
		expect(more(preview).exists()).toBe(false);
		expect(preview.text()).not.toContain("+");
	});

	it("keeps a weighed quantity and names an unusual unit", async () => {
		const wrapper = await show([
			invoice("FA-3", {
				items_preview: [line("Salmon fillet", 0.35), line("Wine", 0.75, "Litre")],
				items_count: 2,
			}),
		]);
		expect(dishes(previews(wrapper)[0])).toEqual(["0.35× Salmon fillet", "0.75 Litre Wine"]);
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

	it("puts the preview in the middle of the row, between the left block and the amount", async () => {
		const wrapper = await show([
			invoice("FA-5", { items_preview: [line("Pizza", 1), line("Cola", 1)], items_count: 2 }),
		]);
		const preview = wrapper.find("[data-testid='invoice-preview']");
		const grid = preview.element.parentElement;
		// Three tracks from 768 px up: a fixed left, the flexible middle, a fixed right, so that the middle starts at the
		// same place on every row; below, two tracks and the preview under the left block
		expect(grid.className).toContain("grid-cols-[minmax(0,1fr)_auto]");
		expect(grid.className).toContain("md:grid-cols-[17rem_minmax(0,1fr)_7rem]");
		// No gap between rows: a row with no preview has no second row to pay for
		expect(grid.className).not.toContain("gap-y");
		const [left, middle, right] = Array.from(grid.children);
		expect(left.textContent).toContain("FA-5");
		expect(middle).toBe(preview.element);
		expect(right.querySelector("[title='View Details']")).not.toBeNull();
		expect(middle.className).toContain("md:col-start-2");
		expect(right.className).toContain("md:col-start-3");
		// A row with a preview and one without keep the same tracks
		expect(left.className).toContain("col-start-1");
	});

	it("leaves the middle empty and the amount where it was for a ticket with no line", async () => {
		const wrapper = await show([invoice("FA-5b", { items_preview: [], items_count: 0 })]);
		const grid = wrapper.find("[title='View Details']").element.closest(".grid");
		const [left, right] = Array.from(grid.children);
		expect(left.textContent).toContain("FA-5b");
		expect(right.className).toContain("md:col-start-3");
	});

	it("keeps the list's height: the row does not grow, so the list stays max-h-96", async () => {
		const wrapper = await show([
			invoice("FA-5c", { items_preview: [line("Pizza", 1)], items_count: 1 }),
		]);
		expect(wrapper.find(".overflow-y-auto").classes()).toContain("max-h-96");
		expect(wrapper.find(".overflow-y-auto").classes()).not.toContain("max-h-[28rem]");
	});

	it("stacks the dishes of a row, one per line", async () => {
		const wrapper = await show([
			invoice("FA-5d", {
				items_preview: [line("Pizza", 2), line("Cola", 1), line("Tiramisu", 1)],
				items_count: 3,
			}),
		]);
		const dishes = wrapper.findAll("[data-testid='invoice-preview-line']");
		expect(dishes.map((dish) => dish.find(".truncate").text())).toEqual([
			"2× Pizza",
			"1× Cola",
			"1× Tiramisu",
		]);
	});

	it("keeps each page's previews when the next page is loaded", async () => {
		const first = Array.from({ length: 20 }, (_, i) =>
			invoice(`FA-P1-${i}`, { items_preview: [line(`Dish ${i}`, 1)], items_count: 1 }),
		);
		const wrapper = await show(first);
		const more = wrapper.findAll("button").find((button) => button.text() === "Load More");
		await more.trigger("click");
		state.options.onSuccess([
			invoice("FA-P2-0", { items_preview: [line("Second page dish", 2)], items_count: 1 }),
		]);
		await flushPromises();
		const texts = previews(wrapper).map((p) => p.text());
		expect(texts).toHaveLength(21);
		expect(texts[0]).toBe("1× Dish 0");
		expect(texts[19]).toBe("1× Dish 19");
		expect(texts[20]).toBe("2× Second page dish");
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
		expect(previews(wrapper)[0].text()).toContain("+9 items");
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
		const [preview] = previews(wrapper);
		expect(dishes(preview)).toEqual(["2× Burger", "1× Fries", "1× Cola"]);
		expect(more(preview).text()).toBe("+1 item");
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
