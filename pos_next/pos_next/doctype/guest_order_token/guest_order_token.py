#//// Neoffice — added file (no upstream equivalent). Upstream POSNext is a cashier-only retail POS:
#//// a guest never orders by himself. This doctype mints the one short-lived credential a QR
#//// self-ordering or takeaway guest ever holds — secrets.token_urlsafe(32) bound to a table and to
#//// a POS Opening Entry, so a token cannot outlive the shift that issued it (3939a848, 2026-03-28
#//// "QR self-ordering and takeaway web ordering"). expire() clears a dangling invoice link and
#//// sets ignore_validate on purpose: by the time the table is cleared the POS Opening may already
#//// be closed, and a LinkValidationError there would leave the token Active for ever (b96ddc17 +
#//// 70c81008). expire_tokens_for_table() is what the table-cleaning flow calls when a table goes
#//// back to Empty (07d0d493, 2026-03-29).
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
		self.flags.ignore_validate = True
		self.flags.ignore_version = True
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
