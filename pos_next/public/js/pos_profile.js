// Copyright (c) 2026, BrainWise and contributors
// For license information, please see license.txt

frappe.ui.form.on("POS Profile", {
	// //// Neoffice — the settings of a till are set on one page (NeoResto lot 1, task 13b; product owner, 30.10.2026): this form stays
	// //// for support and says where the page is (see pos_settings.js).
	refresh(frm) {
		if (frm.is_new()) return;
		frm.set_intro(
			__(
				"The settings of a till are set on one page: tabs, help behind a lightbulb and one Save. Use this form only for support."
			),
			"blue"
		);
		frm.add_custom_button(__("Open the till settings page"), () => {
			frappe.set_route("till-settings", frm.doc.name);
		});
	},
	setup(frm) {
		frm.set_query("account", "posa_allowed_expense_accounts", () => ({
			filters: {
				company: frm.doc.company,
				is_group: 0,
				disabled: 0,
				root_type: "Expense",
			},
		}));
	},
});
