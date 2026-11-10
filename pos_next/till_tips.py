# //// Neoffice — added file (no upstream equivalent). Tips at a SHOP till (NeoCoiffeur study, product owner, 09.11.2026:
# //// « les pourboires, comme dans le restaurant […] attribués à la personne qui a servi »; « attention, on en a pour le resto,
# //// donc pars de là »). The restaurant's mechanism is the base and stays as it is: the overpayment becomes a line of the
# //// TIP item, booked on the transit account 2211 (a Swiss tip is a pass-through for the staff, not turnover), and a
# //// `Restaurant Tip` record says whose it is. What this module adds is what a shop till needs and a restaurant does not:
# ////
# //// - the SETTINGS of a till that is not a restaurant till, read from its POS Settings row (the restaurant's are the
# ////   restaurant's own: `pos_next.restaurant.settings`);
# //// - the PROVISIONING of the account and the item, which the restaurant used to do on its own: one function each,
# ////   called by the restaurant and by the till, so that the two can never book a tip differently;
# //// - the SHARES: a sale made by two people gives each the part of the tip their part of the sale makes.
import frappe
from frappe import _
from frappe.utils import cint, flt

# What kind of tip settings a sale was rung up with: the restaurant's (as before), or a shop till's
KIND_TILL = "till"

# Whose a tip is, at a shop till
TO_THE_PERSON = "Person who served"
COMMON_POT = "Common pot"

# What the tip of a shop till is read from, in the till's POS Settings
SETTINGS_FIELDS = (
	"enable_till_tips",
	"till_tips_auto_detect",
	"till_tip_goes_to",
	"till_tip_item",
	"till_tip_account",
)

TIP_ITEM = "TIP"


# ------------------------------------------------------------------------------------------------ provisioning
def ensure_tip_account(company: str | None) -> str | None:
	"""The tip transit account (2211) of a company, made if it does not exist; None when it cannot be made."""
	if not company:
		return None

	# Check if account 2211 already exists
	existing = frappe.db.get_value("Account", {"account_number": "2211", "company": company}, "name")
	if existing:
		return existing

	# Find parent account (2210 or 220)
	parent = frappe.db.get_value("Account", {"account_number": "2210", "company": company}, "name")
	if not parent:
		parent = frappe.db.get_value("Account", {"account_number": "220", "company": company}, "name")
	if not parent:
		frappe.msgprint(_("Could not find parent account 2210 or 220. Please set the tip account manually."))
		return None

	# Ensure parent is a group
	if not frappe.db.get_value("Account", parent, "is_group"):
		frappe.db.set_value("Account", parent, "is_group", 1)

	account = frappe.get_doc(
		{
			"doctype": "Account",
			"account_name": _("Tip Transit Account"),
			"account_number": "2211",
			"parent_account": parent,
			"company": company,
			"account_type": "Income Account",
			"is_group": 0,
		}
	)
	account.insert(ignore_permissions=True)
	frappe.msgprint(_("Created tip transit account: {0}").format(account.name))
	return account.name


def ensure_tip_item(company: str | None, tip_account: str | None) -> str:
	"""The TIP service item, made if the site has none. Its code is returned.

	A tip earns no commission: the item grants none, so that the person a sale is shared with is not paid a
	percentage on what the customer left for them (a tip is not turnover, and the collective agreement's minimum
	turnover leaves it out). An item made before this was written says yes by Frappe's default; it is set right here.
	"""
	if frappe.db.exists("Item", TIP_ITEM):
		# Ensure 0% tax template is assigned even on existing item
		item = frappe.get_doc("Item", TIP_ITEM)
		if not item.taxes:
			_assign_zero_tax_template(item)
		_grant_no_commission(TIP_ITEM)
		return TIP_ITEM

	# Ensure "Services" item group exists
	if not frappe.db.exists("Item Group", "Services"):
		frappe.get_doc(
			{
				"doctype": "Item Group",
				"item_group_name": "Services",
				"parent_item_group": "All Item Groups",
			}
		).insert(ignore_permissions=True)

	# Create TIP item (marked as internal — hidden from user lists/searches)
	item = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": TIP_ITEM,
			"item_name": _("Tip"),
			"item_group": "Services",
			"is_stock_item": 0,
			"standard_rate": 0,
			"is_internal_item": 1,
			"grant_commission": 0,
			"description": _("Gratuity", context="Restaurant tip line"),
		}
	)

	# Set default income account to the tip transit account. The row names a warehouse of its own company: left empty,
	# Frappe fills it with the site's default warehouse, which can belong to another company of the site, and ERPNext
	# then refuses the whole item (« Warehouse … doesn't belong to Company … »), so tips could not be switched on.
	if tip_account:
		item.append(
			"item_defaults",
			{
				"company": company,
				"income_account": tip_account,
				"default_warehouse": _a_warehouse_of(company),
			},
		)

	item.insert(ignore_permissions=True)

	# Auto-assign a 0% tax template (any Item Tax Template whose rates are all 0) if one exists
	_assign_zero_tax_template(item)

	frappe.msgprint(_("Created tip item: TIP"))
	return TIP_ITEM


def _a_warehouse_of(company: str | None) -> str | None:
	"""The site's default warehouse when it is the company's, else the company's first warehouse that is no group.

	The TIP item is no stock item: any warehouse of its company will do, as long as it is of that company.
	"""
	default = frappe.defaults.get_defaults().get("default_warehouse")
	if default and frappe.db.get_value("Warehouse", default, "company") == company:
		return default
	return frappe.db.get_value(
		"Warehouse", {"company": company, "is_group": 0, "disabled": 0}, "name", order_by="creation asc"
	)


def _grant_no_commission(item_code: str) -> None:
	if cint(frappe.db.get_value("Item", item_code, "grant_commission")):
		frappe.db.set_value("Item", item_code, "grant_commission", 0)


def _assign_zero_tax_template(item) -> None:
	"""Assign a 0% tax template to the TIP item if available."""
	# Find an Item Tax Template where all tax rates are 0
	zero_tax_templates = frappe.db.sql(
		"""
		SELECT DISTINCT parent
		FROM `tabItem Tax Template Detail`
		WHERE tax_rate = 0
		AND parent IN (
			SELECT name FROM `tabItem Tax Template`
			WHERE name NOT IN (
				SELECT DISTINCT parent
				FROM `tabItem Tax Template Detail`
				WHERE tax_rate != 0
			)
		)
	""",
		pluck=True,
	)

	if not zero_tax_templates:
		return

	template_name = zero_tax_templates[0]
	item.append("taxes", {"item_tax_template": template_name})
	item.save(ignore_permissions=True)


def provision(settings) -> None:
	"""Make what tipping needs for the till a POS Settings document is, when it asks for tips.

	Called by the document's validation, the way the restaurant provisions its own when it is saved: the account of the
	till's company, then the item. A till whose company has no account to hang the transit account under cannot take
	tips, and says so in words.
	"""
	if not cint(settings.get("enable_till_tips")):
		return
	company = (
		frappe.db.get_value("POS Profile", settings.pos_profile, "company") if settings.pos_profile else None
	)
	if not settings.get("till_tip_account"):
		settings.till_tip_account = ensure_tip_account(company)
	if not settings.get("till_tip_account"):
		frappe.throw(
			_("Tips cannot be switched on: the tip account could not be made for the company of this till.")
		)
	if not settings.get("till_tip_item"):
		settings.till_tip_item = ensure_tip_item(company, settings.till_tip_account)


# ------------------------------------------------------------------------------------------------ settings
def tip_settings_of_till(pos_profile: str | None) -> frappe._dict:
	"""The tip settings of a SHOP till, in the shape of a restaurant's (`enable_tips`, `tip_item`, `tip_account`,
	`auto_detect_tip`), plus `kind` and `goes_to`; empty when the till takes no tips.

	A restaurant till reads its restaurant's settings instead: this is never asked for it.
	"""
	from pos_next.restaurant.settings import pos_settings_of

	if not pos_profile:
		return frappe._dict()
	try:
		row = pos_settings_of(pos_profile, list(SETTINGS_FIELDS))
	except Exception as error:
		if frappe.db.is_missing_column(error):
			# The code is updated and the site is not migrated yet: no till takes tips
			return frappe._dict()
		raise
	if not row or not cint(row.enable_till_tips) or not row.till_tip_item:
		return frappe._dict()
	return frappe._dict(
		kind=KIND_TILL,
		name=None,
		enable_tips=1,
		tip_item=row.till_tip_item,
		tip_account=row.till_tip_account,
		auto_detect_tip=cint(row.till_tips_auto_detect),
		goes_to=row.till_tip_goes_to or TO_THE_PERSON,
	)


# ------------------------------------------------------------------------------------------------ shares
def shares_of(invoice_doc, amount, settings) -> list[dict]:
	"""Whose a tip is: one dict per `Restaurant Tip` to write, their amounts adding up to `amount` to the cent.

	- A restaurant: the user who rang it up, as it always was.
	- A shop till set to a common pot: one tip that is nobody's.
	- A shop till set to the person who served: the people of the sale (its `sales_team`), each for their part of it
	  (the percentage of the sale made by their lines); the last one takes what rounding leaves. A sale with nobody named
	  (the option is off, or the cashier chose no one) goes to the user who rang it up.
	"""
	amount = flt(amount)
	if settings.get("kind") != KIND_TILL:
		return [{"server": frappe.session.user, "amount": amount}]

	till = {"pos_profile": invoice_doc.get("pos_profile")}
	if settings.get("goes_to") == COMMON_POT:
		return [{**till, "common_pot": 1, "amount": amount}]

	team = [
		row
		for row in (invoice_doc.get("sales_team") or [])
		if row.get("sales_person") and flt(row.get("allocated_percentage")) > 0
	]
	if not team:
		return [{**till, "server": frappe.session.user, "amount": amount}]

	precision = cint(frappe.get_precision("Restaurant Tip", "amount")) or 2
	whole = sum(flt(row.allocated_percentage) for row in team)
	shares, given = [], 0.0
	for index, row in enumerate(team):
		part = (
			amount - given
			if index == len(team) - 1
			else flt(amount * flt(row.allocated_percentage) / whole, precision)
		)
		given += part
		employee = frappe.db.get_value("Sales Person", row.sales_person, "employee")
		shares.append(
			{
				**till,
				"sales_person": row.sales_person,
				"employee": employee,
				"server": frappe.db.get_value("Employee", employee, "user_id") if employee else None,
				"amount": flt(part, precision),
			}
		)
	return shares


# ------------------------------------------------------------------------------------------------ who sees the tips
# Who sees the tips of a shop till: a choice of the till, asked to the salon (product owner, 10.11.2026: « est-ce qu'on voit
# tout ou est-ce que chacun voit ça ? […] par défaut, on voit tout partout […] on préfère demander, comme ça on gère les deux »).
EVERYONE = "Everyone"
OWN_SHARE = "Each their own share"

# Whoever holds one of these sees every tip, whatever the till says: the till's and the salon's managers, and the accountants who pay them
# out. The cashier role reads the tips too (the doctype gives it read): it is the one a till set to « each their own share » narrows down.
SEES_EVERY_TIP = (
	"System Manager",
	"Admin",
	"POSNext Manager",
	"Sales Manager",
	"Restaurant Manager",
	"Accounts Manager",
	"Accounts User",
)


def _sees_every_tip(user):
	return user == "Administrator" or bool(set(SEES_EVERY_TIP).intersection(frappe.get_roles(user)))


def _tills_where_each_sees_their_own():
	"""The shop tills whose staff see only their own share of the tips (none until a till chooses it)."""
	try:
		tills = frappe.get_all(
			"POS Settings", filters={"till_tips_visible_to": OWN_SHARE, "enabled": 1}, pluck="pos_profile"
		)
	except Exception as error:
		if frappe.db.is_missing_column(error):
			# The code is updated and the site is not migrated yet: no till has chosen
			return []
		raise
	return [till for till in tills if till]


def _own_employees(user):
	return frappe.get_all("Employee", filters={"user_id": user}, pluck="name")


def tips_query_conditions(user=None, doctype=None):
	"""`permission_query_conditions` of Restaurant Tip: at a till set to « each their own share », a member of its staff lists the
	tips that are his (he rang the sale up, or his employee is the person the share is for); every other tip is listed as before.

	A restaurant's tips name no till and are never narrowed down here.
	"""
	user = user or frappe.session.user
	if _sees_every_tip(user):
		return ""
	tills = _tills_where_each_sees_their_own()
	if not tills:
		return ""
	own = [f"`tabRestaurant Tip`.`server` = {frappe.db.escape(user)}"]
	employees = _own_employees(user)
	if employees:
		own.append(
			"`tabRestaurant Tip`.`employee` in ({})".format(", ".join(frappe.db.escape(e) for e in employees))
		)
	listed = ", ".join(frappe.db.escape(till) for till in tills)
	return f"(ifnull(`tabRestaurant Tip`.`pos_profile`, '') not in ({listed}) or {' or '.join(own)})"


def may_read_tip(doc, ptype=None, user=None, debug=False):
	"""`has_permission` of Restaurant Tip, the same rule for one record: False refuses a tip that is not the user's, at a till set to
	« each their own share ». It never grants anything (None lets the other rules decide)."""
	user = user or frappe.session.user
	if ptype == "create" or _sees_every_tip(user):
		return None
	till = doc.get("pos_profile")
	if not till or till not in _tills_where_each_sees_their_own():
		return None
	if doc.get("server") == user or (doc.get("employee") and doc.get("employee") in _own_employees(user)):
		return None
	return False
