from pos_next.utils import get_build_version

# //// restore hooks.py and custom_field.json with all coupon/gift card fiel… — f0c960f + 82b2493 (+1 more)

def _has_native_coupon_code_field():
	"""Check if ERPNext has a native coupon_code field on Sales Invoice (v16+)."""
	try:
		import json
		import os
		import importlib
		erpnext_mod = importlib.import_module("erpnext")
		erpnext_dir = os.path.dirname(erpnext_mod.__file__)
		si_json_path = os.path.join(
			erpnext_dir, "accounts", "doctype", "sales_invoice", "sales_invoice.json"
		)
		if os.path.exists(si_json_path):
			with open(si_json_path) as f:
				meta = json.load(f)
			return any(f.get("fieldname") == "coupon_code" for f in meta.get("fields", []))
	except Exception:
		pass
	return False


app_name = "pos_next"
# //// rebrand: rename POS Next to Neopos — 771950b
app_title = "Neopos"
app_publisher = "BrainWise"
app_description = "POS built on ERPNext that brings together real-time billing, stock management, multi-user access, offline mode, and direct ERP integration. Run your store or restaurant with confidence and control, while staying 100% open source."
app_email = "support@brainwise.me"
app_license = "agpl-3.0"

# Apps
# ------------------

# //// Phase 3 — wire POSNext into unified Payments app — 9ff7305
# The unified payments app provides the Provider × Channel × Driver layer that
# POSNext uses via `pos_next.api.payments.*` (see ADR-001 in
# `/Users/jeremy/GitHub/payments/docs/adr/ADR-001-unification-paiements.md`).
required_apps = ["payments"]

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "pos_next",
# 		"logo": "/assets/pos_next/logo.png",
# 		"title": "POS Next",
# 		"route": "/pos_next",
# 		"has_permission": "pos_next.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# Get unique build version for cache busting
_asset_version = get_build_version()

# include js, css files in header of desk.html
# app_include_css = f"/assets/pos_next/css/pos_next.css?v={_asset_version}"
# app_include_js = f"/assets/pos_next/js/pos_next.js?v={_asset_version}"

# include js, css files in header of web template
# web_include_css = "/assets/pos_next/css/pos_next.css"
# web_include_js = "/assets/pos_next/js/pos_next.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "pos_next/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
#//// Neoffice — gift cards are ERPNext Coupon Code documents here, so the "Create Gift Card"
#//// entry point belongs on that list view in the desk; upstream shipped no desk surface for
#//// its own POS Coupon (b14d3066 2026-01-13, restored by f0c960ff 2026-03-21).
doctype_list_js = {"Coupon Code": "public/js/coupon_code_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "pos_next/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "pos_next.utils.jinja_methods",
# 	"filters": "pos_next.utils.jinja_filters"
# }

# Fixtures
# --------
#//// Neoffice — the fixture list is built at import time instead of being a literal: ERPNext
#//// v16 ships a native `coupon_code` field on Sales Invoice and our Custom Field of the same
#//// name would collide on install, so it is added only on v15. Drop the branch once the whole
#//// fleet is on v16. The rest of the list is the fork's own fields — gift-card tracking on
#//// Coupon Code, restaurant table / KDS status / preparation station / modifiers on Sales
#//// Invoice (Item), cash entry templates on POS Profile (f0c960ff 2026-03-21; efe964ae and
#//// 5846bd04 2026-02-18 for the v16 detection; d2a64f30 2026-01-12, 4df0caf1 and 831857f2
#//// 2026-03-21, 82b2493a 2026-03-28).
# Build custom field list dynamically: skip coupon_code on Sales Invoice
# if ERPNext already has it natively (v16+)
_custom_field_names = [
	"Sales Invoice-posa_pos_opening_shift",
	"Sales Invoice-posa_is_printed",
	"Sales Invoice-posa_coupon_code",
	"Item-custom_company",
	"POS Profile-posa_cash_mode_of_payment",
	"POS Profile-posa_allow_delete",
	"POS Profile-posa_cash_entry_templates",
	"POS Profile-posa_block_sale_beyond_available_qty",
	"Mode of Payment-is_wallet_payment",
	"Coupon Code-pos_next_section",
	"Coupon Code-pos_next_gift_card",
	"Coupon Code-gift_card_amount",
	"Coupon Code-original_gift_card_amount",
	"Coupon Code-coupon_code_residual",
	"Coupon Code-source_invoice",
	"Coupon Code-referral_code",
	"Sales Invoice-restaurant_table",
	"Sales Invoice-kds_status",
	"Sales Invoice Item-posa_special_instructions",
	"Sales Invoice Item-preparation_station",
	"Sales Invoice Item-kds_status",
	"Sales Invoice Item-posa_item_modifiers",
]
if not _has_native_coupon_code_field():
	_custom_field_names.insert(3, "Sales Invoice-coupon_code")

fixtures = [
	# //// add custom POS print format with discount display — eca6f13 + f0c960f (+5 more)
	{
		"dt": "Print Format",
		"filters": [
			[
				"name",
				"in",
				[
					"Neopos Receipt"
				]
			]
		]
	},
	{
		"dt": "Role",
		"filters": [
			["role_name", "in", ["POSNext Cashier", "Nexus POS Manager"]]
		]
	},
	{
		"dt": "Custom DocPerm",
		"filters": [
			["role", "in", ["POSNext Cashier"]]
		]
	},
	{"dt": "Menu Badge"},
	{"dt": "Menu Design Template"},
]

# Installation
# ------------

# before_install = "pos_next.install.before_install"
after_install = "pos_next.install.after_install"
after_migrate = "pos_next.install.after_migrate"

# Uninstallation
# ------------

before_uninstall = "pos_next.uninstall.before_uninstall"
# after_uninstall = "pos_next.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "pos_next.utils.before_app_install"
# after_app_install = "pos_next.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "pos_next.utils.before_app_uninstall"
# after_app_uninstall = "pos_next.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "pos_next.notifications.get_notification_config"

# Permissions
# Standard Queries
# ----------------
# Custom query for company-aware item filtering
standard_queries = {
	"Item": "pos_next.validations.item_query"
}

# DocType Class
# ---------------
# Override standard doctype classes

override_doctype_class = {
	"Sales Invoice": "pos_next.overrides.sales_invoice.CustomSalesInvoice"
}

# Document Events
# ---------------
# Hook on document methods and events

# //// wallet functionality with loyalty points conversion — 77e7448
doc_events = {
	"Item": {
		"validate": "pos_next.validations.validate_item"
	},
	"Customer": {
		"after_insert": [
			"pos_next.api.customers.auto_assign_loyalty_program",
			"pos_next.realtime_events.emit_customer_event",
			"pos_next.api.wallet.create_wallet_on_customer_insert"
		],
		"on_update": "pos_next.realtime_events.emit_customer_event",
		#//// Neoffice — on_trash became a list so the unused-wallet cleanup runs before Frappe's
		#//// link-integrity check, which otherwise lets an auto-created wallet block every customer
		#//// deletion (c42d1cfc, 2026-06-29).
		"on_trash": [
			"pos_next.api.wallet.delete_unused_wallet_on_customer_trash",
			"pos_next.realtime_events.emit_customer_event"
		]
	},
	"Sales Invoice": {
		"validate": [
			"pos_next.api.sales_invoice_hooks.validate",
			#//// Neoffice — coupon validation hangs off the invoice's native ERPNext `coupon_code` link
			#//// now; upstream validated its own POS Coupon doctype, which no longer exists here
			#//// (9bc096de 2026-02-05, restored by f0c960ff 2026-03-21).
			"pos_next.api.sales_invoice_hooks.validate_coupon_on_invoice",
			"pos_next.api.wallet.validate_wallet_payment"
		],
		"before_cancel": "pos_next.api.sales_invoice_hooks.before_cancel",
		#//// Neoffice — restaurant mode: the floor plan follows the document, not the browser, so a
		#//// table flips to Occupied / Cleaning from the invoice's own lifecycle — otherwise a till
		#//// that crashed or went offline left tables stuck (458d81a9 2026-03-20, restored by
		#//// f0c960ff 2026-03-21).
		"on_update": "pos_next.api.restaurant.on_invoice_update",
		"on_submit": [
			"pos_next.api.sales_invoice_hooks.update_coupon_usage_on_submit",
			"pos_next.realtime_events.emit_stock_update_event",
			# //// use native ERPNext coupon_code field on Sales Invoice — 9bc096d + f0c960f (+1 more)
			"pos_next.api.wallet.process_loyalty_to_wallet",
			"pos_next.api.gift_cards.create_gift_card_from_invoice",
			"pos_next.api.gift_cards.process_gift_card_on_submit",
			"pos_next.api.restaurant.on_invoice_update"
		],
		"on_cancel": [
			"pos_next.api.sales_invoice_hooks.update_coupon_usage_on_cancel",
			"pos_next.realtime_events.emit_stock_update_event",
			#//// Neoffice — on_cancel became a list: upstream published one stock event. A cancelled sale
			#//// must also give the gift-card balance back, bring the coupon usage counter down and
			#//// release the table (5091779d / 9bc096de for the coupon side, 458d81a9 for the restaurant
			#//// side, restored by f0c960ff 2026-03-21).
			"pos_next.api.gift_cards.process_gift_card_on_cancel",
			"pos_next.api.restaurant.on_invoice_update"
		],
		"after_insert": "pos_next.realtime_events.emit_invoice_created_event"
	},
	#//// Neoffice — POS Invoice gets the same gift-card hooks as Sales Invoice: an instance running
	#//// ERPNext's POS Invoice flow would otherwise sell a gift card without ever creating it, or
	#//// cancel one without giving the balance back (f0c960ff, 2026-03-21).
	"POS Invoice": {
		"on_submit": [
			"pos_next.api.gift_cards.create_gift_card_from_invoice",
			"pos_next.api.gift_cards.process_gift_card_on_submit"
		],
		"on_cancel": "pos_next.api.gift_cards.process_gift_card_on_cancel"
	},
	"POS Profile": {
		"on_update": "pos_next.realtime_events.emit_pos_profile_updated_event"
	},
	"POS Settings": {
		"on_update": "pos_next.api.items.invalidate_pos_settings_cache"
	},
	"Promotional Scheme": {
		"on_update": "pos_next.overrides.pricing_rule.sync_pos_only_to_pricing_rules"
	},
	# //// merge all restaurant enhancements - station groups, realtime cards, shift closing — 34ee11a
	"Restaurant Card": {
		"on_update": "pos_next.realtime_events.emit_card_updated_event",
		"after_rename": "pos_next.realtime_events.emit_card_updated_event",
	},
	"Restaurant Settings": {
		"on_update": "pos_next.realtime_events.emit_restaurant_settings_updated_event",
	},
}

# Scheduled Tasks
# ---------------

#//// Neoffice — upstream scheduled three `pos_next.tasks.branding_monitor` jobs here (hourly
#//// integrity check, daily session validation, monthly tamper-counter reset) policing its own
#//// `BrainWise Branding` doctype. That doctype, `pos_next/api/branding.py` and
#//// `pos_next/tasks/branding_monitor.py` were all removed by 458d81a9 (2026-03-20): a POS we
#//// sell under our own name does not police its supplier's logo. A deletion leaves nothing to
#//// mark inside those files, so it is recorded here, where the hooks were unregistered.
scheduler_events = {
	"hourly": [
		# //// restaurant reservation system with POS dialog, online booking, and em… — ebc3ecc
		"pos_next.api.reservations.send_reminders",
		"pos_next.api.reservations.auto_no_show",
		#//// Neoffice — the till finalizes a POS payment in the browser, so any
		#//// browser-side failure charges the customer with no sale recorded and
		#//// nothing to say so. Reconcile server-side (read-only) and alert.
		"pos_next.tasks.detect_uncollected_payments.detect_uncollected_payments",
	],
	"daily": [
		# //// add support for standalone pricing rules in promotions — 1ed8d44
		"pos_next.tasks.cleanup_expired_promotions.cleanup_expired_promotions",
	],
}

# Testing
# -------

# before_tests = "pos_next.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "pos_next.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "pos_next.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["pos_next.utils.before_request"]
# after_request = ["pos_next.utils.after_request"]

# Job Events
# ----------
# before_job = ["pos_next.utils.before_job"]
# after_job = ["pos_next.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"pos_next.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }


website_route_rules = [{'from_route': '/pos/<path:app_path>', 'to_route': 'pos'},]