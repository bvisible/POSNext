# Copyright (c) 2026, Neoffice and contributors
# License: AGPL-3.0

import json

import frappe
from frappe import _
from frappe.model.document import Document


class POSPaymentDriverMapping(Document):
	"""Maps a (POS Profile, Mode of Payment) pair to a Payment Driver.

	One record per couple. Stored in POSNext (not in `payments/`) because it's
	POS-domain configuration. The Payments app stays PSP-agnostic.
	"""

	def validate(self):
		self._validate_uniqueness()
		self._validate_options_json()
		self._validate_device_binding()

	def _validate_uniqueness(self):
		existing = frappe.db.exists(
			"POS Payment Driver Mapping",
			{
				"pos_profile": self.pos_profile,
				"mode_of_payment": self.mode_of_payment,
				"name": ("!=", self.name),
			},
		)
		if existing:
			frappe.throw(
				_("A mapping already exists for {0} × {1}: {2}").format(
					self.pos_profile, self.mode_of_payment, existing
				)
			)

	def _validate_options_json(self):
		if not self.options_json:
			return
		try:
			value = json.loads(self.options_json)
		except (ValueError, TypeError) as exc:
			frappe.throw(_("Driver Options JSON is invalid: {0}").format(str(exc)))
		if not isinstance(value, dict):
			frappe.throw(_("Driver Options JSON must be a JSON object (dict)"))

	def _validate_device_binding(self):
		# If a default_device is set, ensure it points at the same provider/channel.
		if not self.default_device:
			return
		dev_binding = frappe.db.get_value(
			"Payment Device", self.default_device, "provider_channel_settings"
		)
		if not dev_binding:
			return
		dev_provider, dev_channel = frappe.db.get_value(
			"Provider Channel Settings", dev_binding, ["provider", "channel"]
		) or (None, None)
		if dev_provider != self.provider or dev_channel != self.channel:
			frappe.throw(
				_(
					"Default Payment Device {0} is bound to ({1}, {2}) which does not match this mapping ({3}, {4})."
				).format(self.default_device, dev_provider, dev_channel, self.provider, self.channel)
			)

	def get_options(self) -> dict:
		if not self.options_json:
			return {}
		try:
			return json.loads(self.options_json)
		except (ValueError, TypeError):
			return {}
