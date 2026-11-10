# //// Neoffice — added file (no upstream equivalent).
"""A sale of an appointment made at a till that was offline replaces the draft of that appointment, never a second invoice
(NeoSalon, step 2, lot G4; product owner, 10.11.2026: « il faut encaisser tout connement »).

At the till, offline, the appointment is sold like any sale, and the sale carries the number of the appointment. When the queue replays it
(`submit_invoice`, with its `offline_id`), the server asks the reservation for the draft of that appointment and updates THAT draft with
the sale instead of creating another invoice, then tells the reservation (`pos_next_appointment_sold`). The suite plays it as the real
cashier of the till, with stand-ins for the hooks:

- the draft is replaced: one invoice only, the draft's own, submitted; the reservation is told `replaced = True`;
- no draft to replace (the reservation has none, refuses, or names another till's invoice): the sale is an ordinary invoice and the reservation
  is told `replaced = False`; the draft is not touched;
- an online payment (no `offline_id`) is not an offline replay: the reservation is not asked anything;
- a reservation that fails to hear of the sale does not turn a booked sale into an error.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import appointments, invoices
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	TILL,
	_sale,
	_till_fixture,
	_user,
)

ME = "pos_next.tests.test_a_sale_made_offline_replaces_the_draft_of_its_appointment"
SITE = {}
OFFLINE_ID = "appointment-offline-sale-1"


def the_draft(booking, pos_profile):
	SITE.setdefault("calls", []).append(("draft", booking, pos_profile))
	return SITE.get("draft")


def a_draft_that_is_refused(booking, pos_profile):
	frappe.throw("This appointment is already collected.")


def sold(booking, invoice, pos_profile, replaced):
	SITE.setdefault("calls", []).append(("sold", booking, invoice, pos_profile, replaced))


def a_sold_that_breaks(booking, invoice, pos_profile, replaced):
	raise RuntimeError("the reservation app is broken")


class TestASaleMadeOfflineReplacesTheDraftOfItsAppointment(FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.addCleanup(frappe.db.rollback)
		frappe.set_user("Administrator")
		SITE.clear()
		self.addCleanup(SITE.clear)
		self.addCleanup(frappe.set_user, "Administrator")
		self.account_flag = frappe.flags.ignore_account_permission
		self.addCleanup(setattr, frappe.flags, "ignore_account_permission", self.account_flag)
		# update_invoice commits: a no-op here keeps the test inside the transaction the base class rolls back
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		# The till sells from its own warehouse, which is what its lines say (an item's default warehouse may be another company's on a rich site)
		self.warehouse = frappe.db.get_value("POS Profile", self.fx.profile, "warehouse")
		self.before = self.sales_of_the_till()

	def site_has(self, **hooks):
		table = {
			appointments.DRAFT_HOOK: [f"{ME}.{path}" for path in hooks.get("draft", [])],
			appointments.SOLD_HOOK: [f"{ME}.{path}" for path in hooks.get("sold", [])],
		}
		real = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			return table[hook] if hook in table else real(hook, *args, **kwargs)

		patcher = patch("frappe.get_hooks", side_effect=get_hooks)
		patcher.start()
		self.addCleanup(patcher.stop)

	def sales_of_the_till(self):
		return set(frappe.get_all("Sales Invoice", filters={"pos_profile": self.fx.profile}, pluck="name"))

	def the_appointments_draft(self, **changes):
		"""The draft the reservation prepared: two services, nothing paid yet. At this till it is made the way the till makes a draft (its
		warehouse and its accounts); at another till, the one the cashier of this till has nothing to do with, it is only inserted."""
		changes.setdefault(
			"items",
			[
				{
					"item_code": self.fx.item,
					"qty": 1,
					"rate": 65,
					"price_list_rate": 65,
					"warehouse": self.warehouse,
				},
				{
					"item_code": self.fx.item,
					"qty": 1,
					"rate": 78,
					"price_list_rate": 78,
					"warehouse": self.warehouse,
				},
			],
		)
		changes.setdefault("payments", [])
		if changes.get("pos_profile", self.fx.profile) != self.fx.profile:
			return frappe.get_doc(_sale(self.fx, **changes)).insert(ignore_permissions=True).name
		frappe.set_user(TILL)
		try:
			return invoices.update_invoice(json.dumps(_sale(self.fx, **changes)))["name"]
		finally:
			frappe.set_user("Administrator")

	def the_offline_sale(self, **changes):
		"""What the queue replays: the sale of the appointment with the number of the appointment, in the shape of utils/offline/sync.js."""
		sale = _sale(
			self.fx,
			appointment="BKG-1",
			items=[
				{
					"item_code": self.fx.item,
					"qty": 1,
					"rate": 65,
					"price_list_rate": 65,
					"warehouse": self.warehouse,
				},
				{
					"item_code": self.fx.item,
					"qty": 1,
					"rate": 78,
					"price_list_rate": 78,
					"warehouse": self.warehouse,
				},
			],
			payments=[{"mode_of_payment": self.fx.mode, "amount": 143}],
		)
		sale.update({"offline_id": OFFLINE_ID, **changes})
		return {"invoice": sale, "data": {"sales_team": []}}

	def replay(self, sale):
		frappe.set_user(TILL)
		try:
			return invoices.submit_invoice(data=json.dumps(sale))
		finally:
			frappe.set_user("Administrator")

	def test_the_sale_replaces_the_draft_of_its_appointment_and_no_second_invoice_is_made(self):
		draft = self.the_appointments_draft()
		self.before = self.sales_of_the_till()
		SITE["draft"] = {"invoice": draft}
		self.site_has(draft=["the_draft"], sold=["sold"])

		synced = self.replay(self.the_offline_sale())

		self.assertEqual((synced["name"], synced["status"]), (draft, 1))
		self.assertEqual(frappe.db.get_value("Sales Invoice", draft, "docstatus"), 1)
		self.assertEqual(self.sales_of_the_till(), self.before)
		self.assertEqual(
			SITE["calls"],
			[("draft", "BKG-1", self.fx.profile), ("sold", "BKG-1", draft, self.fx.profile, True)],
		)

	def test_what_the_sale_says_is_what_the_invoice_holds(self):
		draft = self.the_appointments_draft(
			items=[
				{
					"item_code": self.fx.item,
					"qty": 1,
					"rate": 10,
					"price_list_rate": 10,
					"warehouse": self.warehouse,
				}
			]
		)
		SITE["draft"] = {"invoice": draft}
		self.site_has(draft=["the_draft"], sold=["sold"])

		self.replay(self.the_offline_sale())

		doc = frappe.get_doc("Sales Invoice", draft)
		self.assertEqual(sorted(row.rate for row in doc.items), [65, 78])
		self.assertEqual(doc.grand_total, 143)

	def test_with_no_draft_to_replace_the_sale_is_an_ordinary_invoice_and_the_reservation_is_told(self):
		draft = self.the_appointments_draft()
		self.before = self.sales_of_the_till()
		for name, hook in (
			("nothing", None),
			("another till", self.the_appointments_draft(pos_profile=self.fx.other_profile)),
			("not an invoice", "ACC-SINV-NOPE"),
		):
			with self.subTest(case=name):
				SITE.clear()
				SITE["draft"] = None if hook is None else {"invoice": hook}
				self.site_has(draft=["the_draft"], sold=["sold"])
				before = self.sales_of_the_till()

				synced = self.replay(self.the_offline_sale(offline_id=f"{OFFLINE_ID}-{name}"))

				self.assertNotEqual(synced["name"], draft)
				self.assertEqual(frappe.db.get_value("Sales Invoice", synced["name"], "docstatus"), 1)
				self.assertEqual(frappe.db.get_value("Sales Invoice", draft, "docstatus"), 0)
				self.assertEqual(len(self.sales_of_the_till() - before), 1)
				self.assertEqual(SITE["calls"][-1], ("sold", "BKG-1", synced["name"], self.fx.profile, False))

	def test_a_reservation_that_refuses_the_draft_leaves_the_sale_an_ordinary_invoice(self):
		self.site_has(draft=["a_draft_that_is_refused"], sold=["sold"])

		synced = self.replay(self.the_offline_sale())

		self.assertEqual(frappe.db.get_value("Sales Invoice", synced["name"], "docstatus"), 1)
		self.assertEqual(SITE["calls"], [("sold", "BKG-1", synced["name"], self.fx.profile, False)])

	def test_a_site_with_no_reservation_app_sells_the_sale_as_it_always_did(self):
		self.site_has()

		synced = self.replay(self.the_offline_sale())

		self.assertEqual((synced["status"], synced["offline_id"]), (1, OFFLINE_ID))
		self.assertNotIn("calls", SITE)

	def test_a_sale_without_the_number_of_an_appointment_asks_the_reservation_nothing(self):
		self.site_has(draft=["the_draft"], sold=["sold"])
		sale = self.the_offline_sale()
		del sale["invoice"]["appointment"]

		self.replay(sale)

		self.assertNotIn("calls", SITE)

	def test_an_online_payment_is_not_a_replay_and_asks_the_reservation_nothing(self):
		draft = self.the_appointments_draft()
		self.site_has(draft=["the_draft"], sold=["sold"])
		frappe.set_user(TILL)
		try:
			done = invoices.submit_invoice(
				invoice=json.dumps(
					_sale(
						self.fx,
						name=draft,
						appointment="BKG-1",
						payments=[{"mode_of_payment": self.fx.mode, "amount": 143}],
						items=[
							{
								"item_code": self.fx.item,
								"qty": 1,
								"rate": 65,
								"price_list_rate": 65,
								"warehouse": self.warehouse,
							},
							{
								"item_code": self.fx.item,
								"qty": 1,
								"rate": 78,
								"price_list_rate": 78,
								"warehouse": self.warehouse,
							},
						],
					)
				),
				data="{}",
			)
		finally:
			frappe.set_user("Administrator")

		self.assertEqual((done["name"], done["status"]), (draft, 1))
		self.assertNotIn("calls", SITE)

	def test_a_reservation_that_fails_to_hear_of_the_sale_does_not_turn_it_into_an_error(self):
		draft = self.the_appointments_draft()
		SITE["draft"] = {"invoice": draft}
		self.site_has(draft=["the_draft"], sold=["a_sold_that_breaks"])

		with patch("frappe.log_error") as logged:
			synced = self.replay(self.the_offline_sale())

		self.assertEqual((synced["name"], synced["status"]), (draft, 1))
		self.assertEqual(logged.call_args.args[0], "The appointments hook failed")

	def test_replaying_the_same_sale_twice_makes_one_invoice(self):
		draft = self.the_appointments_draft()
		SITE["draft"] = {"invoice": draft}
		self.site_has(draft=["the_draft"], sold=["sold"])

		first = self.replay(self.the_offline_sale())
		second = self.replay(self.the_offline_sale())

		self.assertEqual(first["name"], second["name"])
		self.assertEqual(len([call for call in SITE["calls"] if call[0] == "sold"]), 1)
