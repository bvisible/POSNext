// //// Neoffice — added file (no upstream equivalent). The list of ERPNext's POS Profiles is the list of the TILLS: a person who lands
// //// here (the search bar, the old menu, a link) is told that a till is made, set up, switched off and deleted on one page, with the
// //// two buttons that matter (NeoResto lot 1, task 13b; product owner, 06.11.2026: « création d'une caisse, suppression, modification,
// //// enfin tout, que ce soit très fluide et que les gens qui n'ont aucune notion soient bien aidés »). Nothing is redirected: the list
// //// stays, and ERPNext's own form stays one click away in the menu, for support. The note is a banner over the list, not the page's
// //// inner message (which the desk squeezes into the title bar) and not the primary action (which the list sets again at each refresh).
(function () {
	const existing = frappe.listview_settings["POS Profile"] || {};
	if (existing.neoffice_tills_guide) return;

	frappe.listview_settings["POS Profile"] = Object.assign({}, existing, {
		neoffice_tills_guide: true,
		onload(listview) {
			if (existing.onload) existing.onload(listview);
			neoffice_till_banner(
				listview,
				__(
					"A till is made, set up, switched off and deleted on the till settings page. This list is ERPNext's own."
				),
				[
					[
						__("New till"),
						() => {
							frappe.route_options = { new_till: 1 };
							frappe.set_route("till-settings");
						},
						true,
					],
					[__("Till settings"), () => frappe.set_route("till-settings"), false],
				]
			);
			listview.page.add_menu_item(__("Add a POS Profile (ERPNext's form)"), () =>
				frappe.new_doc("POS Profile")
			);
		},
	});

	// A line of text and its buttons, once, at the top of the list
	function neoffice_till_banner(listview, text, buttons) {
		const $main = listview.page.main;
		if (!$main || $main.find(".neoffice-tills-guide").length) return;
		const $banner = $(
			'<div class="neoffice-tills-guide" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 12px;padding:10px 14px;border-radius:12px;background:#F6F3ED;border:1px solid #ECE7DE;color:#3A342C;font-size:13px"></div>'
		);
		$('<span style="flex:1 1 280px"></span>').text(text).appendTo($banner);
		buttons.forEach(([label, click, primary]) => {
			$(
				`<button type="button" class="btn btn-sm ${
					primary ? "btn-primary" : "btn-default"
				}"></button>`
			)
				.text(label)
				.on("click", click)
				.appendTo($banner);
		});
		$main.prepend($banner);
	}
})();
