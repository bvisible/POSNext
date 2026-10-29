# //// Neoffice — added file (no upstream equivalent). The till is told what its user may manage of the restaurant
# //// (NeoRestau lot 1, task 3), to show only that: the floor plan's Edit button, and the cards, option groups,
# //// workflows and tips of the management rail. The server refuses the rest whatever the till shows
# //// (pos_next.restaurant.permissions).
"""What the till shows of the restaurant's management, for the user who opens it."""

from pos_next.restaurant import permissions


def extend_bootstrap_settings(settings: dict, pos_profile: str | None = None) -> None:
	"""Add `restaurant_can` to a till's settings: each right of `permissions.RIGHTS`, for the session user.

	Registered on `pos_next_bootstrap_settings`, the seam the bootstrap, the settings dialog and the profile data all
	call after they read the till's POS Settings. The answer is the user's, not the till's: two users of one till may
	see two different rails.
	"""
	settings["restaurant_can"] = permissions.rights_of_the_user()
