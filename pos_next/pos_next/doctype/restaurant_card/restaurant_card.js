frappe.ui.form.on("Restaurant Card", {
	refresh: function(frm) {
		hide_category_prices(frm);
	},
	onload: function(frm) {
		hide_category_prices(frm);
	}
});

function hide_category_prices(frm) {
	// Wait for grid to render, then hide price cells on Category rows
	setTimeout(function() {
		frm.fields_dict.items.grid.grid_rows.forEach(function(row) {
			if (row.doc.item_type === "Category") {
				$(row.row).find('.cell-value[data-field="price"]').text("");
				$(row.row).find('[data-field="price"] .static-area').text("");
				$(row.row).find('[data-field="price"] .like-disabled-input').text("");
			}
		});
	}, 300);
}

frappe.ui.form.on("Restaurant Card Item", {
	item_type: function(frm, cdt, cdn) {
		var row = locals[cdt][cdn];
		if (row.item_type === "Category") {
			frappe.model.set_value(cdt, cdn, "price", 0);
			frappe.model.set_value(cdt, cdn, "item", null);
			frappe.model.set_value(cdt, cdn, "menu", null);
		}
		setTimeout(function() { hide_category_prices(frm); }, 500);
	},
	items_add: function(frm) {
		setTimeout(function() { hide_category_prices(frm); }, 500);
	},
	items_move: function(frm) {
		setTimeout(function() { hide_category_prices(frm); }, 500);
	}
});
