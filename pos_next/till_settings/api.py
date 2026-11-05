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
	SECTION_TILL,
)

SAVEPOINT = "till_settings_save"
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
	from pos_next.restaurant import permissions

	till, can = _open(pos_profile)
	if isinstance(values, str):
		values = json.loads(values or "{}")
	if not isinstance(values, dict):
		frappe.throw(_("The settings to save are not readable"))

	settings = {key: _savable(key, till) for key in values}
	for setting in settings.values():
		if not _editable(setting, can):
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
	return _answer(_till(pos_profile), can)


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


def _tab_is_open(tab, till, can):
	"""Whether the user sees a tab: the restaurant's on a restaurant till to its managers and the till's, the
	till's to its managers; the office's never at the till."""
	if tab.section == SECTION_RESTAURANT:
		return till.restaurant_till and (can["till"] or can["restaurant"])
	if tab.section == SECTION_TILL:
		return can["till"]
	return False


def _shown(till, can):
	"""The settings of the list the screen shows this user at this till, in the order of the list."""
	tabs = {tab.key: tab for tab in registry.TABS}
	shown = []
	for setting in registry.till_settings():
		if not registry.shown_on(setting, till.restaurant_till):
			continue
		if not _tab_is_open(tabs[setting.tab], till, can):
			continue
		if setting.store == DOCUMENT and not frappe.get_meta(setting.doctype).has_field(setting.key):
			# A field another app adds, where that app is not installed (or the site not migrated yet)
			continue
		shown.append(setting)
	return shown


def _editable(setting, can):
	"""Whether the user may change a setting: the restaurant's are its managers'; the till's are the till manager's,
	and the few the list names one by one (its default room, its takeaway: `restaurant_manager_may_edit`, ruling 63)
	the restaurant's managers' as well, at the till of their own restaurant (`_rights`). A setting of the till drawn in
	a restaurant tab without that flag stays the till manager's. This computer's and the printer's are the screen's
	own business (the printer app checks its rights)."""
	if setting.doctype == RESTAURANT:
		return can["restaurant"]
	if setting.doctype in (POS_SETTINGS, POS_PROFILE):
		return can["till"] or (setting.restaurant_manager_may_edit and can["restaurant"])
	return True


def _site_facts():
	"""The facts of the site some settings need (`Setting.needs_site`)."""
	from pos_next.pos_next.doctype.pos_settings.pos_settings import _site_allows_negative_stock

	return {registry.SITE_ALLOWS_NEGATIVE_STOCK: bool(_site_allows_negative_stock())}


def _answer(till, can):
	shown = _shown(till, can)
	tab_keys = {setting.tab for setting in shown}
	group_keys = {setting.group for setting in shown}
	facts = _site_facts()
	definitions = []
	for setting in shown:
		definition = registry.serialize(setting)
		definition["editable"] = _editable(setting, can)
		if setting.needs_site:
			# The site does not allow what it is about: the screen shows it greyed, its help says why (ruling 82)
			definition["greyed"] = not facts[setting.needs_site]
		if setting.store == DOCUMENT:
			definition["required"] = bool(frappe.get_meta(setting.doctype).get_field(setting.key).reqd)
		if setting.widget == "table":
			definition["columns"] = _columns(setting)
		definitions.append(definition)
	return {
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


def _columns(setting):
	"""The value columns of a table setting, as the screen draws them: name, type and translated label."""
	child = frappe.get_meta(frappe.get_meta(setting.doctype).get_field(setting.key).options)
	return [
		{"fieldname": df.fieldname, "fieldtype": df.fieldtype, "label": _(df.label)}
		for df in child.fields
		if df.fieldtype not in no_value_fields
	]


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


def _savable(key, till):
	"""The setting of the list a save may write at this till; refuses whatever the till's screen does not show."""
	try:
		setting = registry.get(key)
	except KeyError:
		frappe.throw(_("Unknown setting of the till: {0}").format(key))
	if setting.desk_only:
		frappe.throw(_("{0} is set at the office, not at the till").format(str(setting.label)))
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
		return cint(value)
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
		allowed = [option for option, _label in setting.options]
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
	if doctype in (POS_PROFILE, POS_SETTINGS):
		# Who saves was checked (`_open`, `_editable`): the till manager sets up his till, the restaurant's manager its
		# keys of the restaurant's tabs, whatever their rights on the two documents
		doc.flags.ignore_permissions = True
	doc.save()


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
