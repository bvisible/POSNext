# //// Neoffice — added file (no upstream equivalent). The note of a closed day at the till (NeoSalon, voie 4, 19.11.2026, neoffice-maintenance#3160): the holiday list names its
# //// weekly-off rows after the weekday, in its own language (« Sunday » under a French till), so the till does not say it; a holiday, a closure and other hours keep their note.
from frappe.tests.utils import FrappeTestCase

from pos_next.api import appointments


class TestAWeeklyDayOffHasNoNote(FrappeTestCase):
	def test_the_calendar_of_the_business_keeps_the_note_of_a_holiday_a_closure_and_other_hours_not_of_a_weekly_day_off(
		self,
	):
		rows = [
			{"day": "2026-11-26", "state": "closed", "reason": "holiday", "label": "Thanksgiving"},
			{"day": "2026-11-27", "state": "closed", "reason": "closure", "label": "Inventory"},
			{
				"day": "2026-11-28",
				"state": "special",
				"reason": "special_hours",
				"label": "Late opening",
				"periods": [["10:00", "14:00"]],
			},
			{"day": "2026-11-29", "state": "closed", "reason": "weekly_off", "label": "Sunday"},
		]

		cleaned = {row["day"]: appointments._calendar_day(row) for row in rows}

		self.assertEqual(cleaned["2026-11-26"]["label"], "Thanksgiving")
		self.assertEqual(cleaned["2026-11-27"]["label"], "Inventory")
		self.assertEqual(cleaned["2026-11-28"]["label"], "Late opening")
		self.assertIsNone(cleaned["2026-11-29"]["label"])
		self.assertEqual(
			cleaned["2026-11-29"]["reason"], "weekly_off", "the reason stays: it is what the till says"
		)

	def test_the_banner_of_the_day_does_the_same(self):
		def banner(reason, label):
			return appointments._salon({"salon": {"state": "closed", "reason": reason, "label": label}})

		self.assertIsNone(banner("weekly_off", "Dimanche")["label"])
		self.assertEqual(banner("weekly_off", "Dimanche")["reason"], "weekly_off")
		self.assertEqual(banner("holiday", "Ascension")["label"], "Ascension")
		self.assertEqual(banner("closure", "Inventory")["label"], "Inventory")
		self.assertIsNone(banner("closure", "")["label"])
