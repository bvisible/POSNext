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
		// //// Neoffice — a till has ONE record of settings, made with its profile: say so as soon as a profile that has one is chosen, instead of
		// //// a duplicate-entry error at the save (06.11.2026)
		if (frm.is_new() && frm.doc.pos_profile) {
			frappe.db
				.get_value("POS Settings", { pos_profile: frm.doc.pos_profile }, "name")
				.then((r) => {
					const existing = r && r.message && r.message.name;
					if (!existing) return;
					frappe.msgprint({
						title: __("This till already has its settings"),
						message: __(
							"A till has one record of POSNext settings, made with its profile. They are set on the till settings page."
						),
						indicator: "orange",
						primary_action: {
							label: __("Open the till settings page"),
							action() {
								frappe.set_route("till-settings", frm.doc.pos_profile);
							},
						},
					});
				});
		}
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
	if (frm.is_new()) {
		frm.set_intro(
			__(
				"A till gets its POSNext settings when its POS Profile is made, so there is nothing to add here: choose the till on the till settings page. A record is made by hand only for a profile that has none."
			),
			"blue"
		);
		frm.add_custom_button(__("Open the till settings page"), () => {
			frappe.set_route("till-settings");
		});
		return;
	}
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
