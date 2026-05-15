# Copyright (c) 2026, Neoffice and contributors
# License: AGPL-3.0

from frappe.model.document import Document


class POSProfilePaymentDevice(Document):
	"""Child table on POS Profile: which Payment Devices (terminals) are active
	on this profile. The cashier-facing terminal selector intersects this list
	with `Payment Device.enabled=1` and the mapping's provider/channel.
	"""

	pass
