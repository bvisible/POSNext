# //// Neoffice — added file (no upstream equivalent). A restaurant: what a name, a logo, an address and
# //// one set of settings belong to — opening hours, tips, QR and web ordering, reservations — so that a
# //// site can run several of them (a restaurant with a bar of its own, two places of the same owner).
# //// Those settings used to be the site-wide single `Restaurant Settings`; the fields keep their names,
# //// and the single is moved into a default restaurant by a patch (NeoResto lot 1, task 1).
# //// Like the single before it, a restaurant PROVISIONS what tipping needs the first time tips are
# //// enabled — a TIP service item (0% VAT template, is_internal_item so it never shows up in a
# //// client's item list) and a transit account 2211 — because a Swiss tip is a pass-through
# //// collected for the staff (it goes through a transit account), not turnover: booking it to a
# //// revenue account would inflate both the turnover and the VAT base (32f2415d + a750c5e3,
# //// 2026-03-23; account type and label d08c57e7; 0% tax template 07f2e560 + f46164e4; internal-item
# //// flag e18d1885, 2026-04).
# //// The difference with the single: the account and the item default are made in the company of
# //// THIS restaurant, not in the site's default company.
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, get_time

# The hour a restaurant's business day starts at, unless it says otherwise (a restaurant closes after midnight)
DEFAULT_BUSINESS_DAY_START = "05:00:00"
# The hours of the web takeaway when it keeps fixed hours (pos_next.restaurant.takeaway_hours)
TAKEAWAY_HOURS_TIMES = ("takeaway_open_from", "takeaway_open_to")


class Restaurant(Document):
	def _set_defaults(self):
		"""Frappe gives a new document the CURRENT TIME in every Time field it was not given, whatever the field's own default
		says (`create_new.set_dynamic_default_values`): a restaurant made by the server (the first settings saved at the
		till, a provisioning, a patch) would open its business day at the minute it was made. The day starts at the default
		(05:00) unless the caller named a time."""
		named = self.get("business_day_start")
		# //// Neoffice — the fixed hours of the web takeaway are empty until the restaurant sets them (neoffice-maintenance#2484): the
		# //// minute the restaurant was made is not an hour it named
		takeaway = {field: self.get(field) for field in TAKEAWAY_HOURS_TIMES}
		super()._set_defaults()
		if named in (None, ""):
			self.business_day_start = DEFAULT_BUSINESS_DAY_START
		for field, value in takeaway.items():
			if value in (None, ""):
				self.set(field, None)

	def validate(self):
		self._check_ticket_number_digits()
		self._check_takeaway_hours()
		if self.enable_tips:
			self._ensure_tip_account()
			self._ensure_tip_item()

	def _check_ticket_number_digits(self):
		"""The ticket number is written with 1 to 9 digits (task 38b); a restaurant that left it empty keeps the default."""
		if self.get("ticket_number_digits") in (None, ""):
			return
		if not 1 <= cint(self.ticket_number_digits) <= 9:
			frappe.throw(_("The ticket number must have between 1 and 9 digits"))

	def _check_takeaway_hours(self):
		"""Fixed hours of the web takeaway need a start and an end that differ (neoffice-maintenance#2484); an end before the start runs past
		midnight. The margins are minutes, never fewer than none."""
		from pos_next.restaurant import takeaway_hours

		for field in ("takeaway_first_order_after", "takeaway_last_order_before"):
			if cint(self.get(field)) < 0:
				self.set(field, 0)
		# A restaurant whose online takeaway is off is not held to hours it does not use
		if not self.get("enable_web_takeaway") or self.get("takeaway_hours") != takeaway_hours.FIXED_HOURS:
			return
		start, end = self.get("takeaway_open_from"), self.get("takeaway_open_to")
		if start in (None, "") or end in (None, ""):
			frappe.throw(_("Fixed hours of online takeaway need a start time and an end time."))
		if get_time(str(start)) == get_time(str(end)):
			frappe.throw(_("The fixed hours of online takeaway cannot start and end at the same time."))

	# //// Neoffice — the account and the item are made by pos_next.till_tips, which a shop till's tips use as well: one
	# //// function each, so that a restaurant and a shop book a tip the same way (NeoCoiffeur study, 09.11.2026).
	def _ensure_tip_account(self):
		"""Create the tip transit account (2211) in the restaurant's company if it doesn't exist."""
		if self.tip_account:
			return
		from pos_next import till_tips

		self.tip_account = till_tips.ensure_tip_account(self.company) or self.tip_account

	def _ensure_tip_item(self):
		"""Create the TIP service item if it doesn't exist."""
		if self.tip_item:
			return
		from pos_next import till_tips

		self.tip_item = till_tips.ensure_tip_item(self.company, self.tip_account)
