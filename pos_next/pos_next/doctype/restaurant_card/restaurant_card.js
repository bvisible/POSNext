//// Neoffice — added file (no upstream equivalent). Desk form script for the Restaurant Card we
//// added: it blanks the price cell of Category rows in the items grid and resets price/item/menu
//// when a row is switched to Category. Frappe's grid renders the stored value whatever the row
//// type, so a category header kept showing a leftover price; the server-side validate() cleans the
//// data but not what an already-open form displays (2739503f, 2026-03-22 "hide price display for
//// Category rows via client script formatter"; the working selector is data-fieldname, not
//// data-field — 02c411c0, same day).
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
