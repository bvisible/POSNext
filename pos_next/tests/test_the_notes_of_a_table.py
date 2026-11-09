# //// Neoffice — added file (no upstream equivalent).
"""The notes of a table (NeoResto lot 1): several parties at one table, each with its own order, covers, kitchen ticket and payment.

A note is a draft Sales Invoice on a table, and a table may hold several, told « table 5, .1, .2, .3 » (« je rajoute une bouteille sur la
table 4, mais ce serait le .2 »). A table with ONE note is « T5 » as ever; « T5.0 », « T5.1 » appear only when it holds a second open note,
with the optional name of the party beside the rank (« T5.1 · Dupont »). The rank lives on the draft in the hidden Custom Field
`restaurant_note` (an Int, 0 stored meaning legacy and read as 1) and the name in `restaurant_note_name` (a Small Text). The suite pins:

- the rules (`pos_next.restaurant.notes`): the effective rank, the ranks and names a payload may carry, the next free rank, the label of a
  table, the kitchen state a tile tells, and the two Custom Fields;
- the till's save (`update_invoice`): the draft of a note is found by (table, rank) and never by « any draft of the table », two notes are never
  merged or overwritten, two open drafts never share a rank, an absent key leaves the stored one alone;
- what is read back: `open_table` and `get_table_order` with and without a note, the summary of the table's open notes, the floor plan's tile
  that sums its notes, and the kitchen's and the pass's cards, one per note;
- the payment: paying one note leaves the table Occupied while another is open, the last one paid frees it, and a payment never rewrites a rank;
- the table freed only when no open note remains: cancelling a note, the status hook, a table marked for cleaning that was seated again, the codes;
- `set_table_note_name`: its rights, its cleaning of the name, what it refuses, and the screens it tells;
- a guest's QR order, which attaches to the lowest-rank open note, and a table with one note, which answers exactly as it did.

The suite builds its own restaurants, tills, menu and orders (those of `test_service_families`) and rolls everything back. The people it acts as
are the waiter (the cashier of the till), the restaurant's administrator and the accounts that must be refused (neoffice-maintenance#2125):
never Administrator, who only prepares the scenery.
"""

import json
from unittest.mock import patch

import frappe

# //// Neoffice — the people a test acts as (neoffice-maintenance#2125).
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase
from frappe.utils import cint, flt

from pos_next import hooks
from pos_next.api import guest_ordering, invoices
from pos_next.api import restaurant as restaurant_api
from pos_next.restaurant import covers, devices, notes, open_orders, service_families
from pos_next.tests.test_the_covers_of_a_table import CoversCase
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, TILL, _sale, _user

# What the payer hands over for a line of 10: more than the total of a site with a sales tax, however high it is
TENDERED = 20
OUTSIDER = "notes-outsider@yopmail.com"
PORTAL = "notes-portal@yopmail.com"
# What nobody can open as a note: zero, negative, too many, not a number, not a whole number
NOT_A_RANK = (0, -1, 100, "abc", 2.5, True, [1])
# What the list of tables told for a table before the notes
TILE_BEFORE_THE_NOTES = {
	"item_count",
	"opened_at",
	"opened_by",
	"kds_status",
	"ticket_no",
	"ticket_digits",
	"covers",
	"grand_total",
}
# What an order answered by open_table (a draft that comes back) before the notes
OPEN_TABLE_BEFORE_THE_NOTES = {
	"name",
	"items",
	"customer",
	"customer_name",
	"kds_status",
	"paid_amount",
	"tip_total",
	"is_new",
	"ticket_no",
	"ticket_digits",
	"covers",
}
THE_NOTES_KEYS = {"note", "note_name", "notes", "next_note"}
SUMMARY_KEYS = {"name", "note", "note_name", "covers", "grand_total", "items_count", "kds_status"}


class TestTheRulesOfNotes(FrappeTestCase):
	"""The pure part of `pos_next.restaurant.notes`: nothing is read from the database and nothing is written."""

	def test_the_effective_rank_of_nothing_and_of_zero_is_one(self):
		for stored, rank in ((None, 1), (0, 1), ("", 1), ("0", 1), (-3, 1), (1, 1), (2, 2), ("3", 3), (2.9, 2)):
			with self.subTest(stored=stored):
				self.assertEqual(notes.effective_rank(stored), rank)

	def test_a_whole_number_from_one_to_ninety_nine_is_a_rank(self):
		for value in (1, 2, 99, "1", " 7 ", "+4", 3.0):
			with self.subTest(value=value):
				self.assertEqual(notes.clean_rank(value), int(float(str(value).strip())))

	def test_nothing_is_no_rank(self):
		for value in (None, "", "   "):
			with self.subTest(value=value):
				self.assertIsNone(notes.clean_rank(value))

	def test_the_payment_reads_zero_as_no_rank_because_a_draft_read_back_carries_it(self):
		# restaurant_note is an Int: a draft with no note is read back as 0, and submit_invoice receives it (neoffice-maintenance#2329).
		for value in (0, 0.0, None, "", "   "):
			with self.subTest(value=value):
				self.assertIsNone(notes.rank_asked(value))

	def test_the_payment_reads_a_real_rank_as_clean_rank_does(self):
		for value in (1, 3, 99, "2", 3.0):
			with self.subTest(value=value):
				self.assertEqual(notes.rank_asked(value), notes.clean_rank(value))

	def test_the_payment_still_refuses_what_is_no_rank(self):
		# Only the number 0 is lenient: the text "0", a negative, too many, a boolean, a fraction, a list stay refused, as does clean_rank itself.
		for value in ("0", False, *(v for v in NOT_A_RANK if v != 0), "100", {"note": 1}):
			with self.subTest(value=value), self.assertRaises(frappe.ValidationError):
				notes.rank_asked(value)
		with self.assertRaises(frappe.ValidationError):
			notes.clean_rank(0)

	def test_what_is_no_whole_number_from_one_to_ninety_nine_is_refused(self):
		for value in (*NOT_A_RANK, "0", "100", "1e1", "٣", {"note": 1}, 10**30, float("nan")):
			with self.subTest(value=value), self.assertRaises(frappe.ValidationError):
				notes.clean_rank(value)

	def test_a_name_is_cleaned_to_what_a_screen_and_a_ticket_can_carry(self):
		for typed, kept in (
			("Dupont", "Dupont"),
			("  Les   deux\ncouples \t", "Les deux couples"),
			("<b>Dupont</b> & fils", "Dupont & fils"),
			("Du\x00pont\x07", "Dupont"),
			("x" * 100, "x" * notes.MAX_NAME_CHARS),
			("Zoë ☕ Müller", "Zoë ☕ Müller"),
		):
			with self.subTest(typed=typed):
				self.assertEqual(notes.clean_name(typed), kept)

	def test_a_name_cut_short_does_not_end_with_a_space(self):
		self.assertEqual(notes.clean_name("a" * 59 + " b"), "a" * 59)

	def test_nothing_and_white_space_are_no_name(self):
		for value in (None, "", "   ", "\n\t", "<b></b>"):
			with self.subTest(value=value):
				self.assertIsNone(notes.clean_name(value))

	def test_what_is_no_text_is_no_name_and_is_refused(self):
		for value in (5, ["Dupont"], {"name": "Dupont"}, True):
			with self.subTest(value=value), self.assertRaises(frappe.ValidationError):
				notes.clean_name(value)

	def test_the_next_free_rank_is_the_lowest_one_no_open_note_holds(self):
		for ranks, free in (
			([], 1),
			([1], 2),
			([1, 2], 3),
			([2], 1),
			([1, 3], 2),
			([3, 1, 2], 4),
			([0], 2),
			([None, 2], 3),
			(iter([1, 2]), 3),
		):
			with self.subTest(ranks=ranks):
				self.assertEqual(notes.next_free_rank(ranks), free)

	def test_a_table_that_holds_all_ninety_nine_has_no_next_rank(self):
		self.assertEqual(notes.next_free_rank(range(1, 99)), 99)
		self.assertIsNone(notes.next_free_rank(range(1, 100)))

	def test_a_table_with_one_note_keeps_its_plain_label(self):
		for count in (None, 0, 1):
			with self.subTest(count=count):
				self.assertEqual(notes.table_label("T5", 1, None, count), "T5")
				self.assertEqual(notes.table_label("T5", 2, "Dupont", count), "T5", "a lone note is the table, named or not")

	def test_a_table_with_several_notes_adds_the_rank_and_the_name_of_the_party(self):
		self.assertEqual(notes.table_label("T5", 2, None, 2), "T5.1")
		self.assertEqual(notes.table_label("T5", 2, "Dupont", 2), "T5.1 · Dupont")
		self.assertEqual(notes.table_label("T5", 1, "Les deux couples", 3), "T5.0 · Les deux couples")

	def test_the_number_after_the_dot_counts_from_zero(self):
		self.assertEqual([notes.rank_number(rank) for rank in (None, 0, 1, 2, 3)], [0, 0, 0, 1, 2])

	def test_the_label_of_an_unranked_or_unnamed_note_is_the_first_note_with_no_name(self):
		self.assertEqual(notes.table_label("T5", None, "", 2), "T5.0")
		self.assertEqual(notes.table_label("T5", 0, "   ", 2), "T5.0")
		self.assertEqual(notes.table_label(None, 2, None, 2), ".1")

	def test_the_label_cleans_the_name_it_is_given(self):
		self.assertEqual(notes.table_label("T5", 2, "  Du   pont\n", 2), "T5.1 · Du pont")

	def test_the_tile_tells_the_kitchen_state_that_most_needs_a_look(self):
		for states, told in (
			(["Pending"], "Pending"),
			([None], "Pending"),
			([], "Pending"),
			(["Pending", "Ready"], "Ready"),
			(["Preparing", "Pending"], "Preparing"),
			(["Delivered", "Pending"], "Pending"),
			(["Delivered", "Delivered"], "Delivered"),
			(["Ready", "Delivered", "Preparing"], "Ready"),
			(iter(["Pending", "Preparing"]), "Preparing"),
		):
			with self.subTest(states=states):
				self.assertEqual(notes.kds_status_of_table(states), told)


class NotesCase(CoversCase):
	"""Restaurant A with its tables T1 (`table_a`) and T2 (`table_a2`), its till, and the menu of the service families."""

	def two_notes(self, **second):
		"""T1 with its note .1 (a soup) and its note .2 (a penne), the second one saved last; their names."""
		first = self.save([self.line(self.soup)])
		second_note = self.save([self.line(self.penne)], restaurant_note=2, **second)
		return first, second_note

	def rank_of(self, order):
		return frappe.db.get_value("Sales Invoice", order, "restaurant_note")

	def party_of(self, order):
		return frappe.db.get_value("Sales Invoice", order, "restaurant_note_name") or None

	def status_of_table(self, table=None):
		return frappe.db.get_value("Restaurant Table", table or self.table_a, "status")

	def open_drafts(self, table=None):
		return frappe.get_all(
			"Sales Invoice", filters={"docstatus": 0, "restaurant_table": table or self.table_a}, pluck="name"
		)

	def items_of(self, order):
		return [row.item_code for row in self.lines_of(order)]

	def opened(self, note=None, table=None):
		with self.waiter():
			return restaurant_api.open_table(table or self.table_a, self.fx.profile, note=note)

	def order_of(self, note=None, table=None):
		with self.waiter():
			return restaurant_api.get_table_order(table or self.table_a, note=note)

	def floor(self):
		with self.waiter():
			return {row["name"]: row for row in restaurant_api.get_tables(restaurant=self.a)["tables"]}

	def pay(self, order, note=None, table=None, status="Pending", **changes):
		"""The payment of the order as the till sends it (submit_invoice): the payload of a payment, with the note it is of when one is named.

		`status` is the kitchen state of the line it pays: a dish still at the kitchen (the default) keeps the table seated, a delivered one does not."""
		payload = _sale(
			self.fx,
			name=order,
			restaurant_table=table or self.table_a,
			items=[self.line(self.soup, status)],
			# The cash tendered covers the total whatever the site adds to the 10 of the line: a site with a default sales tax
			# (every real one, and the clone of an instance) owes more than 10, and the till refuses a short sale on a
			# profile without credit sales. The change is given back.
			payments=[{"mode_of_payment": self.fx.mode, "amount": TENDERED}],
			**changes,
		)
		if note is not None:
			payload["restaurant_note"] = note
		with as_role("cashier", email=TILL):
			return invoices.submit_invoice(invoice=json.dumps(payload), data="{}")


class TestTheFieldsOfTheNotes(NotesCase):
	def test_the_rank_is_a_hidden_read_only_whole_number_after_the_covers(self):
		field = frappe.get_meta("Sales Invoice").get_field("restaurant_note")

		self.assertEqual((field.fieldtype, field.hidden, field.read_only), ("Int", 1, 1))
		self.assertEqual((field.no_copy, field.non_negative), (1, 1))
		fixtures = frappe.get_file_json(frappe.get_app_path("pos_next", "fixtures", "custom_field.json"))
		shipped = next(row for row in fixtures if row["name"] == "Sales Invoice-restaurant_note")
		self.assertEqual(
			(shipped["dt"], shipped["fieldname"], shipped["insert_after"]),
			("Sales Invoice", "restaurant_note", "restaurant_covers"),
		)

	def test_the_name_of_the_party_is_a_hidden_read_only_small_text_that_costs_the_row_almost_nothing(self):
		"""A 60-character varchar costs a table row 242 bytes and Sales Invoice has no room for it on a fleet site: a `text` column costs 10."""
		field = frappe.get_meta("Sales Invoice").get_field("restaurant_note_name")

		self.assertEqual((field.fieldtype, field.hidden, field.read_only, field.no_copy), ("Small Text", 1, 1, 1))
		column = frappe.db.sql(
			"select data_type from information_schema.columns where table_schema = database() "
			"and table_name = 'tabSales Invoice' and column_name = 'restaurant_note_name'"
		)
		self.assertEqual(column[0][0], "text")
		fixtures = frappe.get_file_json(frappe.get_app_path("pos_next", "fixtures", "custom_field.json"))
		shipped = next(row for row in fixtures if row["name"] == "Sales Invoice-restaurant_note_name")
		self.assertEqual((shipped["dt"], shipped["insert_after"]), ("Sales Invoice", "restaurant_note"))

	def test_both_fields_are_listed_among_the_custom_fields_the_app_exports(self):
		self.assertIn("Sales Invoice-restaurant_note", hooks._custom_field_names)
		self.assertIn("Sales Invoice-restaurant_note_name", hooks._custom_field_names)

	def test_the_site_has_both_columns(self):
		self.assertTrue(notes.has_columns())
		self.assertEqual(notes.order_fields(), ["restaurant_note", "restaurant_note_name"])


class TestTheRankOfAnOrder(NotesCase):
	def test_an_order_made_at_a_table_is_its_first_note(self):
		order = self.save()

		self.assertEqual(self.rank_of(order), 1)
		self.assertIsNone(self.party_of(order))

	def test_a_save_with_a_rank_stores_it(self):
		order = self.save(restaurant_note=2)

		self.assertEqual(self.rank_of(order), 2)

	def test_a_save_with_a_rank_and_no_name_makes_the_second_draft_and_leaves_the_first_alone(self):
		first = self.save([self.line(self.soup)])

		second = self.save([self.line(self.penne)], restaurant_note=2)

		self.assertNotEqual(second, first)
		self.assertEqual(self.items_of(first), [self.soup], "the first note keeps its own lines")
		self.assertEqual(self.items_of(second), [self.penne])
		self.assertEqual((self.rank_of(first), self.rank_of(second)), (1, 2))
		self.assertCountEqual(self.open_drafts(), [first, second])

	def test_the_same_note_saved_again_without_its_id_finds_its_own_draft(self):
		first, second = self.two_notes()

		again = self.save([self.line(self.penne), self.line(self.steak)], restaurant_note=2)

		self.assertEqual(again, second)
		self.assertEqual(self.items_of(second), [self.penne, self.steak])
		self.assertEqual(self.items_of(first), [self.soup], "the other note is not touched")
		self.assertCountEqual(self.open_drafts(), [first, second])

	def test_a_save_with_no_rank_is_the_first_note(self):
		first, second = self.two_notes()

		again = self.save([self.line(self.salad)])

		self.assertEqual(again, first)
		self.assertEqual(self.items_of(first), [self.salad])
		self.assertEqual(self.items_of(second), [self.penne])

	def test_a_save_by_name_without_a_rank_leaves_the_rank_alone(self):
		first, second = self.two_notes()

		self.save([self.line(self.penne), self.line(self.tart)], name=second)

		self.assertEqual((self.rank_of(first), self.rank_of(second)), (1, 2))

	def test_the_fallback_never_merges_two_notes(self):
		first = self.save([self.line(self.soup)])
		second = self.save([self.line(self.penne)], restaurant_note=2)
		third = self.save([self.line(self.steak)], restaurant_note=3)

		for _round in range(2):
			self.assertEqual(self.save([self.line(self.soup)]), first)
			self.assertEqual(self.save([self.line(self.penne)], restaurant_note=2), second)
			self.assertEqual(self.save([self.line(self.steak)], restaurant_note=3), third)

		self.assertCountEqual(self.open_drafts(), [first, second, third])
		self.assertEqual(
			[self.items_of(first), self.items_of(second), self.items_of(third)],
			[[self.soup], [self.penne], [self.steak]],
		)

	def test_a_rank_that_is_no_whole_number_from_one_to_ninety_nine_is_refused_and_creates_no_order(self):
		first = self.save()

		for sent in NOT_A_RANK:
			with self.subTest(sent=sent):
				with self.assertRaises(frappe.ValidationError):
					self.save(restaurant_note=sent)
				with self.assertRaises(frappe.ValidationError):
					self.save(name=first, restaurant_note=sent)
				self.assertEqual(self.open_drafts(), [first])
				self.assertEqual(self.rank_of(first), 1)

	def test_a_rank_sent_as_text_or_as_a_whole_float_is_kept(self):
		self.assertEqual(self.rank_of(self.save(restaurant_note="2")), 2)
		self.assertEqual(self.rank_of(self.save(restaurant_note=3.0)), 3)

	def test_nothing_and_an_empty_text_are_no_rank_and_find_the_first_note(self):
		first = self.save()
		for none in (None, ""):
			with self.subTest(sent=none):
				self.assertEqual(self.save(restaurant_note=none), first)
				self.assertEqual(self.rank_of(first), 1)

	def test_an_order_cannot_take_the_rank_of_another_open_order_of_its_table(self):
		first, second = self.two_notes()

		with self.assertRaises(frappe.ValidationError):
			self.save(name=second, restaurant_note=1)

		self.assertEqual((self.rank_of(first), self.rank_of(second)), (1, 2))

	def test_an_order_may_take_a_free_rank(self):
		_first, second = self.two_notes()

		self.save(name=second, restaurant_note=5)

		self.assertEqual(self.rank_of(second), 5)

	def test_a_rank_freed_by_a_note_that_is_paid_may_be_taken_again(self):
		first, second = self.two_notes()
		self.pay(first, note=1)

		self.save(name=second, restaurant_note=1)

		self.assertEqual(self.rank_of(second), 1)

	def test_an_order_moved_to_a_table_where_its_rank_is_taken_is_refused(self):
		first = self.save()
		elsewhere = self.save([self.line(self.penne)], restaurant_table=self.table_a2)

		with self.assertRaises(frappe.ValidationError):
			self.save(name=elsewhere, restaurant_table=self.table_a)

		self.assertEqual(frappe.db.get_value("Sales Invoice", elsewhere, "restaurant_table"), self.table_a2)
		self.assertEqual(self.open_drafts(), [first])

	def test_a_save_that_changes_nothing_is_never_refused_whatever_older_data_holds(self):
		"""Two open drafts of one rank are older data (a race, a stray draft): their saves must not be blocked."""
		first, second = self.two_notes()
		frappe.db.set_value("Sales Invoice", second, "restaurant_note", 1, update_modified=False)

		self.save([self.line(self.penne), self.line(self.tart)], name=second)
		self.save([self.line(self.penne)], name=second, restaurant_note=1)

		self.assertEqual(self.items_of(second), [self.penne])
		self.assertEqual(self.items_of(first), [self.soup])

	def test_an_order_saved_before_the_notes_existed_is_the_first_note(self):
		first = self.save()
		frappe.db.set_value("Sales Invoice", first, "restaurant_note", 0, update_modified=False)

		again = self.save([self.line(self.salad)])

		self.assertEqual(again, first, "rank 0 is read as rank 1")
		self.assertEqual(self.opened()["note"], 1)
		with self.assertRaises(frappe.ValidationError):
			self.save(name=self.save(restaurant_note=2), restaurant_note=1)

	def test_a_table_whose_first_note_was_paid_has_no_first_note_to_save_into(self):
		"""A save with no rank is the first note: it makes one, it does not land on a note of another rank."""
		first, second = self.two_notes()
		self.pay(first, note=1)

		fresh = self.save([self.line(self.salad)])

		self.assertNotIn(fresh, (first, second))
		self.assertEqual(self.rank_of(fresh), 1)
		self.assertEqual(self.items_of(second), [self.penne])

	def test_a_rank_on_an_order_of_no_table_is_stored_nowhere(self):
		order = self.save(restaurant_table=None, is_takeaway=1, takeaway_number="T-001", restaurant_note=2)

		self.assertEqual(cint(self.rank_of(order)), 0)

	def test_the_table_is_locked_while_a_note_is_looked_for_to_be_made(self):
		with patch.object(notes, "lock_table", wraps=notes.lock_table) as lock:
			order = self.save()
			lock.assert_called_once_with(self.table_a)
			lock.reset_mock()
			self.save(name=order)

		lock.assert_not_called()

	def test_the_callers_own_payload_keeps_its_keys(self):
		payload = _sale(
			self.fx,
			items=[self.line(self.soup)],
			restaurant_table=self.table_a,
			restaurant_note=2,
			restaurant_note_name="Dupont",
		)

		with self.waiter():
			name = invoices.update_invoice(payload)["name"]

		self.assertEqual((self.rank_of(name), self.party_of(name)), (2, "Dupont"))
		self.assertEqual((payload["restaurant_note"], payload["restaurant_note_name"]), (2, "Dupont"))


class TestTheNameOfAParty(NotesCase):
	def test_a_name_sent_with_the_save_is_kept_cleaned(self):
		order = self.save(restaurant_note_name="  Les   Dupont ")

		self.assertEqual(self.party_of(order), "Les Dupont")

	def test_a_later_save_without_the_key_leaves_the_name_alone(self):
		order = self.save(restaurant_note_name="Dupont")

		self.save([self.line(self.soup), self.line(self.salad)], name=order)

		self.assertEqual(self.party_of(order), "Dupont")

	def test_a_later_save_with_a_new_name_changes_it(self):
		order = self.save(restaurant_note_name="Dupont")

		self.save(name=order, restaurant_note_name="Martin")

		self.assertEqual(self.party_of(order), "Martin")

	def test_an_empty_text_and_nothing_clear_the_name(self):
		order = self.save(restaurant_note_name="Dupont")
		for none in ("", None, "   "):
			with self.subTest(sent=none):
				self.save(name=order, restaurant_note_name="Dupont")
				self.assertEqual(self.party_of(order), "Dupont")

				self.save(name=order, restaurant_note_name=none)

				self.assertIsNone(self.party_of(order))

	def test_a_name_that_is_no_text_is_refused_and_creates_no_order(self):
		for sent in (5, ["Dupont"], {"name": "Dupont"}):
			with self.subTest(sent=sent), self.assertRaises(frappe.ValidationError):
				self.save(restaurant_note_name=sent)

		self.assertEqual(self.open_drafts(), [])

	def test_a_name_is_cut_at_sixty_characters(self):
		order = self.save(restaurant_note_name="x" * 100)

		self.assertEqual(self.party_of(order), "x" * notes.MAX_NAME_CHARS)

	def test_each_note_has_its_own_covers(self):
		first = self.save(restaurant_covers=3)
		second = self.save(restaurant_note=2, restaurant_covers=2)

		self.assertEqual((self.covers_of(first), self.covers_of(second)), (3, 2))
		with self.waiter():
			restaurant_api.set_table_covers(second, 4)
		self.assertEqual((self.covers_of(first), self.covers_of(second)), (3, 4))


class TestOpeningANote(NotesCase):
	def test_a_table_with_no_order_opens_an_empty_first_note(self):
		opened = self.opened(table=self.table_a2)

		self.assertTrue(opened["is_new"])
		self.assertIsNone(opened["name"])
		self.assertEqual((opened["note"], opened["note_name"], opened["notes"], opened["next_note"]), (1, None, [], 1))

	def test_a_table_with_one_note_opens_it_and_lists_it(self):
		order = self.save(restaurant_covers=3)

		opened = self.opened()

		self.assertEqual((opened["name"], opened["is_new"], opened["note"], opened["note_name"]), (order, False, 1, None))
		self.assertEqual(opened["next_note"], 2)
		self.assertEqual(len(opened["notes"]), 1)
		summary = opened["notes"][0]
		self.assertEqual(set(summary), SUMMARY_KEYS)
		self.assertEqual(
			(summary["name"], summary["note"], summary["note_name"], summary["covers"], summary["items_count"]),
			(order, 1, None, 3, 1),
		)
		self.assertEqual(flt(summary["grand_total"]), flt(frappe.db.get_value("Sales Invoice", order, "grand_total")))
		self.assertEqual(summary["kds_status"], "Pending")

	def test_a_table_with_several_notes_opens_the_lowest_by_default_whatever_was_saved_last(self):
		first, second = self.two_notes()

		self.assertEqual(self.opened()["name"], first)
		self.assertEqual(self.order_of()["name"], first)

	def test_a_note_asked_for_is_the_one_opened(self):
		first, second = self.two_notes(restaurant_note_name="Dupont")

		opened = self.opened(note=2)

		self.assertEqual((opened["name"], opened["note"], opened["note_name"]), (second, 2, "Dupont"))
		self.assertEqual([row["item_code"] for row in opened["items"]], [self.penne])
		self.assertEqual(self.opened(note=1)["name"], first)
		self.assertEqual(self.opened(note="2")["name"], second, "the web sends a number as text")

	def test_the_notes_of_a_table_are_listed_by_rank_with_their_figures(self):
		first = self.save([self.line(self.soup)], restaurant_covers=3)
		second = self.save(
			[self.line(self.penne), self.line(self.steak)],
			restaurant_note=2,
			restaurant_note_name="Dupont",
			restaurant_covers=2,
		)
		# A note saved later is not a note listed later: they are listed by rank
		self.save([self.line(self.salad)], name=first)

		listed = self.opened(note=2)["notes"]

		self.assertEqual([row["name"] for row in listed], [first, second])
		self.assertEqual([row["note"] for row in listed], [1, 2])
		self.assertEqual([row["note_name"] for row in listed], [None, "Dupont"])
		self.assertEqual([row["covers"] for row in listed], [3, 2])
		self.assertEqual([row["items_count"] for row in listed], [1, 2])
		self.assertEqual(
			[flt(row["grand_total"]) for row in listed],
			[flt(frappe.db.get_value("Sales Invoice", name, "grand_total")) for name in (first, second)],
		)
		self.assertEqual(self.opened()["next_note"], 3)

	def test_a_note_that_has_no_order_yet_opens_empty_and_creates_nothing(self):
		first = self.save()

		opened = self.opened(note=2)

		self.assertTrue(opened["is_new"])
		self.assertIsNone(opened["name"])
		self.assertEqual((opened["items"], opened["note"], opened["note_name"], opened["covers"]), ([], 2, None, None))
		self.assertEqual([row["name"] for row in opened["notes"]], [first])
		self.assertEqual(self.open_drafts(), [first], "a draft is made by the first save")

	def test_only_the_open_drafts_of_the_table_are_notes(self):
		first, second = self.two_notes()
		self.pay(first, note=1)

		opened = self.opened()

		self.assertEqual((opened["name"], opened["note"]), (second, 2))
		self.assertEqual([row["name"] for row in opened["notes"]], [second], "a paid note is no note of the table")
		self.assertEqual(self.opened(note=1)["is_new"], True, "nor can it be opened again")

	def test_the_notes_of_another_table_are_not_listed(self):
		self.two_notes()
		other = self.save(restaurant_table=self.table_a2)

		listed = self.opened(table=self.table_a2)["notes"]

		self.assertEqual([row["name"] for row in listed], [other])

	def test_a_rank_nobody_can_open_is_refused(self):
		self.save()
		for sent in NOT_A_RANK:
			with self.subTest(sent=sent), self.assertRaises(frappe.ValidationError):
				self.opened(note=sent)

	def test_get_table_order_gives_the_same_notes(self):
		first, second = self.two_notes(restaurant_note_name="Dupont")

		lowest = self.order_of()
		asked = self.order_of(note=2)

		self.assertEqual((lowest["name"], lowest["note"], lowest["note_name"], lowest["is_new"]), (first, 1, None, False))
		self.assertEqual((asked["name"], asked["note"], asked["note_name"]), (second, 2, "Dupont"))
		self.assertEqual([row["item_code"] for row in asked["items"]], [self.penne])
		self.assertEqual([row["name"] for row in asked["notes"]], [first, second])
		self.assertEqual(asked["next_note"], 3)
		self.assertEqual(self.order_of(note="2")["name"], second)

	def test_get_table_order_of_a_note_with_no_order_yet_is_an_empty_new_order(self):
		first = self.save()

		asked = self.order_of(note=2)

		self.assertTrue(asked["is_new"])
		self.assertEqual((asked["name"], asked["items"], asked["note"], asked["restaurant_table"]), (None, [], 2, self.table_a))
		self.assertEqual([row["name"] for row in asked["notes"]], [first])
		self.assertEqual(self.open_drafts(), [first])

	def test_get_table_order_of_a_table_with_no_order_is_none_as_before(self):
		self.assertIsNone(self.order_of(table=self.table_a2))

	def test_get_table_order_falls_back_to_the_order_just_paid_when_no_note_is_asked_for(self):
		only = self.save()
		self.pay(only)

		paid = self.order_of()

		self.assertEqual((paid["name"], paid["note"], paid["notes"]), (only, 1, []))
		self.assertFalse(paid["is_new"])
		asked = self.order_of(note=1)
		self.assertTrue(asked["is_new"], "a paid order is no note one can open")
		self.assertIsNone(asked["name"])

	def test_get_table_order_refuses_a_rank_nobody_can_open(self):
		self.save()
		for sent in NOT_A_RANK:
			with self.subTest(sent=sent), self.assertRaises(frappe.ValidationError):
				self.order_of(note=sent)

	def test_the_payment_summary_of_a_cleaning_table_says_which_note_it_is(self):
		first = self.save(restaurant_note_name="Dupont")
		self.pay(first)

		with self.waiter():
			summary = restaurant_api.get_table_payment_summary(self.table_a)
			empty = restaurant_api.get_table_payment_summary(self.table_a2)

		self.assertEqual((summary["invoice"], summary["note"], summary["note_name"]), (first, 1, "Dupont"))
		self.assertEqual((empty["invoice"], empty["note"], empty["note_name"]), (None, 1, None))


class TestTheFloorSumsTheNotes(NotesCase):
	def test_a_table_with_one_note_is_told_as_it_always_was(self):
		order = self.save([self.line(self.soup), self.line(self.salad)], restaurant_covers=3)

		tile = self.floor()[self.table_a]["order_summary"]

		# What the floor says of the whole table besides the notes (all served, quiet since, « Cash in? »), whatever it adds later
		of_the_table = set(open_orders.summary_of_table([], {}, 0))
		self.assertTrue(TILE_BEFORE_THE_NOTES <= set(tile))
		self.assertEqual(set(tile) - TILE_BEFORE_THE_NOTES - of_the_table, {"notes_count", "note_names"})
		self.assertEqual((tile["item_count"], tile["covers"], tile["notes_count"], tile["note_names"]), (2, 3, 1, []))
		self.assertEqual(flt(tile["grand_total"]), flt(frappe.db.get_value("Sales Invoice", order, "grand_total")))
		self.assertEqual(tile["opened_at"], str(frappe.db.get_value("Sales Invoice", order, "creation")))
		self.assertEqual(tile["kds_status"], "Pending")

	def test_a_table_with_several_notes_sums_them(self):
		first = self.save([self.line(self.soup)], restaurant_covers=3)
		second = self.save([self.line(self.penne), self.line(self.steak)], restaurant_note=2, restaurant_covers=2)

		tile = self.floor()[self.table_a]["order_summary"]

		self.assertEqual(tile["item_count"], 3)
		self.assertEqual(tile["covers"], 5)
		self.assertEqual(tile["notes_count"], 2)
		total = sum(flt(frappe.db.get_value("Sales Invoice", name, "grand_total")) for name in (first, second))
		self.assertEqual(flt(tile["grand_total"]), total)

	def test_the_covers_of_a_table_are_none_when_no_note_has_any_and_the_sum_of_those_that_have(self):
		self.save()
		self.save(restaurant_note=2)
		self.assertIsNone(self.floor()[self.table_a]["order_summary"]["covers"])

		self.save(restaurant_note=2, restaurant_covers=4)

		self.assertEqual(self.floor()[self.table_a]["order_summary"]["covers"], 4)

	def test_the_names_of_the_parties_are_listed_in_rank_order_for_the_search(self):
		self.save()
		self.save([self.line(self.penne)], restaurant_note=3, restaurant_note_name="Martin")
		self.save([self.line(self.steak)], restaurant_note=2, restaurant_note_name="Dupont")
		self.save([self.line(self.salad)], restaurant_note=4)

		tile = self.floor()[self.table_a]["order_summary"]

		self.assertEqual(tile["notes_count"], 4)
		self.assertEqual(tile["note_names"], ["Dupont", "Martin"], "only the names there are, by rank")

	def test_the_tile_is_seated_since_the_note_opened_first_and_reads_the_ticket_of_the_lowest_note(self):
		first, second = self.two_notes()
		frappe.db.set_value("Sales Invoice", second, "creation", "2020-01-01 10:00:00", update_modified=False)
		frappe.db.set_value("Sales Invoice", first, "posa_ticket_no", 7, update_modified=False)
		frappe.db.set_value("Sales Invoice", second, "posa_ticket_no", 3, update_modified=False)

		tile = self.floor()[self.table_a]["order_summary"]

		self.assertEqual(tile["opened_at"], "2020-01-01 10:00:00")
		self.assertEqual(tile["ticket_no"], 7)

	def test_the_tile_tells_the_kitchen_state_that_most_needs_a_look(self):
		first, second = self.two_notes()
		frappe.db.set_value("Sales Invoice", first, "kds_status", "Delivered", update_modified=False)
		frappe.db.set_value("Sales Invoice", second, "kds_status", "Ready", update_modified=False)

		self.assertEqual(self.floor()[self.table_a]["order_summary"]["kds_status"], "Ready")

	def test_a_table_whose_first_note_was_paid_is_a_table_with_one_note_again(self):
		first, _second = self.two_notes(restaurant_note_name="Dupont")
		self.pay(first, note=1)

		tile = self.floor()[self.table_a]["order_summary"]

		self.assertEqual((tile["notes_count"], tile["note_names"], tile["item_count"]), (1, ["Dupont"], 1))

	def test_a_table_with_no_order_has_no_tile(self):
		self.assertIsNone(self.floor()[self.table_a2]["order_summary"])

	def test_the_lines_of_all_the_tables_are_counted_in_one_read(self):
		self.two_notes()
		self.save(restaurant_table=self.table_a2)

		with patch.object(notes, "count_lines", wraps=notes.count_lines) as count:
			tiles = self.floor()

		count.assert_called_once()
		self.assertEqual(tiles[self.table_a]["order_summary"]["notes_count"], 2)


class TestTheKitchenAndThePassKeepOneCardPerNote(NotesCase):
	def test_the_kitchen_has_a_card_for_each_note_that_says_which(self):
		first, second = self.two_notes(restaurant_note_name="Dupont")

		one = self.kitchen_order(first)
		two = self.kitchen_order(second)

		self.assertEqual((one["note"], one["note_name"], one["notes_count"], one["table_label"]), (1, None, 2, "T1.0"))
		self.assertEqual(
			(two["note"], two["note_name"], two["notes_count"], two["table_label"]), (2, "Dupont", 2, "T1.1 · Dupont")
		)
		self.assertEqual(one["table_display_name"], "T1", "the table's own label is unchanged")
		self.assertEqual([row["item_code"] for row in one["items"]], [self.soup])
		self.assertEqual([row["item_code"] for row in two["items"]], [self.penne])

	def test_a_table_with_one_note_has_a_card_that_is_unchanged(self):
		order = self.save()

		card = self.kitchen_order(order)

		self.assertEqual((card["note"], card["note_name"], card["notes_count"], card["table_label"]), (1, None, 1, "T1"))
		self.assertEqual(card["table_display_name"], "T1")

	def test_the_card_counts_the_open_notes_of_its_table_and_a_paid_note_no_longer_counts(self):
		first, second = self.two_notes()
		self.pay(first, note=1)
		# Its dish is still at the kitchen: the payload of the payment carried the line as sent
		frappe.db.set_value("Sales Invoice Item", {"parent": first}, "kds_status", "Pending", update_modified=False)

		paid = self.kitchen_order(first)
		open_one = self.kitchen_order(second)

		self.assertIsNotNone(paid, "a paid note whose dish is still at the kitchen keeps its card")
		self.assertEqual(open_one["notes_count"], 1, "the paid note does not count: the lone open note is the table")
		self.assertEqual(open_one["table_label"], "T1")
		self.assertEqual((paid["note"], paid["notes_count"]), (1, 2), "the paid card is still told apart from the open one")
		self.assertEqual(paid["table_label"], "T1.0")

	def test_a_takeaway_order_is_its_own_first_note(self):
		order = self.save(restaurant_table=None, is_takeaway=1, takeaway_number="T-001")

		card = self.kitchen_order(order)

		self.assertEqual((card["note"], card["note_name"], card["notes_count"]), (1, None, 1))
		self.assertNotIn("table_label", card)

	def test_the_notes_of_the_orders_of_a_list_are_read_once(self):
		self.two_notes()
		self.save(restaurant_table=self.table_a2)

		with (
			patch.object(notes, "stamp", wraps=notes.stamp) as stamp,
			patch.object(notes, "ranks_of_open_notes", wraps=notes.ranks_of_open_notes) as ranks,
			self.waiter(),
		):
			cards = restaurant_api.get_kds_orders(restaurant=self.a)

		self.assertEqual(len(cards), 3)
		stamp.assert_called_once()
		ranks.assert_called_once()

	def test_the_pass_has_a_card_for_each_note_too(self):
		first, second = self.two_notes(restaurant_note_name="Dupont")
		for order in (first, second):
			frappe.db.set_value(
				"Sales Invoice Item",
				{"parent": order},
				{"preparation_station": self.station_a, "kds_status": "Ready"},
				update_modified=False,
			)

		one = self.pass_order(first)
		two = self.pass_order(second)

		self.assertEqual((one["note"], one["note_name"], one["notes_count"], one["table_label"]), (1, None, 2, "T1.0"))
		self.assertEqual((two["note"], two["note_name"], two["notes_count"], two["table_label"]), (2, "Dupont", 2, "T1.1 · Dupont"))

	def test_the_card_of_a_table_with_one_note_at_the_pass_is_unchanged(self):
		order = self.save()
		frappe.db.set_value(
			"Sales Invoice Item",
			{"parent": order},
			{"preparation_station": self.station_a, "kds_status": "Ready"},
			update_modified=False,
		)

		card = self.pass_order(order)

		self.assertEqual((card["note"], card["note_name"], card["notes_count"], card["table_label"]), (1, None, 1, "T1"))


class TestPayingANote(NotesCase):
	def test_paying_one_note_leaves_the_table_occupied(self):
		first, second = self.two_notes()

		self.pay(first, note=1)

		self.assertEqual(frappe.db.get_value("Sales Invoice", first, "docstatus"), 1)
		self.assertEqual(frappe.db.get_value("Sales Invoice", second, "docstatus"), 0)
		self.assertEqual(self.status_of_table(), "Occupied")

	def test_paying_the_last_note_frees_the_table(self):
		first, second = self.two_notes()
		# Everything is served: a dish still at the kitchen would keep the table (test_a_paid_table_stays_while_dishes_are_to_serve)
		self.pay(first, note=1, status="Delivered")

		self.pay(second, note=2, status="Delivered")

		self.assertEqual(frappe.db.get_value("Sales Invoice", second, "docstatus"), 1)
		self.assertEqual(self.status_of_table(), "Cleaning")

	def test_a_table_with_one_note_is_cleaned_when_it_is_paid_as_before(self):
		order = self.save()
		self.assertEqual(self.status_of_table(), "Occupied")

		self.pay(order, status="Delivered")

		self.assertEqual(self.status_of_table(), "Cleaning")

	def test_a_payment_whose_id_was_lost_pays_the_note_it_names(self):
		first, second = self.two_notes()

		paid = self.pay(None, note=2)

		self.assertEqual(paid["name"], second, "the draft of the note, not a new invoice and not the other note's")
		self.assertEqual(frappe.db.get_value("Sales Invoice", second, "docstatus"), 1)
		self.assertEqual(frappe.db.get_value("Sales Invoice", first, "docstatus"), 0)
		self.assertEqual(self.open_drafts(), [first])
		self.assertEqual(self.status_of_table(), "Occupied")

	def test_a_payment_whose_id_was_lost_and_that_names_no_note_pays_the_first(self):
		first, second = self.two_notes()

		paid = self.pay(None)

		self.assertEqual(paid["name"], first)
		self.assertEqual(self.open_drafts(), [second])

	def test_a_payment_never_rewrites_the_rank_or_the_name_of_the_order(self):
		_first, second = self.two_notes(restaurant_note_name="Dupont")

		self.pay(second, note=9, restaurant_note_name="Somebody else")

		self.assertEqual(frappe.db.get_value("Sales Invoice", second, "docstatus"), 1)
		self.assertEqual((self.rank_of(second), self.party_of(second)), (2, "Dupont"))

	def test_a_payment_that_names_a_rank_nobody_can_open_is_refused_and_pays_nothing(self):
		first, second = self.two_notes()
		# Not 0: the payment reads a rank of 0 as no rank (the default every draft read back carries, neoffice-maintenance#2329),
		# and pays the note it finds (see test_the_payment_reads_zero_as_no_rank_because_a_draft_read_back_carries_it).
		for sent in (value for value in NOT_A_RANK if isinstance(value, bool) or value != 0):
			with self.subTest(sent=sent), self.assertRaises(frappe.ValidationError):
				self.pay(second, note=sent)
			self.assertCountEqual(self.open_drafts(), [first, second])
		self.assertEqual(frappe.db.get_value("Sales Invoice", second, "docstatus"), 0)

	def test_an_order_paid_at_once_keeps_the_note_it_came_with(self):
		"""An order the till never saved as a draft (a sale made offline and replayed) is made by the payment itself."""
		first = self.save()

		paid = self.pay(None, note=2, restaurant_note_name="Dupont")

		self.assertNotEqual(paid["name"], first)
		self.assertEqual((self.rank_of(paid["name"]), self.party_of(paid["name"])), (2, "Dupont"))
		self.assertEqual(self.open_drafts(), [first])
		self.assertEqual(self.status_of_table(), "Occupied")

	def test_once_the_first_note_is_paid_the_second_is_the_table(self):
		first, second = self.two_notes(restaurant_note_name="Dupont")
		self.pay(first, note=1)

		opened = self.opened()

		self.assertEqual((opened["name"], opened["note"], opened["note_name"]), (second, 2, "Dupont"))
		self.assertEqual([row["name"] for row in opened["notes"]], [second])
		card = self.kitchen_order(second)
		self.assertEqual((card["notes_count"], card["table_label"]), (1, "T1"))


class TestTheTableIsFreedWhenNoNoteIsOpen(NotesCase):
	def an_order(self, **changes):
		"""A note that holds no money, as the tests of the cancel make theirs."""
		order = self.save(**changes)
		frappe.db.set_value("Sales Invoice", order, "paid_amount", 0, update_modified=False)
		return order

	def cancel(self, order):
		with self.waiter():
			return restaurant_api.cancel_table_order(order)

	def test_cancelling_a_note_leaves_the_table_occupied_while_another_is_open(self):
		first = self.an_order()
		second = self.an_order(restaurant_note=2)

		self.cancel(first)

		self.assertFalse(frappe.db.exists("Sales Invoice", first))
		self.assertEqual(self.open_drafts(), [second])
		self.assertEqual(self.status_of_table(), "Occupied")
		self.assertEqual(frappe.db.get_value("Sales Invoice", second, "restaurant_table"), self.table_a)

	def test_cancelling_the_last_note_frees_the_table(self):
		first = self.an_order()
		second = self.an_order(restaurant_note=2)
		self.cancel(first)

		self.cancel(second)

		self.assertEqual(self.open_drafts(), [])
		self.assertEqual(self.status_of_table(), "Empty")

	def test_the_status_hook_keeps_the_table_occupied_while_another_note_is_open(self):
		first, second = self.two_notes()

		for docstatus in (1, 2):
			with self.subTest(docstatus=docstatus):
				frappe.db.set_value("Restaurant Table", self.table_a, "status", "Cleaning")
				restaurant_api.on_invoice_update(
					frappe._dict(name=first, restaurant_table=self.table_a, docstatus=docstatus), "on_submit"
				)
				self.assertEqual(self.status_of_table(), "Occupied")

	def test_the_status_hook_frees_the_table_when_the_note_that_leaves_is_the_last(self):
		order = self.save()

		restaurant_api.on_invoice_update(frappe._dict(name=order, restaurant_table=self.table_a, docstatus=1), "on_submit")
		self.assertEqual(self.status_of_table(), "Cleaning")

		frappe.db.set_value("Sales Invoice", order, "docstatus", 2)
		restaurant_api.on_invoice_update(frappe._dict(name=order, restaurant_table=self.table_a, docstatus=2), "on_cancel")
		self.assertEqual(self.status_of_table(), "Empty")

	def test_the_status_hook_of_a_draft_saved_seats_the_table(self):
		frappe.db.set_value("Restaurant Table", self.table_a2, "status", "Empty")
		order = self.save(restaurant_table=self.table_a2)
		frappe.db.set_value("Restaurant Table", self.table_a2, "status", "Empty")

		restaurant_api.on_invoice_update(frappe._dict(name=order, restaurant_table=self.table_a2, docstatus=0), "on_update")

		self.assertEqual(self.status_of_table(self.table_a2), "Occupied")

	def test_a_table_marked_for_cleaning_that_holds_an_open_note_is_not_freed(self):
		order = self.an_order()
		frappe.db.set_value("Restaurant Table", self.table_a, "status", "Cleaning")

		with self.waiter():
			restaurant_api.mark_table_available(self.table_a)

		self.assertEqual(self.status_of_table(), "Occupied", "a party was seated since: the table is theirs")
		self.assertEqual(frappe.db.get_value("Sales Invoice", order, "restaurant_table"), self.table_a)

	def test_freeing_the_tables_being_cleaned_leaves_the_one_that_holds_an_open_note(self):
		self.an_order()
		frappe.db.set_value("Restaurant Table", self.table_a, "status", "Cleaning")
		frappe.db.set_value("Restaurant Table", self.table_a2, "status", "Cleaning")

		with self.waiter():
			answer = restaurant_api.free_cleaning_tables(self.room_a, restaurant=self.a)

		self.assertEqual(answer["tables"], [self.table_a2])
		self.assertEqual(answer["freed"], 1)
		self.assertEqual(self.status_of_table(), "Occupied")
		self.assertEqual(self.status_of_table(self.table_a2), "Empty")

	def test_a_table_is_emptied_only_when_no_open_note_remains(self):
		first, second = self.two_notes()
		code = frappe.get_doc(
			{"doctype": "Guest Order Token", "mode": "restaurant", "table": self.table_a, "pos_profile": self.fx.profile}
		).insert(ignore_permissions=True)
		# The code has served the second note, as the link a guest's first order leaves on it
		frappe.db.set_value("Guest Order Token", code.name, "invoice", second)
		frappe.db.set_value("Sales Invoice", first, "docstatus", 2)

		restaurant_api.on_invoice_update(frappe._dict(name=first, restaurant_table=self.table_a, docstatus=2), "on_cancel")

		self.assertEqual(self.status_of_table(), "Occupied")
		self.assertEqual(frappe.db.get_value("Guest Order Token", code.name, "status"), "Active")

		frappe.db.set_value("Sales Invoice", second, "docstatus", 2)
		restaurant_api.on_invoice_update(frappe._dict(name=second, restaurant_table=self.table_a, docstatus=2), "on_cancel")

		self.assertEqual(self.status_of_table(), "Empty")
		self.assertEqual(frappe.db.get_value("Guest Order Token", code.name, "status"), "Expired")


class TestNamingAPartyFromTheTable(NotesCase):
	def setUp(self):
		super().setUp()
		self.order = self.save(restaurant_note_name="Dupont")

	def set_name(self, name, order=...):
		"""The waiter names the party of the order (the setUp's unless another is named, whatever it is: None and "" included)."""
		with self.waiter():
			return restaurant_api.set_table_note_name(self.order if order is ... else order, name)

	def test_it_writes_the_name_and_says_it(self):
		self.assertEqual(self.set_name("Martin"), {"note_name": "Martin"})

		self.assertEqual(self.party_of(self.order), "Martin")

	def test_it_cleans_the_name_as_the_save_does(self):
		self.assertEqual(self.set_name("  Les   deux\ncouples "), {"note_name": "Les deux couples"})
		self.assertEqual(self.set_name("x" * 100), {"note_name": "x" * notes.MAX_NAME_CHARS})
		self.assertEqual(self.set_name("<b>Martin</b>"), {"note_name": "Martin"})

	def test_nothing_an_empty_text_and_white_space_clear_the_name(self):
		for none in (None, "", "   "):
			with self.subTest(sent=none):
				self.set_name("Martin")

				self.assertEqual(self.set_name(none), {"note_name": None})
				self.assertIsNone(self.party_of(self.order))

	def test_a_name_that_is_no_text_is_refused_and_the_stored_one_stays(self):
		for sent in (5, ["Martin"], {"name": "Martin"}):
			with self.subTest(sent=sent), self.assertRaises(frappe.ValidationError):
				self.set_name(sent)
			self.assertEqual(self.party_of(self.order), "Dupont")

	def test_only_the_order_it_names_is_renamed(self):
		other = self.save(restaurant_note=2, restaurant_note_name="Martin")

		self.set_name("Durand")

		self.assertEqual((self.party_of(self.order), self.party_of(other)), ("Durand", "Martin"))

	def test_the_order_is_not_touched_otherwise(self):
		"""Naming the party is no change of the order the kitchen should read as new: its modification time and its lines stay."""
		before = frappe.db.get_value("Sales Invoice", self.order, "modified")
		lines = self.lines_of(self.order)

		self.set_name("Martin")

		self.assertEqual(frappe.db.get_value("Sales Invoice", self.order, "modified"), before)
		self.assertEqual(self.lines_of(self.order), lines)

	def test_the_name_is_what_the_screens_read_back(self):
		self.set_name("Martin")

		self.assertEqual(self.opened()["note_name"], "Martin")
		self.assertEqual(self.order_of()["note_name"], "Martin")
		self.assertEqual(self.floor()[self.table_a]["order_summary"]["note_names"], ["Martin"])
		self.assertEqual(self.kitchen_order(self.order)["note_name"], "Martin")

	def test_a_submitted_order_has_no_party_to_name(self):
		frappe.db.set_value("Sales Invoice", self.order, "docstatus", 1, update_modified=False)

		with self.assertRaises(frappe.ValidationError):
			self.set_name("Martin")

		self.assertEqual(self.party_of(self.order), "Dupont")

	def test_an_order_that_sits_at_no_table_has_no_party_to_name(self):
		for changes in (
			{"restaurant_table": None},
			{"restaurant_table": None, "is_takeaway": 1, "takeaway_number": "T-001"},
		):
			with self.subTest(changes=changes):
				order = self.save(**changes)
				with self.assertRaises(frappe.ValidationError):
					self.set_name("Martin", order)
				self.assertIsNone(self.party_of(order))

	def test_a_name_nobody_knows_is_not_found(self):
		for name in ("_Test Notes no such invoice", "", None):
			with (
				self.subTest(name=name),
				self.assertRaises((frappe.DoesNotExistError, frappe.ValidationError)),
			):
				self.set_name("Martin", name)

	def test_a_value_that_is_no_name_is_refused_and_touches_nothing(self):
		with self.assertRaises((frappe.DoesNotExistError, frappe.ValidationError, frappe.PermissionError)):
			self.set_name("Martin", {"name": self.order})

		self.assertEqual(self.party_of(self.order), "Dupont")

	def test_it_tells_the_screens_after_it_commits(self):
		with (
			patch.object(frappe, "publish_realtime") as publish,
			patch.object(frappe.db, "commit") as commit,
		):
			self.set_name("Martin")

		self.assertEqual(commit.call_count, 1)
		self.assertEqual({call.args[0] for call in publish.call_args_list}, {"kds_update", "table_update"})

	def test_a_refusal_tells_no_screen_and_commits_nothing(self):
		with (
			patch.object(frappe, "publish_realtime") as publish,
			patch.object(frappe.db, "commit") as commit,
			self.assertRaises(frappe.ValidationError),
		):
			self.set_name(5)

		publish.assert_not_called()
		commit.assert_not_called()

	def test_it_waits_for_the_lock_a_save_of_the_till_takes_on_the_lines(self):
		with patch.object(service_families, "stored_lines", wraps=service_families.stored_lines) as read:
			self.set_name("Martin")

		read.assert_called_once()
		self.assertEqual(read.call_args.args[0], self.order)
		self.assertTrue(read.call_args.kwargs.get("lock"))

	def test_it_is_a_post_only_endpoint_the_web_serves_and_no_tablet_calls(self):
		self.assertIn(restaurant_api.set_table_note_name, frappe.whitelisted)
		self.assertEqual(
			list(frappe.allowed_http_methods_for_whitelisted_func[restaurant_api.set_table_note_name]), ["POST"]
		)
		self.assertNotIn("pos_next.api.restaurant.set_table_note_name", devices.TABLET_METHODS)


class TestWhoMayNameAParty(NotesCase):
	def setUp(self):
		super().setUp()
		self.order = self.save(restaurant_note_name="Dupont")

	def refused_to(self, user):
		with as_role(user), self.assertRaises(frappe.PermissionError):
			restaurant_api.set_table_note_name(self.order, "Martin")
		self.assertEqual(self.party_of(self.order), "Dupont")

	def test_the_waiter_of_the_till_may(self):
		with self.waiter():
			answer = restaurant_api.set_table_note_name(self.order, "Martin")

		self.assertEqual(answer, {"note_name": "Martin"})

	def test_a_till_manager_may_at_any_till(self):
		with as_role("till_manager"):
			answer = restaurant_api.set_table_note_name(self.order, "Durand")

		self.assertEqual(answer, {"note_name": "Durand"})

	def test_a_desk_account_that_works_at_no_till_is_refused(self):
		_user(OUTSIDER, ["Blogger"], "System User")

		self.refused_to(OUTSIDER)

	def test_a_portal_account_and_a_visitor_are_refused_before_anything_is_looked_up(self):
		_user(PORTAL, [CASHIER_ROLE], "Website User")
		for user in (PORTAL, "Guest"):
			with self.subTest(user=user):
				self.refused_to(user)
				with as_role(user), self.assertRaises(frappe.PermissionError):
					restaurant_api.set_table_note_name("_Test Notes no such invoice", "Martin")

	def test_a_till_of_another_restaurant_cannot_name_the_parties_of_this_one(self):
		self.make_till(self.fx.other_profile, self.b)

		with (
			self.at_the_till_of(self.fx.other_profile),
			self.waiter(),
			self.assertRaises(frappe.PermissionError),
		):
			restaurant_api.set_table_note_name(self.order, "Martin")

		self.assertEqual(self.party_of(self.order), "Dupont")


class TestAGuestOrderGoesToTheFirstNote(NotesCase):
	def setUp(self):
		super().setUp()
		frappe.db.set_value(
			"Restaurant", self.a, {"enable_qr_ordering": 1, "qr_order_validation": "Direct to Kitchen"}
		)
		self.on_the_guest_menu(self.a, self.cola)
		self.token = frappe.get_doc(
			{
				"doctype": "Guest Order Token",
				"mode": "restaurant",
				"table": self.table_a,
				"pos_profile": self.fx.profile,
			}
		).insert(ignore_permissions=True)
		self.addCleanup(frappe.set_user, frappe.session.user)

	def order(self, *codes):
		items = [{"item_code": code, "qty": 1, "rate": 5} for code in codes]
		frappe.set_user("Guest")
		try:
			return guest_ordering.submit_guest_order(self.token.token, json.dumps(items))
		finally:
			frappe.set_user("Administrator")

	def test_a_guest_order_attaches_to_the_lowest_note_whatever_was_saved_last(self):
		first, second = self.two_notes()

		answer = self.order(self.cola)

		self.assertEqual(answer["invoice"], first)
		self.assertEqual(self.items_of(first), [self.soup, self.cola])
		self.assertEqual(self.items_of(second), [self.penne])

	def test_a_guest_order_at_a_table_whose_first_note_is_paid_goes_to_the_next(self):
		first, second = self.two_notes()
		self.order(self.cola)
		self.pay(first, note=1)

		answer = self.order(self.cola)

		self.assertEqual(answer["invoice"], second)
		self.assertEqual(self.items_of(second), [self.penne, self.cola])

	def test_a_session_that_serves_a_note_keeps_it_when_another_note_is_opened(self):
		first = self.order(self.cola)["invoice"]
		second = self.save([self.line(self.penne)], restaurant_note=2)

		again = self.order(self.cola)

		self.assertEqual(again["invoice"], first)
		self.assertEqual(self.items_of(second), [self.penne])

	def test_a_table_with_no_order_gets_its_first_note_from_a_guest(self):
		answer = self.order(self.cola)

		self.assertEqual(self.rank_of(answer["invoice"]), 1)
		self.assertEqual(self.open_drafts(), [answer["invoice"]])

	def test_the_lowest_open_note_of_a_table_is_the_one_a_guest_is_given(self):
		first, _second = self.two_notes()
		table = self.table_a

		self.assertEqual(notes.lowest_open_note(table), first)
		self.assertIsNone(notes.lowest_open_note(self.table_a2))
		self.assertIsNone(notes.lowest_open_note(None))


class TestATableWithOneNoteIsAsBefore(NotesCase):
	def test_an_order_saved_before_the_notes_existed_answers_as_a_lone_note(self):
		order = self.save(restaurant_covers=3)
		frappe.db.set_value(
			"Sales Invoice", order, {"restaurant_note": 0, "restaurant_note_name": ""}, update_modified=False
		)

		opened = self.opened()

		self.assertTrue(OPEN_TABLE_BEFORE_THE_NOTES <= set(opened))
		self.assertEqual(set(opened) - OPEN_TABLE_BEFORE_THE_NOTES, THE_NOTES_KEYS)
		self.assertEqual((opened["name"], opened["note"], opened["note_name"], opened["covers"]), (order, 1, None, 3))
		self.assertEqual([row["note"] for row in opened["notes"]], [1])
		self.assertEqual(self.floor()[self.table_a]["order_summary"]["notes_count"], 1)
		card = self.kitchen_order(order)
		self.assertEqual((card["note"], card["notes_count"], card["table_label"]), (1, 1, "T1"))

	def test_the_save_of_the_till_that_knows_no_note_keeps_finding_the_tables_order(self):
		order = self.save()
		frappe.db.set_value("Sales Invoice", order, "restaurant_note", 0, update_modified=False)

		for _round in range(2):
			self.assertEqual(self.save([self.line(self.soup), self.line(self.salad)]), order)

		self.assertEqual(self.open_drafts(), [order])

	def test_a_table_with_no_order_answers_as_before(self):
		opened = self.opened(table=self.table_a2)

		self.assertEqual(
			{key: opened[key] for key in ("name", "items", "customer", "kds_status", "is_new", "covers")},
			{"name": None, "items": [], "customer": None, "kds_status": None, "is_new": True, "covers": None},
		)
		self.assertIsNone(self.order_of(table=self.table_a2))
		self.assertIsNone(self.floor()[self.table_a2]["order_summary"])

	def test_the_covers_of_a_lone_note_are_the_covers_of_the_table(self):
		self.save(restaurant_covers=4)

		self.assertEqual(self.floor()[self.table_a]["order_summary"]["covers"], 4)
		self.assertEqual(covers.read([self.open_drafts()[0]]), {self.open_drafts()[0]: 4})
