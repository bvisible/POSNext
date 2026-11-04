/** Unpaid-tab chip buckets partition the tab. */
import { describe, expect, it } from "vitest"
import { unpaidInvoiceBucket } from "../unpaidInvoiceBucket"

const invoices = [
	{ status: "Overdue", paid_amount: 0 },
	{ status: "Overdue", paid_amount: 40 },
	{ status: "Overdue and Discounted", paid_amount: 0 },
	{ status: "Partly Paid", paid_amount: 10 },
	{ status: "Partly Paid and Discounted", paid_amount: 5 },
	{ status: "Unpaid", paid_amount: 0 },
	{ status: "Unpaid", paid_amount: 3 },
	{ status: "Draft" },
]

describe("unpaidInvoiceBucket", () => {
	it("puts every invoice in exactly one bucket, so the counts sum to the tab", () => {
		//// Neoffice — the buckets without Object.groupBy, which Node has only from 21: our CI runs this suite on Node 20, the
		//// Node the till is built with (frontend-tests.yml), where it threw « Object.groupBy is not a function » (04.11).
		//// Upstream: const counts = Object.groupBy(invoices, unpaidInvoiceBucket)
		const counts = {}
		for (const invoice of invoices) {
			const bucket = unpaidInvoiceBucket(invoice)
			counts[bucket] = [...(counts[bucket] || []), invoice]
		}
		expect(counts.overdue).toHaveLength(3)
		expect(counts.partial).toHaveLength(3)
		expect(counts.unpaid).toHaveLength(2)
		expect(
			counts.overdue.length + counts.partial.length + counts.unpaid.length,
		).toBe(invoices.length)
	})

	it("ranks overdue above partly paid", () => {
		expect(unpaidInvoiceBucket({ status: "Overdue", paid_amount: 40 })).toBe(
			"overdue",
		)
	})
})
