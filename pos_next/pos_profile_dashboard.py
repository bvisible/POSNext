# //// Neoffice — added file (no upstream equivalent). The Connections of the POS Profile form (NeoResto lot 1, task 13b; product
# //// owner, 05.11.2026: « quand on est dedans, on tape sur les bonnes factures »). ERPNext's profile links to ITS point of sale's
# //// documents (POS Invoice, POS Opening Entry, POS Closing Entry), which a till of this app never makes: it books Sales Invoices
# //// and keeps its sessions in POS Opening Shift and POS Closing Shift. The form showed three links to nothing and none to
# //// the till's own documents. This puts the till's own there, and the till's POSNext settings with them.
"""The connections of a POS Profile: the documents a till of this app really makes."""

# What ERPNext's own point of sale makes and this app's till never does
UNUSED = ("POS Invoice", "POS Opening Entry", "POS Closing Entry")
# The group ERPNext files its opening and closing under (the label as its doctype declares it, in English)
SESSIONS = "Opening & Closing"
# What a till of this app really makes, each carrying `pos_profile`
SHIFTS = ("POS Opening Shift", "POS Closing Shift")
SETTINGS_GROUP, SETTINGS = "Settings", "POS Settings"


def get_dashboard_data(data):
	"""`data` as ERPNext (and the other apps) left it: the sales invoices stay (the till books them, `pos_profile` on each), the
	three unused links go, the till's sessions take the place of ERPNext's opening and closing, and the till's POSNext settings
	are one click away. Every link counts and filters by the profile (`pos_profile`, the doctype's own fieldname)."""
	groups = []
	for group in data.get("transactions") or []:
		items = [item for item in group.get("items") or [] if item not in UNUSED]
		if group.get("label") == SESSIONS:
			items = list(SHIFTS)
		if items:
			groups.append(dict(group, items=items))
	if not any(group.get("label") == SESSIONS for group in groups):
		groups.append({"label": SESSIONS, "items": list(SHIFTS)})
	if not any(SETTINGS in group["items"] for group in groups):
		groups.append({"label": SETTINGS_GROUP, "items": [SETTINGS]})
	data["transactions"] = groups
	fieldnames = data.get("non_standard_fieldnames") or {}
	for doctype in UNUSED:
		fieldnames.pop(doctype, None)
	data["non_standard_fieldnames"] = fieldnames
	return data
