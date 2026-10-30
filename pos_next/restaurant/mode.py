# //// Neoffice — added file (no upstream equivalent). Whether a till is a restaurant till (NeoRestau lot 1, task 4):
# //// by its own POS Settings, and only where the site runs NeoRestau. The restaurant switch of the till's header, and
# //// the per-device memory behind it, are gone (lot 0): the answer the till reads is worked out here, once, for every
# //// way it reads its settings (the bootstrap, the profile's data, the settings dialog) and for the desk's form.
"""A till is a restaurant till by its own setting, and only where NeoRestau runs."""

import frappe
from frappe.utils import cint

# The site flag that lets restaurant mode show at a till: in site_config.json, off unless the site switches it on
SITE_FLAG = "neorestau_active"

# What makes a till a restaurant till: the tick and the restaurant it works for. They are ticked and chosen on the
# desk's POS Settings form and nowhere else (product owner, 30.10.2026): the till reads them, it never writes them.
DESK_ONLY_FIELDS = ("enable_restaurant_mode", "restaurant")


def neorestau_active() -> bool:
	"""Whether the site runs NeoRestau: its `neorestau_active` flag says 1 (a site without the flag does not)."""
	return cint(frappe.conf.get(SITE_FLAG, 0)) == 1


def effective_restaurant_mode(pos_settings) -> bool:
	"""Whether a till (its POS Settings, as a dict) works as a restaurant till.

	Its tick is on, the site runs NeoRestau, and the till names the restaurant it works for: a tick on a site without
	NeoRestau makes no restaurant till, and neither does a tick on a till that names no restaurant (see
	`settings.restaurant_for_profile`, which also takes such a till for a till of no restaurant).
	"""
	return (
		bool(pos_settings.get("enable_restaurant_mode"))
		and neorestau_active()
		and bool(pos_settings.get("restaurant"))
	)


def extend_bootstrap_settings(settings: dict, pos_profile: str | None = None) -> None:
	"""Tell a till whether it is a restaurant till, and whether the site runs NeoRestau.

	Registered first on `pos_next_bootstrap_settings`, the seam the bootstrap, the settings dialog and the profile data
	all call after they read the till's POS Settings: every way the till gets its settings answers the same
	`enable_restaurant_mode`, the effective one, and with NeoRestau off nothing of the restaurant shows at the till
	(the floor plan, the kitchen, the runner, the takeaway entries). It comes before the hooks that can fail on a
	database or a role, so that none of them can leave the stored tick in its place.
	"""
	settings["neorestau_active"] = neorestau_active()
	settings["enable_restaurant_mode"] = 1 if effective_restaurant_mode(settings) else 0


def extend_boot(bootinfo) -> None:
	"""Tell the desk whether the site runs NeoRestau (`frappe.boot.neorestau_active`), which the POS Settings form
	reads to show its Restaurant section: the tick is not there where NeoRestau is off."""
	bootinfo.neorestau_active = 1 if neorestau_active() else 0
