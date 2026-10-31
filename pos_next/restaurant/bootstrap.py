# //// Neoffice — added file (no upstream equivalent). The till is told what its user may manage of the restaurant
# //// (NeoRestau lot 1, task 3), to show only that: the floor plan's Edit button, and the cards, option groups,
# //// workflows and tips of the management rail. The server refuses the rest whatever the till shows
# //// (pos_next.restaurant.permissions).
"""What the till shows of the restaurant's management, for the user who opens it."""

import frappe

from pos_next.restaurant import permissions

# The till-scoped rights that failed, already logged: once per worker, not at every bootstrap of every till
_LOGGED = set()


def extend_bootstrap_settings(settings: dict, pos_profile: str | None = None) -> None:
	"""Add `restaurant_can` to a till's settings: each right of `permissions.RIGHTS`, for the session user, and who
	opens the settings of the till (task 13): `manage_till_settings` its own, `manage_restaurant_settings` its
	restaurant's.

	Registered on `pos_next_bootstrap_settings`, the seam the bootstrap, the settings dialog and the profile data all
	call after they read the till's POS Settings. The answer is the user's, not the till's: two users of one till may
	see two different rails. For a till named, the settings' two rights are the server's own for THAT till
	(`till_settings.api.rights_at`: a till manager whose User Permissions leave him the till, whoever may write the
	till's own restaurant), so the rail shows the entry to whoever the server lets in; with no till named, what the
	user's roles allow.
	"""
	can = permissions.rights_of_the_user()
	can["manage_restaurant_settings"] = can["manage_settings"]
	# Told first: the seam's runner logs a hook that raises and goes on, so a failure below must not cost the user
	# every right of the restaurant
	settings["restaurant_can"] = can
	if not pos_profile:
		return
	try:
		from pos_next.till_settings.api import rights_at

		at_this_till = rights_at(pos_profile)
		can["manage_till_settings"] = at_this_till["till"]
		can["manage_restaurant_settings"] = at_this_till["restaurant"]
	except Exception:
		# Only the rights scoped to this till are lost (the Settings entry is not shown), and that is logged once
		can["manage_till_settings"] = False
		can["manage_restaurant_settings"] = False
		if pos_profile not in _LOGGED:
			_LOGGED.add(pos_profile)
			frappe.log_error(
				"Till settings rights of a till could not be read",
				f"POS Profile {pos_profile}\n\n{frappe.get_traceback()}",
			)
