//// Neoffice — added file (no upstream equivalent). The restaurant's column of the supplier table of an article (« Unit » in which the supplier sells,
//// NeoResto purchases) shows only where the site runs NeoResto. The other restaurant fields of the ERP's forms hide through their `depends_on`
//// (fixtures/custom_field.json, reading frappe.boot.neoresto_active); a column of a table does not read it, so the form hides it here.
frappe.ui.form.on("Item", {
	refresh(frm) {
		const field = frm.fields_dict.supplier_items;
		if (field && field.grid && !frappe.boot.neoresto_active) {
			field.grid.update_docfield_property("supply_uom", "hidden", 1);
		}
	},
});
