//// Neoffice — added file (no upstream equivalent). Filter bar of the Neopos Register report we
//// added: date range, company, closing, POS Profile, cashier, customer, payment method, transaction type
//// and group-by, and the button of its cash report on A4 paper. The report itself is ours (0a45914d,
//// 2026-04-12 "add Neopos Register report"; Transaction Type filter b7fc0516, same day).
// Copyright (c) 2026, BrainWise and contributors
// For license information, please see license.txt

frappe.query_reports["Neopos Register"] = {
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company"),
			reqd: 1,
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
			reqd: 1,
			width: "60px",
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
			width: "60px",
		},
		{
			// One closing: the register narrows itself to what that closing counted (neopos_register.apply_closing),
			// and the dates and the company take the closing's own.
			fieldname: "pos_closing_shift",
			label: __("POS Closing Shift"),
			fieldtype: "Link",
			options: "POS Closing Shift",
			on_change: function () {
				const name = frappe.query_report.get_filter_value("pos_closing_shift");
				if (!name) return;
				frappe.db
					.get_value("POS Closing Shift", name, ["company", "period_start_date", "period_end_date"])
					.then(({ message }) => {
						if (!message) return;
						frappe.query_report.set_filter_value({
							company: message.company,
							from_date: (message.period_start_date || "").slice(0, 10),
							to_date: (message.period_end_date || "").slice(0, 10),
						});
					});
			},
		},
		{
			fieldname: "pos_profile",
			label: __("POS Profile"),
			fieldtype: "Link",
			options: "POS Profile",
		},
		{
			fieldname: "cashier",
			label: __("Cashier"),
			fieldtype: "Link",
			options: "User",
		},
		{
			fieldname: "customer",
			label: __("Customer"),
			fieldtype: "Link",
			options: "Customer",
		},
		{
			fieldname: "mode_of_payment",
			label: __("Payment Method"),
			fieldtype: "Link",
			options: "Mode of Payment",
		},
		{
			fieldname: "transaction_type",
			label: __("Transaction Type"),
			fieldtype: "Select",
			options: ["", "POS Sales", "Invoice Collection", "Cash In/Out"],
			default: "",
		},
		{
			fieldname: "group_by",
			label: __("Group by"),
			fieldtype: "Select",
			options: ["", "POS Profile", "Cashier", "Payment Method", "Customer", "Transaction Type"],
			default: "",
		},
		{
			fieldname: "is_return",
			label: __("Is Return"),
			fieldtype: "Check",
		},
	],
	onload: function (report) {
		// The cash report: this register on one A4 sheet in landscape, for the period or the closing the filters name
		report.page.add_inner_button(__("Cash report (PDF)"), function () {
			const filters = report.get_filter_values(true);
			window.open(
				"/api/method/pos_next.pos_next.report.neopos_register.neopos_register.export_cash_report_pdf?filters=" +
					encodeURIComponent(JSON.stringify(filters)),
				"_blank"
			);
		});
	},
	formatter: function (value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (data && data.bold) {
			value = value.bold();
		}
		return value;
	},
};
