# //// Neoffice — added file (no upstream equivalent).
"""The sale of an appointment tells the site (NeoSalon, step 2, lot G4; product owner, 10.11.2026: « il faut encaisser tout connement »).

At the till, offline, the appointment is sold like any sale, and the sale carries the number of the appointment. When the queue replays it
(`submit_invoice`, with its `offline_id`) it is an invoice like any other, and the till then tells the reservation (`pos_next_appointment_sold`),
which deletes the appointment's draft and points at the sale: never two open invoices. An online payment is the appointment's own draft, submitted:
nothing replaces anything. Either way the time of the appointment is closed with the sale (never started: « unmeasured »; still running: finished).
The suite plays it as the real cashier of the till, with stand-ins for the hooks:

- an offline sale tells the reservation `sold` with the sale's name; an online payment does not;
- the time is closed as the clock says (idle: unmeasured; running or paused: finished; done: nothing) and only where the site has a time lane;
- a site that refuses or breaks does not turn a booked sale into an error, and a sale that names no appointment asks the site nothing.
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


def sold(booking, invoice, pos_profile):
	SITE.setdefault("calls", []).append(("sold", booking, invoice, pos_profile))
	return {"booking": booking, "invoice": invoice}


def a_sold_that_refuses(booking, invoice, pos_profile):
	frappe.throw("This sale cannot stand for an appointment.")


def a_sold_that_breaks(booking, invoice, pos_profile):
	raise RuntimeError("the reservation app is broken")


def the_clocks(appointments_, pos_profile):
	SITE.setdefault("calls", []).append(("clocks", list(appointments_)))
	return SITE.get("clocks")


def time_action(appointment, action, pos_profile, employee=None):
	SITE.setdefault("calls", []).append(("time_action", appointment, action, pos_profile, employee))
	return {"status": "Finished"}


def a_time_action_that_breaks(appointment, action, pos_profile, employee=None):
	raise RuntimeError("the time lane is broken")


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
		# update_invoice commits: a no-op here keeps the test inside the transaction rolled back at the end
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		# The till sells from its own warehouse, which is what its lines say (an item's default warehouse may be another company's on a rich site)
		self.warehouse = frappe.db.get_value("POS Profile", self.fx.profile, "warehouse")

	def site_has(self, **hooks):
		table = {
			appointments.SOLD_HOOK: [f"{ME}.{path}" for path in hooks.get("sold", [])],
			appointments.TIME_STATE_HOOK: [f"{ME}.{path}" for path in hooks.get("clocks", [])],
			appointments.TIME_ACTION_HOOK: [f"{ME}.{path}" for path in hooks.get("time_action", [])],
		}
		real = frappe.get_hooks

		def get_hooks(hook=None, *args, **kwargs):
			return table[hook] if hook in table else real(hook, *args, **kwargs)

		patcher = patch("frappe.get_hooks", side_effect=get_hooks)
		patcher.start()
		self.addCleanup(patcher.stop)

	def lines(self):
		return [
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
		]

	def the_offline_sale(self, **changes):
		"""What the queue replays: the sale of the appointment with the number of the appointment, in the shape of utils/offline/sync.js."""
		sale = _sale(
			self.fx,
			appointment="BKG-1",
			items=self.lines(),
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

	def paid_online(self, **data):
		"""The online payment of the appointment: its draft is saved, then submitted, with the number of the appointment in the data."""
		frappe.set_user(TILL)
		try:
			draft = invoices.update_invoice(json.dumps(_sale(self.fx, items=self.lines(), payments=[])))[
				"name"
			]
			return invoices.submit_invoice(
				invoice=json.dumps(
					_sale(
						self.fx,
						name=draft,
						items=self.lines(),
						payments=[{"mode_of_payment": self.fx.mode, "amount": 143}],
					)
				),
				data=json.dumps(data),
			)
		finally:
			frappe.set_user("Administrator")

	def calls(self, kind):
		return [call for call in SITE.get("calls", []) if call[0] == kind]

	# The offline sale

	def test_an_offline_sale_of_an_appointment_is_an_ordinary_invoice_and_the_reservation_is_told(self):
		self.site_has(sold=["sold"])

		synced = self.replay(self.the_offline_sale())

		self.assertEqual((synced["status"], synced["offline_id"]), (1, OFFLINE_ID))
		self.assertEqual(frappe.db.get_value("Sales Invoice", synced["name"], "docstatus"), 1)
		self.assertEqual(SITE["calls"], [("sold", "BKG-1", synced["name"], self.fx.profile)])

	def test_the_number_of_the_appointment_is_no_field_of_the_invoice(self):
		self.site_has(sold=["sold"])

		synced = self.replay(self.the_offline_sale())

		self.assertFalse(frappe.get_meta("Sales Invoice").has_field("appointment"))
		self.assertIsNone(frappe.get_doc("Sales Invoice", synced["name"]).get("appointment"))

	def test_a_site_with_no_reservation_app_sells_the_sale_as_it_always_did(self):
		self.site_has()

		synced = self.replay(self.the_offline_sale())

		self.assertEqual((synced["status"], synced["offline_id"]), (1, OFFLINE_ID))
		self.assertNotIn("calls", SITE)

	def test_a_sale_that_names_no_appointment_asks_the_site_nothing(self):
		self.site_has(sold=["sold"], clocks=["the_clocks"], time_action=["time_action"])
		sale = self.the_offline_sale()
		del sale["invoice"]["appointment"]

		self.replay(sale)

		self.assertNotIn("calls", SITE)

	def test_replaying_the_same_sale_twice_makes_one_invoice_and_tells_the_site_once(self):
		self.site_has(sold=["sold"])

		first = self.replay(self.the_offline_sale())
		second = self.replay(self.the_offline_sale())

		self.assertEqual(first["name"], second["name"])
		self.assertEqual(len(self.calls("sold")), 1)

	# The online payment

	def test_an_online_payment_is_the_appointments_own_draft_submitted_and_nothing_is_replaced(self):
		self.site_has(sold=["sold"])

		done = self.paid_online(appointment="BKG-1")

		self.assertEqual(done["status"], 1)
		self.assertEqual(self.calls("sold"), [])

	# The time

	def test_an_appointment_nobody_started_is_closed_as_unmeasured_with_its_sale(self):
		self.site_has(clocks=["the_clocks"], time_action=["time_action"])
		SITE["clocks"] = {"BKG-1": {"status": "Not started"}}

		self.paid_online(appointment="BKG-1")

		self.assertEqual(
			SITE["calls"],
			[("clocks", ["BKG-1"]), ("time_action", "BKG-1", "close_unmeasured", self.fx.profile, None)],
		)

	def test_an_appointment_that_is_running_or_in_pause_is_finished_with_its_sale(self):
		self.site_has(clocks=["the_clocks"], time_action=["time_action"])
		for status in ("In progress", "Paused"):
			with self.subTest(status=status):
				SITE.clear()
				SITE["clocks"] = {"BKG-1": {"status": status}}

				self.paid_online(appointment="BKG-1")

				self.assertEqual(
					self.calls("time_action"), [("time_action", "BKG-1", "finish", self.fx.profile, None)]
				)

	def test_an_appointment_already_finished_is_left_alone(self):
		self.site_has(clocks=["the_clocks"], time_action=["time_action"])
		SITE["clocks"] = {"BKG-1": {"status": "Finished"}}

		self.paid_online(appointment="BKG-1")

		self.assertEqual(self.calls("time_action"), [])

	def test_a_site_with_no_time_lane_is_asked_nothing_about_time(self):
		self.site_has(sold=["sold"])

		self.paid_online(appointment="BKG-1")

		self.assertNotIn("calls", SITE)

	def test_the_offline_sale_tells_the_reservation_first_and_the_time_lane_after(self):
		self.site_has(sold=["sold"], clocks=["the_clocks"], time_action=["time_action"])
		SITE["clocks"] = {}

		synced = self.replay(self.the_offline_sale())

		self.assertEqual([call[0] for call in SITE["calls"]], ["sold", "clocks", "time_action"])
		self.assertEqual(SITE["calls"][0][2], synced["name"])

	# A site that fails

	def test_a_reservation_that_refuses_or_breaks_does_not_turn_the_booked_sale_into_an_error(self):
		for hook in ("a_sold_that_refuses", "a_sold_that_breaks"):
			with self.subTest(hook=hook):
				SITE.clear()
				self.site_has(sold=[hook])

				with patch("frappe.log_error") as logged:
					synced = self.replay(self.the_offline_sale(offline_id=f"{OFFLINE_ID}-{hook}"))

				self.assertEqual(synced["status"], 1)
				self.assertEqual(logged.call_args.args[0], "The appointments hook failed")

	def test_a_time_lane_that_breaks_does_not_turn_the_booked_sale_into_an_error(self):
		self.site_has(clocks=["the_clocks"], time_action=["a_time_action_that_breaks"])
		SITE["clocks"] = {}

		with patch("frappe.log_error") as logged:
			done = self.paid_online(appointment="BKG-1")

		self.assertEqual(done["status"], 1)
		self.assertEqual(logged.call_args.args[0], "The appointments hook failed")
