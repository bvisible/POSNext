/**
 * //// Neoffice — added file (no upstream equivalent). The sections of a ticket by service family, and the pale tint of a category
 * //// (NeoRestau lot 1, Daniel's request of 01.11). The dishes still to cook are cut into sections in the order of the meal (Drink,
 * //// Starter, Main, Dessert); a dish whose family is unknown stands loose at the top, under no label; a ticket that carries no family
 * //// at all is one loose section and is drawn as it always was. A category's colour is user data that ends up in a style: only a
 * //// strict `#RRGGBB` is ever used.
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const translate = vi.hoisted(() => vi.fn())
vi.hoisted(() => {
	globalThis.__ = (...args) => globalThis.__spy(...args)
})

globalThis.__spy = (text, replace, context) => {
	translate(text, replace, context)
	return text
}

const {
	TINT_ALPHA,
	TINT_CLASS,
	inSections,
	isColor,
	sectionLabel,
	sectionsOf,
	tintOf,
	tintStyle,
} = await import("../ticketFamilies.js")

const dish = (name, family, extra = {}) => ({
	name,
	item_name: name,
	service_family: family,
	...extra,
})
const names = (lines) => lines.map((line) => line.name)

beforeEach(() => translate.mockClear())

describe("the sections of the dishes still to cook", () => {
	it("come in the order of the meal whatever the order the dishes were given in", () => {
		const sections = sectionsOf([
			dish("tart", "Dessert"),
			dish("steak", "Main"),
			dish("soup", "Starter"),
			dish("cola", "Drink"),
		])

		expect(sections.map((section) => section.family)).toEqual([
			"Drink",
			"Starter",
			"Main",
			"Dessert",
		])
		expect(sections.map((section) => names(section.items))).toEqual([
			["cola"],
			["soup"],
			["steak"],
			["tart"],
		])
	})

	it("keep the order of the dishes inside a section", () => {
		const sections = sectionsOf([
			dish("penne", "Main"),
			dish("soup", "Starter"),
			dish("steak", "Main"),
			dish("salad", "Starter"),
		])

		expect(names(sections[0].items)).toEqual(["soup", "salad"])
		expect(names(sections[1].items)).toEqual(["penne", "steak"])
	})

	it("leave out a family no dish belongs to: no empty section", () => {
		const sections = sectionsOf([
			dish("soup", "Starter"),
			dish("tart", "Dessert"),
		])

		expect(sections.map((section) => section.family)).toEqual([
			"Starter",
			"Dessert",
		])
	})

	it("put the dishes of no family first, in one section without a label", () => {
		const sections = sectionsOf([
			dish("tart", "Dessert"),
			dish("gum", ""),
			dish("soup", "Starter"),
			dish("mints", undefined),
		])

		expect(sections[0]).toEqual({
			family: "",
			label: "",
			items: [
				expect.objectContaining({ name: "gum" }),
				expect.objectContaining({ name: "mints" }),
			],
		})
		expect(sections.slice(1).map((section) => section.family)).toEqual([
			"Starter",
			"Dessert",
		])
	})

	it("take a family nobody knows for no family", () => {
		const sections = sectionsOf([
			dish("cheese", "Cheese"),
			dish("soup", "Starter"),
		])

		expect(sections.map((section) => section.family)).toEqual(["", "Starter"])
		expect(names(sections[0].items)).toEqual(["cheese"])
	})

	it("are ONE section without a label when no dish carries a family: the ticket of a site that sets none", () => {
		const lines = [dish("a", ""), dish("b", undefined), dish("c", null)]

		const sections = sectionsOf(lines)

		expect(sections).toHaveLength(1)
		expect(sections[0].label).toBe("")
		expect(names(sections[0].items)).toEqual(["a", "b", "c"])
	})

	it("are none for no dish", () => {
		expect(sectionsOf([])).toEqual([])
		expect(sectionsOf(undefined)).toEqual([])
	})
})

describe("the label of a section", () => {
	it("is the plural of the family, through the translation with the context « Service family »", () => {
		expect(
			["Drink", "Starter", "Main", "Dessert"].map((family) =>
				sectionLabel(family),
			),
		).toEqual(["Drinks", "Starters", "Mains", "Desserts"])

		expect(translate.mock.calls).toEqual([
			["Drinks", null, "Service family"],
			["Starters", null, "Service family"],
			["Mains", null, "Service family"],
			["Desserts", null, "Service family"],
		])
	})

	it("is empty for no family, and for one nobody knows", () => {
		expect(sectionLabel("")).toBe("")
		expect(sectionLabel("Cheese")).toBe("")
		expect(sectionLabel(undefined)).toBe("")
	})
})

describe("the dishes in the order they are drawn", () => {
	it("say which dish opens a labelled section: the first of each, and no other", () => {
		const drawn = inSections([
			dish("cola", "Drink"),
			dish("soup", "Starter"),
			dish("salad", "Starter"),
			dish("tart", "Dessert"),
		])

		expect(drawn.map((line) => line._head?.family ?? null)).toEqual([
			"Drink",
			"Starter",
			null,
			"Dessert",
		])
		expect(drawn[1]._head.label).toBe("Starters")
	})

	it("draw a faint rule between two dishes of a section, and none under a label (the label is the divider) nor above the first dish", () => {
		const drawn = inSections([
			dish("cola", "Drink"),
			dish("soup", "Starter"),
			dish("salad", "Starter"),
			dish("tart", "Dessert"),
		])

		expect(drawn.map((line) => line._rule)).toEqual([false, false, true, false])
	})

	it("draw a ticket without a family as it always was: no label, a rule above every dish but the first", () => {
		const drawn = inSections([dish("a", ""), dish("b", ""), dish("c", "")])

		expect(drawn.map((line) => line._head)).toEqual([null, null, null])
		expect(drawn.map((line) => line._rule)).toEqual([false, true, true])
		expect(names(drawn)).toEqual(["a", "b", "c"])
	})

	it("draw the loose dishes first, with a rule between them, then the sections", () => {
		const drawn = inSections([
			dish("tart", "Dessert"),
			dish("gum", ""),
			dish("mints", ""),
		])

		expect(names(drawn)).toEqual(["gum", "mints", "tart"])
		expect(drawn.map((line) => line._head?.label ?? null)).toEqual([
			null,
			null,
			"Desserts",
		])
		expect(drawn.map((line) => line._rule)).toEqual([false, true, false])
	})

	it("put the delivered dishes last, under no label, with the rule they always had above them", () => {
		const drawn = inSections(
			[dish("soup", "Starter"), dish("steak", "Main")],
			[dish("cola", "Drink", { kds_status: "Delivered" })],
		)

		expect(names(drawn)).toEqual(["soup", "steak", "cola"])
		expect(drawn[2]._head).toBeNull()
		expect(drawn[2]._rule).toBe(true)
		expect(drawn[2].service_family).toBe("Drink")
	})

	it("draw a send of delivered dishes only as it always was", () => {
		const drawn = inSections([], [dish("a", "Starter"), dish("b", "Starter")])

		expect(drawn.map((line) => line._head)).toEqual([null, null])
		expect(drawn.map((line) => line._rule)).toEqual([false, true])
	})

	it("copy the dishes and keep everything they carry, the place the status menu reads included", () => {
		const original = dish("soup", "Starter", {
			_globalIdx: 7,
			kds_status: "Pending",
		})

		const [copy] = inSections([original])

		expect(copy).not.toBe(original)
		expect(copy).toMatchObject({
			name: "soup",
			_globalIdx: 7,
			kds_status: "Pending",
		})
		expect(original).not.toHaveProperty("_head")
	})
})

describe("a category's colour", () => {
	it.each(["#CFE8FF", "#cfe8ff", "#aBc012", "#000000", "#FFFFFF"])(
		"%s is a colour",
		(value) => {
			expect(isColor(value)).toBe(true)
		},
	)

	it.each([
		"red",
		"#FFF",
		"#12345",
		"#1234567",
		"#GGGGGG",
		"rgb(1, 2, 3)",
		"#CFE8FF;background:url(x)",
		"#CFE8FF\n",
		" #CFE8FF",
		"#CFE8FF ",
		"javascript:alert(1)",
		'#CFE8FF"><script>',
		"",
		null,
		undefined,
		12345,
		{},
	])("%j is not a colour", (value) => {
		expect(isColor(value)).toBe(false)
	})

	it("becomes a tint of 16 % of itself, written as rgba so that it works everywhere", () => {
		expect(TINT_ALPHA).toBe(0.16)
		expect(tintOf("#CFE8FF")).toBe("rgba(207, 232, 255, 0.16)")
		expect(tintOf("#000000")).toBe("rgba(0, 0, 0, 0.16)")
		expect(tintOf("#ffffff")).toBe("rgba(255, 255, 255, 0.16)")
	})

	it("has no tint when it is no colour: nothing is ever put in a style unchecked", () => {
		for (const bad of ["red", "#FFF", "#CFE8FF;x", "", null, undefined]) {
			expect(tintOf(bad)).toBe("")
			expect(tintStyle(bad)).toBeUndefined()
		}
	})

	it("is handed to the row as a variable the row's class reads, so that the row's pressed state still wins over it", () => {
		expect(tintStyle("#CFE8FF")).toEqual({
			"--service-tint": "rgba(207, 232, 255, 0.16)",
		})
		expect(TINT_CLASS).toBe("bg-[color:var(--service-tint)]")
	})
})
