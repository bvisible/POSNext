# //// Neoffice — added file (no upstream equivalent). What a gift card is for VAT (NeoCoiffeur study, product owner, 13.11.2026).
# ////
# //// The Federal Tax Administration's practice of 17.03.2025 (MWST-Info 04, ch. 2.7.6, in German only) tells two vouchers apart:
# ////
# //// - a VALUE voucher (2.7.6.2: an amount, no service named) is a means of payment. Its sale is no supply and carries no VAT, which is taken when the
# ////   voucher is spent;
# //// - a SERVICE voucher (2.7.6.3: a service named or nameable) is taxed when it is sold, as the service.
# ////
# //// The till used to sell a card as an ordinary item line (taxed as its item group said) and take it as a DISCOUNT of the invoice: the VAT of a card sold
# //// without VAT was never taken, and a card sold with it had it taken at the wrong time. The sale of a value card is now booked on a liability account
# //// the client chooses, at no VAT, and the card is SPENT AS A PAYMENT (a mode of payment whose account is that liability): the invoice carries its full
# //// price, so its VAT is taken in full, and an invoice a card covers entirely is booked like any other.
# ////
# //// A card says where it comes from (`Coupon Code.pos_next_origin`, which the business can correct): SOLD WITH VAT keeps its old way (a discount: its VAT is
# //// taken already, a payment would take it twice); OFFERED (a promotion, no money came in) is a discount too (a payment would clear a debt to the holder that
# //// was never booked); SOLD WITHOUT VAT is spent as a payment, once its till has the account and the mode of payment that make it possible (a till that has
# //// not is left as it was: nothing changes under a client's books before its manager says so). The payment names the account the card's sale credited
# //// (`Coupon Code.pos_next_sale_account`): the liability of the till for a card sold since, a revenue account for one sold before.
import frappe
from frappe import _
from frappe.utils import cint, flt

from pos_next import till_tips

KIND_VALUE = "Value voucher"
KIND_SERVICE = "Service voucher"
# Where a card comes from (`Coupon Code.pos_next_origin`)
ORIGIN_SOLD_WITH_VAT = "Sold with VAT"
ORIGIN_SOLD_WITHOUT_VAT = "Sold without VAT"
ORIGIN_OFFERED = "Given for free"

# The mode of payment a value card is spent through; the payment row names the account, the debt to the holder
MODE_OF_PAYMENT = "Gift Card"

# What a till's card settings are read from
SETTINGS_FIELDS = (
	"enable_gift_cards",
	"gift_card_kind",
	"gift_card_item",
	"gift_card_account",
	"gift_card_tax_template",
)


# ------------------------------------------------------------------------------------------------ the settings
def settings_of(pos_profile: str | None) -> frappe._dict:
	"""The card settings of a till (empty when it has none, or when the column is not there yet)."""
	if not pos_profile or not frappe.db.exists("POS Settings", {"pos_profile": pos_profile}):
		return frappe._dict()
	fields = [field for field in SETTINGS_FIELDS if frappe.db.has_column("POS Settings", field)]
	return (
		frappe.db.get_value("POS Settings", {"pos_profile": pos_profile}, fields, as_dict=True)
		or frappe._dict()
	)


def the_kind_of(settings) -> str:
	"""The kind of card a till sells: a value voucher unless the client said it names a service."""
	return KIND_SERVICE if settings.get("gift_card_kind") == KIND_SERVICE else KIND_VALUE


def _company_of(pos_profile: str | None) -> str | None:
	return frappe.db.get_value("POS Profile", pos_profile, "company") if pos_profile else None


# ------------------------------------------------------------------------------------------------ the provisioning
def the_account_of(company: str | None) -> str | None:
	"""The account a value card's sale is booked on, proposed when the client chose none: the company's account 2020 when it is a liability, else a liability
	account that says what it is (gift card, voucher, bon cadeau), else one made under a liability group. None when none can be made (the client chooses)."""
	if not company:
		return None
	numbered = frappe.db.get_value(
		"Account",
		{
			"company": company,
			"account_number": "2020",
			"root_type": "Liability",
			"is_group": 0,
			"disabled": 0,
		},
		"name",
	)
	if numbered:
		return numbered
	named = frappe.db.sql(
		"""
		SELECT name FROM `tabAccount`
		WHERE company = %(company)s AND root_type = 'Liability' AND is_group = 0 AND disabled = 0
		AND (account_name LIKE %(gift)s OR account_name LIKE %(voucher)s OR account_name LIKE %(cadeau)s)
		ORDER BY account_number, account_name LIMIT 1
		""",
		{"company": company, "gift": "%gift card%", "voucher": "%voucher%", "cadeau": "%cadeau%"},
		pluck=True,
	)
	if named:
		return named[0]
	parent = frappe.db.get_value(
		"Account",
		{"company": company, "root_type": "Liability", "is_group": 1, "parent_account": ["is", "set"]},
		"name",
		order_by="lft asc",
	)
	if not parent:
		return None
	number = (
		"2020" if not frappe.db.exists("Account", {"company": company, "account_number": "2020"}) else None
	)
	account = frappe.get_doc(
		{
			"doctype": "Account",
			"account_name": _("Gift Card Liability"),
			"account_number": number,
			"parent_account": parent,
			"company": company,
			"account_type": "",
			"is_group": 0,
		}
	)
	account.insert(ignore_permissions=True)
	frappe.msgprint(_("Created gift card account: {0}").format(account.name))
	return account.name


def ensure_mode_of_payment() -> None:
	"""The mode of payment a value card is spent through, made if the site has none. It carries no account of its own (ERPNext keeps the accounts of a mode to
	Bank, Cash and Receivable): the payment row names the till's gift card account, the debt to the holder."""
	if frappe.db.exists("Mode of Payment", MODE_OF_PAYMENT):
		return
	frappe.get_doc(
		{"doctype": "Mode of Payment", "mode_of_payment": MODE_OF_PAYMENT, "type": "General", "enabled": 1}
	).insert(ignore_permissions=True)


def _refuse_an_item_shared_by_two_kinds(settings) -> None:
	"""A gift card item is taxed one way (the item carries the template of its sale): two tills that sell the same item as two kinds of card would
	each rewrite the other's. The item is refused, in words, to the till that comes second."""
	item = settings.get("gift_card_item")
	if not item:
		return
	kind = the_kind_of(settings)
	for other in frappe.get_all(
		"POS Settings",
		filters={"gift_card_item": item, "enable_gift_cards": 1, "name": ["!=", settings.get("name") or ""]},
		fields=["pos_profile", "gift_card_kind"],
	):
		if the_kind_of(other) != kind:
			frappe.throw(
				_(
					"The item {0} is also the gift card item of the till {1} (kind of gift card: {2}). A value voucher and a service voucher are not taxed the same way: give each kind its own item."
				).format(item, other.pos_profile, _(the_kind_of(other)))
			)


def provision(settings) -> None:
	"""Make what a value card needs for the till a POS Settings document is, when the client touches its gift cards (called by the document's validation).

	The account, the VAT and the kind are the client's: what they chose wins, and what is proposed (a liability account, a template at 0 %) is only what an empty
	setting is given. A value voucher is refused, in words, where the company has no template at 0 % and none was chosen: its sale carries no VAT, and the
	code does not pick one nobody chose. A service voucher is left to its item (taxed as that item says), nothing is made for it.
	"""
	if not cint(settings.get("enable_gift_cards")):
		return
	touched = settings.is_new() or any(
		settings.has_value_changed(field)
		for field in (
			"enable_gift_cards",
			"gift_card_kind",
			"gift_card_item",
			"gift_card_account",
			"gift_card_tax_template",
		)
	)
	if not touched:
		return
	_refuse_an_item_shared_by_two_kinds(settings)
	if the_kind_of(settings) != KIND_VALUE:
		return
	company = _company_of(settings.pos_profile)
	account = settings.get("gift_card_account")
	if not account:
		account = settings.gift_card_account = the_account_of(company)
	if not account:
		frappe.throw(
			_(
				"Gift cards cannot be switched on as value vouchers: no account could be made for the company {0}. Choose one in « Gift card account »."
			).format(company)
		)
	template = settings.get("gift_card_tax_template")
	if template and frappe.db.get_value("Item Tax Template", template, "company") != company:
		frappe.throw(
			_("The VAT of the gift card sale must be a template of the company of this till ({0}).").format(
				company
			)
		)
	if not template:
		proposed = till_tips.zero_rate_templates(company)
		if not proposed:
			frappe.throw(
				_(
					"Gift cards cannot be switched on as value vouchers: the company {0} has no item tax template at 0 %, and the sale of a value voucher carries no VAT. "
					"Make a template with every rate at 0 % (Accounting, Item Tax Template), or choose one in « VAT of the gift card sale » in the same save."
				).format(company)
			)
		template = settings.gift_card_tax_template = proposed[0]
	ensure_mode_of_payment()
	if settings.get("gift_card_item"):
		_set_the_item(settings.gift_card_item, company, template, account)


def _set_the_item(item_code: str, company: str, template: str, account: str) -> None:
	"""The gift card item takes the VAT template and the account of its company (the rows of another company are left alone)."""
	item = frappe.get_doc("Item", item_code)
	changed = False
	held = till_tips.vat_template_of(item, company)
	if held != template:
		item.set(
			"taxes",
			[
				row
				for row in item.get("taxes") or []
				if not row.item_tax_template
				or frappe.db.get_value("Item Tax Template", row.item_tax_template, "company") != company
			],
		)
		item.append("taxes", {"item_tax_template": template})
		changed = True
	row = next((row for row in item.get("item_defaults") or [] if row.company == company), None)
	if row and row.income_account != account:
		row.income_account = account
		changed = True
	elif not row:
		item.append(
			"item_defaults",
			{
				"company": company,
				"income_account": account,
				"default_warehouse": till_tips._a_warehouse_of(company),
			},
		)
		changed = True
	if changed:
		item.save(ignore_permissions=True)


# ------------------------------------------------------------------------------------------------ the way a card goes
def the_origin_of(coupon) -> str:
	"""Where a card comes from (`Coupon Code.pos_next_origin`), which decides how it is spent. A card that says nothing is an offered one: spent as a
	discount, which is how every card was spent before this existed."""
	get = coupon.get if hasattr(coupon, "get") else (lambda key, default=None: getattr(coupon, key, default))
	origin = get("pos_next_origin")
	return origin if origin in (ORIGIN_SOLD_WITH_VAT, ORIGIN_SOLD_WITHOUT_VAT) else ORIGIN_OFFERED


def the_account_the_sale_credited(source_invoice: str | None, item_code: str | None, amount) -> str | None:
	"""The account the sale of a card credited: the income account of the line of its invoice that sold it (the line of the gift card item, or the one whose
	price is the card's value). The liability account of a till for a card sold since this exists, a revenue account for one sold before."""
	if not source_invoice:
		return None
	for doctype in ("Sales Invoice Item", "POS Invoice Item"):
		rows = frappe.get_all(
			doctype,
			filters={"parent": source_invoice},
			fields=["item_code", "rate", "income_account"],
			order_by="idx",
		)
		if rows:
			ours = [
				row for row in rows if row.item_code == item_code and abs(flt(row.rate) - flt(amount)) < 0.01
			]
			ours = ours or [row for row in rows if abs(flt(row.rate) - flt(amount)) < 0.01]
			return next((row.income_account for row in ours if row.income_account), None)
	return None


def the_card_of(invoice):
	"""The gift card an invoice spends (its Coupon Code row), or None."""
	name = invoice.get("posa_coupon_code") or invoice.get("coupon_code")
	if not name:
		return None
	from pos_next.api import gift_cards

	return gift_cards._get_gift_card_coupon(
		name.strip(),
		["name", "coupon_type", "pos_next_gift_card", "pos_next_origin", "pos_next_sale_account"],
	)


def the_account_that_spends(invoice, coupon=None) -> str | None:
	"""The account a value card is spent through at the till of an invoice, once the till has been given its gift card account and the mode of payment exists
	(None otherwise: the card is then spent as it always was). It is the account the card's SALE credited when the card says it (a card sold before this
	existed was credited to a revenue account: debiting a liability that sale never credited would leave it negative and count the revenue twice), else
	the till's account."""
	settings = settings_of(invoice.get("pos_profile"))
	account = settings.get("gift_card_account")
	if (
		not account
		or the_kind_of(settings) != KIND_VALUE
		or not frappe.db.exists("Mode of Payment", MODE_OF_PAYMENT)
	):
		return None
	sale_account = (coupon or {}).get("pos_next_sale_account") if coupon else None
	if sale_account and frappe.db.get_value("Account", sale_account, "company") == invoice.get("company"):
		return sale_account
	return account


# ------------------------------------------------------------------------------------------------ the spending, on the invoice
def the_card_pays_by_payment(doc, method=None) -> None:
	"""A value card spent on a sale is a PAYMENT of that sale, not a discount of it (hook: Sales Invoice, before_validate).

	The till sends the card as the invoice's discount (the cart works that way, and the card stays the balance's business: `posa_gift_card_amount_used`).
	When the invoice is submitted, the part of its discount that is the card goes to a payment row of the mode of payment that clears the debt to the holder:
	the invoice then carries its full price, its VAT is taken in full, and an invoice the card covers entirely is booked like any other. A card whose sale was
	taxed or offered, a till that has no account for it, and a return are left as they were.
	"""
	if cint(doc.get("docstatus")) != 1 or cint(doc.get("is_return")) or not cint(doc.get("is_pos")):
		return
	used = flt(doc.get("posa_gift_card_amount_used"))
	if used <= 0 or any(row.mode_of_payment == MODE_OF_PAYMENT for row in doc.get("payments") or []):
		return
	coupon = the_card_of(doc)
	# A card sold with VAT (its VAT is taken already) and an offered one (no money came in, so no debt to the holder to clear) are discounts
	if not coupon or the_origin_of(coupon) != ORIGIN_SOLD_WITHOUT_VAT:
		return
	from pos_next.api.gift_cards import is_gift_card

	if not is_gift_card(coupon):
		return
	account = the_account_that_spends(doc, coupon)
	if not account:
		return
	taken = min(used, flt(doc.get("discount_amount")))
	if taken <= 0:
		return
	doc.discount_amount = flt(doc.discount_amount) - taken
	doc.additional_discount_percentage = 0
	rate = flt(doc.get("conversion_rate")) or 1
	doc.append(
		"payments",
		{
			"mode_of_payment": MODE_OF_PAYMENT,
			"amount": flt(taken),
			"base_amount": flt(taken * rate),
			"account": account,
		},
	)


def the_return_gives_the_card_back(doc, method=None) -> None:
	"""A return of a sale a value card paid for gives the card's share back to the card (hook: Sales Invoice, before_validate).

	The return refunds its whole total through the means the cashier chose: the share the card paid goes back on the debt to the holder (a negative card
	payment) instead of out of the till, the other rows being reduced by it. The card's balance is restored by `process_gift_card_on_submit`, in the same
	proportion.
	"""
	if cint(doc.get("docstatus")) != 1 or not cint(doc.get("is_return")) or not doc.get("return_against"):
		return
	rows = doc.get("payments") or []
	if not rows or any(row.mode_of_payment == MODE_OF_PAYMENT for row in rows):
		return
	paid = flt(
		frappe.db.get_value(
			"Sales Invoice Payment",
			{"parent": doc.return_against, "mode_of_payment": MODE_OF_PAYMENT, "parenttype": "Sales Invoice"},
			"sum(amount)",
		)
	)
	if paid <= 0:
		return
	original = abs(flt(frappe.db.get_value("Sales Invoice", doc.return_against, "grand_total")))
	this = abs(flt(doc.get("grand_total")))
	if original <= 0 or this <= 0:
		return
	share = flt(paid * min(1.0, this / original), 2)
	left = share
	for row in rows:
		take = min(abs(flt(row.amount)), left)
		if take > 0:
			row.amount = flt(row.amount) + take
			row.base_amount = flt(row.base_amount) + take
			left -= take
	given = flt(share - left, 2)
	if given <= 0:
		return
	account = frappe.db.get_value(
		"Sales Invoice Payment",
		{"parent": doc.return_against, "parenttype": "Sales Invoice", "mode_of_payment": MODE_OF_PAYMENT},
		"account",
	)
	doc.set("payments", [row for row in doc.payments if flt(row.amount)])
	doc.append(
		"payments",
		{"mode_of_payment": MODE_OF_PAYMENT, "amount": -given, "base_amount": -given, "account": account},
	)
