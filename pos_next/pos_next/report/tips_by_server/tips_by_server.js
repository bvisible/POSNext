// //// Neoffice — added file (no upstream equivalent). The tips of a restaurant by server (NeoResto lot 1, 04.11.2026).
frappe.query_reports["Tips by Server"] = {
	filters: [
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.month_start(),
			reqd: 1,
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
		},
		{
			fieldname: "restaurant",
			label: __("Restaurant"),
			fieldtype: "Link",
			options: "Restaurant",
		},
		{
			fieldname: "pos_profile",
			label: __("POS Profile"),
			fieldtype: "Link",
			options: "POS Profile",
		},
		{
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			options: ["", "Collected", "Distributed"],
		},
	],
};
