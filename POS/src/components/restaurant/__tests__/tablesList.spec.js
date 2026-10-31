/**
 * //// Neoffice — added file (no upstream equivalent). The list of tables as the waiter mockup draws it (NeoRestau lot 1,
 * //// task 26): a white card per table with something going on, its name in 18 px bold, a badge on the right and one
 * //// muted line under it; the reservations arriving under « Soon », dashed; then the other tables, one line each. A
 * //// tap on a card opens the table as a tap on the plan does; the table's QR code is one tap away, on the card. On a
 * //// phone a bar at the bottom opens a free table or a takeaway order.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"

globalThis.__ = (text, args = []) =>
	(args || []).reduce((s, arg, at) => s.replace(`{${at}}`, arg), text)

const { default: TablesList } = await import("../TablesList.vue")
const { default: TableCard } = await import("../TableCard.vue")

const T2 = { name: "t2", table_name: "Table 2", area: "r1", status: "Occupied" }
const T5 = { name: "t5", table_name: "Table 5", area: "r1", status: "Occupied" }
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
	{ minutes: 25, total: 48.5, waiting: 2 },
)
const BUSY = card(
	T5,
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
}
const UNSEATED = {
	key: "R2",
	kind: "reservation",
	title: "No table",
	detail: "reserved 20:30 · 2 guests",
	table: null,
}

function model(overrides = {}) {
	return {
		room: "all",
		rooms: [],
		activeCount: 2,
		busy: [READY, BUSY],
		soon: [SOON, UNSEATED],
		others: [FREE, CLEANING],
		free: [T7],
		...overrides,
	}
}

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

const cards = () => wrapper.findAll('[data-test="table-card"]')
const texts = (els) => els.map((el) => el.text().replace(/\s+/g, " ").trim())

describe("the list of tables", () => {
	it("shows the busy tables first, in the order it is given, then « Soon », then the other tables", () => {
		list()

		const order = wrapper
			.findAll("[data-test]")
			.map((el) => el.attributes("data-test"))
		const kept = order.filter((test) =>
			[
				"table-card",
				"soon-title",
				"reservation-card",
				"others-title",
				"table-row",
			].includes(test),
		)
		expect(kept).toEqual([
			"table-card",
			"table-card",
			"soon-title",
			"reservation-card",
			"reservation-card",
			"others-title",
			"table-row",
			"table-row",
		])
		expect(
			texts(cards()).map((text) => text.split(" ").slice(0, 2).join(" ")),
		).toEqual(["Table 2", "Table 5"])
		expect(wrapper.find('[data-test="soon-title"]').text()).toBe("Soon")
	})

	it("opens the table of a card as a tap on the plan does: it hands the table over", async () => {
		list()

		await cards()[1].find('[data-test="open-table"]').trigger("click")

		expect(wrapper.emitted("open-table")).toEqual([[T5]])
	})

	it("puts the table's QR code one tap away on each card that may have one, through the one entry", async () => {
		list()

		const qr = wrapper.findAll('[data-test="table-qr"]')
		// Table 2 and Table 5 (occupied), Table 7 (free); Table 8 is being cleaned
		expect(qr).toHaveLength(3)
		await qr[0].trigger("click")
		await qr[2].trigger("click")

		expect(wrapper.emitted("show-qr")).toEqual([[T2], [T7]])
		// The QR button opens no table
		expect(wrapper.emitted("open-table")).toBeUndefined()
	})

	it("draws the QR button as a 44 px target with a name a screen reader says", () => {
		list()

		const qr = wrapper.find('[data-test="table-qr"]')
		expect(qr.classes()).toEqual(expect.arrayContaining(["w-11", "h-11"]))
		expect(qr.attributes("aria-label")).toBe("QR code of Table 2")
		expect(qr.find("svg").exists()).toBe(true)
	})

	it("offers no QR code where the restaurant takes no QR orders", () => {
		list({ qrEnabled: false })

		expect(wrapper.find('[data-test="table-qr"]').exists()).toBe(false)
	})

	it("opens the table of a reservation, and nothing for one without a table", async () => {
		list()
		const [withTable, without] = wrapper.findAll(
			'[data-test="reservation-card"]',
		)

		await withTable.find("button").trigger("click")
		expect(wrapper.emitted("open-table")).toEqual([[T10]])

		expect(without.find("button").exists()).toBe(false)
		expect(texts([without])).toEqual(["No table reserved 20:30 · 2 guests"])
	})

	it("marks a booking whose guests are late (fix round 1)", () => {
		list({
			model: model({
				soon: [{ ...SOON, late: true }, UNSEATED],
			}),
		})

		const [late, coming] = wrapper.findAll('[data-test="reservation-card"]')
		expect(late.find('[data-test="late"]').text()).toBe("Late")
		expect(late.find('[data-test="late"]').classes()).toContain(
			"text-[#92610C]",
		)
		expect(coming.find('[data-test="late"]').exists()).toBe(false)
	})

	it("draws in the design system's tokens: the free tables to open in its greens (fix round 1)", async () => {
		list({ model: model({ free: [T7] }) })
		await wrapper
			.find('[data-test="tables-bar"]')
			.findAll("button")[0]
			.trigger("click")

		expect(wrapper.find('[data-test="free-table"]').classes()).toEqual(
			expect.arrayContaining(["bg-[#E9F7EE]", "border-[#CBEDD7]"]),
		)
		expect(wrapper.html()).not.toMatch(/A7DDB9|15803D|E6F4EA|A16207/i)
	})

	it("keeps the till's own fonts after Karla, the riyal sign and Arabic included (fix round 1)", () => {
		list()

		const font = wrapper.find('[data-test="tables-list"]').attributes("style")
		expect(font).toMatch(
			/Karla, Inter, SaudiRiyalSymbol, "IBM Plex Sans Arabic", "IBM Plex Sans", sans-serif/,
		)
	})

	it("draws the reservations dashed, as the mockup", () => {
		list()

		expect(wrapper.find('[data-test="reservation-card"]').classes()).toEqual(
			expect.arrayContaining(["border-dashed"]),
		)
	})

	it("opens a free or a cleaning table from its line", async () => {
		list()
		const [free, cleaning] = wrapper.findAll('[data-test="table-row"]')

		await free.find('[data-test="open-table"]').trigger("click")
		await cleaning.find('[data-test="open-table"]').trigger("click")

		expect(wrapper.emitted("open-table")).toEqual([[T7], [T8]])
		expect(texts([free, cleaning])).toEqual([
			"Table 7 Empty",
			"Table 8 Cleaning",
		])
	})

	it("leaves out « Soon » and the other tables when there is none", () => {
		list({ model: model({ soon: [], others: [] }) })

		expect(wrapper.find('[data-test="soon-title"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="others-title"]').exists()).toBe(false)
	})

	it("says so when there is no table to show", () => {
		list({ model: model({ busy: [], soon: [], others: [], free: [] }) })

		expect(wrapper.find('[data-test="tables-empty"]').text()).toBe(
			"No table to show",
		)
	})
})

describe("the bar at the bottom of a phone's list", () => {
	const bar = () => wrapper.find('[data-test="tables-bar"]')

	it("holds « Open a table » and « Takeaway », 48 px, ink outline", () => {
		list()

		const buttons = bar().findAll("button")
		expect(texts(buttons)).toEqual(["Open a table", "Takeaway"])
		for (const button of buttons) {
			expect(button.classes()).toEqual(
				expect.arrayContaining(["min-h-[48px]", "border-[#141414]"]),
			)
		}
	})

	it("is a phone's: a tablet's list has none, its line holds the takeaway", () => {
		list({ phone: false })

		expect(bar().exists()).toBe(false)
	})

	it("starts a takeaway order as the plan's Takeaway does", async () => {
		list()

		await bar().findAll("button")[1].trigger("click")

		expect(wrapper.emitted("start-takeaway")).toHaveLength(1)
	})

	it("offers no takeaway where the till takes none, and « Open a table » takes the whole bar", () => {
		list({ takeawayEnabled: false })

		const buttons = bar().findAll("button")
		expect(texts(buttons)).toEqual(["Open a table"])
		expect(buttons[0].classes()).toContain("col-span-2")
	})

	it("opens the free tables of what is shown, and seats the one picked as the plan does", async () => {
		list({ model: model({ free: [T7, T10] }) })

		await bar().findAll("button")[0].trigger("click")
		const sheet = wrapper.find('[data-test="free-tables"]')
		expect(sheet.exists()).toBe(true)
		const picks = sheet.findAll('[data-test="free-table"]')
		expect(texts(picks)).toEqual(["Table 7", "Table 10"])

		await picks[1].trigger("click")

		expect(wrapper.emitted("open-table")).toEqual([[T10]])
		expect(wrapper.find('[data-test="free-tables"]').exists()).toBe(false)
	})

	it("says so when no table is free, and closes", async () => {
		list({ model: model({ free: [] }) })

		await bar().findAll("button")[0].trigger("click")
		expect(wrapper.find('[data-test="free-tables"]').text()).toContain(
			"No free table",
		)

		await wrapper.find('[data-test="free-tables-close"]').trigger("click")
		expect(wrapper.find('[data-test="free-tables"]').exists()).toBe(false)
	})

	it("closes the free tables on Escape and on a tap beside them", async () => {
		list()
		await bar().findAll("button")[0].trigger("click")

		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
		await wrapper.vm.$nextTick()
		expect(wrapper.find('[data-test="free-tables"]').exists()).toBe(false)

		await bar().findAll("button")[0].trigger("click")
		await wrapper.find('[data-test="free-tables"]').trigger("click")
		expect(wrapper.find('[data-test="free-tables"]').exists()).toBe(false)
		expect(wrapper.emitted("open-table")).toBeUndefined()
	})
})

describe("a card", () => {
	function aCard(entry, props = {}) {
		wrapper = mount(TableCard, {
			props: { entry, qrEnabled: true, currency: "CHF", ...props },
			global: { mocks: { __: globalThis.__ } },
		})
		return wrapper
	}
	const line = () => wrapper.find('[data-test="card-details"]')

	it("names the table in 18 px bold and its badge on the right, as the mockup", () => {
		aCard(READY)

		const title = wrapper.find('[data-test="card-title"]')
		expect(title.text()).toBe("Table 2")
		expect(title.classes()).toEqual(
			expect.arrayContaining(["text-[18px]", "font-bold"]),
		)
		expect(wrapper.find('[data-test="badge"]').text()).toBe(
			"Dishes ready at the pass",
		)
	})

	it("says under it how long the table has been seated, its total and the lines on hold", () => {
		aCard(READY)

		expect(line().text()).toBe("For 25 min · CHF 48.50 · 2 waiting")
		expect(line().classes()).toEqual(expect.arrayContaining(["text-[13px]"]))
	})

	it("says the hours past the hour", () => {
		aCard(BUSY)

		expect(line().text()).toBe("For 1 h 15 · CHF 120.00")
	})

	it("says only what it knows", () => {
		aCard({ ...BUSY, minutes: null, total: null, waiting: 0 })

		expect(line().exists()).toBe(false)
	})

	it("draws a table ready at the pass in clay: its border and its badge", () => {
		aCard(READY)

		expect(wrapper.find('[data-test="table-card"]').classes()).toEqual(
			expect.arrayContaining(["border-2", "border-[#D68A59]"]),
		)
		expect(wrapper.find('[data-test="badge"]').classes()).toEqual(
			expect.arrayContaining(["bg-[#D68A59]", "text-[#141414]", "font-bold"]),
		)
	})

	it("writes a QR order to accept as quiet text, as the mockup, and an occupied table's word in a sand pill", () => {
		aCard(card(T5, "qr", { text: "QR · 1 item to accept", tone: "quiet" }))
		const quiet = wrapper.find('[data-test="badge"]')
		expect(quiet.classes()).toEqual(expect.arrayContaining(["text-[#6F665A]"]))
		expect(quiet.classes()).not.toContain("rounded-xl")
		wrapper.unmount()

		aCard(BUSY)
		expect(wrapper.find('[data-test="badge"]').classes()).toEqual(
			expect.arrayContaining(["rounded-xl", "bg-[#F6F3ED]", "text-[#524B41]"]),
		)
		expect(wrapper.find('[data-test="table-card"]').classes()).toEqual(
			expect.arrayContaining(["border", "border-[#ECE7DE]"]),
		)
	})
})
