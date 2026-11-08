# //// Neoffice — added file (no upstream equivalent). The one list of a till's settings (NeoResto lot 1,
# //// task 13; product owner, 30.10.2026): what each setting is, where it lives (POS Settings, POS Profile, the
# //// till's Restaurant, this computer, the printer rows of the cloudprnt app), the tab and the group that show
# //// it, its label and the help behind its lightbulb, which till shows it (every till, a shop till, a restaurant
# //// till), the setting it depends on (shown greyed while that one is off) and whether it is set at the office
# //// only. The till's settings screen is drawn from it (served by pos_next.till_settings.api), and so is the
# //// desk's form.
"""The settings of a till, described once for every screen that shows them.

Labels and help texts are lazy (`_lt`): `bench generate-pot-file` extracts them, and they are translated when
they are served, in the language of the user who reads them.

Only what the till really uses is listed: a field that no code acts on, a duplicate, an option of ERPNext's own
till page or a feature switched off on purpose is in `NOT_LISTED`, with the reason (mockup v2 notes and the study
of the inert settings, NeoResto lot 1). A setting the till shows must work.
"""

from __future__ import annotations

from dataclasses import dataclass

from frappe import _lt

POS_SETTINGS = "POS Settings"
POS_PROFILE = "POS Profile"
RESTAURANT = "Restaurant"
DOCTYPES = (POS_SETTINGS, POS_PROFILE, RESTAURANT)

# Where a setting that is no field of a document lives
DOCUMENT = "document"
DEVICE = "device"  # this computer's browser storage
CLOUDPRNT = "cloudprnt"  # the printer rows of the cloudprnt app, saved through that app

# Which till shows a setting
ALL = "all"
SHOP = "shop"
RESTAURANT_TILL = "restaurant"
TILL_TYPES = (ALL, SHOP, RESTAURANT_TILL)

# The sections of the tabs: the restaurant's (a restaurant till only), the till's, the office's (never at the
# till)
SECTION_RESTAURANT = "restaurant"
SECTION_TILL = "till"
SECTION_DESK = "desk"
# //// Neoffice — the first tab of the office's page (NeoResto lot 1, task 13b, 05.11.2026): what a till needs first — its name, who uses
# //// it, whether it is a restaurant till. The office's, never at the till.
SECTION_SETUP = "setup"

# What a group's settings apply to: the badge a screen shows next to the group's title
SCOPES = ("restaurant", "till", "site", "device", "computer")

# What a setting is: a setting (a value someone sets, with its help), an information (a state the screen shows,
# the list of the cards...) or an action (a button: a test print, a certificate)
SETTING = "setting"
INFO = "info"
ACTION = "action"

# The widgets: how a screen draws a value
WIDGETS = (
	"check",
	"int",
	"float",
	"percent",
	"duration",
	"time",
	"select",
	"segmented",
	"link",
	"multiselect",
	"table",
	"text",
	"email",
	"lines",
	# Drawn by a component of their own, placed by the key of the setting
	"special",
)

# How the till takes a change once it is saved, besides reading its settings again
APPLIES_CATALOGUE = "catalogue"  # the items are read again (price list, groups, brands...)
APPLIES_PROFILE = "profile"  # the till's copy of its POS Profile is updated (default customer, warehouse...)
APPLIES_RESTAURANT = "restaurant"  # the restaurant's settings are read again
# The till's settings store takes it again: a field of POS Profile the server sends with the till's settings
APPLIES_SETTINGS = "settings"

# The facts of the site a setting can need (Setting.needs_site): where the fact does not hold, the screen shows the
# setting greyed, and its help says why (api._site_facts reads them)
SITE_ALLOWS_NEGATIVE_STOCK = "allows_negative_stock"


# Compared by identity: a lazy text refuses == (frappe.types.lazytranslatedstring)
@dataclass(frozen=True, eq=False)
class Tab:
	key: str
	label: object
	section: str


@dataclass(frozen=True, eq=False)
class Group:
	key: str
	tab: str
	label: object
	# The column of the tab the group stands in (1 to 3); the hours tab has two, wide then narrow
	column: int
	scope: str = "till"


@dataclass(frozen=True)
class When:
	"""A condition on another setting (named by its key): on (`equals` None), equal to a value, or off."""

	key: str
	equals: str | None = None
	off: bool = False


@dataclass(frozen=True, eq=False)
class Setting:
	key: str
	group: str
	label: object
	help: object
	widget: str
	# Where it lives: a field of POS Settings, POS Profile or the till's Restaurant (the key is the fieldname),
	# else this computer (DEVICE) or the printer rows of the cloudprnt app (CLOUDPRNT)
	doctype: str | None = None
	store: str = DOCUMENT
	till: str = ALL
	# Every condition must hold for the setting to be set; otherwise the screen shows it greyed
	depends_on: tuple[When, ...] = ()
	desk_only: bool = False
	# (value, label) pairs of a select or a segmented control: the only values the screen offers and the server
	# takes
	options: tuple[tuple[str, object], ...] = ()
	min: float | None = None
	max: float | None = None
	# The choices of a link, worked out on the server for this till (a short list): see api.CHOICES
	choices: str | None = None
	# A link whose records are too many to list: the doctype the screen searches
	search: str | None = None
	# The app that adds the field to the doctype: where that app is not installed the setting is not shown
	provided_by: str | None = None
	# //// Neoffice — a check whose field says the opposite of what the screen asks (ERPNext's `disabled`, drawn as "in use"):
	# //// the server hands the screen the reverse of the stored value and takes the reverse back, so the screen never knows
	inverted: bool = False
	# What an empty value means, shown in the empty field
	placeholder: object = None
	# Drawn under the setting it depends on; by default when it depends on one
	indent: bool | None = None
	kind: str = SETTING
	applies: str | None = None
	# The restaurant's managers may change it too, at the till of their own restaurant (ruling 63): a setting of the
	# till named one by one, never because of the tab it is drawn in
	restaurant_manager_may_edit: bool = False
	# A fact of the site it means nothing without (SITE_ALLOWS_NEGATIVE_STOCK...): greyed while it does not hold
	needs_site: str | None = None

	@property
	def field(self) -> str | None:
		"""The fieldname on its doctype (None for a setting kept elsewhere)."""
		return self.key if self.store == DOCUMENT else None

	@property
	def tab(self) -> str:
		return GROUPS[self.group].tab

	@property
	def is_indented(self) -> bool:
		return bool(self.depends_on) if self.indent is None else self.indent


def on(key: str) -> When:
	return When(key)


def off(key: str) -> When:
	return When(key, off=True)


def equals(key: str, value: str) -> When:
	return When(key, equals=value)


TABS = (
	# The office's first tab: a till's identity, its users, its restaurant tick
	Tab("setup", _lt("Getting started"), SECTION_SETUP),
	# The restaurant's tabs, on a restaurant till only
	Tab("restaurant", _lt("Restaurant"), SECTION_RESTAURANT),
	Tab("hours", _lt("Hours and cards"), SECTION_RESTAURANT),
	Tab("online", _lt("Online ordering"), SECTION_RESTAURANT),
	Tab("reservations", _lt("Reservations"), SECTION_RESTAURANT),
	# The till's tabs
	Tab("general", _lt("General"), SECTION_TILL),
	Tab("sale_screen", _lt("Sale screen"), SECTION_TILL),
	Tab("prices", _lt("Prices and discounts"), SECTION_TILL),
	Tab("sales", _lt("Sales"), SECTION_TILL),
	Tab("stock", _lt("Stock"), SECTION_TILL),
	Tab("printing", _lt("Printing"), SECTION_TILL),
	Tab("closing", _lt("Closing"), SECTION_TILL),
	# //// Neoffice — scanning in the shop (pos_next.shop_scan, lot 5, board 9 of the canvas): a shop till only, its
	# //// settings all say so and the tab goes with them
	Tab("shop_scan", _lt("Scanning in the shop"), SECTION_TILL),
	# The office's tabs: set-up and money, never at the till
	Tab("payments", _lt("Payments"), SECTION_DESK),
	Tab("loyalty", _lt("Loyalty"), SECTION_DESK),
	Tab("accounting", _lt("Accounting"), SECTION_DESK),
)
TAB_BY_KEY = {tab.key: tab for tab in TABS}

_GROUPS = (
	# Restaurant
	# //// Neoffice — the restaurant tab in three balanced columns (NeoResto lot 1, product owner, 08.11.2026: « tout est dans la même colonne »): the nine settings of « Service » stood in
	# //// one group, so the first column held thirteen rows and the other two three or four. They are three groups of their own (the service, the tables, the tickets), two groups a column.
	Group("service", "restaurant", _lt("Service"), 1, "restaurant"),
	Group("room", "restaurant", _lt("Room"), 1),
	Group("tables", "restaurant", _lt("Tables"), 2, "restaurant"),
	Group("takeaway", "restaurant", _lt("Takeaway at the till"), 2),
	Group("tickets", "restaurant", _lt("Ticket numbers"), 3, "restaurant"),
	Group("tips", "restaurant", _lt("Tips"), 3, "restaurant"),
	# Hours and cards
	Group("opening_hours", "hours", _lt("Opening hours"), 1, "restaurant"),
	Group("cards", "hours", _lt("Restaurant cards"), 2, "restaurant"),
	# Online ordering
	Group("qr_ordering", "online", _lt("Table ordering by QR code"), 1, "restaurant"),
	Group("web_takeaway", "online", _lt("Online takeaway"), 2, "restaurant"),
	# Reservations
	Group("reservations", "reservations", _lt("Reservations"), 1, "restaurant"),
	Group("online_reservations", "reservations", _lt("Online booking"), 2, "restaurant"),
	Group("reservation_notices", "reservations", _lt("Notices and channels"), 3, "restaurant"),
	# General
	Group("languages", "general", _lt("Languages"), 1),
	Group("session_lock", "general", _lt("Lock"), 1),
	# //// Neoffice — how long the till keeps its staff signed in (pos_next.api.session, NeoResto lot 1, product owner,
	# //// 01.11.2026): added to the list when this task's registry met the setting, which the old settings page had got meanwhile.
	Group("staff_session", "general", _lt("Staff session"), 1),
	# //// Neoffice — the customer moved to the third column, beside the customer display: the second held thirteen rows (the customer, the kitchen alerts, the floor alerts) against eight and four (the product owner, 08.11.2026)
	Group("default_customer", "general", _lt("Customer"), 3),
	# //// Neoffice — the popup and the sounds of the kitchen and runner screens (NeoResto lot 1, Daniel, 01.11: « le son doit être dans les réglages de la caisse »)
	Group("kitchen_alerts", "general", _lt("Kitchen alerts"), 2),
	# //// Neoffice — the notice and the sound of the till itself when a guest orders or pays from the QR code of a table (NeoResto lot 1, Daniel, 01.11: « regarde comment la
	# //// caisse sommelier reçoit l'info (popup et autre) »), beside the kitchen's.
	Group("floor_alerts", "general", _lt("Floor alerts"), 2),
	Group("customer_display", "general", _lt("Customer display"), 3),
	# Sale screen
	# //// Neoffice — the sale screen's ten settings of « Items » were one group against two in the second column: the tiles, the pictures and the items are three groups of their own
	Group("items", "sale_screen", _lt("Items"), 1),
	Group("items_offered", "sale_screen", _lt("Items offered"), 1),
	Group("tiles", "sale_screen", _lt("Tiles"), 2),
	Group("pictures", "sale_screen", _lt("Pictures"), 3),
	# Prices and discounts
	Group("prices", "prices", _lt("Prices"), 1),
	Group("discounts", "prices", _lt("Discounts"), 2),
	Group("scale_barcodes", "prices", _lt("Scale barcodes"), 3),
	# Sales
	Group("payment", "sales", _lt("Payment"), 1),
	Group("returns", "sales", _lt("Returns"), 2),
	Group("sales_orders", "sales", _lt("Sales orders"), 2),
	Group("gift_cards", "sales", _lt("Gift cards"), 3),
	# Stock
	Group("warehouse", "stock", _lt("Warehouse"), 1),
	Group("stock_sync", "stock", _lt("Stock sync"), 2, "device"),
	Group("negative_stock", "stock", _lt("Negative stock"), 3, "site"),
	# Printing
	Group("receipt", "printing", _lt("Receipt"), 1),
	Group("network_printer", "printing", _lt("Network printer (Star)"), 2),
	Group("without_network_printer", "printing", _lt("Without a network printer"), 2),
	Group("qz_tray", "printing", _lt("Printing through QZ Tray"), 3, "computer"),
	Group("preparation_stations", "printing", _lt("Preparation stations"), 3),
	Group("invoice_documents", "printing", _lt("Invoices of this till"), 1),
	# Closing
	Group("counting", "closing", _lt("Counting"), 1),
	Group("cash_movements", "closing", _lt("Cash movements"), 2),
	Group("eod_report", "closing", _lt("End-of-day report"), 3),
	# //// Neoffice — scanning in the shop (lot 5): the switch, the shop's QR code and the abandoned carts; paying on the phone
	Group("shop_scan", "shop_scan", _lt("Customers scan their articles"), 1),
	Group("shop_scan_payment", "shop_scan", _lt("Paying on the phone"), 2),
	# The office only
	# //// Neoffice — one column, in the order a person sets a till up (Daniel, 06.11.2026: three columns were "cramped")
	Group("till_identity", "setup", _lt("This till"), 1),
	Group("till_users", "setup", _lt("Users"), 1),
	Group("restaurant_till", "setup", _lt("Restaurant till"), 1),
	Group("payment_methods", "payments", _lt("Payment methods"), 1),
	Group("loyalty", "loyalty", _lt("Loyalty program"), 1),
	Group("accounts", "accounting", _lt("Accounts"), 1),
	Group("taxes", "accounting", _lt("Taxes"), 2),
	Group("write_off", "accounting", _lt("Rounding and write-off"), 3),
)
GROUPS = {group.key: group for group in _GROUPS}

# The labels of the choices of a select or a segmented control; the values are what the document stores
# The sounds the kitchen and runner screens can play (utils/alertSounds.js is the same list on the screen's side)
SOUND_OPTIONS = (
	("None", _lt("None", context="Alert sound")),
	("Bell", _lt("Bell", context="Alert sound")),
	("Double beep", _lt("Double beep", context="Alert sound")),
	("Chime", _lt("Chime", context="Alert sound")),
	("Gong", _lt("Gong", context="Alert sound")),
	("Beep", _lt("Beep", context="Alert sound")),
)

TILES_PER_ROW_AUTOMATIC = "Automatic"
TILES_PER_ROW_MIN = 3
TILES_PER_ROW_MAX = 8
TILES_PER_ROW = (
	(TILES_PER_ROW_AUTOMATIC, _lt("Automatic")),
	*((str(count), str(count)) for count in range(TILES_PER_ROW_MIN, TILES_PER_ROW_MAX + 1)),
)

# //// Neoffice — the heights of the restaurant card's tiles at the till (NeoResto lot 1, product owner, 05.11.2026: « arriver à caser en hauteur plus de boutons »), the default first
TILE_HEIGHT_STANDARD = "Standard"
TILE_HEIGHT = (
	("Compact", _lt("Compact")),
	(TILE_HEIGHT_STANDARD, _lt("Standard")),
	("Large", _lt("Large")),
)

SETTINGS = (
	# ---------------------------------------------------------------- Restaurant
	Setting(
		"enable_runner",
		"service",
		_lt("Pass screen (Runner)"),
		_lt(
			"The dishes that are ready show on the pass screen; whoever takes them to the tables marks them"
			" served."
		),
		"check",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		applies=APPLIES_RESTAURANT,
	),
	# //// Neoffice — the service rhythm (NeoResto lot 1, Daniel, 01.11: « Oui, les deux modes »): the restaurant says whether the room calls each course
	# //// (the default) or the kitchen prepares them ahead. A field of the Restaurant, the restaurant managers' by its place (it is no setting of the till).
	Setting(
		"service_rhythm",
		"service",
		_lt("Service rhythm"),
		_lt(
			"The room calls: at Validate the drinks and the first course leave, the next courses wait until the waiter"
			" orders them. The kitchen prepares ahead: everything leaves at Validate, the later courses reach the kitchen"
			" marked as ahead so that it can start them, and the waiter's call only tells it to serve them now."
		),
		"select",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		options=(
			("Called by the room", _lt("The room calls", context="Service rhythm")),
			("Prepared ahead", _lt("The kitchen prepares ahead", context="Service rhythm")),
		),
		applies=APPLIES_RESTAURANT,
	),
	# //// Neoffice — what a sold-out dish does at the till (NeoResto lot 1, Daniel, 02.11: « c'est pas nous qui décidons, mais c'est le patron. Si
	# //// on le grise ou pas »): a field of the Restaurant, so the restaurant's own choice.
	Setting(
		"grey_out_sold_out",
		"service",
		_lt("Grey out sold-out dishes"),
		_lt(
			"On: a dish with no portion left is greyed out at the till and cannot be added. Off: it stays available"
			" and the till only warns that none is left. A product counted by its portions (or by its stock) is sold out"
			" when none is left; whoever works at the till adds portions when the kitchen can make more."
		),
		"check",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		applies=APPLIES_RESTAURANT,
	),
	# //// Neoffice — the covers of a table (NeoResto lot 1): whether the till asks how many people are seated when a table is first opened. A field of the Restaurant,
	# //// so the restaurant's own choice; on unless the restaurant switches it off. The number is kept on the table's order whatever this says (pos_next.restaurant.covers).
	Setting(
		"ask_covers_on_open",
		"tables",
		_lt("Ask how many people when opening a table"),
		_lt(
			"On: the first time a table is opened, the till asks how many people are seated (the seats of the table come first)."
			" Off: nothing is asked, and the number is set from the table's header whenever the waiter wants. Either way it can be"
			" changed later, and the kitchen's screens and ticket show it."
		),
		"check",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		applies=APPLIES_RESTAURANT,
	),
	# //// Neoffice — the forgotten tables (NeoResto lot 1, the product owner, 08.11.2026: « le serveur a oublié de fermer la table »): after how many minutes a table where everything is served
	# //// and nothing has moved is marked « Cash in? » on the floor plan. A field of the Restaurant, so the restaurant's own choice; 0 switches the reminder off.
	Setting(
		"remind_to_cash_in_minutes",
		"tables",
		_lt("Remind to cash in after (minutes)"),
		_lt(
			"A table where everything is served and nothing has moved for this many minutes is marked « Cash in? » on the floor plan,"
			" so that a forgotten table is seen while the guests are still there. 0: never."
		),
		"int",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		min=0,
		max=600,
		applies=APPLIES_RESTAURANT,
	),
	# //// Neoffice — the question « Guests left? » (NeoResto lot 1, the product owner, 08.11.2026): a table goes to cleaning by itself, guests gone or not; after how many minutes in cleaning
	# //// it is marked on the floor plan. A field of the Restaurant, so the restaurant's own choice; 0 switches the question off.
	Setting(
		"ask_if_guests_left_minutes",
		"tables",
		_lt("Ask if the guests have left after (minutes)"),
		_lt(
			"A table goes to cleaning by itself when its bill is paid with nothing left to serve, or when the last dish is delivered,"
			" whether the guests have left or not. A table that has waited to be cleaned for this many minutes is marked"
			" « Guests left? » on the floor plan. 0: never."
		),
		"int",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		min=0,
		max=600,
		applies=APPLIES_RESTAURANT,
	),
	# //// Neoffice — the digits of the ticket number (NeoResto lot 1, task 38b), added to the list when this task's registry
	# //// met the field; the server holds the same 1..9 range (Restaurant._check_ticket_number_digits).
	Setting(
		"ticket_number_digits",
		"tickets",
		_lt("Digits of the ticket number"),
		_lt("How many digits a ticket number is written with (0007 has four)."),
		"int",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		min=1,
		max=9,
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"ticket_number_reset",
		"tickets",
		_lt("Ticket numbers start again"),
		_lt(
			"When the numbers of the tickets start again at 1: every business day, never, or at each shift of"
			" the till."
		),
		"select",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		options=(
			("Business day", _lt("Every business day")),
			("Never", _lt("Never")),
			("Each shift", _lt("At each shift")),
		),
		applies=APPLIES_RESTAURANT,
	),
	# //// Neoffice — the hour a business day begins (NeoResto lot 1, Daniel, 05.11.2026): it only decides when the ticket numbers start again
	# //// at 1 (`restaurant.tickets`), so it is shown beside that choice and greyed unless the numbers start again every business day.
	Setting(
		"business_day_start",
		"tickets",
		_lt("Business day starts at"),
		_lt(
			"The hour a new business day begins, for the numbering of the tickets: with « Every business day », the numbers"
			" start again at 1 at this hour. A restaurant that closes after midnight keeps its night on one day (the default,"
			" 05:00, suits it). The end-of-day report does not follow it: it follows each shift, from its opening to its closing."
		),
		"time",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(equals("ticket_number_reset", "Business day"),),
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"default_restaurant_area",
		"room",
		_lt("Default restaurant area"),
		_lt("The room this till opens first, e.g. « Terrace » for the till of the bar."),
		"link",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
		choices="restaurant_areas",
		applies=APPLIES_RESTAURANT,
		restaurant_manager_may_edit=True,
	),
	# //// Neoffice — the table of direct service a till opens on (NeoResto lot 1, the product owner, 08.11.2026: « dès qu'on tape, ça revient sur le comptoir […] dans quelle
	# //// caisse tu choisis cette option, parce que le pad d'un serveur n'aura pas ça »): a setting of THIS till, so the bar's till has it and a waiter's pad does not.
	Setting(
		"default_restaurant_table",
		"room",
		_lt("Default table"),
		_lt(
			"A table of direct service (a bar, a counter) this till opens on, and comes back to after each ticket, so that the next one is typed at once."
			" Empty: the till opens on the floor, as a waiter's pad does."
		),
		"link",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
		choices="direct_service_tables",
		applies=APPLIES_RESTAURANT,
		restaurant_manager_may_edit=True,
	),
	Setting(
		"enable_takeaway",
		"takeaway",
		_lt("Enable takeaway"),
		_lt("Adds the « Takeaway » button to this restaurant till."),
		"check",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
		applies=APPLIES_RESTAURANT,
		restaurant_manager_may_edit=True,
	),
	Setting(
		"takeaway_card",
		"takeaway",
		_lt("Takeaway card"),
		_lt("Optional: the card, and its prices, of a takeaway sale. Empty: the card served at that time."),
		"link",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_takeaway"),),
		choices="restaurant_cards",
		applies=APPLIES_RESTAURANT,
		restaurant_manager_may_edit=True,
	),
	Setting(
		"enable_tips",
		"tips",
		_lt("Enable tip management"),
		_lt("When the customer pays more than the total, the difference can become a tip."),
		"check",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"auto_detect_tip",
		"tips",
		_lt("The overpayment becomes the tip"),
		_lt(
			"The overpayment is entered as the tip straight away; the waiter can correct or cancel it before"
			" validating."
		),
		"check",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_tips"),),
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"tip_status",
		"tips",
		_lt("Tip item and account"),
		None,
		"special",
		store=DEVICE,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_tips"),),
		kind=INFO,
	),
	# ---------------------------------------------------------------- Hours and cards
	Setting(
		"opening_hours",
		"opening_hours",
		_lt("Opening hours"),
		_lt(
			"For each day, the opening slots and the card served in each: the till offers the right card for"
			" the"
			" time of day."
		),
		"special",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		# The cards a slot can serve
		choices="restaurant_cards",
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"restaurant_cards",
		"cards",
		_lt("Restaurant cards"),
		None,
		"special",
		store=DEVICE,
		till=RESTAURANT_TILL,
		choices="restaurant_cards",
		kind=INFO,
	),
	# ---------------------------------------------------------------- Online ordering
	# //// Neoffice — the public menu of the QR code (NeoResto lot 1), added to the list when this task's registry met the field.
	Setting(
		"enable_public_menu",
		"qr_ordering",
		_lt("Public menu (QR)"),
		_lt(
			"The card offered shows, to read only, on the page that the QR code of the tables opens. Guests"
			" cannot order from it. Off: nothing is public."
		),
		"check",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"enable_qr_ordering",
		"qr_ordering",
		_lt("Enable QR ordering"),
		_lt("The customer scans the QR code of the table, orders and pays from the phone."),
		"check",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"guest_menu",
		"qr_ordering",
		_lt("Card offered"),
		_lt("The card the customer sees after scanning the QR code."),
		"link",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_qr_ordering"),),
		choices="restaurant_cards",
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"qr_order_validation",
		"qr_ordering",
		_lt("Order validation"),
		_lt(
			"« Straight to the kitchen »: the order leaves at once. « Waiter approval »: a waiter confirms"
			" it first."
		),
		"segmented",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_qr_ordering"),),
		options=(
			("Direct to Kitchen", _lt("Straight to the kitchen")),
			("Server Approval", _lt("Waiter approval")),
		),
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"guest_account_mode",
		"qr_ordering",
		_lt("Customer account"),
		_lt(
			"Whether the customer may, or must, create an account to order: not offered, optional or"
			" required."
		),
		"segmented",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_qr_ordering"),),
		options=(
			("Not Proposed", _lt("Not offered")),
			("Optional", _lt("Optional")),
			("Mandatory", _lt("Required")),
		),
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"token_expiry_mode",
		"qr_ordering",
		_lt("The QR link expires"),
		_lt(
			"When the QR code of a table stops working: when the table closes, on payment, or after a number"
			" of"
			" days."
		),
		"segmented",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_qr_ordering"),),
		options=(
			("On Table Close", _lt("When the table closes")),
			("On Payment", _lt("On payment")),
			("Timed", _lt("After a delay")),
		),
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"token_expiry_days",
		"qr_ordering",
		_lt("Delay (days)"),
		_lt("Only with « After a delay »: the number of days the link works."),
		"int",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_qr_ordering"), equals("token_expiry_mode", "Timed")),
		min=1,
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"enable_web_takeaway",
		"web_takeaway",
		_lt("Online takeaway ordering"),
		_lt("Customers order online on the /pos/order page and come to collect their order."),
		"check",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"takeaway_menu",
		"web_takeaway",
		_lt("Card offered"),
		_lt("The card offered on the online ordering page."),
		"link",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_web_takeaway"),),
		choices="restaurant_cards",
		applies=APPLIES_RESTAURANT,
	),
	# ---------------------------------------------------------------- Reservations
	Setting(
		"enable_reservations",
		"reservations",
		_lt("Enable reservations"),
		_lt("Turns on taking reservations: the list of the day, reminders to the customers, no-shows."),
		"check",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"default_reservation_duration",
		"reservations",
		_lt("Reservation length"),
		_lt("How long a reserved table is held when nothing else is said (e.g. 1 h 30)."),
		"duration",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_reservations"),),
		min=0,
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"no_show_delay",
		"reservations",
		_lt("No-show after (minutes)"),
		_lt(
			"This long after the time booked, a reservation whose customer has not come is marked « no-show"
			" » and"
			" the table is freed."
		),
		"int",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_reservations"),),
		min=0,
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"reservation_reminder_hours",
		"reservations",
		_lt("Reminder to the customer (hours before)"),
		_lt("A reminder e-mail goes to the customer this many hours before the reservation."),
		"int",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_reservations"),),
		min=0,
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"enable_online_reservations",
		"online_reservations",
		_lt("Customers book online"),
		_lt("Customers can book by themselves online."),
		"check",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_reservations"),),
		indent=False,
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"require_reservation_validation",
		"online_reservations",
		_lt("Confirm each reservation"),
		_lt("Each reservation made online waits for your confirmation before it is accepted."),
		"check",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_reservations"), on("enable_online_reservations")),
		applies=APPLIES_RESTAURANT,
	),
	# //// Neoffice — the expiry of an unconfirmed online booking (NeoResto lot 1, task 18), added to the list when this task's
	# //// registry met the field.
	Setting(
		"unconfirmed_reservation_expiry",
		"online_reservations",
		_lt("Unconfirmed booking expires after (minutes)"),
		_lt(
			"An online booking that the guest has not confirmed from the e-mail within this time expires: its"
			" tables are free again and it never counts as a no-show."
		),
		"int",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_reservations"), on("enable_online_reservations")),
		min=1,
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"restaurant_email",
		"reservation_notices",
		_lt("E-mail for reservation notices"),
		_lt("The address that receives the notice of each new reservation."),
		"email",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_reservations"),),
		indent=False,
		applies=APPLIES_RESTAURANT,
	),
	Setting(
		"reservation_channels",
		"reservation_notices",
		_lt("Reservation channels"),
		_lt(
			"The channels offered when a reservation is taken down (e.g. phone, walk-in, internet). One per"
			" line."
		),
		"lines",
		doctype=RESTAURANT,
		till=RESTAURANT_TILL,
		depends_on=(on("enable_reservations"),),
		indent=False,
		applies=APPLIES_RESTAURANT,
	),
	# ---------------------------------------------------------------- General
	Setting(
		"allowed_locales",
		"languages",
		_lt("Allowed languages"),
		_lt("The languages offered in the language picker of the till. Empty: every language available."),
		"multiselect",
		doctype=POS_SETTINGS,
		choices="languages",
	),
	Setting(
		"enable_session_lock",
		"session_lock",
		_lt("Lock the till"),
		_lt("Each person unlocks it with their personal till code, or with their password if they have none."),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"session_lock_timeout",
		"session_lock",
		_lt("Lock after (minutes)"),
		_lt("Minutes without use before the till locks."),
		"int",
		doctype=POS_SETTINGS,
		depends_on=(on("enable_session_lock"),),
		min=1,
		max=1440,
	),
	# //// Neoffice — the choice of locking at once on leaving the screen, and the days a till keeps its staff signed in:
	# //// both were added to the old settings page by NeoResto lot 1 (01.11.2026) while the registry was being built; the
	# //// server holds the same 0..90 range for the days (pos_settings.validate_keep_signed_in_days).
	Setting(
		"session_lock_on_leave",
		"session_lock",
		_lt("Lock as soon as the screen is left"),
		_lt(
			"Lock at once when the browser tab or the phone's screen is left. Unticked, the lock waits for the"
			" delay above without use"
		),
		"check",
		doctype=POS_SETTINGS,
		depends_on=(on("enable_session_lock"),),
	),
	Setting(
		"keep_signed_in_days",
		"staff_session",
		_lt("Keep staff signed in (days)"),
		_lt("0 = the site's session length. The session stays open while the device is used within this time."),
		"int",
		doctype=POS_SETTINGS,
		min=0,
		max=90,
	),
	Setting(
		"customer",
		"default_customer",
		_lt("Default customer"),
		_lt(
			"The customer offered for each new sale, e.g. « Walk-in ». The cashier can always choose another"
			" one."
		),
		"link",
		doctype=POS_PROFILE,
		search="Customer",
		applies=APPLIES_PROFILE,
	),
	Setting(
		"enable_customer_display",
		"customer_display",
		_lt("Enable customer display"),
		_lt("A second screen, turned to the customer, shows the cart and the total."),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"enable_customer_display_account_creation",
		"customer_display",
		_lt("Allow account creation"),
		_lt("The customer can create an account by themselves on the customer display."),
		"check",
		doctype=POS_SETTINGS,
		depends_on=(on("enable_customer_display"),),
	),
	Setting(
		"customer_display_show_address_fields",
		"customer_display",
		_lt("Show address fields"),
		_lt("Creating an account also asks for the address, on the customer display as in the till."),
		"check",
		doctype=POS_SETTINGS,
		depends_on=(on("enable_customer_display"), on("enable_customer_display_account_creation")),
	),
	# //// Neoffice — the kitchen alerts (NeoResto lot 1, Daniel, 01.11): a notice on the kitchen screen when the next course of a table is ordered,
	# //// the sound of that notice and of the runner's dishes ready, and their volume. The tablets read them through `get_restaurant_settings`
	# //// (pos_next.restaurant.kitchen_alerts); the screen of the till only edits them, with a Listen button for each sound. They are settings of the TILL (the General tab), so a restaurant manager,
	# //// who sets three till settings only (ruling 63), does not see them: the till's manager does.
	# //// Neoffice — no banner any more (Daniel, 01.11: « enlever le bandeau »): the ticket of a table whose next course is ordered flashes in the band « To do » until the kitchen starts it or says it has been seen. The setting that
	# //// switched the banner on now switches the flash, and its seconds are gone from the screen of the settings (the doctype keeps the field, hidden, for the rows already stored).
	Setting(
		"kitchen_next_course_popup",
		"kitchen_alerts",
		_lt("Flash the ticket when the next course is ordered"),
		_lt("The ticket of a table whose next course is ordered flashes on the kitchen screen until the kitchen starts it or leaves it to do"),
		"check",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
	),
	Setting(
		"kitchen_next_course_sound",
		"kitchen_alerts",
		_lt("Next course sound"),
		_lt("Sound of the kitchen screen when the next course is ordered"),
		"select",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
		options=SOUND_OPTIONS,
	),
	Setting(
		"runner_ready_sound",
		"kitchen_alerts",
		_lt("Dishes ready sound"),
		_lt("Sound of the runner screen when dishes come up ready"),
		"select",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
		options=SOUND_OPTIONS,
	),
	Setting(
		"kitchen_alert_volume",
		"kitchen_alerts",
		_lt("Alert volume"),
		_lt("A tablet plays the sounds once somebody has touched its screen."),
		"select",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
		options=(
			("Low", _lt("Low", context="Alert volume")),
			("Medium", _lt("Medium", context="Alert volume")),
			("High", _lt("High", context="Alert volume")),
		),
	),
	# The Listen buttons of the two sounds, drawn by a component of their own (they play the sound chosen above, at the volume chosen above)
	Setting(
		"kitchen_alert_listen",
		"kitchen_alerts",
		_lt("Listen to the sounds"),
		None,
		"special",
		store=DEVICE,
		till=RESTAURANT_TILL,
		kind=INFO,
	),
	# //// Neoffice — the floor alerts (NeoResto lot 1, Daniel, 01.11): when a guest orders or pays from the QR code of a table, the waiter's and the sommelier's till shows a notice
	# //// (« Table 2 — le client commande : 3 x Verre de vin ») and rings. The till reads them with its own settings (`get_pos_settings`); they are settings of the TILL (the General tab),
	# //// so a restaurant manager, who sets three till settings only (ruling 63), does not see them: the till's manager does. The sound plays at the alert volume set above.
	Setting(
		"floor_guest_popup",
		"floor_alerts",
		_lt("Popup when a guest orders"),
		_lt("Show a notice at the top of the till when a guest orders or pays from the QR code of a table"),
		"check",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
	),
	Setting(
		"floor_popup_seconds",
		"floor_alerts",
		_lt("Popup stays (seconds)"),
		_lt(
			"Seconds the notice stays on the till. 0 = until somebody dismisses it."
			" An order waiting for the waiter to validate it always stays until it is handled or dismissed"
		),
		"int",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
		depends_on=(on("floor_guest_popup"),),
		min=0,
		max=600,
	),
	Setting(
		"floor_guest_sound",
		"floor_alerts",
		_lt("Guest order sound"),
		_lt(
			"Sound of the till when a guest orders or pays from the QR code of a table."
			" It plays at the alert volume set above"
		),
		"select",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
		options=SOUND_OPTIONS,
	),
	# The Listen button of that sound, drawn by the component of the kitchen's buttons (it plays the sound chosen above, at the volume chosen above)
	Setting(
		"floor_alert_listen",
		"floor_alerts",
		_lt("Listen to the sound"),
		None,
		"special",
		store=DEVICE,
		till=RESTAURANT_TILL,
		kind=INFO,
	),
	# ---------------------------------------------------------------- Sale screen
	Setting(
		"tiles_per_row",
		"tiles",
		_lt("Tiles per row"),
		_lt(
			"How many items each row of the grid shows. « Automatic »: as many as the width of the screen"
			" allows."
			" A number: always that many, from 3 to 8; an item without a picture shows its name instead."
		),
		"segmented",
		doctype=POS_SETTINGS,
		options=TILES_PER_ROW,
	),
	# //// Neoffice — how tall the restaurant card's tiles are (NeoResto lot 1, product owner, 05.11.2026): a till with many dishes and drinks wants more tiles in the height of the screen
	Setting(
		"tile_height",
		"tiles",
		_lt("Tile height"),
		_lt(
			"How tall the tiles of the restaurant's card are. « Compact »: short pictures, and a tile with no picture"
			" just high enough for its name, so that more tiles fit without scrolling. « Large »: square pictures."
		),
		"segmented",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
		options=TILE_HEIGHT,
	),
	# //// Neoffice — how the lines of the cart look at a restaurant till (NeoResto lot 1, product owner, 05.11.2026: « on voit 3 choses par ticket, c'est pas terrible », « la quantité est
	# //// plus importante visuellement que le texte »): one compact row per article, and the picture of the article or not
	Setting(
		"cart_compact_lines",
		"items",
		_lt("Compact cart lines"),
		_lt(
			"Each line of the cart is one row: the name, the quantity and the price, with the details under it, so that"
			" the whole order is seen at a glance. Off: the taller lines, the buttons under the name."
		),
		"check",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
	),
	Setting(
		"cart_pictures",
		"pictures",
		_lt("Pictures in the cart"),
		_lt(
			"Each line of the cart shows the picture of the item, or its colour. Off: the name only, so that more of the"
			" name fits on the line."
		),
		"check",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
	),
	# A phone shows the restaurant card as buttons without pictures unless the till asks for them
	# (NeoResto lot 1, task 27; design § G: « no pictures by default, a setting with or without »)
	Setting(
		"phone_card_pictures",
		"pictures",
		_lt("Pictures on a phone"),
		_lt(
			"On a phone, each button of the restaurant's card shows the item's picture above its name. Off: the name"
			" and the price only, so that more buttons fit on the screen."
		),
		"check",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
	),
	# How the restaurant card's tiles look at the till (NeoResto lot 1, product owner, 03.11.2026: « voir comment ça donne sans images »
	# and « des couleurs par famille, pour retrouver vite un produit »)
	Setting(
		"till_card_pictures",
		"pictures",
		_lt("Pictures on the till"),
		_lt(
			"On the till, each tile of the restaurant's card shows the item's picture. Off: the name on the tile's"
			" colour, so that more tiles fit."
		),
		"check",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
	),
	Setting(
		"tile_colors",
		"tiles",
		_lt("Colours of the tiles"),
		_lt(
			"Each tile of the restaurant's card takes the colour of its item, else of its item group (the Service Colour"
			" of the group, set at the desk), on the till and on a phone."
		),
		"check",
		doctype=POS_SETTINGS,
		till=RESTAURANT_TILL,
	),
	Setting(
		"display_item_code",
		"items",
		_lt("Show the item code"),
		_lt("Shows the code of each item under its name in the grid."),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"show_variants_as_items",
		"items",
		_lt("Show variants as items"),
		_lt(
			"Each variant (size, colour…) appears as an item of the grid, instead of the template item"
			" followed by"
			" a choice."
		),
		"check",
		doctype=POS_SETTINGS,
		applies=APPLIES_CATALOGUE,
	),
	Setting(
		"hide_unavailable_items",
		"items",
		_lt("Hide unavailable items"),
		_lt("The items with no stock in the warehouse of the till are no longer offered."),
		"check",
		doctype=POS_PROFILE,
		applies=APPLIES_CATALOGUE,
	),
	Setting(
		"item_groups",
		"items_offered",
		_lt("Item groups"),
		_lt("Only the items of these groups show in the till. Empty: every item."),
		"multiselect",
		doctype=POS_PROFILE,
		choices="item_groups",
		applies=APPLIES_CATALOGUE,
	),
	Setting(
		"custom_brands_table",
		"items_offered",
		_lt("Brands"),
		_lt("Only the items of these brands show. Empty: every brand."),
		"multiselect",
		doctype=POS_PROFILE,
		choices="brands",
		applies=APPLIES_CATALOGUE,
	),
	# ---------------------------------------------------------------- Prices and discounts
	Setting(
		"tax_inclusive",
		"prices",
		_lt("Prices include VAT"),
		_lt("The prices shown and entered include VAT."),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"selling_price_list",
		"prices",
		_lt("Price list"),
		_lt("The list the till reads its prices from; it must be in the currency of the till."),
		"link",
		doctype=POS_PROFILE,
		choices="price_lists",
		applies=APPLIES_CATALOGUE,
	),
	Setting(
		"ignore_pricing_rule",
		"prices",
		_lt("Ignore pricing rules"),
		_lt("Pricing rules (promotions, prices by quantity) do not apply at this till."),
		"check",
		doctype=POS_PROFILE,
		applies=APPLIES_CATALOGUE,
	),
	Setting(
		"allow_user_to_edit_additional_discount",
		"discounts",
		_lt("Allow an additional discount"),
		_lt("The cashier can give a discount on the whole receipt."),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"allow_user_to_edit_item_discount",
		"discounts",
		_lt("Allow an item discount"),
		_lt("The cashier can give a discount on an item of the cart."),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"allow_user_to_edit_rate",
		"discounts",
		_lt("Allow price changes"),
		_lt("The cashier can change the price of an item in the cart, except when an offer applies to it."),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"use_percentage_discount",
		"discounts",
		_lt("Discounts in percent"),
		_lt("Discounts are entered as a percentage rather than as an amount."),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"max_discount_allowed",
		"discounts",
		_lt("Maximum discount (%)"),
		_lt("The largest discount a cashier can give, in percent. 0: no limit."),
		"percent",
		doctype=POS_SETTINGS,
		min=0,
		max=100,
	),
	Setting(
		"barcode_rules",
		"scale_barcodes",
		_lt("Barcode rules"),
		_lt(
			"The rules that read scale barcodes, where the code holds the item and the weight or the price."
			" One"
			" line per rule."
		),
		"table",
		doctype=POS_SETTINGS,
	),
	# ---------------------------------------------------------------- Sales
	Setting(
		"allow_credit_sale",
		"payment",
		_lt("Allow credit sales"),
		_lt(
			"The customer takes the goods and pays later: the sale stays due on the account of the customer."
		),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"allow_customer_credit_payment",
		"payment",
		_lt("Pay with the credit of the customer"),
		_lt("The customer pays with the credit on the account (returns, overpayments)."),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"allow_partial_payment",
		"payment",
		_lt("Allow partial payment"),
		_lt("The customer pays a part now and the rest later."),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"use_exact_amount",
		"payment",
		_lt("Exact amount for card and transfer"),
		_lt(
			"Card and transfer pay the exact amount; only cash gives change. Not with credit sales nor partial"
			" payment: ticking one of them unticks this one."
		),
		"check",
		doctype=POS_SETTINGS,
		depends_on=(off("allow_credit_sale"), off("allow_partial_payment")),
		indent=False,
	),
	Setting(
		"return_validity_days",
		"returns",
		_lt("Return validity (days)"),
		_lt("The number of days during which a sale can be returned. 0: no limit."),
		"int",
		doctype=POS_SETTINGS,
		min=0,
	),
	Setting(
		"allow_sales_order",
		"sales_orders",
		_lt("Create sales orders"),
		_lt("The cashier can turn the cart into a sales order. Shop till only."),
		"check",
		doctype=POS_SETTINGS,
		till=SHOP,
	),
	Setting(
		"enable_gift_cards",
		"gift_cards",
		_lt("Enable gift cards"),
		_lt("The till sells gift cards and takes them as payment."),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"gift_card_item",
		"gift_cards",
		_lt("Gift card item"),
		_lt("The item sold when a gift card is sold; its price becomes the value of the card."),
		"link",
		doctype=POS_SETTINGS,
		depends_on=(on("enable_gift_cards"),),
		search="Item",
	),
	Setting(
		"enable_gift_card_splitting",
		"gift_cards",
		_lt("Keep the rest on the card"),
		_lt("When the card is worth more than the receipt, the rest stays on the card for next time."),
		"check",
		doctype=POS_SETTINGS,
		depends_on=(on("enable_gift_cards"),),
	),
	Setting(
		"gift_card_validity_months",
		"gift_cards",
		_lt("Gift card validity (months)"),
		_lt("How long a gift card is valid, in months. 0: no end date."),
		"int",
		doctype=POS_SETTINGS,
		depends_on=(on("enable_gift_cards"),),
		min=0,
	),
	Setting(
		"gift_card_notification",
		"gift_cards",
		_lt("Gift card notification"),
		_lt("The e-mail template sent when a gift card is created, with its code."),
		"link",
		doctype=POS_SETTINGS,
		depends_on=(on("enable_gift_cards"),),
		choices="gift_card_notifications",
	),
	# ---------------------------------------------------------------- Stock
	Setting(
		"warehouse",
		"warehouse",
		_lt("Warehouse of this till"),
		_lt("Every sale of this till takes its stock from this warehouse."),
		"link",
		doctype=POS_PROFILE,
		choices="warehouses",
		applies=APPLIES_PROFILE,
	),
	Setting(
		"posa_block_sale_beyond_available_qty",
		"warehouse",
		_lt("Block a sale beyond the stock"),
		_lt(
			"Where the site allows negative stock, this box decides: ticked, the till refuses an item beyond the"
			" stock of its warehouse, when it is added and when the sale is checked before it is booked; unticked,"
			" it sells it. Where the site refuses negative stock (Stock Settings, at the office), the till refuses"
			" it whatever this box says."
		),
		"check",
		doctype=POS_PROFILE,
		applies=APPLIES_SETTINGS,
		needs_site=SITE_ALLOWS_NEGATIVE_STOCK,
	),
	# The background refresh of the stock quantities is always on, with no switch and no interval (product owner,
	# 31.10.2026): the screen only shows its state, this computer's, read from the till's worker.
	Setting(
		"stock_sync_status",
		"stock_sync",
		_lt("Stock sync"),
		_lt(
			"The quantities on screen are refreshed from the server every minute, in addition to the live updates"
			" from the other tills."
		),
		"special",
		store=DEVICE,
		kind=INFO,
	),
	Setting(
		"negative_stock_note",
		"negative_stock",
		_lt("Negative stock"),
		_lt(
			"Selling below zero is a setting of the whole site, every till included: it is set at the"
			" office, in"
			" the Stock Settings."
		),
		"special",
		store=DEVICE,
		kind=INFO,
	),
	# ---------------------------------------------------------------- Printing
	Setting(
		"print_format",
		"receipt",
		_lt("Print format"),
		_lt("The layout of the printed receipt."),
		"link",
		doctype=POS_PROFILE,
		choices="print_formats",
	),
	Setting(
		"letter_head",
		"receipt",
		_lt("Letter head"),
		_lt("The heading printed at the top of the receipt (logo, address)."),
		"link",
		doctype=POS_PROFILE,
		choices="letter_heads",
	),
	Setting(
		"pos_margin_vertical",
		"receipt",
		_lt("Vertical margin of the receipt (mm)"),
		_lt(
			"The margin at the top and at the bottom of the 80 mm receipt. Empty: the one of the print theme."
		),
		"float",
		doctype=POS_PROFILE,
		min=0,
		provided_by="neoffice_theme",
		placeholder=_lt("As the theme"),
	),
	Setting(
		"pos_margin_horizontal",
		"receipt",
		_lt("Horizontal margin of the receipt (mm)"),
		_lt("The margin on the left and on the right of the receipt. Empty: the one of the print theme."),
		"float",
		doctype=POS_PROFILE,
		min=0,
		provided_by="neoffice_theme",
		placeholder=_lt("As the theme"),
	),
	Setting(
		"pos_show_logo",
		"receipt",
		_lt("Logo on the receipt"),
		_lt(
			"Forces the logo on the receipt of this till, or takes it away. « As the theme »: as the print"
			" theme"
			" says."
		),
		"segmented",
		doctype=POS_PROFILE,
		options=(("", _lt("As the theme")), ("Show", _lt("Show")), ("Hide", _lt("Hide"))),
		provided_by="neoffice_theme",
	),
	Setting(
		"allow_print_draft_invoices",
		"receipt",
		_lt("Print drafts"),
		_lt("The cashier can print a sale on hold before taking the payment, e.g. a bill."),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"receipt_printer",
		"network_printer",
		_lt("Network printer (Star, no computer needed)"),
		_lt(
			"A Star printer on the network prints the receipts without a computer. « None »: the browser or"
			" QZ Tray"
			" prints."
		),
		"special",
		store=CLOUDPRNT,
	),
	Setting(
		"auto_print",
		"network_printer",
		_lt("Print the receipt when the sale is validated"),
		_lt("The receipt comes out by itself when the sale is validated."),
		"special",
		store=CLOUDPRNT,
		depends_on=(on("receipt_printer"),),
	),
	Setting(
		"open_drawer",
		"network_printer",
		_lt("The cash drawer opens at a sale"),
		_lt(
			"When the cash drawer plugged into the printer opens: at the cash sales, at every sale, or never."
		),
		"special",
		store=CLOUDPRNT,
		depends_on=(on("receipt_printer"),),
	),
	Setting(
		"test_print",
		"network_printer",
		_lt("Test print"),
		None,
		"special",
		store=CLOUDPRNT,
		depends_on=(on("receipt_printer"),),
		kind=ACTION,
	),
	Setting(
		"print_receipt_on_order_complete",
		"without_network_printer",
		_lt("Print at the end of the sale"),
		_lt(
			"Without a network printer: the receipt prints through the browser or QZ Tray at the end of each"
			" sale."
		),
		"check",
		doctype=POS_PROFILE,
		applies=APPLIES_PROFILE,
	),
	Setting(
		"silent_print",
		"qz_tray",
		_lt("Silent printing (QZ Tray)"),
		_lt(
			"The receipt goes straight to a thermal printer plugged into this computer, without a print"
			" window."
			" Needs the QZ Tray software."
		),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"qz_printer",
		"qz_tray",
		_lt("Printer"),
		_lt("The thermal printer QZ Tray uses on this computer."),
		"special",
		store=DEVICE,
		depends_on=(on("silent_print"),),
	),
	Setting(
		"qz_certificate",
		"qz_tray",
		_lt("Signing certificate"),
		None,
		"special",
		store=DEVICE,
		depends_on=(on("silent_print"),),
		kind=ACTION,
	),
	Setting(
		"station_printers",
		"preparation_stations",
		_lt("Printer of each station"),
		_lt(
			"The printer that prints the tickets of the station. « Screen only »: the station reads its"
			" orders on screen."
		),
		"special",
		store=CLOUDPRNT,
		till=RESTAURANT_TILL,
	),
	# ---------------------------------------------------------------- Closing
	Setting(
		"closing_withdrawal_template",
		"counting",
		_lt("Withdrawal template at closing"),
		_lt(
			"The journal entry template of a cash withdrawal at closing. The balance left becomes the float"
			" offered at the next opening."
		),
		"link",
		doctype=POS_SETTINGS,
		choices="journal_entry_templates",
	),
	Setting(
		"hide_expected_amount",
		"counting",
		_lt("Hide the expected amount"),
		_lt(
			"The cashier counts the cash without seeing the expected amount; the difference shows after the"
			" count."
		),
		"check",
		doctype=POS_SETTINGS,
	),
	Setting(
		"posa_cash_entry_templates",
		"cash_movements",
		_lt("Cash movements offered"),
		_lt(
			"The movements offered in « Cash in / out », e.g. adding change or a withdrawal for the bank."
			" Empty:"
			" every template."
		),
		"multiselect",
		doctype=POS_PROFILE,
		choices="journal_entry_templates",
	),
	# //// Neoffice — the two limits of the cash movements (NeoResto lot 1, task 15), added to the list when this task's
	# //// registry met them: the most a shift may take out of the drawer, and how long an offline movement keeps its day.
	Setting(
		"posa_cash_movement_out_limit",
		"cash_movements",
		_lt("Cash out limit per shift"),
		_lt("The most the cash movements of this till may take out of the drawer during one shift. Empty: no limit."),
		"float",
		doctype=POS_PROFILE,
		min=0,
	),
	Setting(
		"posa_cash_movement_offline_hours",
		"cash_movements",
		_lt("Offline cash movement window (hours)"),
		_lt(
			"A cash movement recorded while the till was offline is booked on the day the till recorded it when it"
			" reaches the server within this many hours; later, it is booked on the day it arrives, with a note."
			" 0: always on the day it arrives."
		),
		"int",
		doctype=POS_PROFILE,
		min=0,
	),
	Setting(
		"posa_allow_delete",
		"cash_movements",
		_lt("Delete drafts at closing"),
		_lt("At closing, the sales left as drafts can be deleted instead of being carried over."),
		"check",
		doctype=POS_PROFILE,
	),
	Setting(
		"eod_email_recipients",
		"eod_report",
		_lt("End-of-day report recipients"),
		_lt(
			"The addresses that receive the end-of-day report as a PDF, separated by commas. Empty: the"
			" address of"
			" the cashier."
		),
		"text",
		doctype=POS_SETTINGS,
	),
	Setting(
		"eod_email_auto",
		"eod_report",
		_lt("Send the report automatically"),
		_lt(
			"The report goes to these addresses as soon as the shift is closed, without the cashier doing"
			" anything."
		),
		"check",
		doctype=POS_SETTINGS,
		depends_on=(on("eod_email_recipients"),),
	),
	# ---------------------------------------------------------------- The office only (never at the till)
	Setting(
		"pos_profile",
		"till_identity",
		_lt("Till"),
		_lt("The till these settings belong to: one record per till."),
		"link",
		doctype=POS_SETTINGS,
		desk_only=True,
	),
	# //// Neoffice — ONE switch for "is this till in use" (Daniel, 06.11.2026: "un switch activé et un switch désactivé, c'est
	# //// un peu bizarre"): ERPNext's own `disabled` of the profile, shown the right way round. POS Settings.enabled (the
	# //// POSNext record is used or ignored) is no longer a choice of anybody: it follows the profile (see NOT_LISTED).
	Setting(
		"disabled",
		"till_identity",
		_lt("Active till"),
		_lt("Switched off, the till can no longer be opened; its past sales remain."),
		"check",
		doctype=POS_PROFILE,
		desk_only=True,
		inverted=True,
	),
	Setting(
		"company",
		"till_identity",
		_lt("Company"),
		_lt("The company the till belongs to; it decides the accounts and the currency."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"company_address",
		"till_identity",
		_lt("Company address"),
		_lt("The address of the company printed on the receipts and on the end-of-day report."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"applicable_for_users",
		"till_users",
		_lt("Users of this till"),
		_lt("The people who can open this till; the one marked « Default » opens it straight away."),
		"table",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"enable_restaurant_mode",
		"restaurant_till",
		_lt("Restaurant till"),
		_lt(
			"Makes this till a restaurant till: floor plan, tables, kitchen and the Restaurant tabs. Decided"
			" at the"
			" office."
		),
		"check",
		doctype=POS_SETTINGS,
		desk_only=True,
	),
	Setting(
		"restaurant",
		"restaurant_till",
		_lt("Restaurant"),
		_lt("The restaurant of this till: its hours, its cards and its settings apply."),
		"link",
		doctype=POS_SETTINGS,
		depends_on=(on("enable_restaurant_mode"),),
		desk_only=True,
	),
	Setting(
		"payments",
		"payment_methods",
		_lt("Payment methods"),
		_lt(
			"The payment methods offered at checkout; the one marked « Default » is selected first. Each is"
			" tied"
			" to an account."
		),
		"table",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"posa_cash_mode_of_payment",
		"payment_methods",
		_lt("Cash payment method"),
		_lt("The payment method that counts as cash: it gives change and enters the count at closing."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"custom_active_payment_devices",
		"payment_methods",
		_lt("Payment terminals"),
		_lt(
			"For each payment method that goes through a terminal, the terminal or terminals of this till;"
			" the one"
			" marked « Default » is offered first."
		),
		"table",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"enable_loyalty_program",
		"loyalty",
		_lt("Enable the loyalty program"),
		_lt("The customers earn points with every purchase."),
		"check",
		doctype=POS_SETTINGS,
		desk_only=True,
	),
	Setting(
		"default_loyalty_program",
		"loyalty",
		_lt("Loyalty program"),
		_lt("The loyalty program of the till, defined at the office."),
		"link",
		doctype=POS_SETTINGS,
		depends_on=(on("enable_loyalty_program"),),
		desk_only=True,
	),
	Setting(
		"wallet_account",
		"loyalty",
		_lt("Wallet account"),
		_lt("The receivable account where the wallets of the customers are kept."),
		"link",
		doctype=POS_SETTINGS,
		depends_on=(on("enable_loyalty_program"),),
		desk_only=True,
	),
	Setting(
		"auto_create_wallet",
		"loyalty",
		_lt("Create the wallet automatically"),
		_lt("Each new customer gets a wallet. Always on with the loyalty program."),
		"check",
		doctype=POS_SETTINGS,
		depends_on=(on("enable_loyalty_program"),),
		desk_only=True,
	),
	Setting(
		"loyalty_to_wallet",
		"loyalty",
		_lt("Convert loyalty points into the wallet"),
		_lt(
			"The points earned become a wallet balance, at the rate of the program. Always on with the"
			" loyalty program."
		),
		"check",
		doctype=POS_SETTINGS,
		depends_on=(on("enable_loyalty_program"),),
		desk_only=True,
	),
	Setting(
		"currency",
		"accounts",
		_lt("Currency"),
		_lt("The currency of the till, the one of its price list."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"write_off_account",
		"accounts",
		_lt("Write-off account"),
		_lt("The account that receives the small differences written off, e.g. the rounding cents."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"write_off_cost_center",
		"accounts",
		_lt("Write-off cost center"),
		_lt("The cost center of those write-offs."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"account_for_change_amount",
		"accounts",
		_lt("Change account"),
		_lt("The account the change given back comes from, usually the cash of the till."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"income_account",
		"accounts",
		_lt("Income account"),
		_lt("The income account of the sales, when the item names none."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"expense_account",
		"accounts",
		_lt("Expense account"),
		_lt("The expense account of the items sold. Shown only with perpetual inventory."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"cost_center",
		"accounts",
		_lt("Cost center"),
		_lt("The cost center of the sales of the till."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"taxes_and_charges",
		"taxes",
		_lt("Taxes and charges"),
		_lt("The VAT template applied to the sales of the till."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"apply_discount_on",
		"taxes",
		_lt("Apply discount on"),
		_lt(
			"A discount on the receipt is worked out on the total with or without VAT: it changes the VAT"
			" due."
		),
		"select",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"tax_category",
		"taxes",
		_lt("Tax category"),
		_lt("The tax category of the sales; it chooses the VAT rate of each item."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"write_off_limit",
		"write_off",
		_lt("Write-off limit"),
		_lt("The differences below this amount are written off when the sales are consolidated."),
		"float",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"disable_rounded_total",
		"write_off",
		_lt("Disable rounded total"),
		_lt("The total is not rounded (to 5 centimes in Swiss francs)."),
		"check",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"tc_name",
		"invoice_documents",
		_lt("Terms and conditions"),
		_lt("The terms and conditions printed on the invoices of the till."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	Setting(
		"select_print_heading",
		"invoice_documents",
		_lt("Print heading"),
		_lt("The title printed at the top of the document, instead of « Invoice »."),
		"link",
		doctype=POS_PROFILE,
		desk_only=True,
	),
	# ---------------------------------------------------------------- Scanning in the shop (lot 5)
	# //// Neoffice — the settings of scanning in the shop, set at the till now that the phone's page, the till's takeover and
	# //// the payment on the phone work (they were left to the desk until then, NOT_LISTED). A shop till only.
	Setting(
		"enable_shop_scan",
		"shop_scan",
		_lt("Let customers scan their articles"),
		_lt(
			"Customers scan the articles of this till with their phone, from the shop's QR code, and the till"
			" takes their cart over by its code. Off by default."
		),
		"check",
		doctype=POS_SETTINGS,
		till=SHOP,
	),
	Setting(
		"shop_scan_poster",
		"shop_scan",
		_lt("The shop's QR code"),
		_lt("One fixed code, to show at the entrance and in the aisles: print its poster."),
		"special",
		store=DEVICE,
		till=SHOP,
		depends_on=(on("enable_shop_scan"),),
		kind=ACTION,
	),
	Setting(
		"shop_cart_lifetime_hours",
		"shop_scan",
		_lt("An abandoned cart is deleted after (hours)"),
		_lt(
			"A cart neither paid nor taken over is deleted after this many hours. A paid cart is never"
			" deleted: it waits for its check."
		),
		"int",
		doctype=POS_SETTINGS,
		till=SHOP,
		depends_on=(on("enable_shop_scan"),),
		min=1,
		max=72,
	),
	Setting(
		"shop_scan_phone_payment",
		"shop_scan_payment",
		_lt("Pay on the phone"),
		_lt(
			"The customer may pay the cart on the phone, by the payment page of the restaurant's guests. A paid"
			" cart is always checked at the reception before the customer leaves."
		),
		"check",
		doctype=POS_SETTINGS,
		till=SHOP,
		depends_on=(on("enable_shop_scan"),),
	),
	Setting(
		"shop_scan_validation_on_phone",
		"shop_scan_payment",
		_lt("An article to check, on the phone"),
		_lt(
			"An article a seller checks (ticked on the item or on its item group): the cart is paid at the till,"
			" or it is paid on the phone and the seller checks the article at the counter."
		),
		"select",
		doctype=POS_SETTINGS,
		till=SHOP,
		depends_on=(on("enable_shop_scan"), on("shop_scan_phone_payment")),
		options=(
			("Blocks the payment", _lt("Blocks the payment, paid at the till")),
			("Paid, checked at the counter", _lt("Paid, the seller checks it at the counter")),
		),
	),
	Setting(
		"allow_negative_stock",
		"negative_stock",
		_lt("Allow negative stock"),
		_lt(
			"Sell even when the stock is at zero. This changes the Stock Settings of the whole site, every"
			" till"
			" included."
		),
		"check",
		doctype=POS_SETTINGS,
		desk_only=True,
	),
)

_BY_KEY = {setting.key: setting for setting in SETTINGS}

# The fields of these doctypes that the list leaves out, and why. A screen shows none of them.
_INERT = "read by no code of the till: an option of POS Awesome that POSNext copied and never wired (Task 14)"
_OLD_TILL = "an option of ERPNext's own till page, which this till does not use"
_RESTAURANT_FORM = "set on the restaurant's own form, not a setting of a till"
# //// Neoffice — the key of the shop's QR code is set by the system the first time it is asked for (scanning in the shop)
_SET_BY_THE_SYSTEM = "set by the system the first time the shop's QR code is asked for: nobody types it"
NOT_LISTED = {
	POS_SETTINGS: {
		"enabled": (
			"follows the POS Profile's own switch ('Active till', its `disabled`): pos_profile_settings.follow_the_profile"
			" keeps the two in step, so the page asks once"
		),
		"shop_scan_key": _SET_BY_THE_SYSTEM,
		"allow_return": _INERT,
		"default_card_view": _INERT,
		"show_customer_balance": _INERT,
		"display_discount_percentage": _INERT,
		"display_discount_amount": _INERT,
		"allow_select_sales_order": _INERT,
		"create_only_sales_order": _INERT,
		"allow_return_without_invoice": _INERT,
		"allow_free_batch_return": _INERT,
		"decimal_precision": _INERT,
		"allow_customer_purchase_order": _INERT,
		"allow_duplicate_customer_names": _INERT,
		"fetch_coupon": _INERT,
		"allow_print_last_invoice": _INERT,
		"use_delivery_charges": _INERT,
		"auto_set_delivery_charges": _INERT,
		"use_limit_search": _INERT,
		"search_limit": _INERT,
		"allow_submissions_in_background_job": _INERT,
		"allow_delete_offline_invoice": _INERT,
		"allow_change_posting_date": _INERT,
		"input_qty": _INERT,
		"enable_sales_persons": (
			"switched off on purpose by the merge of 28.10.2026, until a till's use is decided"
		),
		"cart_lifo": "switched off on purpose by the merge of 28.10.2026: the newest line always comes first",
		# //// Neoffice — the banner is gone (Daniel, 01.11), so are its seconds: the ticket flashes until the kitchen starts it. The field stays in the doctype, hidden, for the rows already stored.
		"kitchen_popup_seconds": "no longer used: the banner of the kitchen screen is gone, the ticket flashes until the kitchen starts it",
	},
	POS_PROFILE: {
		"country": "information only, fetched from the company",
		"campaign": _OLD_TILL,
		"hide_images": _OLD_TILL,
		"auto_add_item_to_cart": _OLD_TILL,
		"allow_rate_change": _OLD_TILL + "; POS Settings.allow_user_to_edit_rate is the till's",
		"allow_discount_change": _OLD_TILL + "; POS Settings.allow_user_to_edit_item_discount is the till's",
		"disable_grand_total_to_default_mop": _OLD_TILL,
		"validate_stock_on_save": (
			"hidden on purpose (neoffice_theme): it acts on POS Invoices, the till books Sales Invoices"
		),
		"project": "not copied onto the sales of the till",
		"allow_partial_payment": "a duplicate: the till reads POS Settings.allow_partial_payment",
		"update_stock": "the till books the stock of every sale whatever it says (invoices set update_stock)",
		"customer_groups": (
			"not read by this till: api.customers.get_customers filters by a `customer_group` field POS Profile does"
			" not have, so every customer is offered whatever the table says; only ERPNext's own POS page reads it"
		),
		"posa_allow_pos_expense": (
			"switched off on purpose by the merge of 28.10.2026: the till's cash in / out is the one system"
		),
		"posa_maximum_expense_amount": "switched off on purpose with the expenses of the till",
		"posa_allowed_expense_accounts": "switched off on purpose with the expenses of the till",
		"posa_allow_cancel_pos_expense": "switched off on purpose with the expenses of the till",
		"posa_expense_cancel_roles": "switched off on purpose with the expenses of the till",
		# Custom fields another app or the hub adds on some sites
		"link_gift_card": (
			"the gift cards of ERPNext's own till page (POS Settings has the till's gift cards)"
		),
		"enable_gift_card": (
			"the gift cards of ERPNext's own till page (POS Settings has the till's gift cards)"
		),
		"number_of_valid_months": (
			"the gift cards of ERPNext's own till page (POS Settings has the till's gift cards)"
		),
		"cloudprnt_printer": (
			"read by no code: the cloudprnt app keeps the printer of a till on its printer rows"
		),
		"cloudprnt_printer_name": (
			"read by no code: the cloudprnt app keeps the printer of a till on its printer rows"
		),
		"disable_auto_price": "read by no code",
	},
	RESTAURANT: {
		"restaurant_name": _RESTAURANT_FORM,
		"company": _RESTAURANT_FORM,
		"enabled": _RESTAURANT_FORM,
		"logo": _RESTAURANT_FORM,
		"address": _RESTAURANT_FORM,
		"tip_item": (
			_RESTAURANT_FORM + " (made when tips are switched on; the till shows whether it is ready)"
		),
		"tip_account": (
			_RESTAURANT_FORM + " (made when tips are switched on; the till shows whether it is ready)"
		),
		# Task 10's field: where a site already has it, it is classified like the restaurant's other own fields
		"takeaway_tax_category": _RESTAURANT_FORM + " (the VAT of the takeaway sales, set at the office)",
		# //// Neoffice — the mode of payment a customer's loss is written off with (08.11.2026): an accounting choice, made with the accountant at the office
		"loss_mode_of_payment": _RESTAURANT_FORM
		+ " (the holding account the accountant clears at the month's end: an accounting choice, made at the office)",
	},
}


def get(key: str) -> Setting:
	"""The setting of that key (KeyError when the list has none)."""
	return _BY_KEY[key]


def till_settings() -> list[Setting]:
	"""What the till's screen may show, in the order of the list: every entry but the office's."""
	return [setting for setting in SETTINGS if not setting.desk_only]


def document_settings(doctype: str) -> list[Setting]:
	"""The listed fields of a doctype, office's included."""
	return [setting for setting in SETTINGS if setting.doctype == doctype and setting.store == DOCUMENT]


def shown_on(setting: Setting, restaurant_till: bool) -> bool:
	"""Whether a till of that type shows the setting: every till, a shop till only, or a restaurant till"
	" only."""
	if setting.till == RESTAURANT_TILL:
		return restaurant_till
	if setting.till == SHOP:
		return not restaurant_till
	return True


def condition(setting: Setting) -> str | None:
	"""Its conditions as a desk expression (`eval:…` on `doc`), for a form's `read_only_depends_on`: the setting
	is read-only while it is NOT met. None when it depends on nothing."""
	if not setting.depends_on:
		return None
	parts = []
	for when in setting.depends_on:
		if when.off:
			parts.append(f"!doc.{when.key}")
		elif when.equals is not None:
			parts.append(f"doc.{when.key}=={when.equals!r}")
		else:
			parts.append(f"doc.{when.key}")
	return "eval:!(" + " && ".join(parts) + ")"


def serialize(setting: Setting) -> dict:
	"""A setting as a screen reads it: its texts translated in the language of the session."""
	return {
		"key": setting.key,
		"field": setting.field,
		"doctype": setting.doctype,
		"store": setting.store,
		"tab": setting.tab,
		"group": setting.group,
		"label": str(setting.label),
		"help": str(setting.help) if setting.help else "",
		"widget": setting.widget,
		"kind": setting.kind,
		"till": setting.till,
		"depends_on": [
			{"key": when.key, "equals": when.equals, "off": when.off} for when in setting.depends_on
		],
		"indent": setting.is_indented,
		"desk_only": setting.desk_only,
		"options": [{"value": value, "label": str(label)} for value, label in setting.options],
		"min": setting.min,
		"max": setting.max,
		"search": setting.search,
		"placeholder": str(setting.placeholder) if setting.placeholder else "",
		"applies": setting.applies,
	}


def serialize_tab(tab: Tab) -> dict:
	return {"key": tab.key, "label": str(tab.label), "section": tab.section}


def serialize_group(group: Group) -> dict:
	return {
		"key": group.key,
		"tab": group.tab,
		"label": str(group.label),
		"column": group.column,
		"scope": group.scope,
	}
