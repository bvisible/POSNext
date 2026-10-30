# //// Neoffice — added file (no upstream equivalent). A site whose tills already run in restaurant mode keeps it
# //// (NeoRestau lot 1, task 4): restaurant mode now shows at a till only where the site runs NeoRestau (the flag
# //// `neorestau_active` of site_config.json), and no site has that flag yet. Without this patch, the update would
# //// quietly turn every restaurant till of the fleet into a counter till.
import frappe
import frappe.installer

from pos_next.restaurant.mode import SITE_FLAG, neorestau_active


def execute():
	"""Switch NeoRestau on where a POS Settings row already has restaurant mode on; leave every other site off.

	Idempotent, and it never switches NeoRestau off: a site that already runs it is left as it is, whatever its tills
	say. A row counts whether it is enabled or not: a till that was switched off may be switched on again, and the
	site would then have to be told it runs restaurant mode.
	"""
	if neorestau_active():
		return
	if not frappe.db.exists("POS Settings", {"enable_restaurant_mode": 1}):
		return
	frappe.installer.update_site_config(SITE_FLAG, 1)
