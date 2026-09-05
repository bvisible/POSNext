# -*- coding: utf-8 -*-
# Copyright (c) 2024, POS Next and contributors
# For license information, please see license.txt

"""
Shared constants for POS Next API modules.

This module contains shared constants, field lists, and default values
used across multiple API modules to maintain DRY principles.

Note: Some settings are derived from POS Profile as single source of truth:
- allow_write_off_change: derived from POS Profile (write_off_account + write_off_limit > 0)
- disable_rounded_total: uses POS Profile value directly
"""

# Fields to fetch from POS Settings
# Used by both bootstrap.py and pos_profile.py
POS_SETTINGS_FIELDS = [
	"name",
	"enabled",
	"tax_inclusive",
	"allow_user_to_edit_additional_discount",
	"allow_user_to_edit_item_discount",
	"allow_user_to_edit_rate",
	"use_percentage_discount",
	"max_discount_allowed",
	"allow_credit_sale",
	"allow_customer_credit_payment",
	"allow_return",
	"allow_partial_payment",
	"use_exact_amount",
	"decimal_precision",
	"allow_negative_stock",
	"enable_sales_persons",
	"silent_print",
	"allow_print_draft_invoices",
	"allow_sales_order",
	"allow_select_sales_order",
	"create_only_sales_order",
	# //// Neoffice — POS_SETTINGS_FIELDS is the whitelist the bootstrap sends to the SPA: a
	# //// setting missing here reads as "off" in the till however it is set on the doctype. The
	# //// wallet / loyalty and customer-display settings the fork adds were absent, so both
	# //// features looked disabled (f91dcc94, 2026-03-19).
	# //// add missing wallet/loyalty fields to POS_SETTINGS_FIELDS bootstrap — f91dcc9 + 1ec3ead
	# Wallet & Loyalty
	"enable_loyalty_program",
	"default_loyalty_program",
	"wallet_account",
	"auto_create_wallet",
	"loyalty_to_wallet",
	# Customer Display Settings
	"enable_customer_display",
	"enable_customer_display_account_creation",
	"customer_display_show_address_fields",
	"enable_session_lock",
	"session_lock_timeout",
	"show_variants_as_items",
	# //// Neoffice — same whitelist, for two features with no upstream equivalent: restaurant mode
	# //// (458d81a9, 2026-03-20 "remove BrainWise branding, add restaurant mode") and the cash
	# //// withdrawal at shift closing, whose Journal Entry Template is named by
	# //// closing_withdrawal_template (5783eb27, 2026-03-28).
	# //// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a + 5783eb2
	# Restaurant Settings
	"enable_restaurant_mode",
	"default_restaurant_area",
	# Cash Management
	"closing_withdrawal_template",
]

# Default POS Settings values
# Used when no POS Settings found or on error
DEFAULT_POS_SETTINGS = {
	"enabled": 0,
	"tax_inclusive": 0,
	"allow_user_to_edit_additional_discount": 0,
	"allow_user_to_edit_item_discount": 1,
	"allow_user_to_edit_rate": 0,
	"use_percentage_discount": 0,
	"max_discount_allowed": 0,
	"disable_rounded_total": 0,  # Derived from POS Profile
	"allow_credit_sale": 0,
	"allow_customer_credit_payment": 0,
	"allow_return": 0,
	"allow_write_off_change": 0,  # Derived from POS Profile
	"allow_partial_payment": 0,
	"use_exact_amount": 0,
	"decimal_precision": "2",
	"allow_negative_stock": 0,
	"enable_sales_persons": "Disabled",
	"silent_print": 0,
	"allow_print_draft_invoices": 0,
	"allow_sales_order": 0,
	"allow_select_sales_order": 0,
	"create_only_sales_order": 0,
	# //// Neoffice — DEFAULT_POS_SETTINGS has to mirror POS_SETTINGS_FIELDS above key for key, or
	# //// the POS bootstraps without the key and the frontend reads undefined. These are the
	# //// wallet / loyalty and customer-display keys the fork added
	# //// (f91dcc94, 2026-03-19 "fix: add missing wallet/loyalty fields to POS_SETTINGS_FIELDS
	# //// bootstrap"; merge 1ec3eadf).
	# Wallet & Loyalty
	"enable_loyalty_program": 0,
	"default_loyalty_program": "",
	"wallet_account": "",
	"auto_create_wallet": 0,
	"loyalty_to_wallet": 0,
	# Customer Display Settings
	"enable_customer_display": 0,
	"enable_customer_display_account_creation": 0,
	"customer_display_show_address_fields": 0,
	"enable_session_lock": 0,
	"session_lock_timeout": 5,
	"show_variants_as_items": 0,
	# //// Neoffice — same mirror, for two things upstream does not have: restaurant mode (table
	# //// service) and the Journal Entry Template used for the cash withdrawal at shift closing
	# //// (458d81a9 2026-03-20 "remove BrainWise branding, add restaurant mode";
	# //// 5783eb27 2026-03-28 "cash withdrawal at shift closing with suggested opening balance").
	# Restaurant Settings
	"enable_restaurant_mode": 0,
	"default_restaurant_area": "",
	# Cash Management
	"closing_withdrawal_template": "",
}
