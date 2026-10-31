# //// Neoffice — added file (no upstream equivalent). The till is told what its user may manage of the restaurant
# //// (NeoRestau lot 1, task 3), to show only that: the floor plan's Edit button, and the cards, option groups,
# //// workflows and tips of the management rail. The server refuses the rest whatever the till shows
# //// (pos_next.restaurant.permissions).
"""What the till shows of the restaurant's management, for the user who opens it."""

from pos_next.restaurant import permissions


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
	if pos_profile:
		from pos_next.till_settings.api import rights_at

		at_this_till = rights_at(pos_profile)
		can["manage_till_settings"] = at_this_till["till"]
		can["manage_restaurant_settings"] = at_this_till["restaurant"]
	settings["restaurant_can"] = can
