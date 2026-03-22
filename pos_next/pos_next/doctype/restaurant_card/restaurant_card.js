frappe.ui.form.on("Restaurant Card", {
	refresh: function(frm) {
		// Add CSS to hide price cells for Category rows
		if (!document.getElementById("card-category-style")) {
			var style = document.createElement("style");
			style.id = "card-category-style";
			style.textContent = `
				.frappe-control[data-fieldname="items"] .rows .row[data-category-row="1"] .cell-value[data-field="price"],
				.frappe-control[data-fieldname="items"] .rows .row[data-category-row="1"] [data-field="price"] .like-disabled-input,
				.frappe-control[data-fieldname="items"] .rows .row[data-category-row="1"] [data-field="price"] .static-area {
					color: transparent !important;
				}
			`;
			document.head.appendChild(style);
		}
		mark_category_rows(frm);
	},
	onload: function(frm) {
		mark_category_rows(frm);
	}
});

function mark_category_rows(frm) {
	// Mark Category rows with a data attribute for CSS targeting
	setTimeout(function() {
		if (!frm.fields_dict.items || !frm.fields_dict.items.grid) return;
		frm.fields_dict.items.grid.grid_rows.forEach(function(row) {
			if (row.doc.item_type === "Category") {
				$(row.row).attr("data-category-row", "1");
			} else {
				$(row.row).removeAttr("data-category-row");
			}
		});
	}, 200);
}

frappe.ui.form.on("Restaurant Card Item", {
	item_type: function(frm, cdt, cdn) {
		var row = locals[cdt][cdn];
		if (row.item_type === "Category") {
			frappe.model.set_value(cdt, cdn, "price", 0);
			frappe.model.set_value(cdt, cdn, "item", null);
			frappe.model.set_value(cdt, cdn, "menu", null);
		}
		setTimeout(function() { mark_category_rows(frm); }, 500);
	},
	items_add: function(frm) {
		setTimeout(function() { mark_category_rows(frm); }, 300);
	}
});
