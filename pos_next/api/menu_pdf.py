# //// Neoffice — added file (no upstream equivalent). A restaurant needs a printable menu
# //// card, which a retail POS has no notion of: renders a Restaurant Card (categories, items,
# //// allergen / spice badges, cover page with the company logo) to HTML and to PDF through
# //// wkhtmltopdf, the on-screen preview being served from the very same HTML so what is shown
# //// is what prints (b6e757dd 2026-03-26 "feat: add menu PDF generator with badges", then
# //// bbbe36f4, cf0d5410, 8bfc37f3, 125046dd / 005436df — WeasyPrint OOM'd on Osiris —,
# //// 57687612 / 57164782 / 37746a8f for DPI and margins, 72f2d0d4 base64 badge icons,
# //// fe2fcc72, eedb9d4c, 7835b234).
import json
import re

import frappe
from frappe import _
from frappe.utils import cint, cstr
from markupsafe import escape

from pos_next.restaurant import permissions, scope

# What a card's design may hold and override: the fields of a Menu Design Template the templates print, and the option
# groups to print. Anything else a card or a caller sends is ignored (NeoRestau lot 1, task 3; maintenance#2002).
DESIGN_SELECTS = ("style_theme", "paper_format", "price_alignment")
DESIGN_CHECKS = ("show_descriptions", "show_allergens", "show_options", "show_images")
# A number: its lowest, its highest, and what it is when not given
DESIGN_NUMBERS = {
	"columns": (1, 3, 1),
	"custom_width_mm": (50, 1000, 210),
	"custom_height_mm": (50, 1000, 297),
}
DESIGN_FONTS = {"font_header": "Montserrat", "font_body": "Inter"}
DESIGN_COLORS = ("color_primary", "color_secondary", "color_accent")
DESIGN_TEXTS = ("header_text", "footer_text")
DESIGN_KEYS = (
	*DESIGN_SELECTS,
	*DESIGN_CHECKS,
	*DESIGN_NUMBERS,
	*DESIGN_FONTS,
	*DESIGN_COLORS,
	*DESIGN_TEXTS,
	"custom_css",
	"selected_option_groups",
)
DESIGN_DEFAULTS = {"paper_format": "A4 Portrait", "price_alignment": "right"}
# A font is a family name; a colour a hex code or a CSS colour name
FONT = re.compile(r"[A-Za-z0-9][A-Za-z0-9 \-]{0,59}")
COLOR = re.compile(r"#[0-9A-Fa-f]{3,8}|[A-Za-z]{1,20}")
# What would make the PDF engine fetch something, read once the CSS escapes are decoded (an escaped `u\72l(` is a
# `url(` to the engine); a `<` would let a custom CSS leave its style sheet
FORBIDDEN_CSS = ("url(", "@import", "image(", "image-set(", "expression(")
# A CSS escape: a backslash and 1 to 6 hex digits (one following whitespace is part of it), or any other character
CSS_ESCAPE = re.compile(r"\\(?:([0-9a-fA-F]{1,6})\s?|(.))", re.S)
CSS_COMMENT = re.compile(r"/\*.*?\*/", re.S)


def _require_cards(*card_names):
	"""The menu designer is the card editor's: whoever manages the cards, and reads each card named.

	Until 30.10.2026 these endpoints answered any signed-in account, a portal account included (maintenance#2002).
	"""
	permissions.require_right("manage_cards")
	for card_name in card_names:
		permissions.require("Restaurant Card", "read", card_name)


def _decoded_css(css) -> str:
	"""The CSS as the engine reads it: comments dropped and escapes decoded."""

	def decode(match):
		digits, other = match.groups()
		if digits is None:
			return other
		code = int(digits, 16)
		return chr(code) if 0 < code <= 0x10FFFF else "\ufffd"

	return CSS_ESCAPE.sub(decode, CSS_COMMENT.sub("", css))


def css_is_safe(css) -> bool:
	"""Whether a custom CSS only styles the page: no fetch (url, @import, image), escaped or not, and no `<`.

	A harmless escape passes (`content: "\\2022"`, a bullet); until 30.10.2026 any backslash dropped the whole CSS.
	"""
	css = cstr(css)
	if "<" in css:
		return False
	folded = re.sub(r"\s+", "", _decoded_css(css)).lower()
	return not any(token in folded for token in FORBIDDEN_CSS)


def _known_overrides(overrides) -> dict:
	"""The overrides a card's design may carry (DESIGN_KEYS); every other key is ignored."""
	if not isinstance(overrides, dict):
		return {}
	return {key: value for key, value in overrides.items() if key in DESIGN_KEYS and value is not None}


def _parse_overrides(overrides) -> dict:
	if isinstance(overrides, str):
		try:
			overrides = json.loads(overrides)
		except (json.JSONDecodeError, TypeError):
			overrides = {}
	return _known_overrides(overrides)


def _safe_design(design, default_theme) -> dict:
	"""The design the templates print, every value checked for where it lands.

	Frappe's Jinja does not escape what it prints: a select takes one of its options, a number its range, a font a
	family name, a colour a colour, a text is escaped, and a custom CSS that would fetch something or leave its style
	sheet is dropped. A colour that is not one is left out, so that the template's own default applies.
	"""
	design = design or {}
	meta = frappe.get_meta("Menu Design Template")
	safe = {}
	for key in DESIGN_SELECTS:
		options = (meta.get_options(key) or "").split("\n")
		value = design.get(key)
		safe[key] = value if value in options else DESIGN_DEFAULTS.get(key)
	safe["style_theme"] = safe["style_theme"] or default_theme
	for key in DESIGN_CHECKS:
		safe[key] = 1 if cint(design.get(key)) else 0
	for key, (low, high, default) in DESIGN_NUMBERS.items():
		value = cint(design.get(key))
		safe[key] = min(max(value, low), high) if value else default
	for key, default in DESIGN_FONTS.items():
		value = cstr(design.get(key)).strip()
		safe[key] = value if FONT.fullmatch(value) else default
	for key in DESIGN_COLORS:
		value = cstr(design.get(key)).strip()
		if COLOR.fullmatch(value):
			safe[key] = value
	for key in DESIGN_TEXTS:
		safe[key] = escape(design[key]) if design.get(key) else ""
	css = cstr(design.get("custom_css"))
	safe["custom_css"] = css if css and css_is_safe(css) else ""
	groups = design.get("selected_option_groups")
	safe["selected_option_groups"] = (
		[escape(group) for group in groups if isinstance(group, str)] if isinstance(groups, list) else []
	)
	return safe


def _escaped(value):
	"""Every text of a card's data escaped for the HTML it lands in; numbers stay numbers."""
	if isinstance(value, str):
		return escape(value)
	if isinstance(value, dict):
		return {key: _escaped(item) for key, item in value.items()}
	if isinstance(value, list | tuple):
		return [_escaped(item) for item in value]
	return value


def _render_menu(data, default_theme):
	"""The HTML of a menu: the card's data escaped and its design checked (_safe_design). Returns (html, design)."""
	design = _safe_design(data.get("design"), default_theme)
	context = _escaped({key: value for key, value in data.items() if key != "design"})
	context["design"] = design
	return frappe.render_template(f"pos_next/templates/menu/{design['style_theme']}.html", context), design


@frappe.whitelist()
def get_menu_preview_data(card_name, template_name=None):
	"""Return structured data for menu preview and PDF generation.

	The printed card carries its restaurant: the restaurant's name (`restaurant_name`) and logo (`logo`) head the
	card, the company's name and logo standing in for a restaurant that has none of its own.
	"""
	_require_cards(card_name)
	from pos_next.api.restaurant import get_card_items_with_badges

	card_data = get_card_items_with_badges(card_name)

	# Load template config
	template = None
	card_doc = frappe.get_doc("Restaurant Card", card_name)
	tpl_name = template_name or card_doc.get("custom_design_template")

	if tpl_name:
		template = frappe.get_doc("Menu Design Template", tpl_name).as_dict()
	else:
		# Fallback to "Moderne Minimaliste" or first available
		default = frappe.db.get_value(
			"Menu Design Template", {"style_theme": "modern"}, "name"
		) or frappe.db.get_value("Menu Design Template", {}, "name")
		if default:
			template = frappe.get_doc("Menu Design Template", default).as_dict()

	# The card's own overrides, among what a design may carry
	overrides = {}
	raw = card_doc.get("custom_design_overrides")
	if raw:
		try:
			overrides = json.loads(raw) if isinstance(raw, str) else raw
		except (json.JSONDecodeError, TypeError):
			pass

	if template:
		template.update(_known_overrides(overrides))

	# The restaurant the card belongs to, and the company behind it
	restaurant = scope.restaurant_of_record("Restaurant Card", card_name)
	restaurant_name, logo, restaurant_company = "", "", None
	if restaurant:
		restaurant_name, logo, restaurant_company = frappe.db.get_value(
			"Restaurant", restaurant, ["restaurant_name", "logo", "company"]
		) or ("", "", None)

	# Get currency and company logo
	company = restaurant_company or frappe.defaults.get_defaults().get("company")
	currency = frappe.db.get_value("Company", company, "default_currency") or "CHF"
	company_logo = frappe.db.get_value("Company", company, "company_logo") or ""
	company_name = frappe.db.get_value("Company", company, "company_name") or ""

	# Encode chili icon for spice level (replaces emoji which pixelates in PDF)
	chili_uri = ""
	try:
		import base64

		chili_path = frappe.get_app_path("pos_next", "public", "icons", "badges", "png", "chili.png")
		with open(chili_path, "rb") as f:
			b64 = base64.b64encode(f.read()).decode("ascii")
			chili_uri = f"data:image/png;base64,{b64}"
	except FileNotFoundError:
		pass

	# Collect unique option group names
	option_groups = set()
	for cat in card_data["categories"]:
		for item in cat["menu_items"]:
			for opt in item.get("product_options", []):
				option_groups.add(opt["group_name"])

	return {
		"card": card_data["card"],
		"categories": card_data["categories"],
		"design": template,
		"currency": currency,
		"site_url": frappe.utils.get_url(),
		"restaurant": restaurant,
		"restaurant_name": restaurant_name or "",
		"logo": logo or "",
		"company_logo": company_logo,
		"company_name": company_name,
		"chili_uri": chili_uri,
		"option_groups": sorted(option_groups),
	}


@frappe.whitelist()
def get_design_templates():
	"""Return all available design templates."""
	permissions.require_right("manage_cards")
	permissions.require("Menu Design Template", "read")
	return frappe.get_all(
		"Menu Design Template",
		fields=["*"],
		order_by="template_name asc",
	)


def _combined(card_names, template_name):
	"""The data of several cards printed as one menu: their categories, under the first card's design."""
	all_categories = []
	for name in card_names:
		all_categories.extend(get_menu_preview_data(name, template_name)["categories"])
	first_data = get_menu_preview_data(card_names[0], template_name)
	return {
		"card": {"card_name": " + ".join(card_names), "description": "", "image": ""},
		"categories": all_categories,
		"design": first_data.get("design"),
		"currency": first_data.get("currency", "CHF"),
		"site_url": first_data.get("site_url", ""),
		"restaurant": first_data.get("restaurant"),
		"restaurant_name": first_data.get("restaurant_name", ""),
		"logo": first_data.get("logo", ""),
		"company_logo": first_data.get("company_logo", ""),
		"company_name": first_data.get("company_name", ""),
		"chili_uri": first_data.get("chili_uri", ""),
	}


def _with_overrides(data, overrides, paper_format=None):
	"""The data with the caller's overrides (among DESIGN_KEYS) put on its design."""
	design = dict(data.get("design") or {})
	design.update(_parse_overrides(overrides))
	if paper_format:
		design["paper_format"] = paper_format
	return {**data, "design": design}


@frappe.whitelist()
def get_menu_preview_html(card_name=None, card_names=None, template_name=None, overrides=None):
	"""Return the rendered HTML for the menu preview (same HTML used for PDF).

	Supports single card (card_name) or multiple cards (card_names JSON array).
	"""
	# Multi-card support
	if isinstance(card_names, str):
		try:
			card_names = json.loads(card_names)
		except (json.JSONDecodeError, TypeError):
			card_names = None
	if not isinstance(card_names, list):
		card_names = None
	_require_cards(*(card_names or ([card_name] if card_name else [])))

	if card_names and len(card_names) > 1:
		preview_data = _combined(card_names, template_name)
	else:
		name = card_name or (card_names[0] if card_names else None)
		if not name:
			return ""
		preview_data = get_menu_preview_data(name, template_name)

	html, _design = _render_menu(_with_overrides(preview_data, overrides), "modern")
	return html


@frappe.whitelist()
def save_card_design(card_name, template_name=None, overrides=None):
	"""Save design settings to a Restaurant Card (not to the template): the design's own keys only."""
	# //// Neoffice — its caller is the till (MenuDesignerDialog), so only the till's users pass
	# //// (cash_entry.require_till_user).
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	# And whoever may write the card (not a cashier), saved as that user (NeoRestau lot 1, task 3)
	permissions.require("Restaurant Card", "write", card_name)
	overrides = _parse_overrides(overrides)
	_refuse_unsafe_css(overrides.get("custom_css"))

	card = frappe.get_doc("Restaurant Card", card_name)
	if template_name:
		card.custom_design_template = template_name
	if overrides:
		card.custom_design_overrides = json.dumps(overrides)
	card.save()
	frappe.db.commit()
	return {"status": "ok"}


def _refuse_unsafe_css(css):
	"""Refuse a custom CSS that would make the PDF engine fetch something, or leave its style sheet."""
	if css and not css_is_safe(css):
		frappe.throw(_("A menu's custom CSS may not load anything (url(), @import, image()) nor contain <"))


@frappe.whitelist()
def generate_menu_pdf(card_name, template_name=None, overrides=None, paper_format=None):
	"""Generate a PDF for a restaurant card menu (wkhtmltopdf)."""
	_require_cards(card_name)
	data = _with_overrides(get_menu_preview_data(card_name, template_name), overrides, paper_format)
	html_content, design = _render_menu(data, "elegant")

	# Generate PDF
	pdf_bytes = _html_to_pdf(html_content, design)

	# Return as file response
	card_display = data["card"]["card_name"].replace(" ", "_")
	filename = f"menu_{card_display}.pdf"

	frappe.local.response.filename = filename
	frappe.local.response.filecontent = pdf_bytes
	frappe.local.response.type = "download"


@frappe.whitelist()
def generate_multi_card_pdf(card_names, template_name=None, overrides=None, paper_format=None):
	"""Generate a single PDF combining multiple restaurant cards."""
	if isinstance(card_names, str):
		card_names = json.loads(card_names)
	if not isinstance(card_names, list) or not card_names:
		frappe.throw(_("Choose the cards to print"))
	_require_cards(*card_names)

	data = _with_overrides(_combined(card_names, template_name), overrides, paper_format)
	html_content, design = _render_menu(data, "elegant")
	pdf_bytes = _html_to_pdf(html_content, design)

	card_display_name = "_".join(name.replace(" ", "_") for name in card_names)
	frappe.local.response.filename = f"menu_{card_display_name}.pdf"
	frappe.local.response.filecontent = pdf_bytes
	frappe.local.response.type = "download"


def _html_to_pdf(html_content, template):
	"""Convert HTML to PDF using wkhtmltopdf directly.

	Bypasses frappe.utils.pdf.get_pdf() because it forces margin-top/bottom
	to 0mm when no header-html/footer-html divs are found (frappe/utils/pdf.py:339-344).
	"""
	import pdfkit

	options = _get_wkhtmltopdf_options(template)

	# pdfkit expects string values and '--' prefix is handled internally
	return pdfkit.from_string(html_content, False, options=options)


def _build_page_css(template):
	"""Build CSS @page rules from template settings."""
	paper = template.get("paper_format", "A4 Portrait")

	size_map = {
		"A4 Portrait": "210mm 297mm",
		"A4 Landscape": "297mm 210mm",
		"A3": "297mm 420mm",
	}

	if paper == "Custom":
		w = template.get("custom_width_mm", 210)
		h = template.get("custom_height_mm", 297)
		size = f"{w}mm {h}mm"
	else:
		size = size_map.get(paper, "210mm 297mm")

	return f"@page {{ size: {size}; margin: 20mm; }}"


def _get_wkhtmltopdf_options(template):
	"""Build wkhtmltopdf options dict from template settings."""
	paper = template.get("paper_format", "A4 Portrait")

	options = {
		# What Frappe's own get_pdf passes: the engine runs no script and reads no local file
		"disable-javascript": "",
		"disable-local-file-access": "",
		"margin-top": "20mm",
		"margin-bottom": "20mm",
		"margin-left": "20mm",
		"margin-right": "20mm",
		"print-media-type": "",
		"encoding": "UTF-8",
	}

	if paper == "A4 Portrait":
		options["page-size"] = "A4"
		options["orientation"] = "Portrait"
	elif paper == "A4 Landscape":
		options["page-size"] = "A4"
		options["orientation"] = "Landscape"
	elif paper == "A3":
		options["page-size"] = "A3"
		options["orientation"] = "Portrait"
	elif paper == "Custom":
		w = template.get("custom_width_mm", 210)
		h = template.get("custom_height_mm", 297)
		options["page-width"] = f"{w}mm"
		options["page-height"] = f"{h}mm"

	return options
