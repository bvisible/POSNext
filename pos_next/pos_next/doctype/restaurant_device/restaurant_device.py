# //// Neoffice — added file (no upstream equivalent). A tablet of a restaurant (NeoRestau lot 1, task 16): the
# //// kitchen's or the runner's screen, opened with an account of its own after a manager showed a QR code at the
# //// till. The row is the binding the kitchen's and the runner's endpoints accept that account by
# //// (pos_next.restaurant.devices); it is written by the pairing endpoints only, never from the desk.
import frappe
from frappe import _
from frappe.model.document import Document


class RestaurantDevice(Document):
	def validate(self):
		# The account of a tablet never changes: rebinding a row would hand the kitchen's screens to another account
		if not self.is_new() and self.has_value_changed("user"):
			frappe.throw(_("The account of a tablet cannot be changed"), frappe.PermissionError)

	def on_trash(self):
		"""A tablet removed for good: its sessions end, its account is disabled, its spent codes go with it."""
		from pos_next.restaurant import devices

		if self.user and frappe.db.exists("User", self.user):
			devices.end_sessions(self.user, _("Tablet removed"))
			frappe.db.set_value("User", self.user, "enabled", 0, update_modified=False)
			frappe.clear_cache(user=self.user)
		frappe.db.delete(devices.PAIRING, {"device": self.name})
