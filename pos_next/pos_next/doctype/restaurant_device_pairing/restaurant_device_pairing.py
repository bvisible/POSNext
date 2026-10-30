# //// Neoffice — added file (no upstream equivalent). A one-time code that pairs a tablet with the kitchen or the
# //// runner screen of a restaurant (NeoRestau lot 1, task 16). Only the SHA-256 hash of the code is kept: the code
# //// itself lives in the QR code the till shows, for five minutes, and is spent by the first tablet that redeems it
# //// (pos_next.restaurant.devices).
from frappe.model.document import Document


class RestaurantDevicePairing(Document):
	pass
