//// Neoffice — added file (no upstream equivalent). The approver of « Open a card outside its hours » reads which card it
//// is (NeoRestau lot 1, task 25): the summary of the authorization dialog gains a row for it, and the other actions' summaries
//// are as they were.
import { describe, expect, it } from "vitest"
import { buildAuthorizationSummary } from "@/utils/authorizationSummary"

const build = (state) =>
	buildAuthorizationSummary(state, { formatAmount: (value) => `CHF ${value}` })

describe("the summary of an approval to open a card outside its hours", () => {
	it("names the action and the card, by the label the cashier sees", () => {
		const rows = build({
			action: "Open a card outside its hours",
			actionLabel: "Open a card outside its hours",
			context: {
				pos_profile: "Till 1",
				restaurant_card: "Saturday service-2",
				card_label: "Saturday service",
			},
		})

		expect(rows.map((row) => row.key)).toEqual(["action", "restaurant_card"])
		expect(rows[1].value).toBe("Saturday service")
		expect(rows[1].label).toBeTruthy()
	})

	it("falls back on the name of the card when no label came along", () => {
		const rows = build({
			action: "Open a card outside its hours",
			context: { restaurant_card: "Saturday service" },
		})

		expect(rows.find((row) => row.key === "restaurant_card").value).toBe(
			"Saturday service",
		)
	})

	it("adds nothing to the summary of any other action", () => {
		const rows = build({
			action: "Sales Invoice Return",
			context: { amount: 12, return_against: "ACC-1" },
		})

		expect(rows.map((row) => row.key)).toEqual([
			"action",
			"amount",
			"return_against",
		])
	})
})
