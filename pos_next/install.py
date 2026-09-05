"""
Installation and Migration hooks for POS Next

This module relies on Frappe's fixture system for:
- Custom fields (custom_field.json)
- Roles (role.json)
- Custom DocPerm (custom_docperm.json)
- Print formats (print_format.json)

The fixtures are defined in hooks.py and synced automatically during install/migrate.
This module handles post-fixture tasks like setting defaults and clearing cache.
"""
import frappe
import logging
# //// Neoffice — imported for the v15 / v16 split: _has_native_coupon_code_field() decides whether
# //// this app must create the Sales Invoice `coupon_code` Custom Field itself. It cannot ship in
# //// the fixture JSON — Frappe's import_doc reads the whole file and ignores the hooks.py
# //// filters, so a v16 site aborted the migration (3571c411, 2026-02-18).
# //// remove coupon_code from JSON, create programmatically for v15 — 3571c41
from pos_next.hooks import _has_native_coupon_code_field

# Configure logger
logger = logging.getLogger(__name__)


def after_install():
	"""Hook that runs after app installation"""
	try:
		log_message("POS Next: Running post-install setup", level="info")

		# //// Neoffice — the Sales Invoice `coupon_code` Custom Field is created here instead of being
		# //// shipped in the fixture JSON: ERPNext v16 has the field natively and a fixture of the same
		# //// name collides on install. Drop this call once the fleet is on v16
		# //// (3571c411, 2026-02-18 "fix(fixtures): remove coupon_code from JSON, create
		# //// programmatically for v15").
		# Ensure coupon_code custom field exists on v15 (native on v16+)
		ensure_coupon_code_field()

		# Setup default print format for POS Profiles
		setup_default_print_format()

		# Clear cache to ensure changes take effect
		frappe.clear_cache()
		frappe.db.commit()

		log_message("POS Next: Installation completed successfully", level="success")
	except Exception as e:
		frappe.db.rollback()
		frappe.log_error(
			title="POS Next Installation Error",
			message=frappe.get_traceback()
		)
		log_message(f"POS Next: Installation error - {str(e)}", level="error")
		raise


def after_migrate():
	"""Hook that runs after bench migrate"""
	try:
		# //// Neoffice — ERPNext is in required_apps, so its doctype sync runs AFTER this app's
		# //// during `bench migrate` and its Single "POS Settings" lands on top of ours (non-
		# //// Single, holding the per-profile barcode_rules table). The reclaim belongs in
		# //// after_migrate and not in a one-shot patch, because the clobbering repeats at every
		# //// migrate (682184b0, 2026-07-09).
		# //// align w/ upstream weighted-barcode: reclaim POS Settings — 83cb95dc
		# Reclaim POS Settings if ERPNext re-imported its Single on top of ours.
		# Must run in after_migrate (not a one-shot patch) because ERPNext's
		# doctype sync runs after pos_next's during `bench migrate`.
		reclaim_pos_settings_doctype(quiet=True)

		# Ensure coupon_code custom field exists on v15 (native on v16+)
		ensure_coupon_code_field(quiet=True)

		# Setup default print format
		setup_default_print_format(quiet=True)

		# Clear cache
		frappe.clear_cache()
		frappe.db.commit()

		log_message("POS Next: Migration completed successfully", level="success")
	except Exception as e:
		frappe.db.rollback()
		frappe.log_error(
			title="POS Next Migration Error",
			message=frappe.get_traceback()
		)
		log_message(f"POS Next: Migration error - {str(e)}", level="error")
		raise


# //// Neoffice — added function, no upstream equivalent: upstream never had two apps fighting over
# //// this doctype. Idempotent by design — it exits untouched when "POS Settings" already belongs
# //// to the POS Next module, which is the state of every instance today (682184b0, 2026-07-09
# //// "align weighted-barcode resolver with upstream + dialog nextTick").
def reclaim_pos_settings_doctype(quiet=False):
	"""Reclaim the `POS Settings` DocType from ERPNext.

	ERPNext ships a Single `POS Settings` (module Accounts) with only
	`invoice_fields` and `pos_search_fields`. POS Next ships its own
	non-Single `POS Settings` (module POS Next) with per-profile config
	and a `barcode_rules` child table. Because ERPNext is in our
	`required_apps` its doctype sync runs after ours during `bench
	migrate`, so its JSON wins on disk unless we re-install our version
	after both apps have finished syncing.

	Runs from `after_migrate`. Idempotent: if the live doctype already
	belongs to POS Next (module == 'POS Next' and not Single), exits
	without touching anything.
	"""
	if not frappe.db.exists("DocType", "POS Settings"):
		if not quiet:
			log_message("POS Settings DocType missing, skipping reclaim", level="warning")
		return

	row = frappe.db.get_value("DocType", "POS Settings", ["module", "issingle"], as_dict=True)
	if row and row.module == "POS Next" and not row.issingle:
		if not quiet:
			log_message("POS Settings already owned by POS Next, nothing to reclaim", level="info")
		return

	if not quiet:
		log_message(
			f"Reclaiming POS Settings DocType (was module={row.module if row else '?'}, "
			f"issingle={row.issingle if row else '?'})",
			level="warning",
		)

	try:
		# Commit any open transaction first — DROP TABLE is DDL and would
		# otherwise trigger ImplicitCommitError under Frappe's safety check.
		frappe.db.commit()
		frappe.db.sql("DROP TABLE IF EXISTS `tabPOS Settings`")
		frappe.db.commit()
		frappe.db.sql("DELETE FROM `tabSingles` WHERE doctype = 'POS Settings'")
		frappe.db.sql("DELETE FROM `tabDocField` WHERE parent = 'POS Settings'")
		frappe.db.sql("DELETE FROM `tabDocPerm` WHERE parent = 'POS Settings'")
		frappe.db.sql("DELETE FROM `tabDocType` WHERE name = 'POS Settings'")
		frappe.db.commit()
		log_message("Dropped legacy POS Settings meta + table", level="info", indent=1)
	except Exception:
		frappe.log_error(
			title="POS Settings Reclaim Error",
			message="Failed to drop legacy POS Settings\n\n" + frappe.get_traceback(),
		)
		raise

	try:
		frappe.reload_doc("pos_next", "doctype", "pos_settings", force=True)
		frappe.reload_doc("pos_next", "doctype", "pos_barcode_rules", force=True)
		frappe.reload_doc("pos_next", "doctype", "pos_allowed_locale", force=True)
		frappe.db.commit()
	except Exception:
		frappe.log_error(
			title="POS Settings Reclaim Error",
			message="Failed to reload pos_next doctypes\n\n" + frappe.get_traceback(),
		)
		raise

	after = frappe.db.get_value("DocType", "POS Settings", ["module", "issingle"], as_dict=True)
	if not after or after.module != "POS Next" or after.issingle:
		frappe.log_error(
			title="POS Settings Reclaim Error",
			message=(
				f"Reclaim ran but doctype still wrong: {after}. "
				"ERPNext may be re-importing POS Settings later in the migration."
			),
		)
		log_message(f"Reclaim verification FAILED — doctype is now {after}", level="error")
		return

	if not quiet:
		log_message(
			f"POS Settings reclaimed (module={after.module}, issingle={after.issingle})",
			level="success",
		)


def ensure_coupon_code_field(quiet=False):
	"""Create coupon_code Custom Field on Sales Invoice for ERPNext v15 (not needed on v16+)."""
	if _has_native_coupon_code_field():
		if not quiet:
			log_message("ERPNext has native coupon_code on Sales Invoice, skipping custom field", level="info")
		return

	if frappe.db.exists("Custom Field", "Sales Invoice-coupon_code"):
		if not quiet:
			log_message("Custom Field Sales Invoice-coupon_code already exists", level="info")
		return

	if not quiet:
		log_message("Creating coupon_code Custom Field on Sales Invoice (ERPNext v15)", level="info")

	from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
	create_custom_fields({
		"Sales Invoice": [
			{
				"fieldname": "coupon_code",
				"fieldtype": "Link",
				"label": "Coupon Code",
				"options": "Coupon Code",
				"insert_after": "additional_discount_percentage",
				"no_copy": 1,
				"print_hide": 1,
				"description": "Coupon Code used for this invoice",
			}
		]
	})


# //// rebrand: rename POS Next to Neopos — 771950b
def setup_default_print_format(quiet=False):
	"""
	Set Neopos Receipt as default print format for POS Profiles if not already set.

	Args:
		quiet (bool): If True, suppress detailed logs
	"""
	try:
		# Check if the print format exists
		# //// Neoffice — the receipt print format is "Neopos Receipt": the fork is sold as Neopos, not
		# //// POS Next, and a Print Format's name IS its ID, so the string had to change here, in the
		# //// log message and in the value written onto every POS Profile below. Installs that already
		# //// carry the old document are renamed by patches/v2_0_0/rebrand_to_neopos.py
		# //// (771950bd, 2026-04-02 "rebrand: rename POS Next to Neopos").
		if not frappe.db.exists("Print Format", "Neopos Receipt"):
			if not quiet:
				log_message("Neopos Receipt print format not found, skipping default setup", level="warning")
			return

		# Get all POS Profiles without a print format
		pos_profiles = frappe.get_all(
			"POS Profile",
			filters={"print_format": ["in", ["", None]]},
			fields=["name"]
		)

		if pos_profiles:
			updated_count = 0
			for profile in pos_profiles:
				try:
					frappe.db.set_value(
						"POS Profile",
						profile.name,
						"print_format",
						# //// Neoffice — the "Neopos Receipt" rebrand; see the marker above (771950bd, 2026-04-02).
						"Neopos Receipt",
						update_modified=False
					)
					if not quiet:
						log_message(f"Set default print format for: {profile.name}", level="info", indent=1)
					updated_count += 1
				except Exception as e:
					log_message(f"Error updating POS Profile {profile.name}: {str(e)}", level="error", indent=1)

			if updated_count > 0 and not quiet:
				log_message(f"Updated {updated_count} POS Profile(s) with default print format", level="success")

	except Exception as e:
		log_message(f"Error setting up default print format: {str(e)}", level="error")
		frappe.log_error(
			title="Default Print Format Setup Error",
			message=frappe.get_traceback()
		)


def log_message(message, level="info", indent=0):
	"""
	Standardized logging function with consistent formatting.

	Args:
		message (str): The message to log
		level (str): Log level - info, success, warning, error
		indent (int): Indentation level (0, 1, 2, etc.)
	"""
	indent_str = "  " * indent

	prefixes = {
		"info": "[INFO]",
		"success": "[SUCCESS]",
		"warning": "[WARNING]",
		"error": "[ERROR]",
	}

	prefix = prefixes.get(level, "[INFO]")
	formatted_message = f"{indent_str}{prefix} {message}"

	# Print to console
	print(formatted_message)

	# Also log to frappe logger
	if level == "error":
		logger.error(message)
	elif level == "warning":
		logger.warning(message)
	else:
		logger.info(message)
