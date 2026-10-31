// //// Neoffice — added file (no upstream equivalent).
/**
 * The dishes of a ticket, in the middle column of a row of the invoice history (NeoRestau lot 1, task 29, fix round 1).
 *
 * From 768 px up the dishes are STACKED, one per line, each cut with its own ellipsis, and « +n items » is a line
 * of its own: nothing is clamped, so all the dishes handed over are shown and the count is the server's. Below it
 * the preview sits under the left block, the dishes side by side in the room of two lines: a dish is shown whole or
 * not at all, one that would fall on a third line is clipped and the « +n items » counts it with the dishes the
 * ticket holds beyond the three handed over, so that it never says less than what is hidden. jsdom lays nothing
 * out and has no matchMedia: the tests give each dish the `offsetTop` the browser would and the width asked for.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, i) => String(args[i])) : text);
});

const { default: InvoiceTicketPreview } = await import("../InvoiceTicketPreview.vue");

const line = (item_name, qty) => ({ item_name, qty, uom: null });
const row = (items, count = items.length) => ({ items_preview: items, items_count: count });

// The vertical position the browser would give each dish, by its rank among its siblings
let layout = [];
const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
Object.defineProperty(HTMLElement.prototype, "offsetTop", {
	configurable: true,
	get() {
		const parent = this.parentElement;
		if (!parent || this.dataset.testid !== "invoice-preview-line") return 0;
		return layout[Array.prototype.indexOf.call(parent.children, this)] ?? 0;
	},
});

afterEach(() => {
	layout = [];
	vi.unstubAllGlobals();
});

// The screen width, as matchMedia("(min-width: 768px)") answers it; `set` plays a resize
function viewport(wide) {
	const listeners = new Set();
	const query = {
		matches: wide,
		addEventListener: (_, listener) => listeners.add(listener),
		removeEventListener: (_, listener) => listeners.delete(listener),
	};
	vi.stubGlobal("matchMedia", () => query);
	return {
		set(value) {
			query.matches = value;
			for (const listener of listeners) listener({ matches: value });
		},
	};
}

async function show(preview) {
	const wrapper = mount(InvoiceTicketPreview, { props: { preview } });
	await flushPromises();
	return wrapper;
}

const more = (wrapper) => wrapper.find("[data-testid='invoice-preview-more']");
const dishesOf = (wrapper) => wrapper.findAll("[data-testid='invoice-preview-line']");
const { invoicePreview } = await import("@/utils/invoicePreview");

describe("InvoiceTicketPreview, from 768 px up: the dishes stacked", () => {
	it("stacks the dishes, one per line, each cut by itself", async () => {
		viewport(true);
		const wrapper = await show(invoicePreview(row([line("Pizza", 2), line("Cola", 1), line("Tiramisu", 1)])));
		const stack = wrapper.find("[dir='auto']");
		expect(stack.classes()).toEqual(expect.arrayContaining(["flex-col", "min-w-0"]));
		expect(stack.classes()).not.toContain("overflow-hidden");
		expect(stack.classes()).not.toContain("flex-wrap");
		expect(dishesOf(wrapper).map((dish) => dish.find(".truncate").text())).toEqual([
			"2× Pizza",
			"1× Cola",
			"1× Tiramisu",
		]);
		expect(more(wrapper).exists()).toBe(false);
	});

	it("puts « +n items » on a line of its own under the dishes", async () => {
		viewport(true);
		const wrapper = await show(invoicePreview(row([line("A", 1), line("B", 1), line("C", 1)], 12)));
		expect(more(wrapper).text()).toBe("+9 items");
		expect(wrapper.element.className).toContain("flex-col");
	});

	it("says « +1 item » for one dish left over", async () => {
		viewport(true);
		const wrapper = await show(invoicePreview(row([line("A", 1), line("B", 1), line("C", 1)], 4)));
		expect(more(wrapper).text()).toBe("+1 item");
	});

	it("shows every dish whatever the layout says: nothing is clamped, so nothing is counted but the server's rest", async () => {
		viewport(true);
		layout = [0, 16, 32];
		const wrapper = await show(invoicePreview(row([line("A", 1), line("B", 1), line("C", 1)])));
		expect(more(wrapper).exists()).toBe(false);
		expect(dishesOf(wrapper).map((dish) => dish.attributes("aria-hidden"))).toEqual([undefined, undefined, undefined]);
	});

	it("keeps the whole names in the tooltip of the column", async () => {
		viewport(true);
		const long = "Spaghetti alle vongole veraci con pomodorini del Piennolo e bottarga di muggine";
		const wrapper = await show(invoicePreview(row([line(long, 1)])));
		expect(wrapper.attributes("title")).toContain(long);
		expect(wrapper.text()).not.toContain("muggine");
	});
});

describe("InvoiceTicketPreview, below 768 px: under the left block, in the room of two lines", () => {
	it("gives the dishes the room of two lines, side by side", async () => {
		viewport(false);
		const wrapper = await show(invoicePreview(row([line("Pizza", 2), line("Cola", 1)])));
		const room = wrapper.find("[dir='auto']");
		expect(room.classes()).toEqual(expect.arrayContaining(["flex-wrap", "overflow-hidden", "max-h-[2.3em]"]));
		expect(dishesOf(wrapper).map((dish) => dish.text())).toEqual(["2× Pizza ·", "1× Cola"]);
	});

	it("says nothing more when every dish fits on the two lines", async () => {
		viewport(false);
		layout = [0, 0, 14];
		const wrapper = await show(invoicePreview(row([line("A", 1), line("B", 1), line("C", 1)])));
		expect(more(wrapper).exists()).toBe(false);
	});

	it("counts a dish that fell under the second line, and clips it for the readers too", async () => {
		viewport(false);
		layout = [0, 14, 28];
		const wrapper = await show(invoicePreview(row([line("A", 1), line("B", 1), line("C", 1)])));
		expect(more(wrapper).text()).toBe("+1 item");
		expect(dishesOf(wrapper).map((dish) => dish.attributes("aria-hidden"))).toEqual([undefined, undefined, "true"]);
	});

	it("adds what the room cannot hold to what the ticket holds beyond the three", async () => {
		viewport(false);
		layout = [0, 14, 28];
		// Five dishes, three handed over (hidden: 2), the last of which does not fit: +3
		const wrapper = await show(invoicePreview(row([line("A", 1), line("B", 1), line("C", 1)], 5)));
		expect(more(wrapper).text()).toBe("+3 items");
	});

	it("takes a dish that is alone on a line as shown, however long it is (it is cut by its own ellipsis)", async () => {
		viewport(false);
		layout = [0, 14, 28];
		const wrapper = await show(invoicePreview(row([line("A", 1), line("B", 1)], 2)));
		expect(more(wrapper).exists()).toBe(false);
		expect(wrapper.find(".truncate").exists()).toBe(true);
	});

	it("looks again when the browser says a dish changed size", async () => {
		viewport(false);
		let observed = null;
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(callback) {
					observed = callback;
				}
				observe() {}
				disconnect() {}
			},
		);
		layout = [0, 14, 28];
		const wrapper = await show(invoicePreview(row([line("A", 1), line("B", 1), line("C", 1)])));
		expect(more(wrapper).text()).toBe("+1 item");
		// The dialog is made wider: the three dishes sit on one line
		layout = [0, 0, 0];
		observed();
		await flushPromises();
		expect(more(wrapper).exists()).toBe(false);
	});

	it("starts again from what it is given when the row changes", async () => {
		viewport(false);
		layout = [0, 14, 28];
		const wrapper = await show(invoicePreview(row([line("A", 1), line("B", 1), line("C", 1)])));
		expect(more(wrapper).text()).toBe("+1 item");
		layout = [0, 0];
		await wrapper.setProps({ preview: invoicePreview(row([line("X", 1), line("Y", 1)])) });
		await flushPromises();
		expect(more(wrapper).exists()).toBe(false);
		expect(wrapper.text()).toBe("1× X · 1× Y");
	});
});

describe("InvoiceTicketPreview, when the window crosses 768 px", () => {
	it("stacks the dishes again, and counts nothing the stack clips", async () => {
		const screen = viewport(false);
		layout = [0, 14, 28];
		const wrapper = await show(invoicePreview(row([line("A", 1), line("B", 1), line("C", 1)])));
		expect(more(wrapper).text()).toBe("+1 item");
		screen.set(true);
		await flushPromises();
		expect(more(wrapper).exists()).toBe(false);
		expect(wrapper.find("[dir='auto']").classes()).toContain("flex-col");
		screen.set(false);
		await flushPromises();
		expect(more(wrapper).text()).toBe("+1 item");
	});
});

// The prototype is shared with the other specs of this file's worker: put it back
afterAll(() => {
	if (original) Object.defineProperty(HTMLElement.prototype, "offsetTop", original);
	else Reflect.deleteProperty(HTMLElement.prototype, "offsetTop");
});
