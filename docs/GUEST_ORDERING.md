<!-- //// Neoffice — added file (no upstream equivalent). Documents QR self-ordering at the
//// table and web takeaway: how a guest reaches the menu with no account, what the short-lived
//// Guest Order Token grants, and the time-slot rules (c5208ba7, 2026-03-28, "QR button on
//// table view + time-slot guest menu + docs"). -->
# Guest Ordering — QR Self-Ordering & Takeaway Web

## Overview

Guest ordering allows restaurant customers to browse the menu, place orders, and pay directly from their phone — without installing an app or creating an account. It also provides a web-based takeaway ordering flow for pickup customers.

Two entry points, one shared engine:
- **QR Restaurant**: Server opens table → QR code → customer scans → orders → pays (split payment supported)
- **Takeaway Web**: Customer visits `/pos/order` → creates account → orders → pays → picks up

## Setup

### 1. Enable in Restaurant Settings

The settings are the **Restaurant**'s (one set per restaurant), set at the till in **Till settings** › « Online ordering », or at the office:

| Setting | Options | Description |
|---------|---------|-------------|
| Enable QR Ordering | Check | Activates QR ordering for restaurant tables |
| Guest Menu | Link → Restaurant Card | Which menu to show guests (or flag a card as "Guest Menu") |
| Order Validation | Direct to Kitchen / Server Approval | Whether guest orders go straight to kitchen or need server confirmation |
| Guest Account Mode | Not Proposed / Optional / Mandatory | Whether to prompt guests for account creation at payment |
| Token Expiry Mode | On Table Close / On Payment / Timed | When a table's code stops working. « Timed » adds a delay; « On Table Close » and « On Payment » both mean: when the table is freed (nothing reads « On Payment » apart from that, neoffice-maintenance#2484) |
| Token Expiry Days | Integer | Number of days before timed tokens expire |
| Enable Web Takeaway | Check | Activates the `/pos/order` takeaway page |
| Takeaway Menu | Link → Restaurant Card | Which menu to show takeaway customers |
| Takeaway Orders Taken (`takeaway_hours`) | Always / Opening Hours / Fixed Hours | When the `/pos/order` page takes a new order (below, « Takeaway hours ») |
| Takeaway From / To (`takeaway_open_from`, `takeaway_open_to`) | Time | Fixed Hours only: the hours orders are taken; an end before the start runs past midnight |
| Takeaway Days (`takeaway_days`) | Monday … Sunday | Fixed Hours only: the days orders are taken; none: every day |
| First Takeaway Order After Opening / Last Takeaway Order Before Closing | Minutes | Not with Always: no new order in the first minutes after each opening and the last before each closing |

### 2. Create a Guest Menu

In any **Restaurant Card**, check the **Guest Menu** checkbox. This card will be displayed to guest customers. Alternatively, link a specific card in Restaurant Settings → Guest Menu.

### 3. HTTPS Required

QR code scanning requires HTTPS (camera access policy). Ensure the site uses HTTPS in production.

## Architecture

### Routes

| Route | Page | Auth | Purpose |
|-------|------|------|---------|
| `/pos/guest/:token` | GuestOrder.vue | Token (allowGuest) | QR restaurant ordering |
| `/pos/order` | TakeawayOrder.vue | Token (allowGuest) | Takeaway web ordering |

### Backend API

All guest endpoints in `pos_next/api/guest_ordering.py`:

| Endpoint | Guest? | Description |
|----------|--------|-------------|
| `validate_token(token)` | Yes | Validates token, returns table info + settings + `restaurant_name`, the display name of the restaurant of the session (the guest page names its tab with it) |
| `get_guest_menu(token)` | Yes | Returns categories + items from guest menu card |
| `submit_guest_order(token, items)` | Yes | Adds items to the table's Sales Invoice |
| `get_order_status(token)` | Yes | Returns current items, totals, paid amount |
| `create_guest_payment(token, amount, payment_items, tip, success_url, failed_url)` | Yes | Creates a Payment Intent on the site's Wallee provider (`payments` app) and returns the hosted payment page URL |
| `create_table_token(table, pos_profile)` | No (desk account) | Returns the table's active token, or generates one when it has none that can still be used. Asks the rule of the floor read (`get_tables`), `permissions.require_floor_access`: whoever the till shows the floor to may press QR for a table of that till's restaurant, no wider and no narrower. That is a desk account that may read the restaurant of the till it names: the roles that read a Restaurant (the cashier, the managers; a kitchen screen's account holds a till role), and the per-restaurant User Permissions, so a user kept to restaurant B who names a till of restaurant A gets neither A's floor nor A's live code. No assignment to the till, no right on the table and no right on the token is asked on top (the code is made with the authority of that check). Refused to a visitor and a portal account, for a table that is not of the restaurant of the till it names, and where the site does not run NeoResto |
| `create_takeaway_token()` | Yes | Generates token for takeaway (rate-limited per visitor); answers `restaurant_name`, the default restaurant's. Refused, with when orders open again, outside the restaurant's takeaway hours |
| `submit_takeaway_order(token, items)` | Yes | No page calls it any more: answers the order its session's payment paid (`_settle_takeaway_order` finishes a paid order) |

### Token Lifecycle

```
Server presses QR on a table → create_table_token() → the table's active Guest Order Token (created if it has none)
                                           ↓
                               Token: Active, linked to the table (and the till that pressed)
                                           ↓
                               Customer scans QR → validate_token()
                                           ↓
                               Orders/payments via token
                                           ↓
                               Table freed OR (Timed) its delay runs out → expired, is_valid() = false
```

**A table's code follows the table, not the till's shift** (product owner, 10.11.2026, neoffice-maintenance#2484). Closing the till's shift (`POS Opening Shift`) does not touch it: a table's open order outlives a closing on purpose (a restaurant with two services), and a payment made on the QR page is booked only while its code is valid. A code used to be bound to ERPNext's own till session (`POS Opening Entry`, through `_get_active_pos_opening`), which this till never opens: on a site that never sold with ERPNext's till it was bound to nothing, and on a site that kept old entries « Open » it was bound to one of them. Nothing new is bound to an entry now; a code an older version bound to one still dies with it, so nothing expired comes back. The other two kinds of session have their own rule: a shop session (scanning in the shop) dies with the till's `POS Opening Shift` (`pos_opening_shift`, neoffice-maintenance#2473), a takeaway session follows the restaurant's takeaway hours (below).

Pressing the QR button again, from the same till or another, shows the same code: a table with an active token never gets a new one, so the code already placed on the table keeps working. A new token is made only when the table has none that can still be used (it was freed, or its time ran out). The QR dialog says in one line what the code is for.

The QR button sits in the header bar of the open table (`TableHeaderBar.vue`), beside "Back": always in view, a 44 px touch target with the QR icon and the word, at every width (it used to be the last button of the row of the restaurant's cards, where a few cards pushed it off a phone's screen). The waiter shows the table's code on his phone to the guests, who scan it: below 640 px the dialog is the whole screen (`TableQRCode.vue`), the code as large as the width allows and never under 300 px, in ink on white with its quiet zone, the table's name large above it, the line that says what the code is for, and a "Close" button in ink at the bottom, within thumb reach. A phone prints nothing, so "Print" is not offered there. The screen is kept awake while the code is shown (Screen Wake Lock API, released when the dialog closes, and skipped without a word where the browser has none or refuses). On a tablet and a desktop the dialog keeps its size, with "Print" and "Close", the primary button in ink. The dialog is the till's overlay, at z-300 like the others, above the sticky header (z-200) and the phone's Items | Cart strip (z-100) and under the dialogs of frappe-ui (z-400): at a lower z-index they painted over the top of the screen and stayed tappable, and a guest's stray touch could leave the till mid-scan. The Back of a phone (the Android button, the iOS edge swipe) closes it instead of leaving the till: while it is a phone's it takes one entry of the browser's history (`useBackClosesDialog`), which the Back consumes, and which its own "Close" button gives back.

The till keeps no copy of the codes it showed: each press asks the server, so a code that expired from another device is never shown (the server then makes a new one).

A table's code expires whenever the table is emptied. Freeing a table by hand (`update_table_status` to Empty, `mark_table_available`) expires its codes, whatever the table holds. Three other paths go through one function, `expire_codes_of_emptied_tables`: the reset of the floor (`reset_all_tables`, which expires every code of the tables that are Empty after it), the cancel of an invoice (`on_invoice_update`), and the floor read that empties an Occupied table holding no open order (`get_tables`). In those three, a table that still holds an open order (a draft invoice linked to it) keeps its codes. The cancel and the floor read spare one more kind of code: a QR press seats a table without any order, so the floor read empties it at once, and the code the press has just placed is waiting for its first order; the cancel of an old invoice of the table must not kill the code of the party now seated either. That code, and a code whose order is a draft still open, stay; a code whose order is gone (the cancelled invoice it served) expires with the table. The reset spares nothing: it wipes the floor.

A database error during the expiry (a deadlock, a timeout) is not swallowed: the database has rolled the request back, and it fails with the error rather than commit what is left of it. A refusal of the ORM (a validation error on an old code) is expired through the database all the same.

Tokens are validated on every API call. A token is invalid if:
- Status is not "Active"
- `expires_at` has passed (when using Timed expiry mode; a shop session always has one)
- It is a shop session and its `POS Opening Shift` is no longer open
- An older version bound it to a `POS Opening Entry` that is no longer "Open"

### Takeaway hours

Nothing used to close the `/pos/order` page: with a takeaway card, or the guest card as a fallback, it took orders day and night, the opening hours only choosing which card it showed. The restaurant now says when the page takes a new order (`takeaway_hours`, `pos_next/restaurant/takeaway_hours.py`, product owner 10.11.2026, neoffice-maintenance#2484):

- **Always** (the default, what every restaurant did before): at any time.
- **Opening Hours**: the rows of the restaurant's opening hours (« Hours and cards »), those of its takeaway card when the card has some, else all of them. A row is read on its own weekday, as the opening hours always are: one that ends before it starts (22:00 to 02:00) covers that day from its start to midnight and from midnight to its end; a row without a start or an end is left out. A restaurant without any hours takes no takeaway order.
- **Fixed Hours**: from `takeaway_open_from` to `takeaway_open_to` on the days of `takeaway_days` (none: every day), read the same way. Both times are required (the Restaurant refuses a save without them, or with the same time twice).

`takeaway_first_order_after` minutes after each opening and `takeaway_last_order_before` minutes before each closing, no new order is taken. Outside the hours:

- `create_takeaway_token` refuses a new session with « Online takeaway orders are closed right now. They open again today at 18:00. » (tomorrow, or the weekday, as the case is), which the page shows;
- `validate_token` refuses a takeaway session the page kept from earlier when it holds no order yet: the page drops it, asks for a new one, and shows the same message;
- `submit_guest_order` refuses a new takeaway order (`_require_ordering_open`).

An order already sent is still read and paid, whatever the time: a session that holds an order passes `validate_token`, and `create_guest_payment` and `confirm_guest_payment` ask nothing of the hours.

### Doctype: Guest Order Token

| Field | Type | Description |
|-------|------|-------------|
| token | Data (unique) | Crypto-random URL-safe string (43 chars) |
| status | Select | Active / Expired / Closed |
| mode | Select | restaurant / takeaway |
| table | Link → Restaurant Table | Only for restaurant mode |
| pos_profile | Link → POS Profile | POS context |
| pos_opening | Link → POS Opening Entry | Set by an older version only (read-only): a code bound to an entry dies when the entry is no longer Open |
| pos_opening_shift | Link → POS Opening Shift | A shop session's till shift: the session dies when the shift closes |
| invoice | Link → Sales Invoice | The linked POS Invoice |
| expires_at | Datetime | Auto-set from settings at creation |

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `GuestMenuView.vue` | Mobile menu browser with category tabs, item cards, modifier selection |
| `GuestCart.vue` | Cart with quantity controls, total, "Send Order" button |
| `GuestCheckout.vue` | Split payment (amount/items tabs), account creation, redirect to the Wallee payment page |
| `GuestOrder.vue` | Main page — 3-tab navigation (Menu/Cart/Pay) |
| `TakeawayOrder.vue` | Takeaway page — mandatory account + payment before order |
| `TableQRCode.vue` | QR code display: a card with a print button on a tablet and a desktop, the whole screen on a phone (large code, "Close" in ink, no print, screen kept awake, the Back closes it) |
| `TableHeaderBar.vue` | Header bar of the open table or takeaway ticket: its name, lines, kitchen status, the QR button and "Back" |
| `guestOrder.js` | Pinia store — cart, API calls via fetch(), realtime subscription |

### Realtime Sync

Multi-device ordering uses Frappe realtime with room-scoped events:

- **Room**: `guest_table_{table_name}` (server publishes, clients subscribe)
- **Events**: `guest_order_update` (order submitted, payment initiated), `guest_order_pending` (server approval needed), `takeaway_web_order` (new web takeaway)
- Server POS listens for `guest_order_submitted` and `guest_payment_received` in `restaurant.js` store
- Both alerts reach every till of the site and name the restaurant of the table. `guest_order_submitted` is published in both modes and carries the lines of THIS order (`items`: `item_name`, `qty`, five at most, and `count`) and the restaurant's mode (`validation_mode`); `guest_order_pending` (Server Approval only) carries the same. The till answers `guest_order_submitted` and `guest_payment_received` with a notice at the top of the screen and a sound (`stores/floorNotices.js`, `components/restaurant/FloorNotices.vue`), set in the till's settings, group « Floor alerts » (`floor_guest_popup`, `floor_popup_seconds`, `floor_guest_sound`; the volume is the kitchen alerts')

### Payment Flow

Guest payments go through the `payments` app (its Payment Provider and Payment Intent layer), since the `wallee_integration` app was merged into it (ADR-005). Nothing here calls `wallee_integration` any more.

1. Guest selects amount (free entry) or items (checkboxes)
2. Frontend calls `create_guest_payment`. The backend picks the Wallee provider with `_resolve_wallee_provider()` (the enabled Payment Provider whose driver class is `payments.drivers.wallee.*`, the most recently modified one; none → "No enabled Wallee Payment Provider configured on this instance.") and calls `payments.api.intent.create_intent` on the `wallee_web` channel, the hosted payment page. The amount goes in minor units (rappen for CHF); the intent references the order's Sales Invoice and carries the order and tip lines, the guest token and the success and failure addresses
3. The intent answers the hosted page's address (`next_action_payload.url`); the endpoint returns it as `payment_url`, with the provider's `transaction_id`, the `intent_name` and the `state`
4. The checkout leaves for `payment_url` in the same tab; Wallee sends the guest back to the success or failure address it was given, and the page opened on the success address asks `confirm_guest_payment` to record the payment
5. On confirmation → UI updates, `order-confirmed` emitted

**Takeaway**: the order (`submit_guest_order`) is made before the payment, its lines held until the payment is proven; the server settles it when the provider confirms a succeeded Payment Intent (`payments` app) for the order's Sales Invoice (`settle_takeaway_on_payment`, and `confirm_guest_payment` when the page comes back), then sends its lines to the kitchen. A new order is taken only in the restaurant's takeaway hours; its payment, at any time.

**Restaurant**: Payment is optional/at-end. Split payment supported — multiple partial payments tracked against the same invoice.

## Important Implementation Notes

- Guest components use `fetch()` directly — never `createResource` or `window.frappe.call`
- Guest components must NOT import offline workers, IndexedDB, or heavy POS stores
- All guest routes have `meta: { allowGuest: true }` — bypasses POS login check
- Token generation uses `secrets.token_urlsafe(32)` (Python stdlib)
- `GuestCart` has a `hideSendOrder` prop — used by TakeawayOrder to hide the button (payment first)
- `GuestCheckout` emits `order-confirmed` after successful payment
- `create_takeaway_token` is rate-limited per visitor's address (`TAKEAWAY_SESSIONS_PER_VISITOR`, 20 an hour)
