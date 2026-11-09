// Copyright (c) 2026, BrainWise and contributors
// For license information, please see license.txt

frappe.query_reports["Payments and Cash Control Report"] = {
	filters: [
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_days(frappe.datetime.get_today(), -30),
			reqd: 0,
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 0,
		},
		{
			fieldname: "shift",
			label: __("Shift"),
			fieldtype: "Link",
			options: "POS Closing Shift",
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
			fieldname: "mode_of_payment",
			label: __("Mode of Payment"),
			fieldtype: "Link",
			options: "Mode of Payment",
		},
	],
	//// Neoffice — the print of this report (09.11.2026). Upstream lists the closings in 29 columns and prints nothing, so where a
	//// closing is printed from was not to be found. One button: filtered on one closing (« Shift »), it prints that closing's cash
	//// report on A4 paper, the sheet its form prints too; otherwise one line per closing of the period (closings_sheet.py).
	onload: function (report) {
		report.page.add_inner_button(__("Cash report (PDF)"), function () {
			const filters = report.get_filter_values();
			const api = "/api/method/pos_next.pos_next.report.payments_and_cash_control_report.closings_sheet.";
			const url = filters.shift
				? api + "export_closing_pdf?closing=" + encodeURIComponent(filters.shift)
				: api + "export_closings_pdf?filters=" + encodeURIComponent(JSON.stringify(filters));
			window.open(url, "_blank");
		});
	},
};
