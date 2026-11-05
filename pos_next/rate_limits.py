# //// Neoffice — added file (no upstream equivalent).
"""`frappe.rate_limiter.rate_limit`, counted on the address nginx accepted the connection from.

Frappe counts `frappe.local.request_ip`, the FIRST entry of X-Forwarded-For. Where nginx appends to that
header (a customer's website domain) that entry is whatever the caller wrote, so a caller who writes a new
one at each call is never counted (neoffice-maintenance#2296). The last entry is nginx's on any vhost
(`devices.request_peer_ip`). Everything else is Frappe's, the key, the window and the refusal, so a limit
reads the same; only the method's own name stands for `form_dict.cmd`, which a caller of the v2 route writes
himself.
"""

from functools import wraps

import frappe
from frappe import _


def rate_limit_by_peer(limit, seconds, key=None):
	"""At most `limit` calls (a number, or a function that gives it) within `seconds`, per address;
	with `key`, per address and per value of that field. A call made inside the server is not counted."""

	def decorator(fn):
		@wraps(fn)
		def wrapper(*args, **kwargs):
			if getattr(frappe.local, "request", None):
				_count_the_call(fn, limit() if callable(limit) else limit, seconds, key)
			return fn(*args, **kwargs)

		wrapper.peer_limit = (limit, seconds)
		return wrapper

	return decorator


def _count_the_call(fn, limit, seconds, key):
	from pos_next.restaurant.devices import request_peer_ip

	identity = request_peer_ip() or "unknown"
	if key:
		identity = f"{identity}:{frappe.form_dict.get(key, '')}"
	cache_key = frappe.cache.make_key(f"rl:{fn.__module__}.{fn.__name__}:{identity}")
	if not frappe.cache.get(cache_key):
		frappe.cache.setex(cache_key, seconds, 0)
	if frappe.cache.incrby(cache_key, 1) > limit:
		frappe.throw(
			_("You hit the rate limit because of too many requests. Please try after sometime."),
			frappe.RateLimitExceededError,
		)
