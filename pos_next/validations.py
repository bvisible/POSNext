# -*- coding: utf-8 -*-
# Copyright (c) 2024, POS Next and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _


def validate_item(doc, method):
	"""
	Validate Item doctype
	- Keep custom_company value as provided by user
	- Do not auto-fill defaults
	"""
	pass


@frappe.whitelist()
def item_query(doctype, txt, searchfield, start, page_len, filters):
	"""
	Custom query to filter items by company
	- If company is specified in filters, show matching company items only
	- If no company is specified, show items based on the current user's allowed companies
	"""
	import json
	from pos_next.company_isolation import get_user_companies

	# Parse filters if it's a string (when called from frontend)
	if isinstance(filters, str):
		filters = json.loads(filters)

	conditions = ["disabled = 0"]
	values = []

	# //// Neoffice — is_internal_item is a Neoffice Custom Field: items that exist only to be
	# //// added by code (TIP…) must not be reachable from a link-field search. POSNext registers
	# //// this as a standard_query doing raw SQL, which bypasses neoffice_theme's
	# //// permission_query_conditions, so the condition has to be repeated here (6f59de47,
	# //// 2026-04-02).
	# //// hide internal items from search results — 6f59de4
	# Hide internal items from non-Administrator users
	if frappe.session.user != "Administrator":
		conditions.append("IFNULL(is_internal_item, 0) != 1")

	if txt:
		conditions.append(f"({searchfield} LIKE %s OR item_name LIKE %s)")
		values.extend([f"%{txt}%", f"%{txt}%"])

	company = filters.get("company") if filters else None

	if company:
		conditions.append("(custom_company = %s OR custom_company IS NULL OR custom_company = '')")
		values.append(company)
	else:
		user_companies = get_user_companies()
		if user_companies:
			placeholders = ", ".join(["%s"] * len(user_companies))
			conditions.append(
				f"(custom_company IN ({placeholders}) OR custom_company IS NULL OR custom_company = '')"
			)
			values.extend(user_companies)

	query = f"""
		SELECT name, item_name, item_group
		FROM `tabItem`
		WHERE {' AND '.join(conditions)}
		ORDER BY
			CASE WHEN name LIKE %s THEN 0 ELSE 1 END,
			item_name
		LIMIT %s, %s
	"""

	values.extend([f"{txt}%", start, page_len])

	return frappe.db.sql(query, values)
