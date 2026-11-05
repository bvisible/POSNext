/**
 * //// Neoffice — added file (no upstream equivalent). The row of the notes of a table (NeoResto lot 1, notes: « table 5, .1, .2, .3 »): `[.1 Dupont] [.2] [＋]`, one pill per group, the one in front of the waiter filled in ink
 * //// (paper on the phone's ink header), a tap on another pill goes to it, a long press or the ✎ beside the current one names it, the ＋ opens a new group and is drawn only when the page allows it, and a wide pane adds a caption
 * //// (people and total) under each name. Every target is 44 px high; the dark mode wears the neighbouring list's classes.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args) => (args ? text.replace(/\{(\d+)\}/g, (_, at) => args[at]) : text)
})

const { default: TableNotePills } = await import("../TableNotePills.vue")

const pill = (rank, extra = {}) => ({
	rank,
	label: `.${rank}`,
	name: "",
	text: `.${rank}`,
	covers: null,
	total: 0,
	lines: 0,
	invoice: `SINV-${rank}`,
	current: false,
	pending: false,
	...extra,
})
const PILLS = [pill(1, { name: "Dupont", text: ".1 Dupont", current: true, covers: 3, total: 45 }), pill(2, { covers: 2, total: 12.5 })]

let wrapper
function row(props = {}) {
	wrapper = mount(TableNotePills, {
		props: { pills: PILLS, canAdd: true, ...props },
		global: { mocks: { __: globalThis.__ } },
		attachTo: document.body,
	})
	return wrapper
}
const pills = () => wrapper.findAll('[data-test="note-pill"]')

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
	vi.useRealTimers()
	wrapper?.unmount()
	wrapper = undefined
})

describe("the pills of the table's groups", () => {
	it("are one per group, with the rank and the name", () => {
		row()

		expect(pills()).toHaveLength(2)
		expect(pills()[0].find('[data-test="note-pill-label"]').text()).toBe(".1")
		expect(pills()[0].find('[data-test="note-pill-name"]').text()).toBe("Dupont")
		expect(pills()[1].find('[data-test="note-pill-label"]').text()).toBe(".2")
		expect(pills()[1].find('[data-test="note-pill-name"]').exists()).toBe(false)
	})

	it("fill the current one in ink and say so for a screen reader, the others are outlined", () => {
		row()
		const [current, other] = pills()

		expect(current.attributes("aria-pressed")).toBe("true")
		expect(other.attributes("aria-pressed")).toBe("false")
		const filled = current.find("span").classes()
		expect(filled).toContain("bg-[#141414]")
		expect(filled).toContain("text-[#FFFDF8]")
		expect(other.find("span").classes()).toContain("bg-[#FFFDF8]")
		expect(other.find("span").classes()).not.toContain("bg-[#141414]")
	})

	it("wear the dark mode of the list of tables: the chosen pill is the bright paper one", () => {
		row()
		const [current, other] = pills()

		expect(current.find("span").classes()).toEqual(expect.arrayContaining(["dark:bg-ds-paper", "dark:text-ds-ink"]))
		expect(other.find("span").classes()).toContain("dark:text-ds-sand-300")
	})

	it("stand on the phone's ink header as paper when current and outlined in paper otherwise", () => {
		row({ onInk: true })
		const [current, other] = pills()

		expect(current.find("span").classes()).toEqual(expect.arrayContaining(["bg-[#FFFDF8]", "text-[#141414]"]))
		expect(other.find("span").classes()).toContain("border-[#FFFDF8]/35")
		expect(other.find("span").classes()).toContain("text-[#FFFDF8]")
	})

	it("are 44 px high targets with the visible pill drawn inside", () => {
		row()

		for (const one of pills()) expect(one.classes()).toContain("min-h-[44px]")
		expect(wrapper.find('[data-test="note-add"]').classes()).toContain("min-h-[44px]")
		expect(wrapper.find('[data-test="note-rename"]').classes()).toContain("min-h-[44px]")
	})

	it("go to the group tapped", async () => {
		row()

		await pills()[1].trigger("click")

		expect(wrapper.emitted("select")).toEqual([[2]])
	})

	it("do not go to the group already in front of the waiter", async () => {
		row()

		await pills()[0].trigger("click")

		expect(wrapper.emitted("select")).toBeUndefined()
	})

	it("wait while a group is being opened", () => {
		row({ busy: true })

		for (const one of pills()) expect(one.attributes("disabled")).toBeDefined()
		expect(wrapper.find('[data-test="note-add"]').attributes("disabled")).toBeDefined()
	})
})

describe("the ＋ of the row", () => {
	it("opens a new group", async () => {
		row()

		await wrapper.find('[data-test="note-add"]').trigger("click")

		expect(wrapper.emitted("add")).toHaveLength(1)
	})

	it("is drawn only when the page allows a new group", () => {
		row({ canAdd: false })

		expect(wrapper.find('[data-test="note-add"]').exists()).toBe(false)
	})

	it("says what it does", () => {
		row()

		expect(wrapper.find('[data-test="note-add"]').attributes("aria-label")).toBe("Add a group to this table")
	})
})

describe("naming a group", () => {
	it("is asked by the ✎ beside the current pill, which no other pill has", async () => {
		row()

		expect(wrapper.findAll('[data-test="note-rename"]')).toHaveLength(1)
		await wrapper.find('[data-test="note-rename"]').trigger("click")

		expect(wrapper.emitted("rename")).toEqual([[1]])
		expect(wrapper.find('[data-test="note-rename"]').attributes("aria-label")).toBe("Name this group")
	})

	it("is asked by a long press on any pill, which does not also go to the group", async () => {
		row()

		await pills()[1].trigger("pointerdown")
		vi.advanceTimersByTime(700)
		await pills()[1].trigger("pointerup")
		await pills()[1].trigger("click")

		expect(wrapper.emitted("rename")).toEqual([[2]])
		expect(wrapper.emitted("select")).toBeUndefined()
	})

	it("is not asked by a short press, which goes to the group", async () => {
		row()

		await pills()[1].trigger("pointerdown")
		vi.advanceTimersByTime(200)
		await pills()[1].trigger("pointerup")
		await pills()[1].trigger("click")
		vi.advanceTimersByTime(1000)

		expect(wrapper.emitted("rename")).toBeUndefined()
		expect(wrapper.emitted("select")).toEqual([[2]])
	})

	it("is not asked when the finger leaves the pill before the long press is over", async () => {
		row()

		await pills()[1].trigger("pointerdown")
		vi.advanceTimersByTime(200)
		await pills()[1].trigger("pointerleave")
		vi.advanceTimersByTime(1000)

		expect(wrapper.emitted("rename")).toBeUndefined()
	})
})

describe("the caption of a wide pane", () => {
	it("says the people and the total of each group", () => {
		row({ caption: true, currency: "CHF" })
		const captions = wrapper.findAll('[data-test="note-pill-caption"]')

		expect(captions).toHaveLength(2)
		expect(captions[0].text()).toContain("3")
		expect(captions[0].text()).toContain("45")
		expect(captions[1].text()).toContain("2")
		expect(captions[1].text()).toContain("12")
	})

	it("is not drawn on a narrow pane", () => {
		row({ caption: false })

		expect(wrapper.find('[data-test="note-pill-caption"]').exists()).toBe(false)
	})

	it("is not drawn for a group with neither people nor total", () => {
		row({ caption: true, pills: [pill(1, { current: true }), pill(2)] })

		expect(wrapper.find('[data-test="note-pill-caption"]').exists()).toBe(false)
	})
})
