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
	# //// Neoffice — tips at a shop till (pos_next.till_tips): whether the change can become one, and how
	"enable_till_tips",
	"till_tips_auto_detect",
	"decimal_precision",
	"allow_negative_stock",
	"enable_sales_persons",
	# //// Neoffice — a product asks for its person only if this is on (NeoSalon, pos_next.sales_person_lines)
	"track_product_sales_by_person",
	"silent_print",
	"allow_print_draft_invoices",
	"allow_sales_order",
	"allow_select_sales_order",
	"create_only_sales_order",
	# //// Neoffice — scanning in the shop: the till takes over the cart of a phone by its code (pos_next.shop_scan)
	"enable_shop_scan",
	# //// Neoffice — POS_SETTINGS_FIELDS is the whitelist the bootstrap sends to the SPA: a
	# //// setting missing here reads as "off" in the till however it is set on the doctype. The
	# //// customer-display settings the fork adds were absent, so the feature looked disabled
	# //// (f91dcc94, 2026-03-19). The wallet / loyalty keys added by the same commit are now
	# //// upstream's own (develop, end of this list), so ours were dropped at the 2026-10-28 merge.
	# Customer Display Settings
	"enable_customer_display",
	"enable_customer_display_account_creation",
	"customer_display_show_address_fields",
	"enable_session_lock",
	"session_lock_timeout",
	"show_variants_as_items",
	# //// Neoffice — same whitelist: how long the till keeps its staff signed in (pos_next.api.session, NeoResto
	# //// lot 1, 01.11.2026). The till does not read it, the settings dialog edits it.
	"keep_signed_in_days",
	# //// Neoffice — same whitelist: whether leaving the screen locks the till at once, or only the delay without use does
	# //// (the personal till code, NeoResto lot 1, 01.11.2026).
	"session_lock_on_leave",
	# //// Neoffice — same whitelist, for two features with no upstream equivalent: restaurant mode
	# //// (458d81a9, 2026-03-20 "remove BrainWise branding, add restaurant mode") and the cash
	# //// withdrawal at shift closing, whose Journal Entry Template is named by
	# //// closing_withdrawal_template (5783eb27, 2026-03-28).
	# //// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a + 5783eb2
	# Restaurant Settings
	"enable_restaurant_mode",
	# //// Neoffice — the restaurant a till works for (NeoResto lot 1, task 2): the screens pass it to every
	# //// restaurant endpoint. Its label (`restaurant_name`) is added by pos_next.restaurant.scope, on the hook
	# //// pos_next_bootstrap_settings.
	"restaurant",
	"default_restaurant_area",
	# //// Neoffice — the table of direct service this till opens on and comes back to (NeoResto lot 1, 08.11.2026)
	"default_restaurant_table",
	# Cash Management
	"closing_withdrawal_template",
	# //// Neoffice — end-of-day report e-mail (neoffice-maintenance#1235)
	"eod_email_recipients",
	"eod_email_auto",
	"enable_loyalty_program",
	"default_loyalty_program",
	"wallet_account",
	"auto_create_wallet",
	"loyalty_to_wallet",
	"cart_lifo",
	"display_item_code",
	# //// Neoffice — how many tiles a row of the till's item grids shows ("Automatic" or 3 to 8): a setting of the
	# //// till's sale screen (NeoResto lot 1, task 13, product owner 30.10.2026). Missing here, the till would read
	# //// "Automatic" whatever the manager chose.
	"tiles_per_row",
	# //// Neoffice — whether a phone shows the pictures on the restaurant card's buttons (NeoResto lot 1, task 27):
	# //// missing here, a phone would show none whatever the manager chose.
	"phone_card_pictures",
	# //// Neoffice — how the restaurant card's tiles look at the till (NeoResto lot 1, Daniel, 03.11.2026): whether the tile shows the item's picture, and whether it takes the
	# //// colour of its item or of its item group. Missing here, the till would read the defaults whatever the manager chose.
	"till_card_pictures",
	"tile_colors",
	# //// Neoffice — how tall the restaurant card's tiles are (NeoResto lot 1, product owner, 05.11.2026): missing here, the till would read "Standard" whatever the manager chose.
	"tile_height",
	# //// Neoffice — how the lines of the cart look at a restaurant till (product owner, 05.11.2026): missing here, the till would read the defaults whatever the manager chose.
	"cart_compact_lines",
	"cart_pictures",
	# //// Neoffice — same whitelist: the till's own popup and sound when a guest orders or pays from the QR code of a table (NeoResto lot 1, Daniel, 01.11), and the
	# //// volume it rings at, which is the kitchen alerts' (the tablets read that one from get_restaurant_settings, the till reads it here). Missing here, a till would
	# //// ring Chime for 30 s whatever the manager chose.
	"floor_guest_popup",
	"floor_popup_seconds",
	"floor_guest_sound",
	"kitchen_alert_volume",
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
	# //// Neoffice — see POS_SETTINGS_FIELDS
	"enable_till_tips": 0,
	# //// Neoffice — on, as in a restaurant: the overpayment is the tip, the cashier can decline it (NeoCoiffeur, product owner, 09.11.2026)
	"till_tips_auto_detect": 1,
	"decimal_precision": "2",
	"allow_negative_stock": 0,
	"enable_sales_persons": "Disabled",
	# //// Neoffice — see POS_SETTINGS_FIELDS
	"track_product_sales_by_person": 0,
	"silent_print": 0,
	"allow_print_draft_invoices": 0,
	"allow_sales_order": 0,
	"allow_select_sales_order": 0,
	"create_only_sales_order": 0,
	# //// Neoffice — scanning in the shop (see POS_SETTINGS_FIELDS)
	"enable_shop_scan": 0,
	# //// Neoffice — DEFAULT_POS_SETTINGS has to mirror POS_SETTINGS_FIELDS above key for key, or
	# //// the POS bootstraps without the key and the frontend reads undefined. These are the
	# //// customer-display keys the fork added (f91dcc94, 2026-03-19; merge 1ec3eadf). Its wallet /
	# //// loyalty keys are upstream's since develop (end of this dict, with the doctype's defaults
	# //// auto_create_wallet = loyalty_to_wallet = 1 instead of our 0), dropped here on 2026-10-28.
	# Customer Display Settings
	"enable_customer_display": 0,
	"enable_customer_display_account_creation": 0,
	"customer_display_show_address_fields": 0,
	"enable_session_lock": 0,
	"session_lock_timeout": 5,
	"show_variants_as_items": 0,
	# //// Neoffice — mirrors POS_SETTINGS_FIELDS: 0 = the site's session length (pos_next.api.session).
	"keep_signed_in_days": 0,
	# //// Neoffice — mirrors POS_SETTINGS_FIELDS: 0 = the lock waits for its delay (pos_next.api.till_code).
	"session_lock_on_leave": 0,
	# //// Neoffice — same mirror, for two things upstream does not have: restaurant mode (table
	# //// service) and the Journal Entry Template used for the cash withdrawal at shift closing
	# //// (458d81a9 2026-03-20 "remove BrainWise branding, add restaurant mode";
	# //// 5783eb27 2026-03-28 "cash withdrawal at shift closing with suggested opening balance").
	# Restaurant Settings
	"enable_restaurant_mode": 0,
	# //// Neoffice — mirrors POS_SETTINGS_FIELDS: the restaurant a till works for, and its label (NeoResto lot 1,
	# //// task 2).
	"restaurant": "",
	"restaurant_name": "",
	"default_restaurant_area": "",
	# //// Neoffice — mirrors POS_SETTINGS_FIELDS: the table of direct service this till opens on (NeoResto lot 1, 08.11.2026)
	"default_restaurant_table": "",
	# Cash Management
	"closing_withdrawal_template": "",
	# //// Neoffice — end-of-day report e-mail (neoffice-maintenance#1235)
	"eod_email_recipients": "",
	"eod_email_auto": 0,
	"enable_loyalty_program": 0,
	"default_loyalty_program": "",
	"wallet_account": "",
	"auto_create_wallet": 1,
	"loyalty_to_wallet": 1,
	"magento_loyalty_available": 0,
	"miraaya_installed": 0,
	"cart_lifo": 0,
	"display_item_code": 1,
	# //// Neoffice — mirrors POS_SETTINGS_FIELDS: today's grids until a manager chooses (NeoResto lot 1, task 13).
	"tiles_per_row": "Automatic",
	# //// Neoffice — mirrors POS_SETTINGS_FIELDS: no pictures on a phone's card until a manager asks (task 27).
	"phone_card_pictures": 0,
	# //// Neoffice — mirrors POS_SETTINGS_FIELDS: today's till (pictures shown) and the new colours on until a manager says otherwise (Daniel, 03.11.2026).
	"till_card_pictures": 1,
	"tile_colors": 1,
	# //// Neoffice — mirrors POS_SETTINGS_FIELDS: the tiles as tall as the grid draws them by default until a manager chooses (product owner, 05.11.2026).
	"tile_height": "Standard",
	# //// Neoffice — mirrors POS_SETTINGS_FIELDS: compact lines with their pictures until a manager chooses (product owner, 05.11.2026).
	"cart_compact_lines": 1,
	"cart_pictures": 1,
	# //// Neoffice — mirrors POS_SETTINGS_FIELDS: the doctype's defaults (a popup of 30 seconds and a chime), so that a site not migrated yet rings as a migrated one.
	"floor_guest_popup": 1,
	# //// Neoffice — the notice of a guest's order stays until somebody has seen it (Daniel, 02.11.2026)
	"floor_popup_seconds": 0,
	"floor_guest_sound": "Chime",
	"kitchen_alert_volume": "Medium",
}


def merge_pos_settings(row=None):
	"""DB row over defaults so runtime integration flags always exist.

	`miraaya_installed` / `magento_loyalty_available` are not DocType columns;
	hooks may overwrite them, but vanilla benches still need the keys present
	when a POS Settings row exists (defaults alone only apply on miss/error).
	"""
	settings = DEFAULT_POS_SETTINGS.copy()
	if row:
		settings.update(row)
	return settings
