frappe.ui.form.on("Restaurant Card", {
	refresh: function(frm) {
		// Custom formatter to hide price for Category rows in child table
		frm.fields_dict.items.grid.grid_rows.forEach(function(row) {
			if (row.doc.item_type === "Category") {
				$(row.row).find('[data-field="price"]').find('.static-area, .like-disabled-input').text("");
			}
		});
	}
});

frappe.ui.form.on("Restaurant Card Item", {
	item_type: function(frm, cdt, cdn) {
		var row = locals[cdt][cdn];
		if (row.item_type === "Category") {
			frappe.model.set_value(cdt, cdn, "price", 0);
			frappe.model.set_value(cdt, cdn, "item", null);
			frappe.model.set_value(cdt, cdn, "menu", null);
		}
		frm.trigger("refresh");
	},
	items_add: function(frm) {
		frm.trigger("refresh");
	},
	items_move: function(frm) {
		frm.trigger("refresh");
	}
});
