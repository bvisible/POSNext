#//// Neoffice — added file (no upstream equivalent). A Swiss checkout runs several card readers and
#//// TWINT side by side; upstream has no notion of a terminal at all. This child table declares
#//// which (Mode of Payment, Payment Device) pairs are live on a POS Profile, so the cashier picks
#//// the reader when charging instead of the mapping forcing its default one (958a2264, 2026-05-15
#//// "defer terminal payment start until cashier picks amount + device"; the Mode of Payment
#//// binding and the optional device — TWINT QR has no terminal — 2b6b45de, 2026-05-16).
# Copyright (c) 2026, Neoffice and contributors
# License: AGPL-3.0

import frappe
from frappe import _
from frappe.model.document import Document


class POSProfilePaymentDevice(Document):
	"""Child table on POS Profile: which (Mode of Payment, Payment Device) pairs
	are active on this profile. The cashier-facing picker filters this list by
	the Mode of Payment being charged, then by `Payment Device.enabled=1` and
	the driver mapping's provider/channel.

	One Mode of Payment can have multiple rows (e.g. two card readers at the
	same checkout) — the cashier picks at runtime. A row may have NO
	payment_device for channels without a physical terminal (TWINT QR).
	"""

	def validate(self):
		# A row must reference a real, terminal-driven Mode of Payment.
		if not self.mode_of_payment:
			frappe.throw(_("Mode of Payment is required on Active Payment Methods rows."))

		# For channels with a physical device (terminal), require payment_device.
		# We look up the channel via POS Payment Driver Mapping when available.
		channel = None
		if self.parent and self.parenttype == "POS Profile":
			channel = frappe.db.get_value(
				"POS Payment Driver Mapping",
				{
					"pos_profile": self.parent,
					"mode_of_payment": self.mode_of_payment,
					"enabled": 1,
				},
				"channel",
			)

		if channel == "terminal" and not self.payment_device:
			frappe.throw(
				_("Mode of Payment {0} is routed to a terminal channel — "
				  "a Payment Device is required on this row.").format(self.mode_of_payment)
			)
