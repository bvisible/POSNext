/**
 * //// Neoffice — added file (no upstream equivalent). « Back » from a table goes through the question about a sent dish taken off (NeoResto lot 1, product owner, 03.11.2026):
 * the tablet's header and the phone's screen both emit `back` to the page's `closeTable`, so the question is asked there, once, for both.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const page = readFileSync(new URL("../POSSale.vue", import.meta.url), "utf8")

describe("the way back from a table, in the till's page", () => {
	it("goes through the question about a sent dish taken off, not straight to the cart's clearing", () => {
		expect(page).toMatch(/useLeaveTable\(\s*\{/)
		expect(page).toMatch(/function closeTable\(options\)\s*\{\s*return leaveTable\.requestLeave\(\{ unsentAsked: Boolean\(options\?\.unsentAsked\) \}\)/)
	})

	it("draws the question, and hands it what the composable knows", () => {
		expect(page).toMatch(/<LeaveTableDialog\b[^>]*v-if="leaveTable\.asking\.value"/s)
		expect(page).toMatch(/@send="leaveTable\.sendCancellation"/)
		expect(page).toMatch(/@put-back="leaveTable\.putTheOrderBack"/)
		expect(page).toMatch(/@stay="leaveTable\.stay"/)
		expect(page).toMatch(/@leave="leaveTable\.leaveAnyway"/)
		expect(page).toMatch(/:unsent="leaveTable\.unsentCount\.value"/)
		expect(page).toMatch(/:is-takeaway="cartStore\.isTakeaway"/)
	})

	it("sends a cancellation made only of the lines the saved order has", () => {
		expect(page).toMatch(/linesOfTheSavedOrder\(/)
	})

	it("cancels the whole order when no line is left to save, and hands the dialog the news", () => {
		expect(page).toMatch(/pos_next\.api\.restaurant\.cancel_table_order/)
		expect(page).toMatch(/:emptied="leaveTable\.emptied\.value"/)
	})

	it("remembers what had left for the kitchen when an order is read back for a guest's update", () => {
		expect(page).toMatch(/cartStore\.replaceAllItems\(orderData\.items\);[\s\S]{0,400}cartStore\.rememberSentLines\(\)/)
	})
})
