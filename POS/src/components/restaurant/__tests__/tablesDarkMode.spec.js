/**
 * //// Neoffice — added file (no upstream equivalent). The list of the till's tables, and the pieces around it, in DARK mode (NeoResto
 * //// lot 1, smoke-test fix). The list was cream whatever the colour mode: a cream ground, white cards and ink text beside a dark cart. Every
 * //// surface, line and text colour of the list, its cards, its rows, its bar, the sheet « Open a table », the strip under the phone's top and
 * //// the switch « List | Floor plan » now has a dark class beside the light one, from the design system's dark scope; the light mode
 * //// draws what it drew. Here the classes that carry it are pinned, and the light classes of each piece are read back: only `dark:` ones
 * //// were added. The contrast of the colours they name is computed in tablesDarkModeStylesheet.spec.js; a browser measured the screens.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"

globalThis.__ = (text, args = []) =>
	(args || []).reduce((s, arg, at) => s.replace(`{${at}}`, arg), text)

const { default: TablesList } = await import("../TablesList.vue")
const { default: TableCard } = await import("../TableCard.vue")
const { default: TablesPhoneTop } = await import("../TablesPhoneTop.vue")
const { default: TablesViewSwitch } = await import("../TablesViewSwitch.vue")
const look = await import("../tablesListLook.js")

// The classes of an element, split: what the light mode draws, and what only the dark mode adds
const split = (wrapper) => {
	const all = wrapper.classes()
	return {
		light: all.filter((name) => !name.startsWith("dark:")),
		dark: all.filter((name) => name.startsWith("dark:")),
	}
}
const lightOf = (classes) =>
	classes
		.split(/\s+/)
		.filter((name) => name && !name.startsWith("dark:"))
		.sort()
const sorted = (names) => [...names].sort()

const T2 = { name: "t2", table_name: "Table 2", area: "r1", status: "Occupied" }
const T7 = { name: "t7", table_name: "Table 7", area: "r1", status: "Empty" }
const T8 = { name: "t8", table_name: "Table 8", area: "r1", status: "Cleaning" }
const T10 = { name: "t10", table_name: "Table 10", area: "r1", status: "Empty" }

function card(table, tier, badge, extra = {}) {
	return {
		key: table.name,
		kind: "table",
		tier,
		table,
		title: table.table_name,
		badge,
		minutes: null,
		total: null,
		waiting: 0,
		qr: true,
		...extra,
	}
}
const READY = card(
	T2,
	"ready",
	{ text: "Dishes ready at the pass", tone: "ready" },
	{ minutes: 25, total: 48.5 },
)
const BUSY = card(
	T2,
	"occupied",
	{ text: "Occupied", tone: "neutral" },
	{ minutes: 75, total: 120 },
)
const FREE = card(T7, "free", { text: "Empty", tone: "free" })
const CLEANING = card(
	T8,
	"cleaning",
	{ text: "Cleaning", tone: "cleaning" },
	{ qr: false },
)
const SOON = {
	key: "R1",
	kind: "reservation",
	title: "Table 10",
	detail: "reserved 20:15 · 8 guests",
	table: T10,
	late: true,
}
const model = (overrides = {}) => ({
	room: "all",
	rooms: [{ name: "r1", label: "Room 1" }],
	activeCount: 2,
	busy: [READY, BUSY],
	soon: [SOON],
	others: [FREE, CLEANING],
	free: [T7],
	...overrides,
})

let wrapper
afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	document.body.innerHTML = ""
})
function list(props = {}) {
	wrapper = mount(TablesList, {
		attachTo: document.body,
		props: {
			model: model(),
			qrEnabled: true,
			currency: "CHF",
			phone: true,
			takeawayEnabled: true,
			...props,
		},
		global: { mocks: { __: globalThis.__ } },
	})
	return wrapper
}

describe("the list of tables in dark mode (smoke-test fix)", () => {
	it("its ground is the one the plan's canvas has beside it, and its text the design system's paper colour; the light classes are the ones it had", () => {
		list()

		const root = wrapper.get('[data-test="tables-list"]')
		expect(split(root).dark).toEqual(
			expect.arrayContaining(["dark:bg-[#181b21]", "dark:text-ds-paper"]),
		)
		expect(sorted(split(root).light)).toEqual(
			sorted([
				"relative",
				"flex",
				"flex-col",
				"flex-1",
				"min-h-0",
				"bg-[#FAF3EA]",
				"text-[#141414]",
			]),
		)
	})

	it("a card has the dark card, a line of the system's dark border, and the paper and secondary text; a card whose dishes are ready keeps its clay edge in both modes", () => {
		list()

		const [ready, busy] = wrapper.findAll('[data-test="table-card"]')
		expect(split(ready).dark).toEqual(["dark:bg-[#1c1f26]"])
		expect(split(ready).light).toEqual(
			expect.arrayContaining(["border-2", "border-[#D68A59]", "bg-[#FFFDF8]"]),
		)
		expect(split(busy).dark).toEqual(
			expect.arrayContaining([
				"dark:bg-[#1c1f26]",
				"dark:border-[rgba(255,251,245,0.14)]",
			]),
		)
		expect(sorted(split(busy).light)).toEqual(
			sorted([
				"flex",
				"items-stretch",
				"gap-1",
				"rounded-[12px]",
				"bg-[#FFFDF8]",
				"border",
				"border-[#ECE7DE]",
			]),
		)
		const title = busy.get('[data-test="card-title"]')
		expect(split(title).dark).toEqual(["dark:text-ds-paper"])
		expect(split(title).light).toContain("text-[#141414]")
		const details = busy.get('[data-test="card-details"]')
		expect(split(details).dark).toEqual(["dark:text-ds-sand-300"])
		expect(split(details).light).toContain("text-[#6F665A]")
		const qr = busy.get('[data-test="table-qr"]')
		expect(split(qr).dark).toEqual(
			expect.arrayContaining([
				"dark:text-ds-paper",
				"dark:hover:bg-[rgba(255,251,245,0.10)]",
			]),
		)
	})

	it("the badge of each tone has a dark counterpart (the clay « ready » pill is ink on clay in both modes, so it has none)", () => {
		list()

		const badges = wrapper.findAll('[data-test="badge"]')
		const ready = badges[0]
		expect(split(ready).dark).toEqual([])
		expect(split(ready).light).toEqual(
			expect.arrayContaining(["bg-[#D68A59]", "text-[#141414]"]),
		)
		const neutral = badges[1]
		expect(split(neutral).dark).toEqual(
			expect.arrayContaining([
				"dark:bg-[rgba(255,251,245,0.10)]",
				"dark:text-ds-paper",
			]),
		)
		expect(split(neutral).light).toEqual(
			expect.arrayContaining(["bg-[#F6F3ED]", "text-[#524B41]"]),
		)
	})

	it("the filters: the chosen chip is the bright paper one in dark, the others an outline in the secondary text colour", () => {
		list()

		const [all, room] = wrapper.findAll('[data-test="room-chip"]')
		expect(split(all).dark).toEqual(
			expect.arrayContaining([
				"dark:bg-ds-paper",
				"dark:text-ds-ink",
				"dark:border-ds-paper",
			]),
		)
		expect(split(all).light).toEqual(
			expect.arrayContaining(["bg-[#141414]", "text-[#FFFDF8]"]),
		)
		expect(split(room).dark).toEqual(
			expect.arrayContaining([
				"dark:border-[rgba(255,251,245,0.24)]",
				"dark:text-ds-sand-300",
			]),
		)
	})

	it("the section titles, the reservations, the rows, the empty state, the bar and the sheet all have dark classes", async () => {
		list()

		for (const test of ["soon-title", "others-title"])
			expect(split(wrapper.get(`[data-test="${test}"]`)).dark).toEqual([
				"dark:text-ds-sand-300",
			])
		const booking = wrapper.get('[data-test="reservation-card"]')
		expect(split(booking).dark).toEqual(
			expect.arrayContaining(["dark:border-ds-sand-400", "dark:bg-[#1c1f26]"]),
		)
		// A late booking says so in the dark ramp's warning colour
		expect(split(wrapper.get('[data-test="late"]')).dark).toEqual([
			"dark:text-ds-warning",
		])
		const rows = wrapper.findAll('[data-test="table-row"]')
		expect(split(rows[0]).dark).toEqual(
			expect.arrayContaining([
				"dark:bg-[#1c1f26]",
				"dark:border-[rgba(255,251,245,0.14)]",
			]),
		)
		// The state word of a free row, a cleaning row
		expect(
			split(rows[0].get('[data-test="open-table"] > span:nth-child(2)')).dark,
		).toEqual(["dark:text-ds-success"])
		expect(
			split(rows[1].get('[data-test="open-table"] > span:nth-child(2)')).dark,
		).toEqual(["dark:text-ds-sand-300"])

		const bar = wrapper.get('[data-test="tables-bar"]')
		expect(split(bar).dark).toEqual(
			expect.arrayContaining([
				"dark:bg-[#1c1f26]",
				"dark:border-[rgba(255,251,245,0.14)]",
			]),
		)
		const open = bar.findAll("button")[0]
		expect(split(open).dark).toEqual(
			expect.arrayContaining([
				"dark:border-ds-paper",
				"dark:text-ds-paper",
				"dark:bg-transparent",
			]),
		)

		await open.trigger("click")
		const sheet = wrapper.get('[data-test="free-tables"]')
		expect(split(sheet).dark).toEqual(["dark:bg-black/60"])
		const free = wrapper.get('[data-test="free-table"]')
		expect(split(free).dark).toEqual(
			expect.arrayContaining([
				"dark:bg-ds-success/20",
				"dark:text-ds-success-soft",
			]),
		)
		expect(split(free).light).toEqual(
			expect.arrayContaining(["bg-[#E9F7EE]", "border-[#CBEDD7]"]),
		)
	})

	it("an empty list's words read in the secondary text colour", () => {
		list({ model: model({ busy: [], soon: [], others: [] }) })

		expect(split(wrapper.get('[data-test="tables-empty"]')).dark).toEqual([
			"dark:text-ds-sand-300",
		])
	})
})

describe("the colours of the list's badges and words (smoke-test fix)", () => {
	// What the badges and the state words were before the dark mode: the light classes must still be these
	const BEFORE = {
		BADGE_CLASSES: {
			ready: "px-2.5 py-[3px] rounded-xl bg-[#D68A59] text-[#141414] font-bold",
			quiet: "text-[#6F665A]",
			neutral:
				"px-2.5 py-[3px] rounded-xl bg-[#F6F3ED] text-[#524B41] font-semibold",
			paid: "px-2.5 py-[3px] rounded-xl bg-[#E9F7EE] text-[#11663A] font-semibold",
			free: "text-[#11663A]",
			cleaning: "text-[#6F665A]",
			reserved: "text-[#92610C]",
		},
		ROW_STATE_CLASSES: {
			free: "text-[#11663A]",
			cleaning: "text-[#6F665A]",
			reserved: "text-[#92610C]",
		},
	}

	it.each(Object.entries(BEFORE.BADGE_CLASSES))(
		"the %s badge keeps its light classes",
		(tone, before) => {
			expect(lightOf(look.BADGE_CLASSES[tone])).toEqual(lightOf(before))
		},
	)
	it.each(Object.entries(BEFORE.ROW_STATE_CLASSES))(
		"the %s state word of a row keeps its light classes",
		(tone, before) => {
			expect(lightOf(look.ROW_STATE_CLASSES[tone])).toEqual(lightOf(before))
		},
	)
	it("a late booking keeps its light classes", () => {
		expect(lightOf(look.LATE_CLASS)).toEqual(
			lightOf("text-[#92610C] font-semibold"),
		)
	})

	it("every tone but the clay « ready » pill has a dark colour, and it is a colour of the design system's dark scope", () => {
		for (const tone of Object.keys(BEFORE.BADGE_CLASSES)) {
			const dark = look.BADGE_CLASSES[tone]
				.split(/\s+/)
				.filter((name) => name.startsWith("dark:"))
			if (tone === "ready") expect(dark, tone).toEqual([])
			else expect(dark.length, tone).toBeGreaterThanOrEqual(1)
			for (const name of dark)
				expect(name, tone).toMatch(
					/^dark:(text-ds-|bg-ds-success\/20|bg-\[rgba\(255,251,245,0\.10\)\])/,
				)
		}
		for (const tone of Object.keys(BEFORE.ROW_STATE_CLASSES))
			expect(look.ROW_STATE_CLASSES[tone]).toMatch(/dark:text-ds-/)
		expect(look.LATE_CLASS).toMatch(/dark:text-ds-warning/)
	})
})

describe("the strip under the phone's top and its switch in dark mode (smoke-test fix)", () => {
	it("the strip is the ground of the list and of the plan; the ink bar above it is dark in both modes and has no dark class", () => {
		wrapper = mount(TablesPhoneTop, {
			props: { view: "list", userName: "Lea Martin", time: "10:00", runner: 2 },
			global: { mocks: { __: globalThis.__ } },
		})

		expect(split(wrapper).dark).toEqual(["dark:bg-[#181b21]"])
		expect(split(wrapper).light).toEqual(["flex-shrink-0", "bg-[#FAF3EA]"])
		const bar = wrapper.get('[data-test="phone-top-bar"]')
		expect(split(bar).dark).toEqual([])
		expect(split(bar).light).toEqual(
			expect.arrayContaining(["bg-[#141414]", "text-[#FFFDF8]"]),
		)
	})

	it.each(["phone", "line"])(
		"the half of the %s switch in use is the bright paper one in dark, as the kitchen's chosen chip is",
		(size) => {
			wrapper = mount(TablesViewSwitch, {
				props: { view: "list", size },
				global: { mocks: { __: globalThis.__ } },
			})

			const on = wrapper.get('[data-test="view-list"]')
			expect(split(on).dark).toEqual(
				expect.arrayContaining([
					"dark:bg-ds-paper",
					"dark:border-ds-paper",
					"dark:text-ds-ink",
				]),
			)
			// And the light mode still draws the ink half
			expect(split(on).light).toEqual(
				expect.arrayContaining([
					"bg-[#141414]",
					"border-[#141414]",
					"text-[#FFFDF8]",
					"font-bold",
				]),
			)
		},
	)

	it("the half of the phone's switch not in use is a quiet dark card with the secondary text colour", () => {
		wrapper = mount(TablesViewSwitch, {
			props: { view: "list", size: "phone" },
			global: { mocks: { __: globalThis.__ } },
		})

		const off = wrapper.get('[data-test="view-plan"]')
		expect(split(off).dark).toEqual(
			expect.arrayContaining([
				"dark:bg-[#1c1f26]",
				"dark:border-[rgba(255,251,245,0.24)]",
				"dark:text-ds-sand-300",
			]),
		)
		expect(split(off).light).toEqual(
			expect.arrayContaining([
				"bg-[#FFFDF8]",
				"border-[#DCD4C7]",
				"text-[#524B41]",
			]),
		)
	})
})

describe("a table's card alone", () => {
	it("is dark with a dark line when its dishes are not ready, and the ready one has no dark line (its clay edge is the same in both modes)", () => {
		wrapper = mount(TableCard, {
			props: { entry: BUSY, qrEnabled: false },
			global: { mocks: { __: globalThis.__ } },
		})
		expect(split(wrapper).dark).toEqual(
			expect.arrayContaining([
				"dark:bg-[#1c1f26]",
				"dark:border-[rgba(255,251,245,0.14)]",
			]),
		)
		wrapper.unmount()

		wrapper = mount(TableCard, {
			props: { entry: READY, qrEnabled: false },
			global: { mocks: { __: globalThis.__ } },
		})
		expect(split(wrapper).dark).toEqual(["dark:bg-[#1c1f26]"])
	})
})
