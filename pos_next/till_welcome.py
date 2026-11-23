# //// Neoffice — added file (no upstream equivalent). The till follows what the company answered in the welcome of its
# //// spaces (neoffice_theme space_welcome, lot 10 of neoffice-maintenance#2961; product owner, 23.11.2026: « Oui, aussi
# //// à la caisse »): a company that said it runs no promotions has no « Promotions » entry at its till, as the Point de
# //// vente and Resto lose their tab. The answer is read through the welcome's own reading (`answer_of`), never a list of
# //// words; nothing changes while the welcome's key (`neo_space_welcome`) is off, nor on a site without the theme.
"""What the till shows of what the company answered in the welcome of its spaces."""

import frappe

# The welcome's line, one answer for the Point de vente and Resto (neoffice_theme space_welcome/registry.py)
PROMOTIONS = "common.promotions"


def extend_bootstrap_settings(settings: dict, pos_profile: str | None = None) -> None:
	"""Add `promotions_said_no` to a till's settings: whether the company of the till said « No » to « Do you run
	promotions? ». Registered on `pos_next_bootstrap_settings`, the seam the bootstrap, the settings dialog and the
	profile data all call after they read the till's POS Settings."""
	settings["promotions_said_no"] = promotions_said_no(pos_profile)


def promotions_said_no(pos_profile: str | None = None) -> bool:
	"""Whether the company of the till (its POS Profile's; the user's own without a till) said it runs no promotions in
	the welcome. False while the welcome's key is off, while nobody said it, for a proposal kept as it was, and on a site
	without the theme: the till then shows what it always showed."""
	try:
		from neoffice_theme.space_welcome import api, registry
	except ImportError:
		return False
	company = frappe.db.get_value("POS Profile", pos_profile, "company") if pos_profile else None
	return api.answer_of(PROMOTIONS, company) == registry.NO
