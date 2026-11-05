/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen's notice that the next course is ordered names the GROUP of the table whose course is called (NeoResto lot 1, notes: « table 5, .1, .2, .3 »): « Table 5.1 ·
 * //// Dupont » when the table has several groups, « Table 5 » as ever while it has one, so that the cooks know which of the ticket cards of the table is meant.
 */
import { describe, expect, it } from "vitest"
import { readNextCourses } from "../nextCourseWatch"

const STARTERS = "2026-11-01 12:00:00.000000"
const DESSERTS = "2026-11-01 13:30:00.000000"

const dish = (status, sentAt, family) => ({
	item_code: `${status}-${sentAt}`,
	kds_status: status,
	kds_sent_at: sentAt,
	service_family: family,
	preparation_station: "KITCHEN",
})
const order = (items, extra = {}) => ({
	name: "SINV-A",
	restaurant_table: "T5",
	table_display_name: "Table 5",
	is_takeaway: 0,
	items,
	...extra,
})
const alertAfter = (extra) => {
	const first = readNextCourses([order([dish("Preparing", STARTERS, "Starter")], extra)], null)
	const second = readNextCourses(
		[order([dish("Delivered", STARTERS, "Starter"), dish("Pending", DESSERTS, "Dessert")], extra)],
		first.memory,
	)
	return second.alerts[0]
}

describe("the notice of the next course", () => {
	it("names the group and its name when the table has several", () => {
		expect(alertAfter({ note: 2, note_name: "Dupont", notes_count: 2 }).table).toBe("Table 5.1 · Dupont")
	})

	it("names the group alone when it has no name", () => {
		expect(alertAfter({ note: 1, note_name: null, notes_count: 2 }).table).toBe("Table 5.0")
	})

	it("names the table as ever when it has one group", () => {
		expect(alertAfter({ note: 1, note_name: "Dupont", notes_count: 1 }).table).toBe("Table 5")
		expect(alertAfter({}).table).toBe("Table 5")
	})
})
