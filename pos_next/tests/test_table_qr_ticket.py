# //// Neoffice — added file (no upstream equivalent).
"""The QR ticket of a table, asked for from the Print button of the QR dialog (NeoRestau lot 1, task 53).

The dialog shows the QR code of a table and used to open the browser's print window. Now Print asks the SERVER to put a
ticket on the till's receipt printer: POS Next names the moment (the hook `pos_next_table_qr_print`), checks who asks,
and hands the app that prints (cloudprnt) the table and the link IT worked out from the guest token. The suite stands in
for that app with a listener of its own, so that it proves POS Next alone: the link is never one the browser sent (the
endpoint takes the token, not a text or an address), a forged, foreign, expired or takeaway token prints nothing, only a
desk account of the till, for a table of the till's restaurant, may ask, a paired tablet may not, a till with no printer
is told so (the dialog then prints from the browser), and a flood is stopped.
"""

import inspect
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime

from pos_next.api import guest_ordering, table_qr_ticket
from pos_next.pos_next.doctype.guest_order_token.guest_order_token import GuestOrderToken
from pos_next.restaurant import devices
from pos_next.restaurant.permissions import CASHIER_ROLE
from pos_next.tests.test_restaurant_devices import KITCHEN, PORTAL, Tablets, as_user
from pos_next.tests.test_till_writes_need_the_till import (
	OTHER_PROFILE,
	OTHER_TILL,
	PROFILE,
	TILL,
	_till_fixture,
	_user,
)

PRINT = "pos_next.api.table_qr_ticket.print_table_qr_ticket"
NOT_ON_THE_TILL = "tableqr-elsewhere@yopmail.com"
NO_ROLE = "tableqr-norole@yopmail.com"
MAKES_THE_CODE = "POS User"


class Printer:
	"""The listener of the hook, standing in for the app that prints."""

	def __init__(self, reply=None):
		self.reply = reply if reply is not None else self.printed()
		self.asked = []

	@staticmethod
	def printed(**values):
		return {
			"printed": True,
			"printer": "Receipt printer",
			"printer_online": True,
			"job_token": "tok-1",
			"queue_position": 1,
			"valid_minutes": 15,
			"duplicate": False,
			**values,
		}

	def __call__(self, table, link, pos_profile):
		self.asked.append(frappe._dict(table=table, link=link, pos_profile=pos_profile))
		return self.reply


@contextmanager
def listening(*listeners):
	"""The hook answered by `listeners` (none: no app prints)."""
	with patch.object(table_qr_ticket, "_listeners", lambda hook: list(listeners)):
		yield listeners[0] if listeners else None


def call(**values):
	return frappe.get_attr(PRINT)(**values)


class QrTicketCase(Tablets):
	def setUp(self):
		super().setUp()
		self.addCleanup(self.forget_the_rate)
		# The role that makes the code (guest_order_token.json): a site that never named it has none until now
		if not frappe.db.exists("Role", MAKES_THE_CODE):
			frappe.get_doc({"doctype": "Role", "role_name": MAKES_THE_CODE}).insert(ignore_permissions=True)
		_user(TILL, [CASHIER_ROLE, MAKES_THE_CODE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		_user(NOT_ON_THE_TILL, [MAKES_THE_CODE], "System User")
		_user(NO_ROLE, [], "System User")
		self.fx = _till_fixture()
		self.till_of(PROFILE, self.bistro)
		self.till_of(OTHER_PROFILE, self.bar)
		self.token = self.make_token(self.table)
		self.bar_token = self.make_token(self.bar_table, OTHER_PROFILE)

	def till_of(self, profile, restaurant):
		"""The POS Settings that make a POS Profile the till of a restaurant."""
		for name in frappe.get_all("POS Settings", filters={"pos_profile": profile}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		doc = frappe.get_doc(
			{
				"doctype": "POS Settings",
				"pos_profile": profile,
				"enabled": 1,
				"enable_restaurant_mode": 1,
				"restaurant": restaurant,
			}
		)
		doc.flags.ignore_links = True
		doc.insert(ignore_permissions=True)

	def make_token(self, table, pos_profile=PROFILE, **values):
		doc = frappe.get_doc(
			{
				"doctype": "Guest Order Token",
				"mode": "restaurant",
				"table": table,
				"pos_profile": pos_profile,
				**values,
			}
		)
		doc.flags.ignore_permissions = True
		doc.insert()
		return doc.token

	def forget_the_rate(self):
		frappe.cache().delete_keys(table_qr_ticket.RATE_KEY)

	def link_of(self, token):
		return f"{frappe.utils.get_url()}/pos/guest/{token}"

	def assert_nothing_printed(self, listener, **values):
		with as_user(TILL), self.assertRaises((frappe.PermissionError, frappe.ValidationError)):
			call(**{"token": self.token, "pos_profile": PROFILE, **values})
		self.assertEqual(listener.asked, [])


class TestTheLinkIsTheServers(QrTicketCase):
	def test_the_app_is_handed_the_table_the_till_and_the_link_worked_out_from_the_token(self):
		with listening(Printer()) as app, as_user(TILL):
			answer = call(token=self.token, pos_profile=PROFILE)

		self.assertEqual(len(app.asked), 1)
		asked = app.asked[0]
		self.assertEqual(asked.table, self.table)
		self.assertEqual(asked.pos_profile, PROFILE)
		self.assertEqual(asked.link, self.link_of(self.token))
		self.assertTrue(answer["printed"])

	def test_the_endpoint_takes_no_text_and_no_address_so_the_browser_cannot_print_one(self):
		self.assertEqual(
			list(inspect.signature(frappe.get_attr(PRINT)).parameters), ["token", "pos_profile", "table"]
		)
		# whatever else a request carries is dropped before the function is called
		with listening(Printer()) as app, as_user(TILL):
			frappe.call(
				frappe.get_attr(PRINT),
				token=self.token,
				pos_profile=PROFILE,
				url="https://evil.example.test/steal",
				link="https://evil.example.test/steal",
				table_name="Evil table",
				text="Evil text",
			)

		self.assertEqual(app.asked[0].link, self.link_of(self.token))
		self.assertEqual(app.asked[0].table, self.table)

	def test_the_link_is_the_one_the_dialog_was_given_when_the_code_was_made(self):
		with as_user("Administrator"):
			made = guest_ordering.create_table_token(self.table, PROFILE)

		with listening(Printer()) as app, as_user(TILL):
			call(token=made["token"], pos_profile=PROFILE)

		self.assertEqual(app.asked[0].link, made["url"])

	def test_the_table_the_dialog_may_name_must_be_the_tokens(self):
		with listening(Printer()) as app, as_user(TILL):
			call(token=self.token, pos_profile=PROFILE, table=self.table)
		self.assertEqual(len(app.asked), 1)
		with listening(Printer()) as app:
			self.assert_nothing_printed(app, table="no-such-table")
			self.assert_nothing_printed(app, table=self.bar_table)

	def test_the_answer_carries_what_the_dialog_follows_and_nothing_the_app_may_have_added(self):
		reply = Printer.printed(markup="<script>alert(1)</script>", link="https://evil.example.test/")
		with listening(Printer(reply)), as_user(TILL):
			answer = call(token=self.token, pos_profile=PROFILE)

		self.assertEqual(
			answer,
			{
				"printed": True,
				"no_printer": False,
				"printer": "Receipt printer",
				"printer_online": True,
				"job_token": "tok-1",
				"queue_position": 1,
				"valid_minutes": 15,
				"duplicate": False,
			},
		)


class TestOnlyARealTokenOfTheTablePrints(QrTicketCase):
	def test_a_forged_unknown_or_malformed_token_prints_nothing(self):
		for token in (
			"forged-token",
			"",
			None,
			42,
			["x"],
			{"token": self.token},
			self.token + "x",
			self.token[:-1],
		):
			with self.subTest(token=token), listening(Printer()) as app:
				self.assert_nothing_printed(app, token=token)

	def test_a_token_that_has_expired_or_was_closed_prints_nothing(self):
		for label, change in (
			("expired", {"status": "Expired"}),
			("closed", {"status": "Closed"}),
			("timed out", {"expires_at": add_to_date(now_datetime(), hours=-1)}),
		):
			with self.subTest(label), listening(Printer()) as app:
				frappe.db.set_value("Guest Order Token", {"token": self.token}, change)
				self.assert_nothing_printed(app)

	def test_a_token_the_guest_page_would_no_longer_take_prints_nothing(self):
		# the token's own rule (a closed POS opening among others): the ticket asks it, it does not copy it
		with listening(Printer()) as app, patch.object(GuestOrderToken, "is_valid", return_value=False):
			self.assert_nothing_printed(app)

	def test_a_takeaway_token_has_no_table_and_prints_nothing(self):
		doc = frappe.get_doc({"doctype": "Guest Order Token", "mode": "takeaway"})
		doc.flags.ignore_permissions = True
		doc.insert()

		with listening(Printer()) as app:
			self.assert_nothing_printed(app, token=doc.token)


class TestWhoMayAsk(QrTicketCase):
	def test_the_staff_of_the_till_and_its_managers_ask(self):
		for user in (TILL, "Administrator"):
			with self.subTest(user=user), listening(Printer()) as app, as_user(user):
				call(token=self.token, pos_profile=PROFILE)
				self.assertEqual(len(app.asked), 1)

	def test_a_visitor_and_a_portal_account_are_refused(self):
		for user in ("Guest", PORTAL):
			with self.subTest(user=user), listening(Printer()) as app:
				with as_user(user), self.assertRaises(frappe.PermissionError):
					call(token=self.token, pos_profile=PROFILE)
				self.assertEqual(app.asked, [])

	def test_a_desk_account_that_is_not_on_the_till_and_reads_no_invoice_is_refused(self):
		self.assertFalse(frappe.has_permission("Sales Invoice", "read", user=NOT_ON_THE_TILL))
		for user in (NOT_ON_THE_TILL, NO_ROLE, OTHER_TILL):
			with self.subTest(user=user), listening(Printer()) as app:
				with as_user(user), self.assertRaises(frappe.PermissionError):
					call(token=self.token, pos_profile=PROFILE)
				self.assertEqual(app.asked, [])

	def test_an_account_that_cannot_make_the_code_cannot_print_it(self):
		# on the till's user list, but with no right on the guest tokens
		profile = frappe.get_doc("POS Profile", PROFILE)
		profile.append("applicable_for_users", {"user": NO_ROLE})
		profile.save(ignore_permissions=True)
		with listening(Printer()) as app, as_user(NO_ROLE), self.assertRaises(frappe.PermissionError):
			call(token=self.token, pos_profile=PROFILE)
		self.assertEqual(app.asked, [])

	def test_a_till_that_does_not_exist_or_is_not_a_name_is_refused(self):
		for profile in ("No such till", "", None, 5, ["x"], {"name": PROFILE}):
			with self.subTest(profile=profile), listening(Printer()) as app:
				with as_user(TILL), self.assertRaises((frappe.PermissionError, frappe.ValidationError)):
					call(token=self.token, pos_profile=profile)
				self.assertEqual(app.asked, [])

	def test_a_table_of_another_restaurant_is_not_printed_at_this_till(self):
		with listening(Printer()) as app:
			self.assert_nothing_printed(app, token=self.bar_token)
			with as_user(TILL), self.assertRaises(frappe.PermissionError):
				call(token=self.bar_token, pos_profile=PROFILE)
		# and the other restaurant's own till prints it
		with listening(Printer()) as app, as_user("Administrator"):
			call(token=self.bar_token, pos_profile=OTHER_PROFILE)
		self.assertEqual(len(app.asked), 1)

	def test_a_tablet_of_the_kitchen_is_refused_whatever_it_is_given(self):
		tablet = self.tablet(self.bistro, KITCHEN)
		with listening(Printer()) as app, as_user(tablet), self.assertRaises(frappe.PermissionError):
			call(token=self.token, pos_profile=PROFILE)
		self.assertEqual(app.asked, [])

	def test_the_tablets_session_cannot_even_reach_the_endpoint(self):
		self.assertNotIn(PRINT, devices.TABLET_METHODS)

	def test_the_endpoint_answers_post_only_so_that_a_link_opened_on_a_tablet_prints_nothing(self):
		self.assertEqual(
			list(frappe.allowed_http_methods_for_whitelisted_func[frappe.get_attr(PRINT)]), ["POST"]
		)


class TestWhenNothingCanPrint(QrTicketCase):
	def test_a_till_with_no_printer_is_told_so_and_the_dialog_prints_from_the_browser(self):
		with listening(Printer({"printed": False, "no_printer": True})), as_user(TILL):
			answer = call(token=self.token, pos_profile=PROFILE)

		self.assertEqual(answer["printed"], False)
		self.assertEqual(answer["no_printer"], True)
		self.assertIsNone(answer.get("job_token"))

	def test_no_app_that_prints_is_no_printer_either(self):
		with listening(), as_user(TILL):
			answer = call(token=self.token, pos_profile=PROFILE)

		self.assertEqual((answer["printed"], answer["no_printer"]), (False, True))

	def test_the_first_app_that_prints_answers_and_an_app_without_a_printer_does_not_hide_it(self):
		with listening(Printer({"printed": False, "no_printer": True}), Printer()) as _first, as_user(TILL):
			answer = call(token=self.token, pos_profile=PROFILE)

		self.assertEqual((answer["printed"], answer["no_printer"]), (True, False))

	def test_a_second_tap_the_app_calls_a_duplicate_is_told_which_job_to_follow(self):
		reply = Printer.printed(duplicate=True)
		with listening(Printer(reply)), as_user(TILL):
			answer = call(token=self.token, pos_profile=PROFILE)

		self.assertEqual((answer["duplicate"], answer["job_token"]), (True, "tok-1"))

	def test_a_refusal_of_the_app_reaches_the_till_as_it_is(self):
		def refuse(table, link, pos_profile):
			frappe.throw("The ordering link of this table is not a web address")

		with listening(refuse), as_user(TILL), self.assertRaises(frappe.ValidationError):
			call(token=self.token, pos_profile=PROFILE)


class TestAFloodIsStopped(QrTicketCase):
	def test_no_more_than_the_limit_a_minute_for_one_user(self):
		with listening(Printer()) as app, as_user(TILL):
			for _tap in range(table_qr_ticket.PRINTS_PER_MINUTE):
				call(token=self.token, pos_profile=PROFILE)
			with self.assertRaises(frappe.RateLimitExceededError):
				call(token=self.token, pos_profile=PROFILE)

		self.assertEqual(len(app.asked), table_qr_ticket.PRINTS_PER_MINUTE)

	def test_a_refused_call_does_not_use_up_the_limit(self):
		with listening(Printer()) as app:
			for _tap in range(table_qr_ticket.PRINTS_PER_MINUTE + 5):
				with as_user(TILL), self.assertRaises(frappe.ValidationError):
					call(token="forged-token", pos_profile=PROFILE)
			with as_user(TILL):
				call(token=self.token, pos_profile=PROFILE)
		self.assertEqual(len(app.asked), 1)

	def test_the_limit_is_each_users_own(self):
		with listening(Printer()):
			with as_user(TILL):
				for _tap in range(table_qr_ticket.PRINTS_PER_MINUTE):
					call(token=self.token, pos_profile=PROFILE)
			with as_user("Administrator"):
				call(token=self.token, pos_profile=PROFILE)


class TestTheFrenchIsInTheCatalogue(FrappeTestCase):
	"""The words of the button and of the refusals are translated (PO only, never a CSV), and the template is in step."""

	WORDS = (
		("Printer offline", "Imprimante hors ligne"),
		("Failed to print the QR code", "Impossible d'imprimer le code QR"),
		(
			"This till has no ticket printer: the QR code prints from the browser",
			"Cette caisse n'a pas d'imprimante à tickets : le code QR s'imprime depuis le navigateur",
		),
		("Nothing was printed", "Rien n'a été imprimé"),
		(
			"This QR code is no longer valid: make a new one",
			"Ce code QR n'est plus valide : créez-en un nouveau",
		),
		("This till does not serve this table", "Cette caisse ne dessert pas cette table"),
		(
			"Too many tickets in a minute: wait a moment before printing another",
			"Trop de tickets en une minute : patientez un moment avant d'en imprimer un autre",
		),
	)

	def test_each_word_has_its_french_entry_and_its_place_in_the_template(self):
		locale = Path(table_qr_ticket.__file__).resolve().parents[1] / "locale"
		french = (locale / "fr.po").read_text(encoding="utf-8")
		template = (locale / "main.pot").read_text(encoding="utf-8")
		for english, translated in self.WORDS:
			with self.subTest(english):
				self.assertIn(f'msgid "{english}"\nmsgstr "{translated}"\n', french)
				self.assertIn(f'msgid "{english}"\nmsgstr ""\n', template)
