// //// Neoffice — added file (no upstream equivalent). The list of POS Settings is one record per till, made with the till's profile: a
// //// person who lands here is told where the settings are set (NeoResto lot 1, task 13b; product owner, 06.11.2026). Nothing is
// //// redirected; making a record by hand stays in the menu, for the rare profile that has none. The note is a banner over the list
// //// (see pos_profile_list.js for why it is neither the inner message nor the primary action).
(function () {
	const existing = frappe.listview_settings["POS Settings"] || {};
	if (existing.neoffice_tills_guide) return;

	frappe.listview_settings["POS Settings"] = Object.assign({}, existing, {
		neoffice_tills_guide: true,
		onload(listview) {
			if (existing.onload) existing.onload(listview);
			const $main = listview.page.main;
			if ($main && !$main.find(".neoffice-tills-guide").length) {
				const $banner = $(
					'<div class="neoffice-tills-guide" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 12px;padding:10px 14px;border-radius:12px;background:#F6F3ED;border:1px solid #ECE7DE;color:#3A342C;font-size:13px"></div>'
				);
				$('<span style="flex:1 1 280px"></span>')
					.text(
						__(
							"Each till has one record of settings, made with its profile. They are all set on the till settings page."
						)
					)
					.appendTo($banner);
				$('<button type="button" class="btn btn-sm btn-primary"></button>')
					.text(__("Till settings"))
					.on("click", () => frappe.set_route("till-settings"))
					.appendTo($banner);
				$main.prepend($banner);
			}
			listview.page.add_menu_item(__("Add a POS Settings record"), () =>
				frappe.new_doc("POS Settings")
			);
		},
	});
})();
