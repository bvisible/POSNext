# -*- coding: utf-8 -*-
# Copyright (c) 2024, POS Next and contributors
# For license information, please see license.txt

#//// Neoffice — `os` is imported for get_supported_locales(), which lists the languages by
#//// scanning locale/*.po. Upstream hard-coded a default set of {'ar', 'en'} and hid the rest,
#//// which is wrong for a fork whose translations are PO files (RULE: PO only, never CSV): an
#//// empty allowed_locales now means "every language actually shipped" (c081f418, 2026-01-12).
# //// show all languages when allowed_locales is empty — c081f41
import os
import frappe
from frappe import translate


@frappe.whitelist()
def get_app_translations():
	"""
	Get all translations for the current user's language.
	This is a wrapper around frappe.translate.get_all_translations
	since the original function is not whitelisted.

	Returns:
		dict: Translation dictionary {source: translated}
	"""
	lang = frappe.local.lang or "en"
	return translate.get_all_translations(lang)


@frappe.whitelist()
def get_user_language():
	"""
	Get the language preference for the current user.

	Returns:
		dict: User's language preference

	Security checks:
	- User must be authenticated (not Guest)
	"""
	# Check if user is authenticated
	if frappe.session.user == "Guest":
		frappe.throw("Authentication required", frappe.AuthenticationError)

	# Get user's language preference
	language = frappe.db.get_value("User", frappe.session.user, "language") or "en"

	return {
		"success": True,
		"locale": language.lower()
	}


@frappe.whitelist()
def get_allowed_locales():
	"""
	Get list of allowed locales from POS Settings for the language switcher.

	Returns:
		dict: List of allowed locale codes
	"""
	allowed = get_allowed_locales_from_settings()
	return {
		"success": True,
		"locales": list(allowed)
	}


def get_supported_locales():
	"""
	Get all supported locales by scanning available .po translation files.
	Always includes 'en' as the base language.

	Returns:
		set: Set of supported locale codes
	"""
	supported = {'en'}  # English is always supported as base language

	try:
		# Get the locale directory path for pos_next app
		locale_path = frappe.get_app_path('pos_next', 'locale')

		if os.path.exists(locale_path):
			for filename in os.listdir(locale_path):
				if filename.endswith('.po'):
					# Extract locale code from filename (e.g., 'fr.po' -> 'fr')
					locale_code = filename[:-3]  # Remove '.po' extension
					if locale_code != 'main':  # Skip template file
						supported.add(locale_code.lower())
	except Exception:
		# Fallback to known locales if directory scan fails
		supported = {'en', 'ar', 'pt_br', 'fr'}

	return supported


# //// configurable language settings and Brazilian Portuguese support — 148cec7
#//// Neoffice — upstream fell back to a hardcoded {'ar', 'en'} whitelist whenever POS Settings
#//// listed no allowed_locales, so a fresh site could not offer French at all. An empty table
#//// now means "no restriction" and returns an empty set; get_supported_locales() above
#//// derives the real list from the locale/*.po files the app ships (the fork moved its
#//// translations from CSV to PO) (c081f418, 2026-01-12 "feat(i18n): show all languages when
#//// allowed_locales is empty"). The docstring and the three `return set()` below are the
#//// same change.
#//// TO REVIEW: the comprehension reads `row.locale`, but the child doctype POS Allowed Locale
#//// only defines a `language` field — the AttributeError is swallowed by the except clause
#//// below, so a whitelist that IS configured is silently ignored.
def get_allowed_locales_from_settings():
	"""
	Get allowed locales from POS Settings.
	Returns empty set if not configured (frontend will show all languages).

	Returns:
		set: Set of allowed locale codes, or empty set for all languages
	"""
	#//// Neoffice — upstream's {'ar','en'} default stood here; see the marker above (c081f418).
	try:
		# Get the first POS Settings (or we could use a specific one based on user's profile)
		pos_settings_list = frappe.get_all(
			"POS Settings",
			filters={"enabled": 1},
			fields=["name"],
			limit=1
		)

		if not pos_settings_list:
			#//// Neoffice — empty allowed_locales now means "all languages"; see the marker above (c081f418).
			return set()  # Empty = all languages allowed

		pos_settings = frappe.get_doc("POS Settings", pos_settings_list[0].name)

		if pos_settings.allowed_locales and len(pos_settings.allowed_locales) > 0:
			#//// Neoffice — empty allowed_locales now means "all languages"; see the marker above (c081f418).
			return {row.locale.lower() for row in pos_settings.allowed_locales}

		#//// Neoffice — empty allowed_locales now means "all languages"; see the marker above (c081f418).
		return set()  # Empty = all languages allowed
	except Exception:
		#//// Neoffice — empty allowed_locales now means "all languages"; see the marker above (c081f418).
		return set()  # Empty = all languages allowed


@frappe.whitelist()
def change_user_language(locale):
	"""
	Change the language preference for the current user.

	Args:
		locale (str): Language code (e.g., 'en', 'ar')

	Returns:
		dict: Success status and message

	Security checks:
	- User must be authenticated (not Guest)
	- User must be enabled
	"""
	# Check if user is authenticated
	if frappe.session.user == "Guest":
		frappe.throw("Authentication required", frappe.AuthenticationError)

	# Verify user is enabled
	if not frappe.db.get_value("User", frappe.session.user, "enabled"):
		frappe.throw("User is disabled", frappe.AuthenticationError)

	# Validate locale parameter
	if not locale:
		frappe.throw("Locale parameter is required", frappe.ValidationError)

	# Normalize locale to lowercase
	locale = locale.lower()

	#//// Neoffice — an empty allowed_locales now means "all languages", so change_user_language
	#//// must validate against the locales actually shipped as .po files instead of refusing
	#//// everything (c081f418, 2026-01-12).
	# Get dynamically supported locales from translation files
	all_supported_locales = get_supported_locales()

	allowed_locales = get_allowed_locales_from_settings()
	#//// Neoffice — validated against the shipped .po locales; see the marker above (c081f418).
	# If allowed_locales is empty, all supported locales are allowed
	effective_allowed = allowed_locales if allowed_locales else all_supported_locales

	if locale not in effective_allowed:
		frappe.throw(f"Locale '{locale}' is not supported", frappe.ValidationError)

	# Update user's language preference
	try:
		frappe.db.set_value("User", frappe.session.user, "language", locale)
		frappe.db.commit()

		return {
			"success": True,
			"message": f"Language changed to {locale}",
			"locale": locale
		}
	except Exception as e:
		frappe.log_error(f"Failed to change user language: {str(e)}")
		frappe.throw(f"Failed to change language: {str(e)}", frappe.ValidationError)
