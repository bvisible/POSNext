# //// Neoffice — added file (no upstream equivalent).
"""The limit on starting a takeaway session is each visitor's, not the whole site's (neoffice-maintenance#2220).

`create_takeaway_token` is open to any visitor. Its docstring promised a limit per address, but it counted every takeaway
session visitors had started on the site in the hour and refused at 50: one visitor could start 50 and close takeaway
ordering for everybody for an hour, while no visitor was ever held under 50. The limit is now counted per address, by
Frappe's own rate limiter (the public menu's): a visitor past it is refused, the others are not.

The rate limiter only counts a real request: the test gives each call the request of a visitor at an address, and wipes
its counters (they live in the cache, which the suite does not roll back). The visitor acts as `Guest`.
"""

from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

import frappe

from pos_next.api import guest_ordering
from pos_next.tests.test_a_takeaway_order_goes_to_the_end import TakeawayCase

METHOD = "pos_next.api.guest_ordering.create_takeaway_token"
# The sessions a visitor may start in an hour (guest_ordering.TAKEAWAY_SESSIONS_PER_VISITOR)
LIMIT = 20
MISSING = object()


class TestTheTakeawaySessionLimitIsEachVisitors(TakeawayCase):
	def setUp(self):
		super().setUp()
		self.addresses = set()
		self.addCleanup(self.wipe_the_counters)

	def wipe_the_counters(self):
		for address in self.addresses:
			frappe.cache.delete_value(f"rl:{METHOD}:{address}")

	@contextmanager
	def a_visitor_at(self, address):
		"""The request of a visitor's page, from `address`, as the rate limiter reads it."""
		if address not in self.addresses:
			# A counter an interrupted run left behind is not this test's
			self.addresses.add(address)
			frappe.cache.delete_value(f"rl:{METHOD}:{address}")
		# Set and put back by hand: `patch.object` deletes an attribute of `frappe.local` on its way out (a werkzeug Local keeps
		# none in its __dict__), and the next session started reads `request_ip`
		kept = {name: getattr(frappe.local, name, MISSING) for name in ("request", "request_ip")}
		frappe.local.request = SimpleNamespace(method="POST", headers={})
		frappe.local.request_ip = address
		try:
			with patch.dict(frappe.local.form_dict, {"cmd": METHOD}):
				yield
		finally:
			for name, value in kept.items():
				if value is MISSING:
					delattr(frappe.local, name)
				else:
					setattr(frappe.local, name, value)

	def starts(self, address):
		with self.a_visitor_at(address):
			return self.as_guest(guest_ordering.create_takeaway_token)

	def test_a_visitor_past_the_limit_is_refused(self):
		for _ in range(LIMIT):
			self.assertTrue(self.starts("203.0.113.10")["token"])

		with self.assertRaises(frappe.RateLimitExceededError):
			self.starts("203.0.113.10")

	def test_another_visitor_is_not_refused_for_the_first(self):
		for _ in range(LIMIT):
			self.starts("203.0.113.11")

		self.assertTrue(self.starts("203.0.113.12")["token"])

	def test_the_visitors_together_go_past_what_the_whole_site_was_allowed(self):
		started = [self.starts(f"198.51.100.{n}")["token"] for n in range(1, 61)]

		self.assertEqual(len(set(started)), 60)
