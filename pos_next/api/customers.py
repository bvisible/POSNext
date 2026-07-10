"""
POS Next Customer API
Handles customer search, creation, and management for POS operations
"""

import frappe
from frappe import _


@frappe.whitelist()
def get_customers(search_term="", pos_profile=None, limit=20, modified_since=None):
	"""
	Search customers for inline customer selection in POS.

	Args:
	    search_term (str): Search query (name, mobile, or customer ID)
	    pos_profile (str): POS Profile to filter by customer group
	    limit (int): Maximum number of results to return
	    modified_since (str): Fetch customers modified after this timestamp (ISO format)

	Returns:
	    list: List of customer dictionaries with name, customer_name, mobile_no, email_id, disabled
	"""
	try:
		frappe.logger().debug(
			f"get_customers called with search_term={search_term}, pos_profile={pos_profile}, limit={limit}, modified_since={modified_since}"
		)

		filters = {}

		# Filter by POS Profile customer group if specified
		if pos_profile:
			frappe.logger().debug(f"Loading POS Profile: {pos_profile}")
			profile_doc = frappe.get_cached_doc("POS Profile", pos_profile)
			# Check if customer_group field exists (it may not exist in all versions)
			if hasattr(profile_doc, "customer_group") and profile_doc.customer_group:
				filters["customer_group"] = profile_doc.customer_group
				frappe.logger().debug(f"Filtering by customer_group: {profile_doc.customer_group}")

		if modified_since:
			# Delta sync: include disabled customers so frontend can purge them
			filters["modified"] = [">=", modified_since]
		else:
			# Full fetch: only active customers
			filters["disabled"] = 0

		search_term = (search_term or "").strip()
		customer_limit = limit if limit not in (None, 0) else frappe.db.count("Customer", filters)
		# Extra fields (group/territory/type/address) let the POS show an address
		# snippet in search results and a full info popover on the selected card
		# without an extra per-customer fetch — they ride along in the cache.
		fields = [
			"name",
			"customer_name",
			"mobile_no",
			"email_id",
			"disabled",
			"customer_group",
			"territory",
			"customer_type",
			"primary_address",
		]

		# Split the query into words so the order the name was entered in does not
		# matter: "Moret Daniel" must find a customer stored as "Daniel Moret".
		# Each word must match some field (OR across fields), and all words must
		# match (AND across words) — which frappe.get_all's single or_filters group
		# cannot express, so build the condition with the query builder.
		words = search_term.split()
		if words:
			Customer = frappe.qb.DocType("Customer")
			query = frappe.qb.from_(Customer).select(
				Customer.name,
				Customer.customer_name,
				Customer.mobile_no,
				Customer.email_id,
				Customer.disabled,
				Customer.customer_group,
				Customer.territory,
				Customer.customer_type,
				Customer.primary_address,
			)
			# Re-apply the base filters (customer_group + disabled/modified).
			if filters.get("customer_group"):
				query = query.where(Customer.customer_group == filters["customer_group"])
			if "modified" in filters:
				query = query.where(Customer.modified >= modified_since)
			else:
				query = query.where(Customer.disabled == 0)
			# AND across words, OR across fields for each word.
			for word in words:
				like = f"%{word}%"
				query = query.where(
					Customer.name.like(like)
					| Customer.customer_name.like(like)
					| Customer.mobile_no.like(like)
					| Customer.email_id.like(like)
				)
			result = (
				query.orderby(Customer.customer_name).limit(customer_limit).run(as_dict=True)
			)
		else:
			result = frappe.get_all(
				"Customer",
				filters=filters,
				fields=fields,
				limit=customer_limit,
				order_by="customer_name asc",
			)
		frappe.logger().debug(f"get_customers returned {len(result)} customers")
		return result
	except Exception as e:
		frappe.logger().error(f"Error in get_customers: {str(e)}")
		frappe.logger().error(frappe.get_traceback())
		frappe.throw(_("Error fetching customers: {0}").format(str(e)))


@frappe.whitelist()
def create_customer(
	customer_name,
	mobile_no=None,
	email_id=None,
	customer_group="Individual",
	territory="All Territories",
	customer_type="Individual",
	company=None,
	pos_profile=None,
):
	"""
	Create a new customer from POS.

	Args:
	    customer_name (str): Customer name (required)
	    mobile_no (str): Mobile number (optional)
	    email_id (str): Email address (optional)
	    customer_group (str): Customer group (default: Individual)
	    territory (str): Territory (default: All Territories)
	    customer_type (str): Individual or Company (default: Individual)
	    company (str): Company (optional, used to auto-assign loyalty program)
	    pos_profile (str): POS Profile (optional, preferred for context-aware loyalty assignment)

	Returns:
	    dict: Created customer document
	"""
	# Check if user has permission to create customers
	if not frappe.has_permission("Customer", "create"):
		frappe.throw(_("You don't have permission to create customers"), frappe.PermissionError)

	if not customer_name:
		frappe.throw(_("Customer name is required"))

	loyalty_program = get_default_loyalty_program_from_settings(
		company=company,
		pos_profile=pos_profile,
	)

	# Normalize customer_type to the values accepted by ERPNext (Individual / Company)
	customer_type = (customer_type or "Individual").strip().capitalize()
	if customer_type not in ("Individual", "Company"):
		customer_type = "Individual"

	# Resolve customer_group with fallback (a localized site may not have "Individual" as a doc)
	resolved_group = customer_group if customer_group and frappe.db.exists("Customer Group", customer_group) else None
	if not resolved_group:
		resolved_group = frappe.db.get_single_value("Selling Settings", "customer_group") or frappe.db.get_value(
			"Customer Group", {"is_group": 0}, "name", order_by="name"
		)
	if not resolved_group:
		frappe.throw(_("No customer group configured. Please create one before adding customers."))

	# Resolve territory with fallback (localized sites rename "All Territories", e.g. "Tout les territoires")
	resolved_territory = territory if territory and frappe.db.exists("Territory", territory) else None
	if not resolved_territory:
		resolved_territory = frappe.db.get_single_value("Selling Settings", "territory") or frappe.db.get_value(
			"Territory", {"is_group": 0}, "name", order_by="name"
		)
	if not resolved_territory:
		frappe.throw(_("No territory configured. Please create one before adding customers."))

	# Resolve default_currency (Customer treats it as mandatory on some sites). Prefer the POS Profile,
	# then the company default, then the global default. Stay None-tolerant so we don't crash if nothing
	# is configured — Frappe will raise its own MandatoryError with a clearer location at that point.
	resolved_currency = None
	if pos_profile:
		resolved_currency = frappe.db.get_value("POS Profile", pos_profile, "currency")
	if not resolved_currency:
		resolved_company = company
		if not resolved_company and pos_profile:
			resolved_company = frappe.db.get_value("POS Profile", pos_profile, "company")
		if resolved_company:
			resolved_currency = frappe.db.get_value("Company", resolved_company, "default_currency")
	if not resolved_currency:
		resolved_currency = frappe.db.get_default("currency")

	customer = frappe.get_doc(
		{
			"doctype": "Customer",
			"customer_name": customer_name,
			"customer_type": customer_type,
			"customer_group": resolved_group,
			"territory": resolved_territory,
			"mobile_no": mobile_no or "",
			"email_id": email_id or "",
			"loyalty_program": loyalty_program,
			"default_currency": resolved_currency,
		}
	)

	frappe.flags.pos_next_customer_company = company
	frappe.flags.pos_next_customer_pos_profile = pos_profile
	try:
		customer.insert()
	finally:
		frappe.flags.pos_next_customer_company = None
		frappe.flags.pos_next_customer_pos_profile = None

	return customer.as_dict()


def get_default_loyalty_program(company):
	"""
	Get the default loyalty program for a company.
	Prefers programs with auto_opt_in enabled.

	Args:
	    company (str): Company name

	Returns:
	    str: Loyalty program name or None
	"""
	# First try to find a loyalty program with auto_opt_in for the company
	loyalty_program = frappe.db.get_value("Loyalty Program", {"company": company, "auto_opt_in": 1}, "name")

	if loyalty_program:
		return loyalty_program

	# Fallback: any loyalty program for the company
	loyalty_program = frappe.db.get_value("Loyalty Program", {"company": company}, "name")

	return loyalty_program


def auto_assign_loyalty_program(doc, method=None):
	"""
	Auto-assign loyalty program to newly created customers.
	Called as after_insert hook on Customer doctype.

	Uses the default_loyalty_program from POS Settings.
	If no loyalty program is configured in POS Settings, no auto-assignment occurs.

	Args:
	    doc: Customer document
	    method: Hook method name (not used)
	"""
	# Skip if customer already has a loyalty program
	if doc.loyalty_program:
		return

	company, pos_profile = _get_customer_assignment_context()
	loyalty_program = get_default_loyalty_program_from_settings(
		company=company,
		pos_profile=pos_profile,
	)

	if loyalty_program:
		# Use db_set to avoid triggering validate hooks again
		doc.db_set("loyalty_program", loyalty_program, update_modified=False)
		frappe.logger().info(f"Auto-assigned loyalty program '{loyalty_program}' to customer '{doc.name}'")


def _get_customer_assignment_context():
	"""Get company/profile context for customer auto-assignment from the current request."""
	company = getattr(frappe.flags, "pos_next_customer_company", None)
	pos_profile = getattr(frappe.flags, "pos_next_customer_pos_profile", None)

	form_dict = getattr(frappe.local, "form_dict", None)
	if form_dict:
		company = company or form_dict.get("company")
		pos_profile = pos_profile or form_dict.get("pos_profile")

	return company, pos_profile


def get_default_loyalty_program_from_settings(company=None, pos_profile=None):
	"""
	Get the default loyalty program from POS Settings using explicit context.
	Returns a program only when the company/profile context is clear enough to avoid
	assigning the wrong loyalty program.

	Returns:
	    str: Loyalty program name or None if not configured
	"""
	if pos_profile:
		pos_settings = frappe.db.get_value(
			"POS Settings",
			{"enabled": 1, "pos_profile": pos_profile},
			"default_loyalty_program",
		)
		return pos_settings or None

	if not company:
		return None

	pos_settings = frappe.get_all(
		"POS Settings",
		filters={"enabled": 1, "default_loyalty_program": ["is", "set"]},
		fields=["pos_profile", "default_loyalty_program"],
		order_by="modified desc",
	)

	company_programs = []
	for row in pos_settings:
		profile_company = frappe.get_cached_value("POS Profile", row.pos_profile, "company")
		if profile_company == company:
			company_programs.append(row.default_loyalty_program)

	unique_programs = list(dict.fromkeys(program for program in company_programs if program))
	if len(unique_programs) == 1:
		return unique_programs[0]

	return None


@frappe.whitelist()
def get_customer_details(customer):
	"""
	Get detailed customer information.

	Args:
	    customer (str): Customer ID

	Returns:
	    dict: Customer details
	"""
	if not customer:
		frappe.throw(_("Customer is required"))

	return frappe.get_cached_doc("Customer", customer).as_dict()


# ////  meta-driven full customer edit for the POS (dialog, stays in the SPA)
# Field types we can render as inputs in the POS edit dialog. Child tables,
# HTML, attachments, etc. are intentionally skipped to keep the dialog clean.
_RENDERABLE_FIELDTYPES = {
	"Data",
	"Small Text",
	"Text",
	"Long Text",
	"Text Editor",
	"Select",
	"Check",
	"Link",
	"Int",
	"Float",
	"Currency",
	"Percent",
	"Date",
	"Datetime",
	"Time",
	"Phone",
	"Read Only",
}

# Internal / CRM-linkage fields that are pure noise for a cashier editing a
# customer — skipped even though they are renderable field types.
_SKIP_FIELDNAMES = {
	"lead_name",
	"opportunity_name",
	"prospect_name",
	"represents_company",
	"is_internal_customer",
	"companies",
	"objects",
}


def _label(text):
	"""Translate a label and decode HTML entities (some doctype labels such as
	'Address &amp; Contact' come HTML-escaped and would render literally)."""
	import html

	if not text:
		return ""
	return html.unescape(_(text))


def _customer_form_layout():
	"""Build the grouped (tab -> section -> fields) layout of the Customer
	doctype, keeping only renderable, non-noise fields. Empty tabs/sections are
	dropped so the dialog never shows a blank tab (e.g. Portal Users)."""
	meta = frappe.get_meta("Customer")

	tabs = []
	cur_tab = {"label": _("Details"), "sections": []}
	cur_section = {"label": "", "fields": []}

	def flush_section():
		if cur_section["fields"]:
			cur_tab["sections"].append(dict(cur_section))

	def flush_tab():
		flush_section()
		if cur_tab["sections"]:
			tabs.append(dict(cur_tab))

	for df in meta.fields:
		if df.fieldtype == "Tab Break":
			flush_tab()
			cur_tab = {"label": _label(df.label), "sections": []}
			cur_section = {"label": "", "fields": []}
		elif df.fieldtype == "Section Break":
			flush_section()
			cur_section = {"label": _label(df.label), "fields": []}
		elif df.fieldtype == "Column Break":
			continue
		elif (
			df.fieldtype in _RENDERABLE_FIELDTYPES
			and not df.hidden
			and df.fieldname not in _SKIP_FIELDNAMES
		):
			cur_section["fields"].append(
				{
					"fieldname": df.fieldname,
					"label": _label(df.label) if df.label else df.fieldname,
					"fieldtype": df.fieldtype,
					"options": df.options,
					"reqd": int(df.reqd or 0),
					"read_only": int(df.read_only or 0),
					"depends_on": df.depends_on or "",
					"description": _label(df.description),
				}
			)

	flush_tab()
	return tabs


@frappe.whitelist()
def get_customer_form(customer):
	"""Return the Customer values + a grouped, meta-driven field layout for the
	POS full-edit dialog. Custom fields are included automatically; child tables
	and other non-editable field types are omitted."""
	if not customer:
		frappe.throw(_("Customer is required"))
	if not frappe.has_permission("Customer", "read", doc=customer):
		frappe.throw(_("You are not permitted to view this customer"), frappe.PermissionError)

	doc = frappe.get_doc("Customer", customer)
	tabs = _customer_form_layout()

	values = {"name": doc.name}
	for tab in tabs:
		for section in tab["sections"]:
			for field in section["fields"]:
				values[field["fieldname"]] = doc.get(field["fieldname"])

	return {"name": doc.name, "tabs": tabs, "values": values}


@frappe.whitelist()
def save_customer_form(customer, values):
	"""Persist edited values back onto the Customer doc. Only writable,
	non-table fields are applied; the doc's own validation runs on save."""
	import json

	if not customer:
		frappe.throw(_("Customer is required"))
	if isinstance(values, str):
		values = json.loads(values)
	if not frappe.has_permission("Customer", "write", doc=customer):
		frappe.throw(_("You are not permitted to edit this customer"), frappe.PermissionError)

	meta = frappe.get_meta("Customer")
	writable = {
		df.fieldname
		for df in meta.fields
		if df.fieldtype in _RENDERABLE_FIELDTYPES
		and df.fieldtype != "Read Only"
		and not df.read_only
		and df.fieldname not in _SKIP_FIELDNAMES
	}

	doc = frappe.get_doc("Customer", customer)
	for fieldname, value in values.items():
		if fieldname in writable:
			doc.set(fieldname, value)
	doc.save()

	return {
		"name": doc.name,
		"customer_name": doc.customer_name,
		"mobile_no": doc.mobile_no,
		"email_id": doc.email_id,
		"customer_group": doc.customer_group,
		"territory": doc.territory,
		"customer_type": doc.customer_type,
		"primary_address": doc.get("primary_address"),
	}
