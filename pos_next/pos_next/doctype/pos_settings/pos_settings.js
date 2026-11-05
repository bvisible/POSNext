// Copyright (c) 2024, BrainWise and contributors
// For license information, please see license.txt

frappe.ui.form.on("POS Settings", {
	refresh(frm) {
		// //// Neoffice — the settings of a till are set on one page (NeoResto lot 1, task 13b; product owner, 30.10.2026: « une seule
		// //// page que nous gérons, qui cache les deux fiches d'origine »). This form stays for support and says where the page is.
		neoffice_point_to_the_till_settings_page(frm, frm.doc.pos_profile);

		// Set query for loyalty program filtered by POS Profile company
		frm.set_query("default_loyalty_program", function () {
			if (!frm.doc.__company) {
				return { filters: {} };
			}
			return {
				filters: {
					company: frm.doc.__company,
				},
			};
		});

		// Fetch company when form loads
		if (frm.doc.pos_profile) {
			fetch_pos_profile_company(frm);
		}
	},

	pos_profile(frm) {
		// Clear loyalty program when POS Profile changes
		frm.set_value("default_loyalty_program", "");
		frm.doc.__company = null;

		if (frm.doc.pos_profile) {
			fetch_pos_profile_company(frm);
		}
	},
});

function fetch_pos_profile_company(frm) {
	frappe.db.get_value("POS Profile", frm.doc.pos_profile, "company", (r) => {
		if (r && r.company) {
			frm.doc.__company = r.company;
		}
	});
}

// //// Neoffice — added function (no upstream equivalent). A banner and a button on the two original forms of a till's settings
// //// (POS Settings, POS Profile): the settings are set on one page, with the till's other settings, their help and what depends
// //// on what. Said once at the top of the form, and one click away.
function neoffice_point_to_the_till_settings_page(frm, pos_profile) {
	if (frm.is_new()) return;
	frm.set_intro(
		__(
			"The settings of a till are set on one page: tabs, help behind a lightbulb and one Save. Use this form only for support."
		),
		"blue"
	);
	frm.add_custom_button(__("Open the till settings page"), () => {
		if (pos_profile) frappe.set_route("till-settings", pos_profile);
		else frappe.set_route("till-settings");
	});
}
