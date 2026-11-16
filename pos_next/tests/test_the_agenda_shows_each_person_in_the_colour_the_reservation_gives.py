# //// Neoffice — added file (no upstream equivalent).
"""The till's agenda shows a person in the colour the reservation gives her (NeoSalon B', 16.11.2026: the till and the planning of the desk show
her alike). The colour is the server's (`team.staff_today`, the colour chosen on her employee file, else one drawn from her name); the till's
answer carries it as it is, and nothing that is not a colour."""

from frappe.tests.utils import FrappeTestCase

from pos_next.api.appointments import _staff


class TestTheColourOfAPersonAtTheTill(FrappeTestCase):
	def row(self, **values):
		return {
			"user": "maya@example.com",
			"sales_person": "Maya",
			"state": "present",
			"periods": [["09:00", "17:00"]],
			**values,
		}

	def test_the_colour_the_reservation_gives_is_carried(self):
		self.assertEqual(_staff(self.row(color="#3A5572"))["color"], "#3A5572")

	def test_anything_that_is_not_a_colour_is_dropped(self):
		for value in ("red; background:url(x)", "#12345", "", None):
			with self.subTest(value=value):
				self.assertIsNone(_staff(self.row(color=value))["color"])
