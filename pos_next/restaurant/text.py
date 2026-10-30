# //// Neoffice — added file (no upstream equivalent). A dish's description as text (NeoRestau lot 1, task 3).
"""The text of a rich-text field, for the screens and the printed menu that show it as text."""

from html import unescape

import frappe


def plain_text(value) -> str:
	"""The text of a Text Editor field: its tags removed and its entities decoded, so that it is text, escaped once.

	The desk stores an item's description as HTML (`<div class="ql-editor read-mode"><p>Fish &amp; chips</p></div>`).
	Removing the tags keeps the entities: a screen that shows text, or a menu that escapes what it prints, would show
	`Fish &amp; chips` and `&nbsp;` as such.
	"""
	return unescape(frappe.utils.strip_html_tags(value)).strip() if value else ""
