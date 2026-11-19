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
		def team_of(hook, pos_profile, day, *more):
			# The site's calendar says nothing here: no closed day (see the tests of the closed days below)
			if hook == appointments.CALENDAR_HOOK:
				return None
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

	# A closed day has no free hour: the band reads the calendar of the site, as the banner of the day does (neoffice-maintenance#3161)

	def week_with(self, calendar, team=None):
		# The calendar answers for the period it is asked for, as the reservation's does: the days outside it are not in its answer
		self.calendar_asked = []

		def answer(hook, pos_profile, *when):
			if hook == appointments.CALENDAR_HOOK:
				self.calendar_asked.append(when)
				if isinstance(calendar, dict) and isinstance(calendar.get("days"), list):
					first, last = when
					return {**calendar, "days": [d for d in calendar["days"] if first <= d["day"] <= last]}
				return calendar
			return (
				team
				if team is not None
				else [{"user": "a", "periods": [["09:00", "17:00"]], "booked_minutes": 0}]
			)

		with (
			patch("pos_next.api.cash_entry.require_till_access"),
			patch.object(appointments, "appointments_enabled", return_value=True),
			patch.object(appointments, "site_has_appointments", return_value=True),
			patch.object(appointments, "_declared", return_value=["calendar.path"]),
			patch.object(appointments, "_first_answer", side_effect=answer),
		):
			return appointments.get_week("any-till", "2026-11-18")

	def test_a_day_the_calendar_says_is_closed_has_no_free_hour_and_says_why_whatever_the_team_works(self):
		week = self.week_with(
			{
				"days": [
					{"day": "2026-11-16", "state": "closed", "reason": "closure", "label": "Inventory"},
					{"day": "2026-11-22", "state": "closed", "reason": "weekly_off", "label": None},
				]
			}
		)

		self.assertEqual(
			self.calendar_asked,
			[("2026-11-16", "2026-11-22")],
			"the whole week, Monday to Sunday, asked once",
		)
		monday = week["days"][0]
		self.assertEqual(
			monday,
			{
				"date": "2026-11-16",
				"working": 0,
				"worked_minutes": 0,
				"free_minutes": 0,
				"closed": True,
				"reason": "closure",
				"label": "Inventory",
			},
		)
		self.assertEqual(week["days"][1]["free_minutes"], 480, "the other days are the team's, as before")
		self.assertNotIn("closed", week["days"][1])
		# the week runs Monday to Sunday: the last day is read too
		self.assertEqual(
			(
				week["days"][6]["date"],
				week["days"][6]["closed"],
				week["days"][6]["reason"],
				week["days"][6]["free_minutes"],
			),
			("2026-11-22", True, "weekly_off", 0),
		)

	def test_a_day_of_other_hours_is_not_closed(self):
		week = self.week_with(
			{
				"days": [
					{
						"day": "2026-11-17",
						"state": "special",
						"reason": "special_hours",
						"periods": [["09:00", "12:00"]],
					}
				]
			}
		)

		self.assertNotIn("closed", week["days"][1])
		self.assertEqual(week["days"][1]["free_minutes"], 480)

	def test_a_site_whose_calendar_says_nothing_or_breaks_has_the_week_it_had(self):
		for answer in (None, "a text", {"days": "not a list"}, {}):
			with self.subTest(answer=answer):
				week = self.week_with(answer)
				self.assertTrue(all("closed" not in day for day in week["days"]))
				self.assertEqual([d["free_minutes"] for d in week["days"]], [480] * 7)

	def test_a_site_with_no_calendar_hook_is_not_asked_for_one(self):
		asked = []

		def answer(hook, *args):
			asked.append(hook)
			return [{"user": "a", "periods": [["09:00", "17:00"]], "booked_minutes": 0}]

		with (
			patch("pos_next.api.cash_entry.require_till_access"),
			patch.object(appointments, "appointments_enabled", return_value=True),
			patch.object(appointments, "site_has_appointments", return_value=True),
			patch.object(appointments, "_declared", return_value=[]),
			patch.object(appointments, "_first_answer", side_effect=answer),
		):
			appointments.get_week("any-till", "2026-11-18")

		self.assertNotIn(appointments.CALENDAR_HOOK, asked)

	def test_a_closed_day_is_not_asked_for_its_team(self):
		teams = []

		def answer(hook, pos_profile, *when):
			if hook == appointments.CALENDAR_HOOK:
				return {
					"days": [{"day": "2026-11-16", "state": "closed", "reason": "holiday", "label": None}]
				}
			teams.append(when[0])
			return []

		with (
			patch("pos_next.api.cash_entry.require_till_access"),
			patch.object(appointments, "appointments_enabled", return_value=True),
			patch.object(appointments, "site_has_appointments", return_value=True),
			patch.object(appointments, "_declared", return_value=["calendar.path"]),
			patch.object(appointments, "_first_answer", side_effect=answer),
		):
			appointments.get_week("any-till", "2026-11-18")

		self.assertNotIn("2026-11-16", teams)
		self.assertEqual(len(teams), 6)
