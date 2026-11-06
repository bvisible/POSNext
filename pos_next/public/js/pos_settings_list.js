// //// Neoffice — added file (no upstream equivalent). The list of POS Settings is one record per till, made with the till's profile: a
// //// person who lands here is told where the settings are set (NeoResto lot 1, task 13b; product owner, 06.11.2026). Nothing is
// //// redirected; making a record by hand stays in the menu, for the rare profile that has none.
(function () {
	const existing = frappe.listview_settings["POS Settings"] || {};
	if (existing.neoffice_tills_guide) return;

	frappe.listview_settings["POS Settings"] = Object.assign({}, existing, {
		neoffice_tills_guide: true,
		onload(listview) {
			if (existing.onload) existing.onload(listview);
			listview.page.add_inner_message(
				__(
					"Each till has one record of settings, made with its profile. They are all set on the till settings page."
				)
			);
			listview.page.set_primary_action(__("Till settings"), () =>
				frappe.set_route("till-settings")
			);
			listview.page.add_menu_item(__("Add a POS Settings record"), () =>
				frappe.new_doc("POS Settings")
			);
		},
	});
})();
