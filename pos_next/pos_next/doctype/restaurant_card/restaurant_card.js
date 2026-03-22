frappe.ui.form.on("Restaurant Card", {
	refresh: function(frm) {
		// Override price formatter in the grid to hide price for Category rows
		var grid = frm.fields_dict.items.grid;
		grid.grid_rows.forEach(function(row) {
			if (row.doc.item_type === "Category") {
				// Set rendered price cell to empty via DOM
				var $row = $(row.row);
				$row.find('.static-area').each(function() {
					var $cell = $(this).closest('.row-index, .frappe-control');
					if ($cell.attr('data-fieldname') === 'price') {
						$(this).html('');
					}
				});
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
		frm.refresh_fields();
	}
});
