# //// Neoffice — added file (no upstream equivalent). When the web takeaway of a restaurant takes orders (neoffice-maintenance#2484,
# //// product owner, 10.11.2026). Nothing closed it before: the /pos/order page served the takeaway card, or the guest card as a fallback,
# //// and took orders day and night, the opening hours only choosing which card it showed. A restaurant now says, in its settings, when the
# //// page takes orders: always (what it did, the default), by its opening hours, or at fixed hours on chosen days, with a margin after the
# //// opening and before the closing.
"""When a restaurant's web takeaway takes a new order.

- « Always » (`ALWAYS`, the default, and whatever a site not migrated yet reads): at any time.
- « By the opening hours » (`OPENING_HOURS`): the rows of the restaurant's opening hours, those of its takeaway card when the card has
  some, else all of them. A row is read on its own weekday, as the opening hours always are (`api.restaurant._cards_of_the_hours`): one
  that ends before it starts (22:00 to 02:00) covers that day from its start to midnight and from midnight to its end. A row without a
  start or an end is left out; midnight is an hour like another (a Time of 00:00 comes back as a zero timedelta, which reads as false:
  it is tested against None, not for truth). A restaurant without any hours takes no takeaway order.
- « Fixed hours » (`FIXED_HOURS`): from `takeaway_open_from` to `takeaway_open_to` on the days of `takeaway_days` (none ticked: every
  day), read the same way.

`takeaway_first_order_after` minutes after each opening and `takeaway_last_order_before` minutes before each closing, no new order is
taken (the kitchen gets ready, the last orders are cooked before it closes). Only a NEW order is refused: an order already sent is paid,
and the page that comes back from the payment goes through, whatever the time.
"""

from datetime import datetime, time, timedelta

import frappe
from frappe import _
from frappe.utils import cint, get_time, now_datetime

ALWAYS = "Always"
OPENING_HOURS = "Opening Hours"
FIXED_HOURS = "Fixed Hours"
MODES = (ALWAYS, OPENING_HOURS, FIXED_HOURS)
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
# The minutes of a day
DAY = 24 * 60
# How far ahead the page looks for the next opening it names
LOOKAHEAD_DAYS = 7


def mode_of(settings) -> str:
	"""The rule of the restaurant: « Always » unless it chose another (an empty or unknown value is « Always »)."""
	mode = (settings or {}).get("takeaway_hours")
	return mode if mode in MODES else ALWAYS


def _minutes(value) -> int:
	"""A Time as the minutes of its day (a Time comes back from the database as a timedelta)."""
	moment = get_time(str(value))
	return moment.hour * 60 + moment.minute


def _margins(settings) -> tuple[int, int]:
	return max(cint(settings.get("takeaway_first_order_after")), 0), max(
		cint(settings.get("takeaway_last_order_before")), 0
	)


def periods(settings, weekday: str) -> list[tuple[int, int]]:
	"""The periods (start, end), in minutes of the day, the rule of the restaurant gives `weekday`; an end before its start runs
	past midnight."""
	mode = mode_of(settings)
	if mode == FIXED_HOURS:
		days = {
			row.get("day_of_week") for row in settings.get("takeaway_days") or [] if row.get("day_of_week")
		}
		if days and weekday not in days:
			return []
		start, end = settings.get("takeaway_open_from"), settings.get("takeaway_open_to")
		if start in (None, "") or end in (None, ""):
			return []
		return [(_minutes(start), _minutes(end))]
	if mode == OPENING_HOURS:
		rows = [
			row
			for row in settings.get("opening_hours") or []
			if row.get("from_time") not in (None, "") and row.get("to_time") not in (None, "")
		]
		card = settings.get("takeaway_menu")
		own = [row for row in rows if card and row.get("restaurant_card") == card]
		return [
			(_minutes(row.get("from_time")), _minutes(row.get("to_time")))
			for row in own or rows
			if row.get("day_of_week") == weekday
		]
	return []


def _takes_orders_in(period, minute, first, last) -> bool:
	start, end = period
	opens, closes = start + first, end - last
	if start <= end:
		return opens <= minute <= closes
	# Past midnight, read on its own weekday: from its start to midnight, and from midnight to its end
	return (opens < DAY and minute >= opens) or (closes >= 0 and minute <= closes)


def takes_orders(settings, at: datetime | None = None) -> bool:
	"""Whether the restaurant's web takeaway takes a new order at `at` (now, on the site's clock, by default)."""
	if mode_of(settings) == ALWAYS:
		return True
	at = at or now_datetime()
	minute = at.hour * 60 + at.minute
	first, last = _margins(settings)
	return any(
		_takes_orders_in(period, minute, first, last) for period in periods(settings, WEEKDAYS[at.weekday()])
	)


def next_opening(settings, at: datetime | None = None) -> datetime | None:
	"""The next moment after `at` the web takeaway takes orders again, within a week; None when it never does."""
	if mode_of(settings) == ALWAYS:
		return None
	at = at or now_datetime()
	first, last = _margins(settings)
	for offset in range(LOOKAHEAD_DAYS + 1):
		day = (at + timedelta(days=offset)).date()
		starts = set()
		for start, end in periods(settings, WEEKDAYS[day.weekday()]):
			opens, closes = start + first, end - last
			if start <= end:
				if opens <= closes:
					starts.add(opens)
				continue
			if closes >= 0:
				# The part of the day before its end: from midnight
				starts.add(0)
			if opens < DAY:
				starts.add(opens)
		for minute in sorted(starts):
			moment = datetime.combine(day, time()) + timedelta(minutes=minute)
			if moment > at:
				return moment
	return None


# One sentence per weekday: a translation writes the day as its language does (« lundi » in French, « Montag » in German)
_OPENS_ON = {
	"Monday": lambda hour: _("They open again on Monday at {0}.").format(hour),
	"Tuesday": lambda hour: _("They open again on Tuesday at {0}.").format(hour),
	"Wednesday": lambda hour: _("They open again on Wednesday at {0}.").format(hour),
	"Thursday": lambda hour: _("They open again on Thursday at {0}.").format(hour),
	"Friday": lambda hour: _("They open again on Friday at {0}.").format(hour),
	"Saturday": lambda hour: _("They open again on Saturday at {0}.").format(hour),
	"Sunday": lambda hour: _("They open again on Sunday at {0}.").format(hour),
}


def closed_message(settings, at: datetime | None = None) -> str:
	"""What the page tells a customer while no order is taken: closed, and when it opens again."""
	at = at or now_datetime()
	closed = _("Online takeaway orders are closed right now.")
	moment = next_opening(settings, at)
	if not moment:
		return closed
	hour = moment.strftime("%H:%M")
	if moment.date() == at.date():
		return f"{closed} {_('They open again today at {0}.').format(hour)}"
	if moment.date() == (at + timedelta(days=1)).date():
		return f"{closed} {_('They open again tomorrow at {0}.').format(hour)}"
	return f"{closed} {_OPENS_ON[WEEKDAYS[moment.weekday()]](hour)}"


def require_taking_orders(settings):
	"""Refuse a new takeaway order, or a new takeaway session, while the restaurant takes none."""
	if not takes_orders(settings):
		frappe.throw(closed_message(settings), title=_("Closed"))
