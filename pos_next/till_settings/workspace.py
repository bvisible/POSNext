# //// Neoffice — added file (no upstream equivalent). The point of sale's own space gets a Settings tab (NeoResto lot 1, task 13b;
# //// product owner, 06.11.2026: « que ta page de réglage soit dans point de vente et dans resto »). The theme's retail space had none:
# //// its tills tab lists the POS Profiles and nothing told a shop owner where a till's settings are. The tab is the same as the
# //// restaurant space's « Tills » group (the page first, then the two original lists, kept for support), declared here and not in the
# //// theme: the page is ours, so the door shows only where pos_next, and so the page, is installed.
"""The Settings tab of the point of sale's space, through the theme's `neoffice_workspace_tabs` hook."""

from frappe import _

SPACE = "Retail"


def tabs():
	"""{space: [tab, ...]}: one tab, added to the point of sale's space before its reports; the theme calls it, nothing else does."""
	from neoffice_theme.workspace_spaces.common import settings

	from pos_next.restaurant.neoresto import till_settings_entry

	tab = settings(
		[
			{
				"label": _("Tills"),
				"description": _("Create a till, set it up, switch it off: the page below does it all."),
				"items": [till_settings_entry(), "POS Settings", "POS Profile"],
			}
		]
	)
	# The bundle the space's other tabs carry: whoever sees the point of sale sees its settings
	return {SPACE: [dict(tab, bundle=[SPACE])]}
