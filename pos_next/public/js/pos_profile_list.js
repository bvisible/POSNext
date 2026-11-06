// //// Neoffice — added file (no upstream equivalent). The list of ERPNext's POS Profiles is the list of the TILLS: a person who lands
// //// here (the search bar, the old menu, a link) is told that a till is made, set up, switched off and deleted on one page, and the
// //// list's main button makes a till the simple way (NeoResto lot 1, task 13b; product owner, 06.11.2026: « création d'une caisse,
// //// suppression, modification, enfin tout, que ce soit très fluide et que les gens qui n'ont aucune notion soient bien aidés »).
// //// Nothing is redirected: the list stays, and ERPNext's own form stays one click away in the menu, for support.
(function () {
	const existing = frappe.listview_settings["POS Profile"] || {};
	if (existing.neoffice_tills_guide) return;

	frappe.listview_settings["POS Profile"] = Object.assign({}, existing, {
		neoffice_tills_guide: true,
		onload(listview) {
			if (existing.onload) existing.onload(listview);
			listview.page.add_inner_message(
				__(
					"A till is made, set up, switched off and deleted on the till settings page. This list is ERPNext's own."
				)
			);
			listview.page.set_primary_action(__("New till"), () => {
				frappe.route_options = { new_till: 1 };
				frappe.set_route("till-settings");
			});
			listview.page.add_inner_button(__("Till settings"), () =>
				frappe.set_route("till-settings")
			);
			listview.page.add_menu_item(__("Add a POS Profile (ERPNext's form)"), () =>
				frappe.new_doc("POS Profile")
			);
		},
	});
})();
