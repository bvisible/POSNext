//// Neoffice — added file (no upstream equivalent).
////
//// A web takeaway order that the payment provider settled is settled by the SERVER, whether or not the customer's page comes
//// back (neoffice-maintenance#2132). Played for real on osiris on 04.11: the customer paid on the provider's page, the money
//// was booked on the invoice by the `payments` app, and the order stayed a draft with its lines held (the kitchen never heard
//// of it) because the page that asks for the settlement had come back in another browser.
////
//// No page is opened here, on purpose: the order is made, the provider "settles" it the way its webhook does, and the real
//// workers must submit the invoice and send its lines to the kitchen on their own.

const { test, expect } = require("@playwright/test");
const {
	aDiner,
	aHeldTakeawayOrder,
	theProviderSettles,
	onTheServer,
	cleanUp,
} = require("../fixtures/server");

function theOrder(invoice) {
	const out = onTheServer(`
doc = frappe.db.get_value("Sales Invoice", ${JSON.stringify(
		invoice
	)}, ["docstatus", "paid_amount", "grand_total", "posa_ticket_no"], as_dict=True)
lines = frappe.get_all("Sales Invoice Item", filters={"parent": ${JSON.stringify(
		invoice
	)}}, pluck="kds_status")
print(json.dumps({"docstatus": doc.docstatus, "paid": doc.paid_amount, "total": doc.grand_total, "ticket": doc.posa_ticket_no, "lines": lines}))
`);
	return JSON.parse(out.split("\n").pop().trim());
}

async function waitUntil(read, done, timeout) {
	const deadline = Date.now() + timeout;
	let last = null;
	while (Date.now() < deadline) {
		last = read();
		if (done(last)) return last;
		await new Promise((resolve) => setTimeout(resolve, 3000));
	}
	return last;
}

test.describe("a paid web takeaway order is settled by the server", () => {
	// Nothing here is a page: one project is enough
	test.beforeEach((_fixtures, info) => {
		test.skip(info.project.name !== "phone", "server side only, no page");
	});

	test("nobody opens the page after the payment: the invoice is submitted and its lines go to the kitchen by themselves", async () => {
		const address = aDiner();
		const held = aHeldTakeawayOrder(address);
		try {
			const before = theOrder(held.invoice);
			expect(before.docstatus).toBe(0);
			expect(before.lines.every((status) => status === "Waiting")).toBe(true);

			theProviderSettles(held.invoice);

			// The intent's update queues the settlement; the real workers run it (a job every five minutes backs it up)
			const settled = await waitUntil(
				() => theOrder(held.invoice),
				(order) => order.docstatus === 1,
				150_000
			);

			expect(settled.docstatus).toBe(1);
			expect(settled.paid).toBeCloseTo(settled.total, 2);
			expect(settled.lines.length).toBeGreaterThan(0);
			expect(settled.lines.every((status) => status === "Pending")).toBe(true);
			expect(settled.ticket).toBeTruthy();
		} finally {
			cleanUp({ tokenNames: [held.token_name], addresses: [address] });
		}
	});
});
