# //// Neoffice — added file (no upstream equivalent). A site that used the restaurant keeps it (NeoRestau lot 1, task 4):
# //// restaurant mode now shows at a till only where the site runs NeoRestau (the flag `neorestau_active` of
# //// site_config.json), and no site has that flag yet. Without this patch, the update would quietly turn the
# //// restaurant tills of the sites that use them into counter tills.
import frappe
import frappe.installer

from pos_next.restaurant.mode import SITE_FLAG
from pos_next.restaurant.usage import site_used_the_restaurant


def execute():
	"""Switch NeoRestau on where the site used the restaurant; leave every other site off.

	"Used" is `site_used_the_restaurant` (a ticked till, a room, a table, a card, hours, an order on a table...), the same
	criterion as the patch that makes the default restaurant: a site that ran restaurant mode through the old switch of
	the till's header, which ticked nothing, is switched on too.

	Idempotent, and it never switches NeoRestau off. A site whose configuration already names the flag, on or off, is left
	as it says: an explicit 0 is somebody's decision, and the absence of the key is the only thing this patch fills.
	"""
	if SITE_FLAG in frappe.conf:
		return
	if not site_used_the_restaurant():
		return
	frappe.installer.update_site_config(SITE_FLAG, 1)
