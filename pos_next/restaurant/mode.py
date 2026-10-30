# //// Neoffice — added file (no upstream equivalent). Whether a till is a restaurant till (NeoRestau lot 1, task 4):
# //// by its own POS Settings, and only where the site runs NeoRestau. The restaurant switch of the till's header, and
# //// the per-device memory behind it, are gone (lot 0): the answer the till reads is worked out here, once, for every
# //// way it reads its settings (the bootstrap, the profile's data, the settings dialog), for the desk's form, and for
# //// the entry points of the visitors that start something, which refuse where the site does not run NeoRestau.
"""A till is a restaurant till by its own setting, and only where NeoRestau runs."""

import frappe
from frappe import _
from frappe.utils import cint

# The site flag that lets restaurant mode show at a till: in site_config.json, off unless the site switches it on
SITE_FLAG = "neorestau_active"

# What makes a till a restaurant till: the tick and the restaurant it works for. They are ticked and chosen on the
# desk's POS Settings form and nowhere else (product owner, 30.10.2026): the till reads them, it never writes them.
DESK_ONLY_FIELDS = ("enable_restaurant_mode", "restaurant")


def neorestau_active() -> bool:
	"""Whether the site runs NeoRestau: its `neorestau_active` flag says 1 (a site without the flag does not)."""
	return cint(frappe.conf.get(SITE_FLAG, 0)) == 1


def require_neorestau() -> None:
	"""Refuse, with a short message, a call that starts something new of the restaurant where the site does not run
	NeoRestau.

	It stands in front of what a visitor STARTS: a new order (`submit_guest_order`), a new payment
	(`create_guest_payment`), a booking and the look at the free tables that leads to it (`get_available_slots`,
	`get_available_tables`, `submit_guest_reservation`): nothing of the restaurant shows where NeoRestau is off.

	It never stands in front of anything a payment's return goes through, whatever the flag says: a payment started
	before NeoRestau went off must stay recordable. The page the payment provider sends the diner back to calls
	`validate_token` and `get_guest_menu` before it can mount the checkout that calls `confirm_guest_payment`: a refusal
	there shows the token error, the checkout never mounts, the payment is never written on the invoice and nothing
	reports it. The takeaway page asks `create_takeaway_token` for a token on every mount, the return included (the
	restaurant's own `enable_web_takeaway` setting closes it), and `submit_takeaway_order` finishes an order that a
	payment already paid. What reads back or confirms something already started (`confirm_guest_payment`,
	`get_order_status`, `get_guest_receipt_pdf`, `verify_reservation`) is open as well.
	"""
	if not neorestau_active():
		frappe.throw(_("Restaurant services are not available"))


def effective_restaurant_mode(pos_settings: dict) -> bool:
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

	Registered last among the app's own hooks on `pos_next_bootstrap_settings`, the seam the bootstrap, the settings
	dialog, the profile data and the answer of a save all call after they read the till's POS Settings: every way the
	till gets its settings answers the same `enable_restaurant_mode`, the effective one, and with NeoRestau off nothing
	of the restaurant shows at the till (the floor plan, the kitchen, the runner, the takeaway entries). It is a hook of
	its own, which the seam isolates (it logs the hook that fails and goes on), so that no other hook failing can
	leave the stored tick in its place; and it is the last, so that no hook of the app can rewrite the effective value
	after it.
	"""
	settings["neorestau_active"] = neorestau_active()
	settings["enable_restaurant_mode"] = 1 if effective_restaurant_mode(settings) else 0


def default_settings() -> dict:
	"""The settings of a till that has none (no POS Profile at all, or a read that failed): the defaults of the POS, told
	whether the site runs NeoRestau like any other answer. No restaurant mode: such a till names no restaurant."""
	from pos_next.api.constants import DEFAULT_POS_SETTINGS

	settings = DEFAULT_POS_SETTINGS.copy()
	extend_bootstrap_settings(settings)
	return settings


def extend_boot(bootinfo) -> None:
	"""Tell the desk whether the site runs NeoRestau (`frappe.boot.neorestau_active`, a bool like the one the till is
	told), which the POS Settings form reads to show its Restaurant section: the tick is not there where NeoRestau is
	off."""
	bootinfo.neorestau_active = neorestau_active()
