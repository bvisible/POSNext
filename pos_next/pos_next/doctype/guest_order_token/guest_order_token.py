# Copyright (c) 2026, BrainWise and contributors
# For license information, please see license.txt

import secrets
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class GuestOrderToken(Document):
	def before_insert(self):
		# Generate a cryptographically secure random token
		self.token = secrets.token_urlsafe(32)
		self.created_by_user = frappe.session.user

	def validate(self):
		# Ensure the linked POS Opening is still open
		if self.pos_opening:
			opening_status = frappe.db.get_value("POS Opening Entry", self.pos_opening, "status")
			if opening_status and opening_status != "Open":
				frappe.throw(_("The POS Opening Entry {0} is no longer open.").format(self.pos_opening))

	def is_valid(self):
		"""Check whether this token is still usable for ordering."""
		if self.status != "Active":
			return False

		# Check time-based expiry
		if self.expires_at:
			if now_datetime() > self.expires_at:
				return False

		# Check that the linked POS Opening is still open
		if self.pos_opening:
			opening_status = frappe.db.get_value("POS Opening Entry", self.pos_opening, "status")
			if opening_status != "Open":
				return False

		return True

	def expire(self):
		"""Mark this token as Expired."""
		# Clear invoice link if it no longer exists (prevents LinkValidationError)
		if self.invoice and not frappe.db.exists("Sales Invoice", self.invoice):
			self.invoice = None
		self.status = "Expired"
		self.save(ignore_permissions=True)

	@staticmethod
	def expire_tokens_for_table(table_name):
		"""Expire all active tokens linked to a specific table."""
		active_tokens = frappe.get_all(
			"Guest Order Token",
			filters={"table": table_name, "status": "Active"},
			pluck="name",
		)
		for token_name in active_tokens:
			token_doc = frappe.get_doc("Guest Order Token", token_name)
			token_doc.expire()
