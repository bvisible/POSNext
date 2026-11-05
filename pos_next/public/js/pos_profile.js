// Copyright (c) 2026, BrainWise and contributors
// For license information, please see license.txt

// //// Neoffice — the fields of ERPNext's profile that a till of this app does not act on, or that another setting duplicates (NeoResto
// //// lot 1, task 13b; product owner, 30.10.2026: « on ne fait jamais revenir un champ caché exprès », and 05.11: « je vois rien du tout »).
// //// They stay in the doctype, with the values they hold; the form no longer shows them. It is the list's `NOT_LISTED` for the POS
// //// Profile (pos_next/till_settings/registry.py) less `country`, which is information (fetched from the company) and stays shown: a test
// //// holds the two together.
const UNUSED_PROFILE_FIELDS = [
	"campaign",
	"hide_images",
	"auto_add_item_to_cart",
	"allow_rate_change",
	"allow_discount_change",
	"disable_grand_total_to_default_mop",
	"validate_stock_on_save",
	"project",
	"allow_partial_payment",
	"update_stock",
	"customer_groups",
	"posa_allow_pos_expense",
	"posa_maximum_expense_amount",
	"posa_allowed_expense_accounts",
	"posa_allow_cancel_pos_expense",
	"posa_expense_cancel_roles",
	"link_gift_card",
	"enable_gift_card",
	"number_of_valid_months",
	"cloudprnt_printer",
	"cloudprnt_printer_name",
	"disable_auto_price",
];

frappe.ui.form.on("POS Profile", {
	// //// Neoffice — the settings of a till are set on one page (NeoResto lot 1, task 13b; product owner, 30.10.2026): this form stays
	// //// for support and says where the page is (see pos_settings.js).
	refresh(frm) {
		UNUSED_PROFILE_FIELDS.filter((fieldname) => frm.fields_dict[fieldname]).forEach((fieldname) =>
			frm.set_df_property(fieldname, "hidden", 1)
		);
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
