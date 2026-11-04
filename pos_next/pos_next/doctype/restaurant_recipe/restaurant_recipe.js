//// Neoffice — added file (no upstream equivalent). The desk form of a recipe (NeoResto, « Nora au restaurant », lot R3): the portions
//// changed without touching the recipe, the ingredients linked to the articles the restaurant buys, and the approval. The rules live on
//// the server (pos_next/restaurant/recipes.py); this form only asks and shows.
const API = "pos_next.api.recipes.";

function chip(text, tone) {
	return `<span class="indicator-pill ${tone} ml-1">${frappe.utils.escape_html(text)}</span>`;
}

function ingredient_line(row) {
	const quantity = row.qty ? `${row.qty} ${frappe.utils.escape_html(row.unit || "")}` : "";
	const flags = [];
	if (row.without_quantity) flags.push(chip(__("Without quantity"), "gray"));
	if (row.to_complete) flags.push(chip(__("To complete"), "orange"));
	if (row.to_convert) flags.push(chip(__("To convert"), "orange"));
	if (row.item_name) flags.push(chip(row.item_name, "blue"));
	return `<tr><td>${frappe.utils.escape_html(
		row.name
	)}</td><td class="text-right">${quantity.trim()}</td><td>${flags.join("")}</td></tr>`;
}

function show_portions(frm) {
	const dialog = new frappe.ui.Dialog({
		title: __("Quantities for another number of portions"),
		fields: [
			{
				fieldname: "portions",
				fieldtype: "Int",
				label: __("Portions"),
				default: frm.doc.base_portions,
				reqd: 1,
			},
			{ fieldname: "sheet", fieldtype: "HTML" },
		],
	});
	const draw = () => {
		const portions = dialog.get_value("portions");
		if (!portions || portions < 1) return;
		frappe.call({
			method: API + "get_recipe",
			args: { name: frm.doc.name, portions: portions },
			callback: (r) => {
				const sheet = r.message;
				const rows = sheet.ingredients.map(ingredient_line).join("");
				const note = sheet.note
					? `<p class="text-muted small">${frappe.utils.escape_html(sheet.note)}</p>`
					: "";
				dialog.fields_dict.sheet.$wrapper.html(
					`<table class="table table-sm"><tbody>${rows}</tbody></table>${note}`
				);
			},
		});
	};
	dialog.fields_dict.portions.$input.on("change", draw);
	dialog.show();
	draw();
}

function link_ingredients(frm) {
	frappe.call({
		method: API + "get_link_suggestions",
		args: { recipe: frm.doc.name },
		callback: (r) => {
			const todo = r.message.ingredients.filter((row) => !row.without_quantity);
			if (!todo.length) {
				frappe.msgprint(__("There is no ingredient to link."));
				return;
			}
			const fields = [
				{
					fieldtype: "HTML",
					options: `<p class="text-muted">${__("{0} of {1} ingredients are linked.", [
						r.message.linked,
						r.message.total,
					])} ${__(
						"A suggestion is only a suggestion: nothing is linked until you press the button."
					)}</p>`,
				},
			];
			todo.forEach((row) => {
				const suggested = (row.suggestions[0] || {}).item || "";
				fields.push(
					{ fieldtype: "Section Break", label: row.name },
					{
						fieldname: `item_${row.idx}`,
						fieldtype: "Link",
						options: "Item",
						label: __("Article"),
						default: row.item || suggested,
					}
				);
				if (row.to_convert) {
					fields.push(
						{ fieldtype: "Column Break" },
						{
							fieldname: `qty_${row.idx}`,
							fieldtype: "Float",
							label: __("Quantity as the article is bought"),
							description: __("The source says {0} {1}", [
								row.qty || "",
								row.unit || "",
							]),
						},
						{ fieldname: `unit_${row.idx}`, fieldtype: "Data", label: __("Unit") }
					);
				}
			});
			const dialog = new frappe.ui.Dialog({
				title: __("Link the ingredients to articles"),
				fields: fields,
				primary_action_label: __("Link"),
				primary_action(values) {
					const links = [];
					for (const row of todo) {
						const item = values[`item_${row.idx}`] || null;
						if (!item && !row.item) continue;
						if (item === row.item && !row.to_convert) continue;
						links.push({
							idx: row.idx,
							item: item,
							qty: values[`qty_${row.idx}`] || null,
							unit: values[`unit_${row.idx}`] || null,
						});
					}
					if (!links.length) {
						dialog.hide();
						return;
					}
					frappe.call({
						method: API + "set_ingredient_links",
						args: { recipe: frm.doc.name, links: links },
						freeze: true,
						callback: () => {
							dialog.hide();
							frm.reload_doc();
						},
					});
				},
			});
			dialog.show();
		},
	});
}

frappe.ui.form.on("Restaurant Recipe", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Change the portions"), () => show_portions(frm));
		frm.add_custom_button(__("Link the ingredients to articles"), () => link_ingredients(frm));
		if (frm.doc.status !== "Validated") {
			frm.add_custom_button(__("Mark as validated"), () => {
				frm.set_value("status", "Validated");
				frm.save();
			});
		}
		if (frm.doc.status === "To review") {
			frm.dashboard.set_headline(
				__(
					"Nobody has read this recipe yet. Check the quantities and the steps, then mark it as validated."
				)
			);
		}
	},
});
