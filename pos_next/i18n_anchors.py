# //// Neoffice — added file (no upstream equivalent): keeps the DocType-context entries of locale/fr.po alive.
"""Translation entries that live in a DocType JSON, anchored here so the POT keeps them.

The desk translates a DocType label as `__(label, null, <DocType name>)` and a Select option as
`__(option, null, <DocType name>)`: it looks `"<text>:<DocType name>"` up first and falls back to the bare text.
The extractor that reads DocType JSON files writes the bare text only, never the context. A
`msgctxt "<DocType name>"` entry in `locale/fr.po` that nothing in the code mentions is therefore dropped as
obsolete the next time `bench update-po-files` runs, and the screen silently falls back to the bare word.

This function is NEVER called. It exists so that `bench generate-pot-file` finds the strings.
"""

from frappe import _


def _i18n_anchors():
	"""Never called. See the module docstring."""
	# Label of the `course_name` field of Restaurant Menu Course: the name of one course of a restaurant menu.
	# The bare word `Course Name` is the name of a training course in LMS.
	_("Course Name", context="Restaurant Menu Course")
	# The names of the badges this app seeds (fixtures/menu_badge.json). They are data, read out of the database, so the
	# extractor never sees them in the code; the public menu translates each one, in the language of the guest, with the
	# context below (pos_next.api.public_menu.BADGE_CONTEXT). A badge added to the fixture is added here too: a test checks.
	_("Gluten", context="Menu Badge")
	_("Crustaceans", context="Menu Badge")
	_("Eggs", context="Menu Badge")
	_("Fish", context="Menu Badge")
	_("Peanuts", context="Menu Badge")
	_("Soy", context="Menu Badge")
	_("Milk", context="Menu Badge")
	_("Tree Nuts", context="Menu Badge")
	_("Celery", context="Menu Badge")
	_("Mustard", context="Menu Badge")
	_("Sesame", context="Menu Badge")
	_("Sulfites", context="Menu Badge")
	_("Lupin", context="Menu Badge")
	_("Mollusks", context="Menu Badge")
	_("Vegetarian", context="Menu Badge")
	_("Vegan", context="Menu Badge")
	_("Lactose Free", context="Menu Badge")
	_("Halal", context="Menu Badge")
	_("Kosher", context="Menu Badge")
	_("Homemade", context="Menu Badge")
	_("Local", context="Menu Badge")
	_("Organic", context="Menu Badge")
