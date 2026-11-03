# //// Neoffice — added file (no upstream equivalent). The restaurant's overview follows the service (neoffice-maintenance#2163, restaurant film of
# //// 02.11.2026: « l'encaissé ne monte pas juste après un paiement »). The theme keeps the figures of a space's overview for each reader for two
# //// minutes; what the till does (a sale taken, a table filled or freed, a session opened or closed, a booking) tells it, once the work is committed,
# //// that its copy is out of date, and each reader draws the figures again at the next visit.

import frappe


def figures_changed(doc=None, method=None):
	"""What the restaurant's overview counts has changed: tell the theme, after the commit, that the copies of it are out of date.

	A hook of the documents that move the figures (doc_events) and a call of the table gestures that write a table's status by hand. After the
	commit, not before: a reader who drew the figures between the two would keep the old ones under the new generation. A site with no such
	theme, or an older one that cannot be told, has nothing to tell; and a cache that cannot be told never stops a sale."""
	frappe.db.after_commit.add(_tell_the_overview)


def _tell_the_overview():
	try:
		from neoffice_theme.workspace_tabs import overview_changed

		from pos_next.restaurant.neoresto import SPACE
	except ImportError:
		return
	try:
		overview_changed(SPACE)
	except Exception:
		frappe.log_error("Failed to tell the Resto overview its figures changed", frappe.get_traceback())
