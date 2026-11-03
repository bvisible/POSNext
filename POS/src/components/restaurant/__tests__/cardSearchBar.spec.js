/**
 * //// Neoffice — added file (no upstream equivalent). The search of the open card and its grid / list switch (NeoResto lot 1, 03.11.2026): what is typed goes out as `update:query`,
 * //// the switch says `update:view`, and the one that is on is pressed. They sit at the end of the row of the card buttons.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	globalThis.__ = (s) => s;
});

vi.mock("../CardPickerMenu.vue", () => ({
	default: { name: "CardPickerMenu", template: "<div />" },
}));

const { default: CardSearchBar } = await import("../CardSearchBar.vue");
const { default: CardFamilyChips } = await import("../CardFamilyChips.vue");

let wrapper;
afterEach(() => wrapper?.unmount());

function bar(props = {}) {
	wrapper = mount(CardSearchBar, {
		props: { query: "", view: "grid", ...props },
		global: { mocks: { __: globalThis.__ } },
	});
	return wrapper;
}

describe("the search of the card", () => {
	it("says what is typed", async () => {
		bar();

		await wrapper.get('[data-test="card-search-input"]').setValue("soup");

		expect(wrapper.emitted("update:query")).toEqual([["soup"]]);
	});

	it("shows the text it was given", () => {
		bar({ query: "pizza" });

		expect(wrapper.get('[data-test="card-search-input"]').element.value).toBe("pizza");
	});

	it("presses the layout that is on, and says the other when it is clicked", async () => {
		bar({ view: "list" });
		expect(wrapper.get('[data-view="list"]').attributes("aria-pressed")).toBe("true");
		expect(wrapper.get('[data-view="grid"]').attributes("aria-pressed")).toBe("false");

		await wrapper.get('[data-view="grid"]').trigger("click");

		expect(wrapper.emitted("update:view")).toEqual([["grid"]]);
	});
});

describe("the row of the families", () => {
	const mountRow = (slots = {}, props = {}) =>
		mount(CardFamilyChips, { props: { families: ["Starters", "Mains"], selected: null, ...props }, slots, global: { mocks: { __: globalThis.__ } } })

	it("carries the search at its end, in the same line, wrapping under the families where the pane is narrow", () => {
		const row = mountRow({ aside: '<div data-test="the-search" />' })

		expect(row.get('[data-test="card-chips-aside"]').find('[data-test="the-search"]').exists()).toBe(true)
		expect(row.find('[data-card-chips] > div').classes()).toContain("flex-wrap")
		row.unmount()
	})

	it("keeps the search on a card that has no family at all: the row holds nothing else", () => {
		const row = mountRow({ aside: '<div data-test="the-search" />' }, { families: [] })

		expect(row.find('[data-chip="all"]').exists()).toBe(false)
		expect(row.find('[data-test="the-search"]').exists()).toBe(true)
		row.unmount()
	})

	it("is not drawn at all with no family and nothing to put at its end", () => {
		const row = mountRow({}, { families: [] })

		expect(row.find("[data-card-chips]").exists()).toBe(false)
		row.unmount()
	})

	it("holds no empty group where nothing is put at its end", () => {
		const row = mountRow()

		expect(row.find('[data-test="card-chips-aside"]').exists()).toBe(false)
		row.unmount()
	})
})
