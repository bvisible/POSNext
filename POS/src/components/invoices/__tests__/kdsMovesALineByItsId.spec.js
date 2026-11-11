/**
 * //// Neoffice — added file (no upstream equivalent). A line of the kitchen's ticket moves by its own id (maintenance#2075): two lines of one dish (another round,
 * //// another course) have a state each. A tap names the LINE (`row`, the Sales Invoice Item's name that `get_kds_orders` sends with each line), only that line
 * //// changes on the screen, its units are its own, and the five seconds' undo puts that line back alone. A line the server sent without its id (an older server)
 * //// still moves with every line of its dish, by its item code. jsdom has no layout engine: the boxes of the elements are given by hand.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { dismissUndo, useUndoToast } from "@/composables/useUndoToast";
import { kitchenView, readyForTheRunner } from "@/utils/kitchenRunner";

const call = vi.hoisted(() => vi.fn());
const showError = vi.hoisted(() => vi.fn());
const restaurantStore = vi.hoisted(() => ({ runnerEnabled: true }));

vi.hoisted(() => {
	// The app's `__`: indexed placeholders
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text;
});

// The REAL Button, reached by its path (the package's `exports` map does not offer the file)
vi.mock("frappe-ui", async () => {
	const { default: Button } = await import(
		"../../../../node_modules/frappe-ui/src/components/Button/Button.vue"
	);
	return { Button };
});
vi.mock("@/utils/apiWrapper", () => ({ call }));
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError }),
}));
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}));

const { default: KDSOrderCard } = await import("../KDSOrderCard.vue");

const STATIONS = [{ name: "kit", station_name: "Kitchen", use_runner: 1 }];

/** A line of the order, as `get_kds_orders` sends it: with its id. */
const line = (name, code, qty, status, ready = 0, delivered = 0, extra = {}) => ({
	name,
	item_code: code,
	item_name: `Dish ${code}`,
	qty,
	kds_status: status,
	kds_batch: 1,
	kds_ready_qty: ready,
	kds_delivered_qty: delivered,
	preparation_station: "kit",
	...extra,
});
const ticket = (items, extra = {}) => ({
	name: "SINV-PART",
	restaurant_table: "T1",
	table_display_name: "T1",
	kds_status: "Preparing",
	creation: "2026-11-01 12:00:00",
	modified: "2026-11-01 12:05:00",
	items,
	...extra,
});

const rect = (left, top, width, height) => ({
	left,
	top,
	width,
	height,
	right: left + width,
	bottom: top + height,
	x: left,
	y: top,
	toJSON() {},
});

/** The dishes are 48 px high, one under the other, from y = 300. */
function layout() {
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function box() {
		if (this.matches?.('[data-test="ticket-line"]')) {
			const all = [
				...this.closest('[data-test="ticket-body"]').querySelectorAll(
					'[data-test="ticket-line"]'
				),
			];
			return rect(100, 300 + all.indexOf(this) * 48, 300, 48);
		}
		return rect(0, 0, 0, 0);
	});
}

let opened = [];
function show(order, props = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: { order, stations: STATIONS, ...props },
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	});
	opened.push(wrapper);
	return wrapper;
}

const lines = (wrapper) => wrapper.findAll('[data-test="ticket-line"]');
const menuOf = (wrapper) => wrapper.find('[data-test="ticket-line-menu"]');
const open = (wrapper, index = 0) => lines(wrapper)[index].trigger("click");
const picker = (wrapper) => wrapper.find('[data-test="ticket-line-picker"]');
const count = (wrapper) => wrapper.get('[data-test="picker-count"]').text();
const readyButton = (wrapper) => wrapper.get('[data-test="menu-ready"]');
const label = (button) => button.text().replace(/\s+/g, " ").trim();

beforeEach(() => {
	opened = [];
	call.mockReset();
	call.mockResolvedValue({ status: "success" });
	showError.mockReset();
	dismissUndo();
	window.innerWidth = 1280;
	window.innerHeight = 800;
	layout();
});
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount());
	dismissUndo();
	vi.restoreAllMocks();
});

const UPDATE = "pos_next.api.restaurant.update_item_kds_status";
const updates = () =>
	call.mock.calls.filter(([method]) => method === UPDATE).map(([, params]) => params);
const statuses = (order) => order.items.map((item) => item.kds_status);

describe("two rounds of one dish", () => {
	it("a tap on the second round names that line, and only it moves on the screen", async () => {
		const order = ticket([line("r1", "A", 2, "Preparing"), line("r2", "A", 1, "Preparing")]);
		const wrapper = show(order);

		await open(wrapper, 1);
		await readyButton(wrapper).trigger("click");
		await flushPromises();

		expect(updates()).toEqual([
			{ invoice_name: "SINV-PART", item_code: "A", status: "Ready", row: "r2" },
		]);
		expect(statuses(order)).toEqual(["Preparing", "Ready"]);
	});

	it("the units left to cook are the line's own: the picker of a round of three does not reach the six of the other", async () => {
		const wrapper = show(
			ticket([line("r1", "A", 6, "Preparing"), line("r2", "A", 3, "Preparing")])
		);

		await open(wrapper, 1);

		expect(count(wrapper)).toBe("3");
		expect(wrapper.get('[data-test="picker-more"]').attributes("disabled")).toBeDefined();

		await wrapper.get('[data-test="picker-less"]').trigger("click");
		expect(label(readyButton(wrapper))).toBe("Mark ready · 2 of 3");
		await readyButton(wrapper).trigger("click");
		await flushPromises();

		expect(updates()).toEqual([
			{ invoice_name: "SINV-PART", item_code: "A", status: "Ready", row: "r2", qty: 2 },
		]);
	});

	it("the undo of the tap puts that line back alone, by its id", async () => {
		const order = ticket([line("r1", "A", 2, "Ready", 2, 0), line("r2", "A", 1, "Preparing")]);
		const wrapper = show(order);
		await open(wrapper, 1);
		await readyButton(wrapper).trigger("click");
		await flushPromises();
		call.mockClear();

		await useUndoToast().undoNow();

		expect(updates()).toEqual([
			{
				invoice_name: "SINV-PART",
				item_code: "A",
				status: "Preparing",
				row: "r2",
				restore: JSON.stringify({ ready_qty: 0, delivered_qty: 0 }),
			},
		]);
	});

	it("the undo of the ticket's main button puts each round back to its own state, by its id", async () => {
		// The first round was cooking, the second had just been sent: « Ready » on the ticket takes both, its undo gives each its own state back
		const order = ticket([line("r1", "A", 2, "Preparing"), line("r2", "A", 1, "Pending")], {
			kds_status: "Preparing",
		});
		const wrapper = show(order, { useRunner: true });

		await wrapper.get('[data-test="ticket-main"]').trigger("click");
		await flushPromises();
		expect(call.mock.calls.map(([method, params]) => [method, params.status])).toEqual([
			["pos_next.api.restaurant.update_kds_status", "Ready"],
		]);
		call.mockClear();

		await useUndoToast().undoNow();

		expect(updates().map(({ row, status }) => [row, status])).toEqual([
			["r1", "Preparing"],
			["r2", "Pending"],
		]);
	});

	it("a line the order no longer has (the till saved the table again) is put back on the screen and said", async () => {
		const order = ticket([line("r1", "A", 2, "Preparing"), line("r2", "A", 1, "Preparing")]);
		const wrapper = show(order);
		call.mockRejectedValueOnce(new Error("This line is no longer on the order."));

		await open(wrapper, 1);
		await readyButton(wrapper).trigger("click");
		await flushPromises();

		expect(statuses(order)).toEqual(["Preparing", "Preparing"]);
		expect(showError).toHaveBeenCalledTimes(1);
	});
});

describe("the call-back from the pass", () => {
	it("calls each Ready line back by its id, not every line of its dish", async () => {
		const order = ticket(
			[
				line("r1", "A", 2, "Ready", 2, 0),
				line("r2", "A", 1, "Ready", 1, 0),
				line("r3", "B", 1, "Delivered", 1, 1),
			],
			{
				kds_status: "Ready",
			}
		);
		const wrapper = show(order, { mode: "ready-list" });

		await wrapper.get('[data-test="ticket-main"]').trigger("click");
		await flushPromises();

		expect(updates()).toEqual([
			{ invoice_name: "SINV-PART", item_code: "A", status: "Preparing", row: "r1" },
			{ invoice_name: "SINV-PART", item_code: "A", status: "Preparing", row: "r2" },
		]);
	});
});

describe("a line the server sent without its id (an older server)", () => {
	it("still moves with every line of its dish, by its item code, as it always did", async () => {
		const bare = (code, qty, status) => {
			const { name, ...rest } = line("x", code, qty, status);
			return rest;
		};
		const order = ticket([bare("A", 2, "Preparing"), bare("A", 1, "Preparing")]);
		const wrapper = show(order);

		await open(wrapper, 1);
		await readyButton(wrapper).trigger("click");
		await flushPromises();

		expect(updates()).toEqual([
			{ invoice_name: "SINV-PART", item_code: "A", status: "Ready" },
		]);
		expect(statuses(order)).toEqual(["Ready", "Ready"]);
	});
});
