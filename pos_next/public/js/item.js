// Prevent Frappe core's `set_default_values` from auto-filling
// `custom_company` with the user's default Company.
//
// Items in POSNext can be either:
//   * global (custom_company = "")  -> visible to all companies
//   * company-scoped (custom_company set explicitly by the user)
//
// Frappe core (frappe/public/js/frappe/model/create_new.js,
// get_default_value) auto-fills any Link field whose options match a
// DocType the user has a default for. With a default Company set on
// the user, every new Item would silently become company-scoped, which
// breaks the "leave empty for global" UX advertised in the field
// description.
//
// `no_default` on the docfield would short-circuit that logic but it
// is a runtime-only meta flag, not a stored Custom Field column, so we
// can't set it via fixture. Clearing the field on `setup` for new
// docs runs after the core default logic and matches the same intent.
frappe.ui.form.on("Item", {
	setup(frm) {
		if (frm.doc.__islocal && frm.doc.custom_company) {
			frm.set_value("custom_company", "");
		}
	},
});
