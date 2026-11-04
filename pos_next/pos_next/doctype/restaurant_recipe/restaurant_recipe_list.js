//// Neoffice — added file (no upstream equivalent). The list of the recipes of a restaurant (NeoResto, « Nora au restaurant », lot R3): the
//// status of each one, and the way in to the free library, whose fiches become recipes of the restaurant only when someone picks them.
const API = "pos_next.api.recipes.";

function open_library(listview) {
	frappe.call({
		method: API + "get_library",
		callback: (r) => {
			const library = r.message;
			const fields = [
				{
					fieldtype: "HTML",
					options: `<p class="text-muted">${frappe.utils.escape_html(library.note)}</p>`,
				},
			];
			library.recipes.forEach((fiche) => {
				const here = fiche.state !== "new";
				const detail = [
					fiche.family,
					fiche.portions ? __("{0} portions", [fiche.portions]) : null,
					fiche.minutes ? __("{0} min", [fiche.minutes]) : null,
					fiche.vegetarian ? __("Vegetarian") : null,
				].filter(Boolean);
				fields.push({
					fieldname: fiche.id,
					fieldtype: "Check",
					label: fiche.title,
					read_only: here ? 1 : 0,
					description: here
						? __("Already in your recipes")
						: `${detail.join(" · ")} — ${fiche.author}, ${fiche.license}`,
				});
			});
			const dialog = new frappe.ui.Dialog({
				title: __("Add from the free library"),
				fields: fields,
				size: "large",
				primary_action_label: __("Add to my recipes"),
				primary_action(values) {
					const ids = library.recipes
						.filter((f) => f.state === "new" && values[f.id])
						.map((f) => f.id);
					if (!ids.length) {
						frappe.msgprint(__("Tick the recipes to add."));
						return;
					}
					frappe.call({
						method: API + "add_from_library",
						args: { ids: ids },
						freeze: true,
						callback: (res) => {
							dialog.hide();
							frappe.show_alert({
								message: __("{0} recipes added, to review.", [
									res.message.added.length,
								]),
								indicator: "green",
							});
							listview.refresh();
						},
					});
				},
			});
			dialog.show();
		},
	});
}

frappe.listview_settings["Restaurant Recipe"] = {
	add_fields: ["status"],
	get_indicator(doc) {
		const tone =
			{ Validated: "green", "To review": "orange", Draft: "gray" }[doc.status] || "gray";
		return [__(doc.status), tone, "status,=," + doc.status];
	},
	onload(listview) {
		if (!frappe.boot.neoresto_active) return;
		listview.page.add_inner_button(__("Add from the free library"), () =>
			open_library(listview)
		);
	},
};
