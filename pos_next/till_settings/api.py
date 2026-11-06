# //// Neoffice — added file (no upstream equivalent). The till's settings screen reads and saves here (NeoResto
# //// lot 1, task 13; product owner, 30.10.2026): the settings of the list (pos_next.till_settings.registry) that
# //// the user may see, with their values, and one save that writes POS Settings, the till's POS Profile and its
# //// Restaurant together, in one transaction, after checking who saves: the till manager the till's settings,
# //// whoever manages the restaurant its restaurant's.
"""Read and save the settings of a till, as its settings screen shows them.

Who, for THIS till (both doors ask it first, `_open`, before anything of the till is read or made):
- a till manager (`cash_entry.TILL_MANAGER_ROLES`) whose User Permissions leave him the till opens every tab of it and
  saves its POS Settings and the fields of its POS Profile the list shows. He needs no right on POS Profile or POS
  Settings themselves: the check is his role and his User Permissions, and both documents are written with
  `ignore_permissions` once it passed;
- whoever may write the till's own restaurant (the restaurant manager, `Restaurant Manager`) opens the restaurant's
  tabs of that restaurant's till and saves what they show: the restaurant's settings, as himself (the restaurant's
  own rules decide), and the till's settings that sit in those tabs (its default room, its takeaway);
- anybody else is refused (`frappe.PermissionError`), a right on another till or another restaurant included.

A save names only what changed. It is refused whole when one value is unknown, set at the office only, not shown on
that type of till, not the user's to change, or out of what the screen offers; otherwise the POS Profile, the POS
Settings and the Restaurant are saved through their documents (their own checks run), and when one of them fails
nothing is kept.

The office's page (`get_desk_settings`, `save_desk_settings`; NeoResto lot 1, task 13b, product owner, 30.10.2026:
« une seule page que nous gérons, qui cache les deux fiches d'origine ») reads the SAME list, with what the till never
shows: the office's own settings (the till's identity, its users, its payments, its accounts, its loyalty, the site's
negative stock) and their three tabs. It draws only the settings of the list that live on a document: a setting of this
computer or of the printer rows is the till screen's own business. Whoever opens it, and what each tab shows, is decided
as for the till; the office's own settings are saved only by someone the ERP lets write the document they live on (a
till manager's role is not enough for money and accounts). A field hidden on purpose is never served: the list leaves
it out, and a test refuses a listed setting that its doctype hides.

A new till is made from the same page (`create_till`; product owner, 05.11.2026: « tu arrives, tu es un simple utilisateur [...] ils
vont jamais s'en sortir »): its name and its company, and optionally the till whose settings it takes, instead of ERPNext's long
profile form where the POSNext settings are not. ERPNext does the same in its version 16: one profile, in tabs, with the till's
configuration inside.
"""

import json
import math
import re

import frappe
from frappe import _
from frappe.model import no_value_fields
from frappe.utils import cint, cstr, flt

from pos_next.till_settings import registry
from pos_next.till_settings.registry import (
	DOCUMENT,
	POS_PROFILE,
	POS_SETTINGS,
	RESTAURANT,
	SECTION_DESK,
	SECTION_RESTAURANT,
	SECTION_SETUP,
	SECTION_TILL,
	SETTING,
)

SAVEPOINT = "till_settings_save"
# What the office's page reads and nobody changes: the setting that names the till itself (a till is renamed on its
# POS Profile)
DESK_LOCKED = ("pos_profile",)
# The settings of the site that the office's own right on POS Settings is not enough to change
STOCK_SETTINGS_KEYS = ("allow_negative_stock",)
# The order a save writes in: when a later document fails, the earlier ones are undone
WRITE_ORDER = (POS_PROFILE, POS_SETTINGS, RESTAURANT)
# The fields of a row of opening hours, as the screen sends them
OPENING_HOURS_FIELDS = ("day_of_week", "from_time", "to_time", "label", "restaurant_card")
# What the item endpoints keep of a till's groups and brands for five minutes (pos_next.api.items: get_item_groups,
# get_brands, _get_pos_profile_configured_brands, _get_allowed_profile_item_groups): forgotten when the till's POS
# Profile is saved here, so that the till that asks for its items right after its save is not answered from them
TILL_CACHE_KEYS = (
	"pos_item_groups:{0}",
	"pos_brands:{0}",
	"pos_profile_brands_raw:{0}",
	"pos_profile_allowed_item_groups:{0}",
)


@frappe.whitelist()
def get_till_settings(pos_profile):
	"""The settings of a till its user may see: the tabs, the groups, the settings of the list with their help, the
	values, the choices of the short links, and what the user may change."""
	till, can = _open(pos_profile)
	return _answer(till, can)


@frappe.whitelist(methods=["POST"])
def save_till_settings(pos_profile, values):
	"""Save what changed (`values`: {key of the list: value}) and answer the settings as `get_till_settings` does."""
	return _save(pos_profile, values, desk=False)


# //// Neoffice — the office's page (NeoResto lot 1, task 13b): the same list, the office's settings and tabs included.
@frappe.whitelist()
def get_desk_settings(pos_profile: str):
	"""The settings of a till as the office's page shows them: `get_till_settings` plus the office's own (the till's
	identity and users, payments, loyalty, accounts, the site's negative stock) in their tabs. Opened by the same people
	as the till's screen; a setting is editable there only for whoever the ERP lets write its document."""
	till, can = _open(pos_profile)
	return _answer(till, can, desk=True)


@frappe.whitelist(methods=["POST"])
def save_desk_settings(pos_profile: str, values):
	"""Save what changed on the office's page (`values`: {key of the list: value}), the office's settings included, and
	answer as `get_desk_settings` does."""
	return _save(pos_profile, values, desk=True)


# What a new till copied from another does not take: the identity (its own), the key of the shop's QR code (set by the system for
# each till), and the site's negative stock (one setting of the whole site: copying it would save Stock Settings)
COPY_NEVER = ("pos_profile", "shop_scan_key", "allow_negative_stock")
# The columns a row of a child table never carries over to another document
ROW_BOOKKEEPING = (
	"name",
	"idx",
	"parent",
	"parenttype",
	"parentfield",
	"owner",
	"creation",
	"modified",
	"modified_by",
	"docstatus",
	"doctype",
)


# //// Neoffice — a new till from the office's page (NeoResto lot 1, task 13b, 05.11.2026).
@frappe.whitelist(methods=["POST"])
def create_till(till_name: str, company: str, copy_from: str | None = None):
	"""Make a till: its POS Profile, then its POSNext settings (the profile's `after_insert` makes them), and answer its name.

	Who may: a till manager who also holds the ERP's right to create a POS Profile (what the profile is: its accounts, its
	payments). The new till takes the accounts, the price list, the warehouse, the customer and the payment methods of
	`copy_from` (and its POSNext settings), else of the company's first till, else what the company itself says. It takes no
	user and no payment terminal: those are the new till's own."""
	from pos_next.api.cash_entry import require_till_manager

	require_till_manager()
	frappe.has_permission(POS_PROFILE, "create", throw=True)
	name = (till_name or "").strip()
	if not name:
		frappe.throw(_("A till needs a name"))
	if frappe.db.exists(POS_PROFILE, name):
		frappe.throw(_("A till named {0} already exists").format(name))
	source = (copy_from or "").strip() or None
	if source:
		if not frappe.db.exists(POS_PROFILE, source):
			frappe.throw(_("POS Profile not found"), frappe.DoesNotExistError)
		frappe.has_permission(POS_PROFILE, "read", doc=source, throw=True)
		# A copy stays in the company of the till it copies: its accounts and its warehouse are that company's
		company = frappe.db.get_value(POS_PROFILE, source, "company")
	if not company or not frappe.db.exists("Company", company):
		frappe.throw(_("Company {0} not found").format(company or ""), frappe.DoesNotExistError)

	profile = _new_profile(name, company, source)
	profile.insert()
	if source:
		_copy_settings(source, profile.name)
	return profile.name


def _new_profile(name, company, source):
	"""The POS Profile of a new till, not inserted yet."""
	template = source or frappe.db.get_value(
		POS_PROFILE, {"company": company, "disabled": 0}, "name", order_by="creation asc"
	)
	if template:
		profile = frappe.copy_doc(frappe.get_doc(POS_PROFILE, template))
		profile.set("applicable_for_users", [])
		profile.set("custom_active_payment_devices", [])
		profile.disabled = 0
	else:
		profile = _profile_from_the_company(company)
	profile.name = name
	return profile


def _profile_from_the_company(company):
	"""A POS Profile for a company that has no till yet, from what the company says: its currency, its cost centre, its write-off
	account, a warehouse, a selling price list in its currency and a mode of payment wired to its accounts (cash first)."""
	company_doc = frappe.get_cached_doc("Company", company)
	currency = company_doc.default_currency
	cost_center = company_doc.cost_center or frappe.db.get_value(
		"Cost Center", {"company": company, "is_group": 0}, "name"
	)
	write_off_account = company_doc.write_off_account or frappe.db.get_value(
		"Account", {"company": company, "is_group": 0, "root_type": "Expense", "disabled": 0}, "name"
	)
	warehouse = frappe.db.get_value(
		"Warehouse", {"company": company, "is_group": 0, "disabled": 0}, "name", order_by="creation asc"
	)
	price_list = frappe.db.get_value(
		"Price List", {"selling": 1, "enabled": 1, "currency": currency}, "name", order_by="creation asc"
	)
	mode = frappe.db.sql(
		"""select mpa.parent from `tabMode of Payment Account` mpa
		join `tabMode of Payment` mp on mp.name = mpa.parent
		where mpa.company = %s and ifnull(mpa.default_account, '') != '' and mp.enabled = 1
		order by mp.type = 'Cash' desc, mpa.parent limit 1""",
		company,
	)
	missing = [
		label
		for label, value in (
			(_("a warehouse"), warehouse),
			(_("a selling price list in {0}").format(currency), price_list),
			(_("a write-off account"), write_off_account),
			(_("a cost centre"), cost_center),
			(_("a mode of payment wired to its accounts"), mode),
		)
		if not value
	]
	if missing:
		frappe.throw(_("{0} has no till to start from, and lacks: {1}").format(company, ", ".join(missing)))
	return frappe.get_doc(
		{
			"doctype": POS_PROFILE,
			"company": company,
			"currency": currency,
			"warehouse": warehouse,
			"selling_price_list": price_list,
			"cost_center": cost_center,
			"write_off_account": write_off_account,
			"write_off_cost_center": cost_center,
			"write_off_limit": 1,
			"payments": [{"mode_of_payment": mode[0][0], "default": 1}],
		}
	)


def _copy_settings(source, target):
	"""The POSNext settings of a till onto those of the new one (the row the new till's profile made with the defaults): every
	setting of POS Settings the list names, but the identity, the shop's QR key and the site's negative stock."""
	old = frappe.db.get_value(POS_SETTINGS, {"pos_profile": source})
	new = frappe.db.get_value(POS_SETTINGS, {"pos_profile": target})
	if not old or not new:
		return
	old, doc = frappe.get_doc(POS_SETTINGS, old), frappe.get_doc(POS_SETTINGS, new)
	for setting in registry.document_settings(POS_SETTINGS):
		if setting.key in COPY_NEVER or not frappe.get_meta(POS_SETTINGS).has_field(setting.key):
			continue
		value = old.get(setting.key)
		if isinstance(value, list):
			value = [
				{key: row.get(key) for key in row.as_dict() if key not in ROW_BOOKKEEPING} for row in value
			]
		doc.set(setting.key, value)
	# Made by the profile's own hook, now filled: the new till's managers saved nothing themselves
	doc.flags.ignore_permissions = True
	doc.save()


def _save(pos_profile, values, desk):
	"""One save for both doors: the till's screen (`desk` False: what the till shows) and the office's page."""
	from pos_next.restaurant import permissions

	till, can = _open(pos_profile)
	if isinstance(values, str):
		values = json.loads(values or "{}")
	if not isinstance(values, dict):
		frappe.throw(_("The settings to save are not readable"))

	settings = {key: _savable(key, till, desk) for key in values}
	for setting in settings.values():
		if not _editable(setting, can, desk):
			frappe.throw(
				_("{0} is not yours to change at this till").format(str(setting.label)),
				frappe.PermissionError,
			)
	if any(setting.doctype == RESTAURANT for setting in settings.values()):
		# The restaurant is saved as the user: its own rules decide too
		permissions.require("Restaurant", "write", till.restaurant)

	choices = _choices(till, settings.values())
	clean = {key: _clean(settings[key], value, till, choices) for key, value in values.items()}

	frappe.db.savepoint(SAVEPOINT)
	try:
		for doctype in WRITE_ORDER:
			changes = {key: value for key, value in clean.items() if settings[key].doctype == doctype}
			if changes:
				_write(doctype, till, changes)
	except Exception:
		# Both documents or neither: a request that fails is rolled back whole anyway, this keeps the rule for
		# a caller inside a longer transaction too
		frappe.db.rollback(save_point=SAVEPOINT)
		raise
	if any(setting.doctype == POS_PROFILE for setting in settings.values()):
		_forget_what_the_item_endpoints_keep(pos_profile)
	if "disabled" in clean:
		# The till's one switch: its POSNext record says what its profile says (the profile's own hook does it when `disabled`
		# moved; this also repairs a record switched off on its own while the profile was in use)
		from pos_next.pos_profile_settings import keep_in_step

		keep_in_step(pos_profile, clean["disabled"])
	if desk:
		# The office's page can make the till a restaurant till (or the reverse): what its user may do is read again
		can = _rights(frappe.get_cached_doc(POS_PROFILE, pos_profile), _restaurant_of(pos_profile))
	return _answer(_till(pos_profile), can, desk)


def rights_at(pos_profile):
	"""What the session user may do with the settings of this till, as the till is told it (bootstrap's
	`restaurant_can`): open and save its own (`till`), its restaurant's (`restaurant`). Nothing is made."""
	from pos_next.api.cash_entry import is_desk_account

	if (
		not pos_profile
		or not isinstance(pos_profile, str)
		or not frappe.db.exists("POS Profile", pos_profile)
	):
		return {"till": False, "restaurant": False}
	if not is_desk_account():
		return {"till": False, "restaurant": False}
	# Asked by every bootstrap and every read of a till's settings, for every user: the documents from the cache
	return _rights(frappe.get_cached_doc(POS_PROFILE, pos_profile), _restaurant_of(pos_profile))


def _open(pos_profile):
	"""The till, and what the session user may do with its settings; refused (`frappe.PermissionError`) to whoever
	manages neither THIS till nor ITS restaurant, before anything of the till is read or made (its POS Settings row is
	made with the defaults for an allowed user only)."""
	_require_a_manager()
	if (
		not pos_profile
		or not isinstance(pos_profile, str)
		or not frappe.db.exists("POS Profile", pos_profile)
	):
		frappe.throw(_("POS Profile not found"), frappe.DoesNotExistError)
	can = _rights(frappe.get_cached_doc(POS_PROFILE, pos_profile), _restaurant_of(pos_profile))
	if not (can["till"] or can["restaurant"]):
		frappe.throw(_("Only the till manager can open the settings of the till"), frappe.PermissionError)
	return _till(pos_profile), can


def _require_a_manager():
	"""Refuse at once whoever manages neither a till nor a restaurant (a cashier, a portal account, a visitor):
	nothing of the till is read, nor made, for him."""
	from pos_next.api.cash_entry import is_till_manager, require_system_user

	require_system_user()
	if is_till_manager():
		return
	try:
		manages_a_restaurant = frappe.has_permission(RESTAURANT, "write")
	except frappe.DoesNotExistError:
		# The code is updated and the site is not migrated yet: there is no restaurant to manage
		frappe.clear_last_message()
		manages_a_restaurant = False
	if not manages_a_restaurant:
		frappe.throw(_("Only the till manager can open the settings of the till"), frappe.PermissionError)


def _till(pos_profile):
	"""A till as the screen needs it: its POS Profile, its POS Settings (made with the defaults when it has none,
	as the till does at its first opening), and its restaurant when it is a restaurant till. Only once `_open` let
	the user in."""
	from pos_next.pos_next.doctype.pos_settings.pos_settings import create_default_settings

	name = frappe.db.get_value("POS Settings", {"pos_profile": pos_profile})
	if not name:
		name = create_default_settings(pos_profile)["name"]
	restaurant = _restaurant_of(pos_profile)
	return frappe._dict(
		pos_profile=pos_profile,
		profile=frappe.get_doc(POS_PROFILE, pos_profile),
		settings=frappe.get_doc(POS_SETTINGS, name),
		restaurant_till=bool(restaurant),
		restaurant=restaurant,
		restaurant_doc=frappe.get_doc(RESTAURANT, restaurant) if restaurant else None,
	)


def _restaurant_of(pos_profile):
	"""The restaurant a till works for when it is effectively a restaurant till, read without making anything (the
	till may have no POS Settings row yet: it is then no restaurant till)."""
	from pos_next.restaurant.mode import effective_restaurant_mode

	row = frappe.db.get_value(
		POS_SETTINGS, {"pos_profile": pos_profile}, ["enable_restaurant_mode", "restaurant"], as_dict=True
	)
	if not row or not row.restaurant:
		return None
	if effective_restaurant_mode(row) and frappe.db.exists(RESTAURANT, row.restaurant):
		return row.restaurant
	return None


def _rights(profile, restaurant):
	"""What the session user may do with the settings of the till of `profile` (its POS Profile document), whose
	restaurant is `restaurant`: its own (`till`), its restaurant's (`restaurant`).

	The till's own are its managers' (product owner, 30.10.2026) within their User Permissions (ruling 67): a till
	manager kept to some tills, or to a company, saves those only; no right on POS Profile itself is asked. The
	restaurant's are whoever may write that restaurant (its own User Permissions apply)."""
	from frappe.permissions import has_user_permission

	from pos_next.api.cash_entry import is_desk_account, is_till_manager

	till = is_till_manager() and has_user_permission(profile)
	restaurant_right = False
	if restaurant and is_desk_account():
		restaurant_right = bool(
			frappe.has_permission(RESTAURANT, "write", doc=frappe.get_cached_doc(RESTAURANT, restaurant))
		)
	return {"till": bool(till), "restaurant": restaurant_right}


def _tab_is_open(tab, till, can, desk=False):
	"""Whether the user sees a tab: the restaurant's on a restaurant till to its managers and the till's, the
	till's to its managers; the office's never at the till, and on the office's page to the till's managers."""
	if tab.section == SECTION_RESTAURANT:
		return till.restaurant_till and (can["till"] or can["restaurant"])
	if tab.section == SECTION_TILL:
		return can["till"]
	return bool(desk and tab.section in (SECTION_SETUP, SECTION_DESK) and can["till"])


def _shown(till, can, desk=False):
	"""The settings of the list the screen shows this user at this till, in the order of the list. The office's page
	(`desk`) adds the office's own settings, and draws only what lives on a document: a setting of this computer, or of
	the printer rows, or a state or a button of the till's screen, has no place on it."""
	tabs = {tab.key: tab for tab in registry.TABS}
	shown = []
	for setting in registry.SETTINGS if desk else registry.till_settings():
		if desk and (setting.store != DOCUMENT or setting.kind != SETTING):
			continue
		if not registry.shown_on(setting, till.restaurant_till):
			continue
		if not _tab_is_open(tabs[setting.tab], till, can, desk):
			continue
		if setting.store == DOCUMENT and not frappe.get_meta(setting.doctype).has_field(setting.key):
			# A field another app adds, where that app is not installed (or the site not migrated yet)
			continue
		shown.append(setting)
	return shown


def _desk_may_set(setting):
	"""Whether the session user may set one of the office's own settings: the ERP's right on the document it lives on
	(a till manager's role does not give the accounts and the payment methods), and, for the site's negative stock, on
	Stock Settings and the rights its save needs. The till's identity is read, never set."""
	if setting.key in DESK_LOCKED:
		return False
	if not frappe.has_permission(setting.doctype, "write"):
		return False
	if setting.key in STOCK_SETTINGS_KEYS:
		# ERPNext's Stock Settings validation writes Property Setters (the barcode fields' visibility), which only a System
		# Manager may create: for anybody else the save would fail half way, in ERPNext's code, with a bare "Not permitted".
		# The page shows the setting read-only to them instead.
		return bool(
			frappe.has_permission("Stock Settings", "write")
			and frappe.has_permission("Property Setter", "create")
		)
	return True


def _editable(setting, can, desk=False):
	"""Whether the user may change a setting: the restaurant's are its managers'; the till's are the till manager's,
	and the few the list names one by one (its default room, its takeaway: `restaurant_manager_may_edit`, ruling 63)
	the restaurant's managers' as well, at the till of their own restaurant (`_rights`). A setting of the till drawn in
	a restaurant tab without that flag stays the till manager's. This computer's and the printer's are the screen's
	own business (the printer app checks its rights). The office's own settings are the office's page's (`desk`), for
	the till's managers who also hold the ERP's right on their document (`_desk_may_set`)."""
	if setting.desk_only:
		return bool(desk and can["till"] and _desk_may_set(setting))
	if setting.doctype == RESTAURANT:
		return can["restaurant"]
	if setting.doctype in (POS_SETTINGS, POS_PROFILE):
		return can["till"] or (setting.restaurant_manager_may_edit and can["restaurant"])
	return True


def _site_facts():
	"""The facts of the site some settings need (`Setting.needs_site`)."""
	from pos_next.pos_next.doctype.pos_settings.pos_settings import _site_allows_negative_stock

	return {registry.SITE_ALLOWS_NEGATIVE_STOCK: bool(_site_allows_negative_stock())}


def _answer(till, can, desk=False):
	shown = _shown(till, can, desk)
	tab_keys = {setting.tab for setting in shown}
	group_keys = {setting.group for setting in shown}
	facts = _site_facts()
	definitions = []
	for setting in shown:
		definition = registry.serialize(setting)
		definition["editable"] = _editable(setting, can, desk)
		if setting.needs_site:
			# The site does not allow what it is about: the screen shows it greyed, its help says why (ruling 82)
			definition["greyed"] = not facts[setting.needs_site]
		if setting.store == DOCUMENT:
			definition["required"] = bool(frappe.get_meta(setting.doctype).get_field(setting.key).reqd)
		if setting.widget == "table":
			definition["columns"] = _columns(setting, rich=desk)
		if desk:
			_describe_for_the_office(setting, definition)
		definitions.append(definition)
	answer = {
		"pos_profile": till.pos_profile,
		"restaurant_till": till.restaurant_till,
		"restaurant": till.restaurant or "",
		"restaurant_name": (till.restaurant_doc.restaurant_name if till.restaurant_doc else "") or "",
		"can": can,
		"tabs": [registry.serialize_tab(tab) for tab in registry.TABS if tab.key in tab_keys],
		"groups": [
			registry.serialize_group(group) for group in registry.GROUPS.values() if group.key in group_keys
		],
		"settings": definitions,
		"values": {setting.key: _read(setting, till) for setting in shown if setting.store == DOCUMENT},
		"choices": _choices(till, shown),
		"status": _status(till),
	}
	if desk:
		answer["company"] = till.profile.company
		answer["left_out"] = _left_out_for_the_type(till)
		answer["people"] = _people_of_the_till(till)
		answer["readiness"] = _readiness(till, answer["people"])
		answer["tills"] = _tills_to_switch_to()
		# What the page offers besides the settings: a new till, deleting this one (the ERP's own rights on a POS Profile; the page
		# hides the button of what the user may not do, the server refuses it anyway)
		answer["can"] = {
			**can,
			"create": bool(can["till"] and frappe.has_permission(POS_PROFILE, "create")),
			"delete": bool(can["till"] and frappe.has_permission(POS_PROFILE, "delete", doc=till.profile)),
		}
	return answer


def _tills_to_switch_to():
	"""The tills the session user may open on the office's page, for the bar that switches from one to another: name, whether it
	is switched off, whether it is a restaurant till. The ones in use first, then by name; asked as `_open` asks (the user's role and
	User Permissions, no right on POS Profile itself)."""
	tills = []
	for row in frappe.get_all(POS_PROFILE, fields=["name", "disabled"], order_by="disabled asc, name asc"):
		restaurant = _restaurant_of(row.name)
		can = _rights(frappe.get_cached_doc(POS_PROFILE, row.name), restaurant)
		if can["till"] or can["restaurant"]:
			tills.append({"name": row.name, "disabled": cint(row.disabled), "restaurant": bool(restaurant)})
	return tills


def _people_of_the_till(till):
	"""The people the till's POS Profile lists as its users, with what each can do at the till: the roles of the till they hold and
	whether they can open it (an enabled desk account holding one of them). A person listed with none opens nothing: the page says
	so, as the profile's own form never did. Read as the profile is stored, not as a draft."""
	from pos_next.api.cash_entry import TILL_MANAGER_ROLES
	from pos_next.restaurant.permissions import CASHIER_ROLE

	till_roles = {CASHIER_ROLE, "Restaurant Manager", *TILL_MANAGER_ROLES}
	people = []
	for row in till.profile.get("applicable_for_users") or []:
		user = frappe.db.get_value(
			"User", row.user, ["full_name", "enabled", "user_type"], as_dict=True
		) or frappe._dict(full_name=row.user, enabled=0, user_type="")
		roles = sorted(till_roles & set(frappe.get_roles(row.user))) if user.enabled else []
		people.append(
			{
				"user": row.user,
				"full_name": user.full_name or row.user,
				"enabled": cint(user.enabled),
				"default": cint(row.default),
				"roles": roles,
				# A website account holds no role of the desk: it cannot open the till, and a role cannot be given to it
				"desk_account": user.user_type == "System User",
				"can_open": bool(user.enabled and user.user_type == "System User" and roles),
			}
		)
	return people


# //// Neoffice — deleting a till from the office's page (Daniel, 06.11.2026: « création d'une caisse, suppression, modification »).
DELETE_SAVEPOINT = "till_settings_delete"


@frappe.whitelist(methods=["POST"])
def delete_till(pos_profile: str):
	"""Delete a till nobody used: its POS Profile, and its POSNext settings with it (`pos_profile_settings.remove_with_the_profile`). A till
	that sales, sessions or other records mention is never deleted behind their back: it is refused whole, in words, and the page points at
	the switch that closes a till without losing anything. Asked of a till manager of THIS till who also holds the ERP's right to delete a
	profile. Answers the till the page goes on to."""
	_till_, can = _open(pos_profile)
	if not can["till"]:
		frappe.throw(_("Only the till manager can delete a till"), frappe.PermissionError)
	frappe.has_permission(POS_PROFILE, "delete", doc=pos_profile, throw=True)
	frappe.db.savepoint(DELETE_SAVEPOINT)
	try:
		frappe.delete_doc(POS_PROFILE, pos_profile)
	except frappe.LinkExistsError:
		# The ERP's own message lists the records; the page says what to do instead
		frappe.db.rollback(save_point=DELETE_SAVEPOINT)
		frappe.clear_last_message()
		frappe.throw(
			_(
				"The till {0} has sales, sessions or other records. Deleting it would lose them. Switch it off instead: it can no longer be opened, and its sales stay."
			).format(pos_profile)
		)
	remaining = [till["name"] for till in _tills_to_switch_to()]
	return {"deleted": pos_profile, "next": remaining[0] if remaining else ""}


# //// Neoffice — "give the cashier role" from the people list (Daniel, 06.11.2026: a person listed on a till who cannot open it was
# //// only told so). One role, the lowest of the till; written as the user who clicks, so the ERP's own right on User decides.
@frappe.whitelist(methods=["POST"])
def give_the_cashier_role(pos_profile: str, user: str):
	"""Give the role of a cashier to one of the people the till lists, so that they can open it; answers the people and the readiness
	of the till as `get_desk_settings` does. Asked of a till manager of THIS till who also holds the ERP's right to write that user: the
	role is added through the User document, as the clicker (a customer's admin can, a cashier cannot)."""
	from pos_next.restaurant.permissions import CASHIER_ROLE

	till, can = _open(pos_profile)
	if not can["till"]:
		frappe.throw(_("Only the till manager can give a role of the till"), frappe.PermissionError)
	if not isinstance(user, str) or user not in [
		row.user for row in till.profile.get("applicable_for_users") or []
	]:
		frappe.throw(_("{0} is not one of the users of this till").format(cstr(user)))
	details = frappe.db.get_value("User", user, ["enabled", "user_type"], as_dict=True)
	if not details or not cint(details.enabled):
		frappe.throw(_("{0} is disabled: switch the account on first").format(user))
	if details.user_type != "System User":
		frappe.throw(_("{0} is a website account: it cannot hold a role of the till").format(user))
	frappe.has_permission("User", "write", doc=user, throw=True)
	frappe.get_doc("User", user).add_roles(CASHIER_ROLE)
	people = _people_of_the_till(_till(pos_profile))
	return {"people": people, "readiness": _readiness(_till(pos_profile), people)}


def _readiness(till, people):
	"""What a till needs to open, as a list the page shows at its top: {key, ok, label, tab}. Only what is known to stop a till: someone who
	can open it, a payment method marked as the default, a warehouse, and, for a restaurant till, its restaurant."""
	payments = till.profile.get("payments") or []
	checks = [
		("users", any(person["can_open"] for person in people), _("Someone can open the till"), "setup"),
		(
			"payments",
			sum(1 for row in payments if row.default) == 1,
			_("One payment method is the default"),
			"payments",
		),
		("warehouse", bool(till.profile.warehouse), _("A warehouse is chosen"), "stock"),
	]
	if till.settings.enable_restaurant_mode:
		checks.append(
			("restaurant", bool(till.restaurant), _("The restaurant of the till is chosen"), "setup")
		)
	return [{"key": key, "ok": bool(ok), "label": str(label), "tab": tab} for key, ok, label, tab in checks]


def _describe_for_the_office(setting, definition):
	"""What the office's page needs to draw a setting with the desk's own controls: the doctype a link points at (a link
	with no short list of its own: a company, an account...), and the columns of the opening hours, a table the list
	draws by its own component at the till."""
	if setting.widget == "link" and not setting.choices and not setting.search:
		definition["link_doctype"] = frappe.get_meta(setting.doctype).get_field(setting.key).options
	if setting.widget in ("select", "segmented") and not setting.options:
		definition["options"] = [{"value": value, "label": _(value)} for value in _allowed_options(setting)]
	if setting.key == "opening_hours":
		definition["columns"] = _columns(setting, rich=True)


def _left_out_for_the_type(till):
	"""How many settings the page leaves out because of the TYPE of this till: the restaurant's on a shop till, the
	shop's on a restaurant till. Said at the foot of the page, so that nobody looks for them in vain."""
	from pos_next.restaurant.mode import neoresto_active

	restaurant_only = shop_only = 0
	for setting in registry.SETTINGS:
		if (
			setting.store != DOCUMENT
			or setting.kind != SETTING
			or registry.shown_on(setting, till.restaurant_till)
		):
			continue
		if not frappe.get_meta(setting.doctype).has_field(setting.key):
			continue
		if setting.till == registry.RESTAURANT_TILL:
			restaurant_only += 1
		else:
			shop_only += 1
	return {
		# A site that does not run NeoResto has no restaurant till to speak of
		"restaurant": restaurant_only if neoresto_active() else 0,
		"shop": shop_only,
	}


def _document(till, doctype):
	return {POS_SETTINGS: till.settings, POS_PROFILE: till.profile, RESTAURANT: till.restaurant_doc}[doctype]


def _link_field(setting):
	"""The link column of the child table a multiselect setting fills (one per row)."""
	child = frappe.get_meta(setting.doctype).get_field(setting.key).options
	return next(df.fieldname for df in frappe.get_meta(child).fields if df.fieldtype == "Link")


def _table_fields(setting):
	"""The value columns of the child table a table setting fills."""
	child = frappe.get_meta(setting.doctype).get_field(setting.key).options
	return [df.fieldname for df in frappe.get_meta(child).fields if df.fieldtype not in no_value_fields]


def _columns(setting, rich=False):
	"""The value columns of a table setting, as the screen draws them: name, type and translated label. The office's
	page (`rich`) draws them with the desk's own controls and asks for what those need: the options (the doctype of a
	link, the values of a select) and whether the column is required."""
	child = frappe.get_meta(frappe.get_meta(setting.doctype).get_field(setting.key).options)
	columns = []
	for df in child.fields:
		if df.fieldtype in no_value_fields:
			continue
		column = {"fieldname": df.fieldname, "fieldtype": df.fieldtype, "label": _(df.label)}
		if rich:
			column["options"] = df.options or ""
			column["reqd"] = cint(df.reqd)
			column["default"] = df.default or ""
		columns.append(column)
	return columns


def _read(setting, till):
	doc = _document(till, setting.doctype)
	if doc is None:
		return None
	value = doc.get(setting.key)
	if setting.widget == "multiselect":
		link = _link_field(setting)
		return [row.get(link) for row in value or [] if row.get(link)]
	if setting.widget == "table":
		fields = _table_fields(setting)
		return [{field: row.get(field) for field in fields} for row in value or []]
	if setting.key == "opening_hours":
		return [
			{
				"day_of_week": row.day_of_week,
				"from_time": _hour(row.from_time),
				"to_time": _hour(row.to_time),
				"label": row.label or "",
				"restaurant_card": row.restaurant_card or None,
			}
			for row in value or []
		]
	if setting.widget == "check":
		if setting.inverted:
			# "In use": the profile is not disabled and its POSNext record is not ignored (a record switched off on its own,
			# as the old form allowed, reads as off here, and switching it on again repairs both: `_save`)
			return 0 if cint(value) or not cint(till.settings.get("enabled", 1)) else 1
		return cint(value)
	if setting.widget in ("int", "duration"):
		return cint(value)
	if setting.widget in ("float", "percent"):
		return flt(value)
	if setting.widget == "time":
		return _hour(value)
	return value if value is not None else ""


# A time of day as the screen writes it: two digits, a colon, two digits (00:00 to 23:59)
TIME_OF_DAY = re.compile(r"([01][0-9]|2[0-3]):[0-5][0-9]")


def _time_of_day(label, value):
	"""A time of day the way a Time field keeps it: the screen sends HH:MM, the document stores HH:MM:00."""
	text = value.strip() if isinstance(value, str) else ""
	if not TIME_OF_DAY.fullmatch(text):
		frappe.throw(_("{0} is a time of day, like 05:00").format(label))
	return f"{text}:00"


def _hour(value):
	"""A Time value as the screen's time fields read it: HH:MM."""
	if value is None or value == "":
		return ""
	text = str(value)
	hours, _sep, rest = text.partition(":")
	minutes = rest.split(":")[0] if rest else "00"
	return f"{int(hours):02d}:{minutes[:2]}"


def _status(till):
	"""What the screen shows as a state, not as a setting: whether the tip item and account are ready."""
	if not till.restaurant_doc:
		return {}
	return {
		"tip_item": till.restaurant_doc.tip_item or "",
		"tip_account": till.restaurant_doc.tip_account or "",
	}


def _savable(key, till, desk=False):
	"""The setting of the list a save may write at this till; refuses whatever the till's screen does not show (the
	office's page, `desk`, also takes the office's own settings)."""
	try:
		setting = registry.get(key)
	except KeyError:
		frappe.throw(_("Unknown setting of the till: {0}").format(key))
	if setting.desk_only and not desk:
		frappe.throw(_("{0} is set at the office, not at the till").format(str(setting.label)))
	if desk and setting.kind != SETTING:
		frappe.throw(_("{0} is not a setting of this till").format(str(setting.label)))
	if (
		setting.store != DOCUMENT
		or not registry.shown_on(setting, till.restaurant_till)
		or not frappe.get_meta(setting.doctype).has_field(setting.key)
	):
		frappe.throw(_("{0} is not a setting of this till").format(str(setting.label)))
	return setting


def _clean(setting, value, till, choices):
	"""The value as the document stores it, once checked against what the screen offers."""
	label = str(setting.label)
	widget = setting.widget
	if widget == "check":
		if value not in (0, 1, True, False, "0", "1"):
			frappe.throw(_("{0} is either on or off").format(label))
		# An inverted check is asked as "in use" and stored as ERPNext's "disabled"
		return 1 - cint(value) if setting.inverted else cint(value)
	if widget in ("int", "duration"):
		number = _number(label, value, whole=True)
		_within(setting, label, number)
		return cint(number)
	if widget in ("float", "percent"):
		number = _number(label, value, whole=False)
		_within(setting, label, number)
		return number
	if widget == "time":
		return _time_of_day(label, value)
	if widget in ("select", "segmented"):
		allowed = _allowed_options(setting)
		if cstr(value) not in allowed:
			frappe.throw(_("{0} cannot be {1}").format(label, cstr(value) or _("empty")))
		return cstr(value)
	if widget == "link":
		value = cstr(value).strip()
		if not value:
			return None
		if setting.choices and value not in {choice["value"] for choice in choices.get(setting.key, [])}:
			frappe.throw(_("{0}: {1} cannot be chosen at this till").format(label, value))
		return value
	if widget == "multiselect":
		if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
			frappe.throw(_("{0} is a list").format(label))
		allowed = {choice["value"] for choice in choices.get(setting.key, [])}
		refused = [item for item in value if item not in allowed]
		if refused:
			frappe.throw(_("{0}: {1} cannot be chosen at this till").format(label, ", ".join(refused)))
		return list(dict.fromkeys(value))
	if widget == "table":
		return _rows(setting, label, value)
	if setting.key == "opening_hours":
		return _opening_hours(label, value, till)
	if not isinstance(value, str | type(None)):
		frappe.throw(_("{0} is a text").format(label))
	return cstr(value)


def _allowed_options(setting):
	"""The values a select setting takes: the list's, which are the only ones the till offers; for one of the office's
	own, with no values in the list, the doctype's."""
	if setting.options or not setting.desk_only:
		return [option for option, _label in setting.options]
	stored = frappe.get_meta(setting.doctype).get_field(setting.key).options or ""
	return [option for option in stored.split("\n") if option]


def _number(label, value, whole):
	if isinstance(value, bool) or value in (None, ""):
		value = 0
	try:
		number = float(value)
	except (TypeError, ValueError):
		frappe.throw(_("{0} is a number").format(label))
	if not math.isfinite(number):
		# float() reads "nan" and "inf" as numbers: no setting of the till is either
		frappe.throw(_("{0} is a number").format(label))
	if whole and number != int(number):
		frappe.throw(_("{0} is a whole number").format(label))
	return number


def _within(setting, label, number):
	if setting.min is not None and number < setting.min:
		frappe.throw(_("{0} cannot be less than {1}").format(label, _shown_number(setting.min)))
	if setting.max is not None and number > setting.max:
		frappe.throw(_("{0} cannot be more than {1}").format(label, _shown_number(setting.max)))


def _shown_number(number):
	return str(int(number)) if number == int(number) else str(number)


def _rows(setting, label, value):
	"""The rows of a table setting: lists of the child's value columns, nothing else."""
	if not isinstance(value, list) or not all(isinstance(row, dict) for row in value):
		frappe.throw(_("{0} is a list of lines").format(label))
	fields = _table_fields(setting)
	return [{field: row.get(field) for field in fields} for row in value]


def _opening_hours(label, value, till):
	"""The rows of the opening hours: a day, two hours, a label and a card of the till's restaurant: one the screen
	offers (active, not the permanent one), or one a line of the hours already has (a card deactivated since)."""
	if not isinstance(value, list) or not all(isinstance(row, dict) for row in value):
		frappe.throw(_("{0} is a list of lines").format(label))
	cards = set(_restaurant_cards(till, None, as_values=True))
	cards |= {
		row.restaurant_card for row in till.restaurant_doc.get("opening_hours") or [] if row.restaurant_card
	}
	rows = []
	for row in value:
		card = row.get("restaurant_card") or None
		if card and card not in cards:
			frappe.throw(_("{0}: {1} cannot be chosen at this till").format(label, card))
		rows.append({field: row.get(field) for field in OPENING_HOURS_FIELDS} | {"restaurant_card": card})
	return rows


def _forget_what_the_item_endpoints_keep(pos_profile):
	"""Forget the till's groups and brands the item endpoints keep (TILL_CACHE_KEYS): now, and once more after the
	commit, so that no request served between the two answers from the old ones for five minutes."""

	def forget():
		for key in TILL_CACHE_KEYS:
			frappe.cache().delete_value(key.format(pos_profile))

	forget()
	frappe.db.after_commit.add(forget)


def _write(doctype, till, changes):
	"""Write the changes onto their document and save it through its controller."""
	doc = frappe.get_doc(doctype, _document(till, doctype).name)
	for key, value in changes.items():
		setting = registry.get(key)
		if setting.widget == "multiselect":
			link = _link_field(setting)
			doc.set(key, [{link: item} for item in value])
		else:
			doc.set(key, value)
	if doctype == POS_PROFILE and "applicable_for_users" in changes:
		_default_the_first_till_of_each_user(doc)
	if doctype in (POS_PROFILE, POS_SETTINGS):
		# Who saves was checked (`_open`, `_editable`): the till manager sets up his till, the restaurant's manager its
		# keys of the restaurant's tabs, whatever their rights on the two documents
		doc.flags.ignore_permissions = True
	doc.save()


# //// Neoffice — a person added to a till who has no default till yet gets this one as their default (06.11.2026): ERPNext's profile save
# //// otherwise warns « this user has no default POS Profile, tick Default on row 1 », which nobody who is not an ERPNext expert understands.
def _default_the_first_till_of_each_user(profile):
	"""Tick `default` on the row of every listed person who is the default user of no other till in use; a person who already has a
	default elsewhere (or whose row is already ticked) is left as they are."""
	rows = profile.get("applicable_for_users") or []
	for row in rows:
		if row.default or not row.user:
			continue
		elsewhere = frappe.db.sql(
			"""select 1 from `tabPOS Profile User` pfu join `tabPOS Profile` pf on pf.name = pfu.parent
			where pfu.user = %s and pfu.`default` = 1 and pf.disabled = 0 and pf.name != %s limit 1""",
			(row.user, profile.name),
		)
		if not elsewhere and not any(other.default and other.user == row.user for other in rows):
			row.default = 1


# ---------------------------------------------------------------------------------------------- choices


def _choices(till, settings):
	"""The choices of the short links the settings show, for this till: {key: [{value, label}]}, the value set
	today always among them (a disabled price list stays readable until it is changed)."""
	answer = {}
	for setting in settings:
		if not setting.choices:
			continue
		current = None
		if setting.store == DOCUMENT and setting.widget == "link":
			doc = _document(till, setting.doctype)
			current = doc.get(setting.key) if doc else None
		elif setting.store == DOCUMENT and setting.widget == "multiselect":
			current = _read(setting, till)
		answer[setting.key] = CHOICES[setting.choices](till, current)
	return answer


def _with_current(choices, doctype, current, label_field=None):
	"""Add the values set today that the choices left out, with their label."""
	values = {choice["value"] for choice in choices}
	for value in current if isinstance(current, list) else [current]:
		if value and value not in values and frappe.db.exists(doctype, value):
			label = frappe.db.get_value(doctype, value, label_field) if label_field else None
			choices.append({"value": value, "label": label or value})
			values.add(value)
	return choices


def _named(rows, label_field=None):
	return [
		{"value": row.name, "label": (row.get(label_field) if label_field else None) or row.name}
		for row in rows
	]


def _warehouses(till, current):
	rows = frappe.get_all(
		"Warehouse",
		filters={"company": till.profile.company, "is_group": 0, "disabled": 0},
		fields=["name", "warehouse_name"],
		order_by="warehouse_name asc",
	)
	return _with_current(_named(rows, "warehouse_name"), "Warehouse", current, "warehouse_name")


def _price_lists(till, current):
	filters = {"selling": 1, "enabled": 1}
	if till.profile.currency:
		filters["currency"] = till.profile.currency
	rows = frappe.get_all("Price List", filters=filters, fields=["name"], order_by="name asc")
	return _with_current(_named(rows), "Price List", current)


def _print_formats(till, current):
	# The till prints its Sales Invoices with the format of its POS Profile (utils/printInvoice.js)
	rows = frappe.get_all(
		"Print Format",
		filters={"doc_type": "Sales Invoice", "disabled": 0},
		fields=["name"],
		order_by="name asc",
	)
	return _with_current(_named(rows), "Print Format", current)


def _letter_heads(till, current):
	rows = frappe.get_all("Letter Head", filters={"disabled": 0}, fields=["name"], order_by="name asc")
	return _with_current(_named(rows), "Letter Head", current)


def _restaurant_areas(till, current):
	from pos_next.restaurant import scope

	if not till.restaurant:
		return []
	rows = frappe.get_all(
		"Restaurant Area",
		or_filters=scope.restaurant_or_filters(till.restaurant),
		fields=["name", "area_name"],
		order_by="area_name asc",
	)
	return _named(rows, "area_name")


def _restaurant_cards(till, current, selectable_only=True, as_values=False):
	"""The cards of the till's restaurant: the active ones that are not the permanent card (what a menu, a takeaway
	lane or an opening slot can be set to), or every card of the restaurant."""
	from pos_next.restaurant import scope

	if not till.restaurant:
		return []
	rows = frappe.get_all(
		"Restaurant Card",
		filters={"is_active": 1, "is_permanent": 0} if selectable_only else {},
		or_filters=scope.restaurant_or_filters(till.restaurant),
		fields=["name", "card_name"],
		order_by="card_name asc",
	)
	if as_values:
		return [row.name for row in rows]
	return _named(rows, "card_name")


def _restaurant_card_choices(till, current):
	choices = _restaurant_cards(till, current)
	# A card set today that is no longer offered (deactivated) stays readable, if it is the restaurant's
	if current and current not in {choice["value"] for choice in choices}:
		if current in _restaurant_cards(till, None, selectable_only=False, as_values=True):
			choices.append(
				{
					"value": current,
					"label": frappe.db.get_value("Restaurant Card", current, "card_name") or current,
				}
			)
	return choices


def _languages(till, current):
	from pos_next.api.localization import get_supported_locales

	codes = sorted(get_supported_locales())
	rows = frappe.get_all("Language", filters={"name": ["in", codes]}, fields=["name", "language_name"])
	names = {row.name: row.language_name for row in rows}
	choices = [{"value": code, "label": names.get(code) or code} for code in codes if code in names]
	return _with_current(choices, "Language", current, "language_name")


def _item_groups(till, current):
	rows = frappe.get_all("Item Group", fields=["name"], order_by="lft asc")
	return _named(rows)


def _brands(till, current):
	rows = frappe.get_all("Brand", fields=["name"], order_by="name asc")
	return _named(rows)


def _journal_entry_templates(till, current):
	rows = frappe.get_all(
		"Journal Entry Template",
		filters={"company": till.profile.company},
		fields=["name", "template_title"],
		order_by="template_title asc",
	)
	return _with_current(_named(rows, "template_title"), "Journal Entry Template", current, "template_title")


def _gift_card_notifications(till, current):
	# A gift card is a Coupon Code: its notification is one of those
	rows = frappe.get_all(
		"Notification",
		filters={"document_type": "Coupon Code", "enabled": 1},
		fields=["name", "subject"],
		order_by="name asc",
	)
	return _with_current(_named(rows), "Notification", current)


# The providers of the choices the list names (`Setting.choices`)
CHOICES = {
	"warehouses": _warehouses,
	"price_lists": _price_lists,
	"print_formats": _print_formats,
	"letter_heads": _letter_heads,
	"restaurant_areas": _restaurant_areas,
	"restaurant_cards": _restaurant_card_choices,
	"languages": _languages,
	"item_groups": _item_groups,
	"brands": _brands,
	"journal_entry_templates": _journal_entry_templates,
	"gift_card_notifications": _gift_card_notifications,
}
