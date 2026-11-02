# //// Neoffice — added file (no upstream equivalent). The portions a kitchen made of a product today (NeoResto lot 1,
# //// Daniel, 02.11.2026: « quand un plat compté est épuisé, pouvoir augmenter la quantité […] la cuisine dit tu peux encore en
# //// faire 2, 3, 5 », then « tous les produits » of a card can have this option).
"""The portions of a product, counted by the kitchen (not by the stock).

Any product of a card can be counted, a dish as well as a drink or a dessert: the kitchen says how many portions it made
today (`set_made`), the orders take them one by one, and what is left is

    portions made today  -  the quantities of today's orders (saved drafts and sales, every table, the cancelled ones out)

so that nothing is decremented anywhere: an order that goes gives its portions back, and the count cannot drift. When the
kitchen can make more, somebody adds portions (`add`), which is the one write of the day.

A product whose STOCK is managed is counted by its stock and never by portions (Daniel: « à part si on gère le stock »):
`state` leaves it out and `add` refuses it.

Portions are a day's: those made on another day limit nothing, and adding portions on a new day starts the count again.
The tills are told (`pos_portions_updated`) when portions are made or an order holds a counted product, so that the sold-out
state of a dish follows the room.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate

DOCTYPE = "Restaurant Portion"
EVENT = "pos_portions_updated"


def today():
	return nowdate()


def _stock_managed(item_codes):
	if not item_codes:
		return set()
	return set(frappe.get_all("Item", filters={"name": ["in", list(item_codes)], "is_stock_item": 1}, pluck="name"))


def sold_today(item_codes, exclude_invoice=None):
	"""{item: quantity} on today's orders (drafts and sales, the cancelled and the returns out), in the item's stock unit."""
	if not item_codes:
		return {}
	values = {"day": today(), "codes": tuple(item_codes), "exclude": exclude_invoice or ""}
	rows = frappe.db.sql(
		"""
		select sii.item_code, sum(sii.qty * ifnull(nullif(sii.conversion_factor, 0), 1))
		from `tabSales Invoice Item` sii
		join `tabSales Invoice` si on si.name = sii.parent
		where si.docstatus < 2 and si.is_return = 0 and si.posting_date = %(day)s
			and sii.item_code in %(codes)s and si.name != %(exclude)s
		group by sii.item_code
		""",
		values,
	)
	return {code: flt(quantity) for code, quantity in rows}


def state(item_codes, exclude_invoice=None):
	"""What the products of the list say about their portions: {item: {counted, made, sold, left}}, the counted ones only.

	`made` and `left` are None when the portions were made on another day (or never): such a product is counted but limited
	by nothing. `exclude_invoice` leaves one order out of what is sold, the one the till has on screen, whose lines the till
	subtracts itself from its cart.
	"""
	item_codes = list(dict.fromkeys(item_codes or []))
	if not item_codes:
		return {}
	rows = frappe.get_all(
		DOCTYPE,
		filters={"item": ["in", item_codes], "counted": 1},
		fields=["item", "made", "service_date"],
	)
	skipped = _stock_managed([row.item for row in rows])
	rows = [row for row in rows if row.item not in skipped]
	sold = sold_today([row.item for row in rows], exclude_invoice)
	answer = {}
	for row in rows:
		made = flt(row.made) if str(row.service_date or "") == today() else None
		taken = sold.get(row.item, 0)
		answer[row.item] = {
			"counted": True,
			"made": made,
			"sold": taken,
			"left": None if made is None else made - taken,
		}
	return answer


def set_made(item, counted=True, made=None):
	"""Count a product (or stop counting it), and say how many portions the kitchen made today (None keeps them)."""
	if made is not None and flt(made) < 0:
		frappe.throw(_("The portions made cannot be below zero"))
	if frappe.db.exists(DOCTYPE, item):
		doc = frappe.get_doc(DOCTYPE, item)
	else:
		doc = frappe.new_doc(DOCTYPE)
		doc.item = item
	doc.counted = 1 if counted else 0
	if made is not None:
		doc.made = flt(made)
		doc.service_date = today()
	doc.save(ignore_permissions=True)
	publish([item])
	return doc


def add(item, quantity):
	"""The kitchen can make `quantity` more portions of a counted product: they are added to what it made today."""
	try:
		number = float(quantity)
	except (TypeError, ValueError):
		number = 0
	if number <= 0 or number != int(number):
		frappe.throw(_("Portions are added in whole numbers above zero"))
	number = int(number)
	if item in _stock_managed([item]):
		frappe.throw(_("The stock of this product is managed: its stock counts it, not its portions"))
	if not frappe.db.get_value(DOCTYPE, item, "counted"):
		frappe.throw(_("The portions of this product are not counted"))
	if str(frappe.db.get_value(DOCTYPE, item, "service_date") or "") == today():
		# One statement, so that two tills adding at once both count
		frappe.db.sql("update `tabRestaurant Portion` set made = made + %s where name = %s", (number, item))
	else:
		frappe.db.set_value(DOCTYPE, item, {"made": number, "service_date": today()})
	publish([item])


def publish(item_codes):
	"""Tell the tills which products' portions changed."""
	frappe.publish_realtime(EVENT, {"items": list(item_codes)}, after_commit=True)


def invoice_changed(doc, method=None):
	"""Hook of a Sales Invoice saved, submitted, cancelled or deleted: the tills hear of it when it holds a counted product."""
	codes = list(dict.fromkeys(row.item_code for row in doc.get("items") or [] if row.item_code))
	if not codes:
		return
	counted = frappe.get_all(DOCTYPE, filters={"item": ["in", codes], "counted": 1}, pluck="item")
	if counted:
		publish(counted)
