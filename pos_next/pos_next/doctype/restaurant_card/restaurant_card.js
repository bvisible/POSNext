frappe.ui.form.on("Restaurant Card", {
	refresh: function(frm) {
		setTimeout(function() { hide_category_prices(frm); }, 200);
	},
	onload: function(frm) {
		setTimeout(function() { hide_category_prices(frm); }, 500);
	}
});

function hide_category_prices(frm) {
	if (!frm.fields_dict.items || !frm.fields_dict.items.grid) return;
	frm.fields_dict.items.grid.grid_rows.forEach(function(row) {
		if (row.doc.item_type === "Category") {
			$(row.row).find('[data-fieldname="price"] .static-area').html("");
		}
	});
}

frappe.ui.form.on("Restaurant Card Item", {
	item_type: function(frm, cdt, cdn) {
		var row = locals[cdt][cdn];
		if (row.item_type === "Category") {
			frappe.model.set_value(cdt, cdn, "price", 0);
			frappe.model.set_value(cdt, cdn, "item", null);
			frappe.model.set_value(cdt, cdn, "menu", null);
		}
		setTimeout(function() { hide_category_prices(frm); }, 300);
	},
	items_add: function(frm) {
		setTimeout(function() { hide_category_prices(frm); }, 300);
	}
});
