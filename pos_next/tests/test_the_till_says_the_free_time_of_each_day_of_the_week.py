# //// Neoffice — added file (no upstream equivalent).
"""The week at the till (NeoSalon B', 16.11.2026, Jérémy: « vous avez de la place jeudi ? », answered in a second). The agenda stays a day, and
a band of the week says, for each day, how much time the team still has: what each person works that day (her hours, read as the reservation
reads them) less what is already booked, never below nothing."""

from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from pos_next.api import appointments


class TestTheWeekAtTheTill(FrappeTestCase):
	def test_the_free_time_of_a_day_is_what_the_team_works_less_what_is_booked(self):
		team = [
			{"user": "a", "periods": [["09:00", "12:00"], ["13:00", "17:00"]], "booked_minutes": 120},
			# booked beyond her hours: her day is full, never below nothing
			{"user": "b", "periods": [["09:00", "17:00"]], "booked_minutes": 600},
			# she does not work that day
			{"user": "c", "periods": [], "booked_minutes": 0},
		]

		self.assertEqual(
			appointments._free_of_the_day(team), {"working": 2, "worked_minutes": 900, "free_minutes": 300}
		)

	def test_the_week_runs_monday_to_sunday_and_says_each_day_s_free_time(self):
		def team_of(hook, pos_profile, day):
			# Thursday is full, Sunday nobody works, the other days one person free all day
			if day.endswith("-19"):
				return [{"user": "a", "periods": [["09:00", "17:00"]], "booked_minutes": 480}]
			if day.endswith("-22"):
				return []
			return [{"user": "a", "periods": [["09:00", "17:00"]], "booked_minutes": 0}]

		with (
			patch("pos_next.api.cash_entry.require_till_access"),
			patch.object(appointments, "appointments_enabled", return_value=True),
			patch.object(appointments, "site_has_appointments", return_value=True),
			patch.object(appointments, "_first_answer", side_effect=team_of),
		):
			week = appointments.get_week("any-till", "2026-11-18")

		self.assertTrue(week["available"])
		self.assertEqual(week["days"][0]["date"], "2026-11-16")
		self.assertEqual(len(week["days"]), 7)
		free = {d["date"][-2:]: d["free_minutes"] for d in week["days"]}
		self.assertEqual((free["16"], free["19"], free["22"]), (480, 0, 0))
		self.assertEqual(week["days"][6]["working"], 0)
