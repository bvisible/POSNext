import json

import frappe
from frappe import _


@frappe.whitelist()
def get_menu_preview_data(card_name, template_name=None):
	"""Return structured data for menu preview and PDF generation."""
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

	# Get overrides from card
	overrides = {}
	raw = card_doc.get("custom_design_overrides")
	if raw:
		try:
			overrides = json.loads(raw) if isinstance(raw, str) else raw
		except (json.JSONDecodeError, TypeError):
			pass

	# Merge template + overrides
	if template and overrides:
		for key, value in overrides.items():
			if key in template and value is not None:
				template[key] = value

	# Get currency and company logo
	company = frappe.defaults.get_defaults().get("company")
	currency = frappe.db.get_value("Company", company, "default_currency") or "CHF"
	company_logo = frappe.db.get_value("Company", company, "company_logo") or ""
	company_name = frappe.db.get_value("Company", company, "company_name") or ""

	return {
		"card": card_data["card"],
		"categories": card_data["categories"],
		"design": template,
		"currency": currency,
		"site_url": frappe.utils.get_url(),
		"company_logo": company_logo,
		"company_name": company_name,
	}


@frappe.whitelist()
def get_design_templates():
	"""Return all available design templates."""
	return frappe.get_all(
		"Menu Design Template",
		fields=["*"],
		order_by="template_name asc",
	)


@frappe.whitelist()
def save_card_design(card_name, template_name=None, overrides=None):
	"""Save design settings to a Restaurant Card (not to the template)."""
	if isinstance(overrides, str):
		try:
			overrides = json.loads(overrides)
		except (json.JSONDecodeError, TypeError):
			overrides = {}

	card = frappe.get_doc("Restaurant Card", card_name)
	if template_name:
		card.custom_design_template = template_name
	if overrides:
		card.custom_design_overrides = json.dumps(overrides)
	card.save(ignore_permissions=True)
	frappe.db.commit()
	return {"status": "ok"}


@frappe.whitelist()
def generate_menu_pdf(card_name, template_name=None, overrides=None, paper_format=None):
	"""Generate a PDF for a restaurant card menu using WeasyPrint."""
	if isinstance(overrides, str):
		try:
			overrides = json.loads(overrides)
		except (json.JSONDecodeError, TypeError):
			overrides = {}

	preview_data = get_menu_preview_data(card_name, template_name)

	if overrides and preview_data.get("design"):
		for key, value in overrides.items():
			if value is not None:
				preview_data["design"][key] = value

	if paper_format and preview_data.get("design"):
		preview_data["design"]["paper_format"] = paper_format

	design = preview_data.get("design") or {}
	style_theme = design.get("style_theme", "elegant")

	# Render Jinja template
	template_path = f"pos_next/templates/menu/{style_theme}.html"
	html_content = frappe.render_template(template_path, preview_data)

	# Generate PDF
	pdf_bytes = _html_to_pdf(html_content, design)

	# Return as file response
	card_display = preview_data["card"]["card_name"].replace(" ", "_")
	filename = f"menu_{card_display}.pdf"

	frappe.local.response.filename = filename
	frappe.local.response.filecontent = pdf_bytes
	frappe.local.response.type = "download"


@frappe.whitelist()
def generate_multi_card_pdf(card_names, template_name=None, overrides=None, paper_format=None):
	"""Generate a single PDF combining multiple restaurant cards."""
	if isinstance(card_names, str):
		card_names = json.loads(card_names)
	if isinstance(overrides, str):
		try:
			overrides = json.loads(overrides)
		except (json.JSONDecodeError, TypeError):
			overrides = {}

	all_categories = []
	card_display_name = ""

	for card_name in card_names:
		data = get_menu_preview_data(card_name, template_name)
		all_categories.extend(data["categories"])
		if card_display_name:
			card_display_name += "_"
		card_display_name += data["card"]["card_name"].replace(" ", "_")

	# Use first card's design if not specified
	first_data = get_menu_preview_data(card_names[0], template_name)
	design = first_data.get("design") or {}

	if overrides:
		for key, value in overrides.items():
			if value is not None:
				design[key] = value

	if paper_format:
		design["paper_format"] = paper_format

	style_theme = design.get("style_theme", "elegant")

	combined_data = {
		"card": {"card_name": " + ".join(card_names), "description": "", "image": ""},
		"categories": all_categories,
		"design": design,
		"currency": first_data.get("currency", "CHF"),
		"site_url": first_data.get("site_url", ""),
	}

	template_path = f"pos_next/templates/menu/{style_theme}.html"
	html_content = frappe.render_template(template_path, combined_data)

	pdf_bytes = _html_to_pdf(html_content, design)

	frappe.local.response.filename = f"menu_{card_display_name}.pdf"
	frappe.local.response.filecontent = pdf_bytes
	frappe.local.response.type = "download"


def _html_to_pdf(html_content, template):
	"""Convert HTML to PDF using wkhtmltopdf (stable) or WeasyPrint if configured."""
	use_weasyprint = frappe.db.get_single_value("Restaurant Settings", "use_weasyprint") if frappe.db.exists("DocType", "Restaurant Settings") else False

	if use_weasyprint:
		try:
			from weasyprint import CSS, HTML

			css_overrides = _build_page_css(template)
			stylesheets = [CSS(string=css_overrides)] if css_overrides else []

			pdf_bytes = HTML(string=html_content, base_url=frappe.utils.get_url()).write_pdf(
				stylesheets=stylesheets,
			)
			return pdf_bytes
		except Exception as e:
			frappe.log_error("WeasyPrint PDF error", str(e))

	# Default: use wkhtmltopdf (stable, low memory)
	from frappe.utils.pdf import get_pdf

	options = _get_wkhtmltopdf_options(template)
	return get_pdf(html_content, options=options)


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
		"margin-top": "20mm",
		"margin-bottom": "20mm",
		"margin-left": "20mm",
		"margin-right": "20mm",
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
