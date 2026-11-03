/**
 * //// Neoffice — added file (no upstream equivalent). The families of the open card are buttons as big as the card buttons above them (NeoResto lot 1, product owner, 03.11.2026:
 * //// « aligner les boutons des familles avec le bouton du dessus des cartes… c'est un petit peu petit »): the same size, corner and border, one for « All » and one per family,
 * //// the sub-categories row keeping its colour dot. A family is picked by a click; « All » says null.
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

const { default: CardFamilyChips } = await import("../CardFamilyChips.vue");
const { default: RestaurantCardTabs } = await import("../RestaurantCardTabs.vue");

let wrapper;
function chips(props = {}) {
	wrapper = mount(CardFamilyChips, {
		props: { families: ["Menu du jour", "Entrées", "Plats"], selected: null, ...props },
		global: { mocks: { __: globalThis.__ } },
	});
	return wrapper;
}
const buttons = () => wrapper.findAll("button");

afterEach(() => wrapper?.unmount());

describe("the family buttons", () => {
	it("are as big as a card button: same text size, padding and corner", () => {
		chips();
		const card = mount(RestaurantCardTabs, {
			props: { cards: [{ name: "Lunch", card_name: "Lunch" }], selected: "Lunch" },
			global: { mocks: { __: globalThis.__ } },
		});
		const cardClasses = card.get('[data-test="card-button"]').classes();

		for (const size of [
			"px-2",
			"py-1.5",
			"sm:px-3",
			"sm:py-2",
			"text-[10px]",
			"sm:text-xs",
			"rounded-neo-sm",
		]) {
			expect(cardClasses).toContain(size);
			expect(buttons()[1].classes()).toContain(size);
		}
		card.unmount();
	});

	it("are « All » and one button per family, in the card's order", () => {
		chips();

		expect(buttons().map((button) => button.text())).toEqual([
			"All",
			"Menu du jour",
			"Entrées",
			"Plats",
		]);
	});

	it("show « All » as the one chosen while no family is, and the family chosen otherwise", () => {
		chips();
		expect(buttons().map((button) => button.attributes("aria-pressed"))).toEqual([
			"true",
			"false",
			"false",
			"false",
		]);

		wrapper.unmount();
		chips({ selected: "Entrées" });
		expect(buttons().map((button) => button.attributes("aria-pressed"))).toEqual([
			"false",
			"false",
			"true",
			"false",
		]);
	});

	it("say which family was picked, and null for « All »", async () => {
		chips({ selected: "Plats" });

		await buttons()[2].trigger("click");
		await buttons()[0].trigger("click");

		expect(wrapper.emitted("select")).toEqual([["Entrées"], [null]]);
	});
});

describe("the sub-categories row", () => {
	it("is marked for the till's page and carries the colour of a sub-category as a dot", () => {
		chips({
			level: "sub",
			families: [
				{ label: "Bières", color: "#F59E0B" },
				{ label: "Vins", color: null },
			],
		});

		expect(wrapper.find("[data-card-subchips]").exists()).toBe(true);
		expect(buttons()[1].find("span").attributes("style")).toContain("background-color");
		expect(buttons()[2].find("span").exists()).toBe(false);
	});

	it("is not marked as the sub-categories row when it is the categories", () => {
		chips();

		expect(wrapper.find("[data-card-subchips]").exists()).toBe(false);
	});

	it("draws the border of the sub-category chosen in its colour", () => {
		chips({
			level: "sub",
			families: [{ label: "Bières", color: "#F59E0B" }],
			selected: "Bières",
		});

		expect(buttons()[1].attributes("style")).toContain("border-color");
	});
});
