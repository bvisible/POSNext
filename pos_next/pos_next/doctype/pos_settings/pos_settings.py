# Copyright (c) 2025, Youssef Restom and contributors
# For license information, please see license.txt

import frappe

# //// Neoffice — `_` added at module level: the settings validations below were bare English strings.
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt


class POSSettings(Document):
	def validate(self):
		"""Validate POS Settings"""
		# Guard against None values and validate discount percentage
		# //// Neoffice — upstream passed these validation and notification texts to frappe.throw /
		# //// frappe.msgprint as bare strings, which Frappe does not translate: they stayed English whatever
		# //// the user language. They go through _() (adjacent literals are joined before the lookup).
		max_discount = flt(self.max_discount_allowed)
		if max_discount < 0 or max_discount > 100:
			frappe.throw(_("Max Discount Allowed must be between 0 and 100"))

		# Guard against None values and validate search limit
		if self.use_limit_search:
			search_limit = cint(self.search_limit)
			if search_limit <= 0:
				# //// Neoffice — fix(i18n): translate validation messages, composed templates and the receipt footer (5a6f5a99, 2026-10-04).
				frappe.throw(_("Search Limit must be greater than 0"))

		# Validate use_exact_amount cannot be enabled with credit sale or partial payment
		if cint(self.use_exact_amount):
			if cint(self.allow_credit_sale):
				frappe.throw(
					# //// Neoffice — fix(i18n): translate validation messages, composed templates and the
					# //// receipt footer (5a6f5a99, 2026-10-04): the message goes through _().
					_(
						"'Use Exact Amount for Non-Cash' cannot be enabled together with 'Allow Credit Sale'. "
						"Please disable Credit Sale first."
					)
				)
			if cint(self.allow_partial_payment):
				frappe.throw(
					# //// Neoffice — fix(i18n): translate validation messages, composed templates and the
					# //// receipt footer (5a6f5a99, 2026-10-04): the message goes through _().
					_(
						"'Use Exact Amount for Non-Cash' cannot be enabled together with 'Allow Partial Payment'. "
						"Please disable Partial Payment first."
					)
				)

	def on_update(self):
		"""Sync allow_negative_stock with Stock Settings"""
		self.sync_negative_stock_setting()

	def sync_negative_stock_setting(self):
		"""
		Synchronize allow_negative_stock with Stock Settings.

		When enabled in POS Settings, it enables the global Stock Settings.
		When disabled, it only disables global Stock Settings if no other
		POS Settings have it enabled.

		Note: Runs in the same transaction as the save, no manual commits.
		"""
		current_stock_setting = cint(
			frappe.db.get_single_value("Stock Settings", "allow_negative_stock") or 0
		)

		if cint(self.allow_negative_stock):
			# Enable Stock Settings if not already enabled
			if not current_stock_setting:
				frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1, update_modified=False)
				# //// Neoffice — bare English string, see validate(); goes through _().
				frappe.msgprint(
					_("Stock Settings 'Allow Negative Stock' has been automatically enabled."),
					indicator="green",
					alert=True,
				)
		else:
			# Only disable if no other enabled POS Settings have it enabled
			if current_stock_setting:
				# Use count for better performance and clarity
				other_enabled_count = frappe.db.count(
					"POS Settings",
					{
						"allow_negative_stock": 1,
						"enabled": 1,  # Only check enabled POS Settings
						"name": ["!=", self.name],
					},
				)

				if other_enabled_count == 0:
					frappe.db.set_single_value(
						"Stock Settings", "allow_negative_stock", 0, update_modified=False
					)
					# //// Neoffice — bare English string, see validate(); goes through _().
					frappe.msgprint(
						_("Stock Settings 'Allow Negative Stock' has been automatically disabled."),
						indicator="orange",
						alert=True,
					)


@frappe.whitelist()
def get_pos_settings(pos_profile):
	"""
	Get POS Settings for a specific POS Profile.

	Also injects the current global Stock Settings value to show the actual
	source of truth, preventing confusion when the checkbox appears enabled
	but the global setting was changed elsewhere.
	"""
	from frappe import _

	if not pos_profile:
		return None

	# Check if user has access to this POS Profile
	has_access = frappe.db.exists("POS Profile User", {"parent": pos_profile, "user": frappe.session.user})

	if not has_access and not frappe.has_permission("POS Settings", "read"):
		frappe.throw(_("You don't have access to this POS Profile"))

	settings = frappe.db.get_value("POS Settings", {"pos_profile": pos_profile}, "*", as_dict=True)

	# If no settings exist, create default settings
	if not settings:
		settings = create_default_settings(pos_profile)

	# Inject the current global Stock Settings value for transparency
	# This helps UI reflect the actual state even if multiple POS Settings exist
	settings["_global_allow_negative_stock"] = cint(
		frappe.db.get_single_value("Stock Settings", "allow_negative_stock") or 0
	)

	# //// Neoffice — derived from the POS Profile, as bootstrap._get_pos_settings already does. The
	# //// till falls back to this endpoint when a shift is opened on its page (the bootstrap knew no
	# //// profile at load), and without these two keys its store kept its defaults: rounding off
	# //// (disable_rounded_total: 1), so a whole CHF session charged 26.91 instead of 26.90 and its
	# //// returns refunded 0.01 (neoffice-maintenance#1157). Remove if upstream returns them here.
	profile = frappe.get_cached_doc("POS Profile", pos_profile)
	settings["disable_rounded_total"] = cint(profile.disable_rounded_total)
	settings["allow_write_off_change"] = (
		1 if (profile.write_off_account and flt(profile.write_off_limit) > 0) else 0
	)

	return settings


def create_default_settings(pos_profile):
	"""Create default POS Settings for a POS Profile"""
	doc = frappe.new_doc("POS Settings")
	doc.pos_profile = pos_profile
	doc.enabled = 1
	doc.insert()

	return doc.as_dict()


@frappe.whitelist()
def update_pos_settings(pos_profile, settings):
	"""Update POS Settings for a POS Profile"""
	import json

	from frappe import _

	if isinstance(settings, str):
		settings = json.loads(settings)

	# Check if user has access to this POS Profile
	has_access = frappe.db.exists("POS Profile User", {"parent": pos_profile, "user": frappe.session.user})

	if not has_access and not frappe.has_permission("POS Settings", "write"):
		frappe.throw(_("You don't have permission to update this POS Profile"))

	# Check if settings exist
	existing = frappe.db.exists("POS Settings", {"pos_profile": pos_profile})

	if existing:
		doc = frappe.get_doc("POS Settings", existing)
		# //// Neoffice — the settings payload comes from the SPA and carries the document's own
		# //// metadata (name, modified, owner…). Feeding `modified` back into doc.update() made
		# //// Frappe compare it against the row and raise TimestampMismatchError on an ordinary
		# //// save, so those keys are dropped (d646953c, 2026-03-23).
		# //// prevent TimestampMismatchError when saving POS Settings — d646953
		# Exclude internal fields that could cause timestamp mismatch
		safe_settings = {
			k: v
			for k, v in settings.items()
			if k not in ("name", "modified", "creation", "owner", "doctype", "docstatus", "idx")
		}
		doc.update(safe_settings)
		doc.save()
	else:
		doc = frappe.new_doc("POS Settings")
		doc.pos_profile = pos_profile
		doc.update(settings)
		doc.insert()

	return doc.as_dict()
