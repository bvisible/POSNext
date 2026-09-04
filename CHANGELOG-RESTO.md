<!-- //// Neoffice — added file (no upstream equivalent). The record of what the restaurant
//// branch (version-15-resto) added on top of upstream's retail POS before it was merged into
//// version-15 by 7b64f6c6 (2026-03-31). Written by 4419e066 (2026-03-31, "docs: add
//// comprehensive changelog for version-15-resto branch") so the size of that divergence stays
//// legible at the next upstream merge. -->
# POSNext — Changelog `version-15-resto` vs `version-15`

> Branch: `version-15-resto` | Base: `version-15`
> 307 files changed | ~34,000 lines added | ~200 commits

---

## Table of Contents

1. [Restaurant Module](#1-restaurant-module)
   - [1.1 Floor Plan](#11-floor-plan)
   - [1.2 Table Management](#12-table-management)
   - [1.3 Area Management](#13-area-management)
   - [1.4 Restaurant Cards](#14-restaurant-cards)
   - [1.5 Fixed-Price Menus (Multi-Course)](#15-fixed-price-menus-multi-course)
   - [1.6 Opening Hours](#16-opening-hours)
2. [Kitchen & Service](#2-kitchen--service)
   - [2.1 Preparation Stations](#21-preparation-stations)
   - [2.2 KDS (Kitchen Display System)](#22-kds-kitchen-display-system)
   - [2.3 Runner (Table Service)](#23-runner-table-service)
   - [2.4 Preparation Workflows](#24-preparation-workflows)
   - [2.5 Send to Kitchen](#25-send-to-kitchen)
3. [Guest Ordering (QR & Takeaway)](#3-guest-ordering-qr--takeaway)
   - [3.1 QR Self-Ordering (Dine-In)](#31-qr-self-ordering-dine-in)
   - [3.2 Guest Payment (Wallee)](#32-guest-payment-wallee)
   - [3.3 Takeaway](#33-takeaway)
4. [Reservations](#4-reservations)
   - [4.1 POS-Side Management](#41-pos-side-management)
   - [4.2 Online Reservations (Guest)](#42-online-reservations-guest)
   - [4.3 Automated Emails](#43-automated-emails)
5. [Payments & Tips](#5-payments--tips)
   - [5.1 Split Payment](#51-split-payment)
   - [5.2 Tips](#52-tips)
   - [5.3 Swiss Rounding (5 Centimes)](#53-swiss-rounding-5-centimes)
   - [5.4 Invoice Email](#54-invoice-email)
6. [Cash Management](#6-cash-management)
   - [6.1 Cash In/Out](#61-cash-inout)
   - [6.2 Withdrawal at Closing](#62-withdrawal-at-closing)
   - [6.3 Enhanced Closing Summary](#63-enhanced-closing-summary)
7. [Product Management](#7-product-management)
   - [7.1 Zero-Price Items (Price Entry)](#71-zero-price-items-price-entry)
   - [7.2 Product Options (Modifiers)](#72-product-options-modifiers)
   - [7.3 Badges & Allergens](#73-badges--allergens)
   - [7.4 Item Creation from POS](#74-item-creation-from-pos)
   - [7.5 Item Editing (Side Panel)](#75-item-editing-side-panel)
   - [7.6 Images & Colors](#76-images--colors)
8. [Menu PDF Generator](#8-menu-pdf-generator)
9. [General POS Improvements](#9-general-pos-improvements)
   - [9.1 Improved Customer Creation](#91-improved-customer-creation)
   - [9.2 Realtime & Synchronization](#92-realtime--synchronization)
   - [9.3 Build & Deployment](#93-build--deployment)
10. [New DocTypes](#10-new-doctypes)
11. [New Frontend Routes](#11-new-frontend-routes)
12. [New API Endpoints](#12-new-api-endpoints)

---

## 1. Restaurant Module

### 1.1 Floor Plan

**Component:** `POS/src/components/pos/FloorPlanEditor.vue` (1,899 lines)

The floor plan is an interactive visual editor embedded directly in the main POS view.

**Features:**
- Drag-and-drop canvas for positioning tables and stations
- Snap-to-grid with configurable visual grid
- Zoom controls (persisted in localStorage)
- Area tabs with occupied table counters
- Edit mode: create/move/resize/delete tables
- Table shapes: square or round, with visual seats around edges
- Live badges on occupied tables: item count, opening time, server initials, KDS status
- Preparation stations displayed on the plan with color coding
- Animated chevron arrows showing delivery flow between stations and tables
- Reservation badges on reserved tables
- Server-side position persistence via `save_table_positions`
- WebSocket real-time table status updates

**Supporting composable:** `POS/src/composables/useDraggable.js` — handles drag-and-drop and resize via Pointer Events API, with canvas boundary constraints and touch support.

**Table visual states:**
| Status | Color | Description |
|--------|-------|-------------|
| Empty | Gray | Available table |
| Occupied | Red | Active order |
| Paid | Blue | Guest payment completed |
| Cleaning | Orange | Being cleaned |
| Reserved | Purple | Active reservation |

---

### 1.2 Table Management

**DocType:** `Restaurant Table`

| Field | Type | Description |
|-------|------|-------------|
| `table_name` | Data | Unique name (e.g., "T1", "Bar-3") |
| `area` | Link → Restaurant Area | Assigned area |
| `capacity` | Int | Seating capacity (default: 4) |
| `status` | Select | Empty / Occupied / Reserved / Paid / Cleaning |
| `shape` | Select | Square / Round |
| `pos_x`, `pos_y` | Int | Floor plan position |
| `width`, `height` | Int | Floor plan size (default: 100×100) |

**Table lifecycle:**
1. **Empty** → Guest arrives → server clicks table → `open_table()` creates draft invoice → **Occupied**
2. **Occupied** → Order sent to kitchen → items appear on KDS
3. **Occupied** → Guest QR payment completed → **Paid**
4. **Paid** / **Occupied** → Server POS payment submitted → **Cleaning**
5. **Cleaning** → Server marks available → `mark_table_available()` → **Empty**

**API endpoints:**
- `get_tables()` — returns areas, tables, stations with order summaries
- `update_table_status(table_name, status)` — updates status, expires guest tokens
- `mark_table_available(table_name)` — clears table (unlinks invoice, expires tokens)
- `reset_all_tables()` — emergency reset of all occupied tables
- `create_table(table_name, area, capacity, shape, pos_x, pos_y)` — creation
- `save_table_positions(positions)` — saves floor plan positions
- `open_table(table_name, pos_profile, customer)` — creates/links draft invoice
- `get_table_order(table_name)` — retrieves active order for a table
- `get_table_payment_summary(table_name)` — payment summary with items and tips

---

### 1.3 Area Management

**DocType:** `Restaurant Area`

| Field | Type | Description |
|-------|------|-------------|
| `area_name` | Data | Unique name (e.g., "Dining Room", "Terrace", "Bar") |
| `description` | Small Text | Optional description |
| `sort_order` | Int | Display order |

**API endpoints:**
- `create_area(area_name)` — new area
- `rename_area(name, new_name)` — rename
- `delete_area(name)` — delete
- `reorder_areas(order)` — reorder display

**UX:** Tabs at the top of the floor plan. In edit mode, drag-and-drop to reorder, inline buttons to edit/delete.

---

### 1.4 Restaurant Cards

**DocType:** `Restaurant Card` + child `Restaurant Card Item`

A card is equivalent to a "daily menu" or "main menu" — it defines which products are visible and at what price.

**Restaurant Card fields:**
| Field | Type | Description |
|-------|------|-------------|
| `card_name` | Data | Unique name |
| `description` | Small Text | Description |
| `image` | Attach Image | Card image |
| `is_active` | Check | Card is active |
| `is_permanent` | Check | Always visible (ignores time slots) |
| `is_guest_menu` | Check | Visible for QR guest ordering |
| `items` | Table → Restaurant Card Item | Item list |

**Restaurant Card Item fields:**
| Field | Type | Description |
|-------|------|-------------|
| `item_type` | Select | Category / Item / Menu |
| `label` | Data | Display label |
| `item` | Link → Item | ERPNext item (if type = Item) |
| `menu` | Link → Restaurant Menu | Fixed menu (if type = Menu) |
| `price` | Currency | Price override (blank = standard price) |
| `sort_order` | Int | Display order |
| `disabled` | Check | Disabled on this card |

**Editor component:** `POS/src/components/restaurant/CardEditor.vue` (882 lines)
- Category management: add, remove, drag-and-drop reorder
- Item search by name/code
- Per-card price override
- Per-card label override
- Item disable without deletion
- Product option group assignment
- Badges (allergens, dietary) per item

**API endpoints:**
- `get_active_cards()` — active cards
- `duplicate_card(card_name)` — clone a card
- `get_card_items_stock(card_name)` — item stock availability
- `get_card_items_extra(card_name)` — enriched data with pricing
- `get_card_items_with_badges(card_name)` — items with allergen/dietary badges

---

### 1.5 Fixed-Price Menus (Multi-Course)

**DocType:** `Restaurant Menu` + child `Restaurant Menu Course`

A fixed-price menu is a set of courses at a single price (e.g., "Lunch Menu 25 CHF — Starter + Main + Dessert").

**Restaurant Menu fields:**
| Field | Type | Description |
|-------|------|-------------|
| `menu_name` | Data | Unique name |
| `price` | Currency | Fixed menu price |
| `description` | Small Text | Description |
| `is_active` | Check | Menu is active |
| `courses` | Table → Restaurant Menu Course | Menu courses |

**Restaurant Menu Course fields:**
| Field | Type | Description |
|-------|------|-------------|
| `course_name` | Data | Course name (e.g., "Starter") |
| `item` | Link → Item | ERPNext item |
| `sort_order` | Int | Service order |

**Component:** `POS/src/components/sale/MenuSelectionDialog.vue` — course selection dialog when ordering a fixed menu.

---

### 1.6 Opening Hours

**DocType:** `Restaurant Opening Hours` (child of Restaurant Settings)

| Field | Type | Description |
|-------|------|-------------|
| `day_of_week` | Select | Monday → Sunday |
| `from_time` | Time | Start time |
| `to_time` | Time | End time |
| `label` | Data | Label (e.g., "Lunch", "Dinner") |
| `restaurant_card` | Link → Restaurant Card | Active card during this slot |

**Component:** `POS/src/components/settings/OpeningHoursEditor.vue`
- Add time slots with day/time selectors
- Card assignment per slot
- Overlap validation
- Drag-and-drop to reorder

**Impact:** Opening hours determine which card is visible in the POS and for QR guest orders at any given time. The `restaurant.js` store computes `restaurantStatus.isOpen` and `currentSlot`.

---

## 2. Kitchen & Service

### 2.1 Preparation Stations

**DocType:** `Preparation Station` + children `Preparation Station Item` and `Preparation Station Item Group`

| Field (Station) | Type | Description |
|-----------------|------|-------------|
| `station_name` | Data | Unique name (e.g., "Kitchen", "Bar") |
| `station_type` | Select | Kitchen / Bar / Other |
| `color` | Color | Display color |
| `is_active` | Check | Station is active |
| `workflow` | Link → Preparation Workflow | Workflow override |
| `use_runner` | Check | Items go through runner for delivery |
| `show_on_floor_plan` | Check | Display on floor plan |
| `area` | Link → Restaurant Area | Floor plan area |
| `pos_x`, `pos_y`, `width`, `height` | Int | Floor plan position/size |
| `items` | Table → Preparation Station Item | Assigned items |
| `item_groups` | Table → Preparation Station Item Group | Assigned item groups |

**Preparation Station Item fields:**
| Field | Type | Description |
|-------|------|-------------|
| `item` | Link → Item | Item |
| `prep_time` | Int | Preparation time (minutes) |
| `priority` | Select | Normal / Urgent |
| `workflow` | Link → Preparation Workflow | Per-item workflow override |

**API endpoints:**
- `get_preparation_stations()` — list of active stations with colors
- `get_station_items_map()` — items-to-stations mapping (for auto-routing)
- `create_station(...)` — creation
- `update_station(...)` — update with items/groups
- `delete_station(name)` — deletion
- `get_station_details(name)` — full details
- `save_station_positions(positions)` — floor plan positions
- `get_station_for_item(item_code)` — resolve station for an item

---

### 2.2 KDS (Kitchen Display System)

**Page:** `POS/src/pages/KDS.vue` | **Route:** `/kds`

Full-screen display for kitchen staff.

**Features:**
- Responsive order grid (2-5 columns based on screen size)
- Station filtering (station bar with counters)
- "Show completed" toggle (persisted in localStorage)
- Auto-refresh every 5 seconds + WebSocket `kds_update`
- Sorted by age (oldest first)
- "Coming Next" section for items in Waiting status

**Card component:** `POS/src/components/invoices/KDSOrderCard.vue` (415 lines)
- Displays: table/takeaway name, item list with quantities, prep times
- Per-item KDS status: Pending → Waiting → Preparing → Ready → Delivered
- Special instructions per item
- Color-coded station badges
- Timer since order creation
- Actions: mark individual item Ready/Preparing/Delivered, mark entire order

**KDS item statuses:**
| Status | Color | Meaning |
|--------|-------|---------|
| Pending | Red | Waiting to be picked up |
| Waiting | Yellow | Staged (delayed sending) |
| Preparing | Orange | Being prepared |
| Ready | Green | Ready to serve |
| Delivered | Gray | Delivered to table |

---

### 2.3 Runner (Table Service)

**Page:** `POS/src/pages/Runner.vue` (519 lines) | **Route:** `/runner`

Display for staff delivering dishes from stations to tables.

**3 display modes:**
1. **By Table** — orders grouped by table, ready items per table
2. **By Station** — orders grouped by preparation station
3. **Plan** — visual floor plan with ready item badges on tables

**Features:**
- Area filtering (All + individual area tabs)
- Station filtering
- Ready items counter in header
- Auto-refresh 5s + WebSocket
- "Show delivered" toggle

**Card component:** `POS/src/components/invoices/RunnerOrderCard.vue` (233 lines)
- List of items marked Ready with checkmarks
- Ready item count badge
- Action: mark all Ready items as Delivered

**Activation:** Configurable via `Restaurant Settings > enable_runner`. Pill visible in the station bar when enabled.

---

### 2.4 Preparation Workflows

**DocType:** `Preparation Workflow` + children `Preparation Workflow Step` and `Preparation Workflow Item`

Defines the preparation steps for a dish.

**Preparation Workflow fields:**
| Field | Type | Description |
|-------|------|-------------|
| `workflow_name` | Data | Unique name |
| `is_default` | Check | Default workflow (only one allowed) |
| `steps` | Table → Preparation Workflow Step | Steps |
| `applicable_items` | Table → Preparation Workflow Item | Applicable items |

**Preparation Workflow Step fields:**
| Field | Type | Description |
|-------|------|-------------|
| `step_name` | Data | Step name |
| `color` | Color | Visual color |
| `allow_edit` | Check | Editing allowed at this step |

**Editor component:** `POS/src/components/restaurant/WorkflowEditor.vue` (291 lines)
- Create named workflows
- Define steps with stations and sequence
- Assign items to workflow
- Editable from the POS sidebar in restaurant mode

---

### 2.5 Send to Kitchen

**Component:** `POS/src/components/sale/SendToKitchenDialog.vue` (260 lines)

Dialog shown when the server validates an order.

**Features:**
- Dynamic title based on item stations ("Send to Kitchen", "Send to Bar", "Send to Preparation")
- Color thumbnails of items
- Creates server-side draft invoice for KDS visibility
- Assigns `kds_status` and `kds_batch` to each item
- Staged sending support: items in Waiting status don't go out immediately

---

## 3. Guest Ordering (QR & Takeaway)

### 3.1 QR Self-Ordering (Dine-In)

**API:** `pos_next/api/guest_ordering.py` (869 lines)

The server generates a QR code for a table. The guest scans it and orders from their phone.

**QR Component:** `POS/src/components/restaurant/TableQRCode.vue` (122 lines)
- QR code generation via canvas
- Calls `create_table_token(table, pos_profile)`

**Guest page:** `POS/src/pages/GuestOrder.vue` (257 lines) | **Route:** `/guest/:token`

**Store:** `POS/src/stores/guestOrder.js` (305 lines)

**Guest components:**
| Component | Lines | Purpose |
|-----------|-------|---------|
| `GuestMenuView.vue` | 383 | Menu browsing by category, grid/list view, search |
| `GuestCart.vue` | 191 | Cart with quantities, prices, special instructions |
| `GuestCheckout.vue` | 474 | Wallee payment, tips, PDF receipt |

**Complete flow:**
1. Server clicks "QR" on table → `create_table_token()` → table becomes Occupied
2. Guest scans → `/guest/:token` → `validate_token()` checks validity
3. Guest browses menu → `get_guest_menu(token)` (card based on opening hours)
4. Guest adds to cart and submits → `submit_guest_order(token, items)` → draft invoice created/updated
5. Items appear on KDS with separate batch
6. POS server sees the order in real-time (WebSocket `guest_order_update`)
7. Guest pays → `create_guest_payment(token, amount, tip)` → Wallee transaction
8. Full payment → table becomes **Paid** → paid amount visible in POS

**Guest ordering API endpoints:**
| Endpoint | Auth | Description |
|----------|------|-------------|
| `validate_token(token)` | Guest | Validates token, returns table info/currency/logo |
| `create_table_token(table, pos_profile)` | Auth | Creates QR token for a table |
| `create_takeaway_token()` | Guest | Creates takeaway token (rate limit: 50/hr) |
| `get_guest_menu(token)` | Guest | Menu with categories/items/product options |
| `submit_guest_order(token, items)` | Guest | Adds items to draft invoice |
| `get_order_status(token)` | Guest | Order status, items, paid amount |
| `create_guest_payment(token, amount, tip, ...)` | Guest | Creates Wallee transaction with tip |
| `get_guest_receipt_pdf(token)` | Guest | Downloads receipt PDF |
| `submit_takeaway_order(token, items, customer)` | Guest | Finalizes takeaway order after payment |

**Tokens:**
| Field | Type | Description |
|-------|------|-------------|
| `token` | Data | Unique cryptographic token (auto-generated) |
| `status` | Select | Active / Expired / Closed |
| `mode` | Select | restaurant / takeaway |
| `table` | Link → Restaurant Table | Associated table |
| `pos_profile` | Link → POS Profile | POS profile |
| `invoice` | Link → Sales Invoice | Linked invoice |
| `expires_at` | Datetime | Expiration time |

**CSRF:** Guest calls use direct `fetch()` (not `createResource` or `window.frappe.call`). The CSRF token is fetched from the server on the first request and auto-refreshed on 417 errors.

---

### 3.2 Guest Payment (Wallee)

**Wallee integration in `guest_ordering.py`:**
- Creates Wallee transaction with amount rounded to 2 decimals
- Handles tips separately (recorded in `Restaurant Tip`)
- Redirect in same tab (not new tab) to avoid session cookie issues
- Wallee mode of payment read from `Wallee Settings` (no longer from POS Profile)
- Bypasses wallet validation hooks for guest payments (direct DB writes)
- On full payment: table becomes Paid, token stays active for redirect return
- Thank-you page shown even if token expired in the meantime

**Remaining amount handling:**
- POS displays remaining amount to collect (total - guest payments)
- Payment dialog accounts for guest payments already made
- Searches draft + submitted invoices and by token

---

### 3.3 Takeaway

**Management page:** `POS/src/pages/Takeaway.vue` (254 lines) | **Route:** `/takeaway`

Screen for staff managing takeaway orders.

**Features:**
- Status filter tabs (Pending, Preparing, Ready, Completed)
- Order cards with number, customer, items, status
- Auto-refresh 5s + WebSocket
- Validate + Pay buttons

**Guest order page:** `POS/src/pages/TakeawayOrder.vue` (287 lines) | **Route:** `/order`
- Self-service ordering menu
- Live status tracking
- Order timeline

**Takeaway API endpoints:**
- `get_takeaway_orders()` — list of takeaway orders
- `get_next_takeaway_number()` — next sequential number
- `update_takeaway_status(invoice_name, status)` — status update
- `create_takeaway_token()` — token for web ordering (rate limited)

---

## 4. Reservations

### 4.1 POS-Side Management

**API:** `pos_next/api/reservations.py` (663 lines)

**DocType:** `Restaurant Reservation` + child `Restaurant Reservation Table`

**Reservation fields:**
| Field | Type | Description |
|-------|------|-------------|
| `status` | Select | Pending / Confirmed / Seated / Completed / Cancelled / No Show |
| `channel` | Select | Phone / Walk-in / Internet |
| `reservation_date` | Date | Date |
| `reservation_time` | Time | Time |
| `duration` | Duration | Duration |
| `end_time` | Time | Computed end time (read-only) |
| `no_of_guests` | Int | Number of guests |
| `guest_name` | Data | Guest name |
| `phone`, `email` | Data | Contact info |
| `customer` | Link → Customer | ERPNext customer |
| `tables` | Table → Restaurant Reservation Table | Reserved tables |
| `notes` | Small Text | Special requests |
| `verification_token` | Data | Email verification token (hidden) |

**Python logic:**
- `validate()`: checks future date, opening hours, computes `end_time`
- `before_insert()`: locks tables + overlap check
- `on_update()`: if status → "Seated", sets tables to Occupied

**POS components:**
| Component | Lines | Purpose |
|-----------|-------|---------|
| `ReservationDialog.vue` | 259 | Create/edit modal |
| `ReservationForm.vue` | 723 | Full form with service selector, area filter, floor plan |
| `ReservationList.vue` | 308 | Table with date/status/area filters, check-in/cancel/no-show actions |
| `ReservationFloorPlan.vue` | 295 | Floor plan with reservation overlays |
| `ReservationBadge.vue` | 93 | Badge on reserved tables (name + time) |
| `ReservationStats.vue` | 228 | Dashboard: total, by status, by channel, no-show rate |

**POS API endpoints:**
| Endpoint | Description |
|----------|-------------|
| `get_reservations(date, area, status)` | List reservations |
| `create_reservation(...)` | Create confirmed reservation (bypasses Pending) |
| `update_reservation_status(name, status, force)` | Status transition with validation |
| `check_table_availability(tables, date, time, duration)` | Check for conflicts |
| `get_reservation_stats(from_date, to_date)` | Statistics |

---

### 4.2 Online Reservations (Guest)

**Page:** `POS/src/pages/GuestReservation.vue` (443 lines) | **Route:** `/reservation`

**Public API endpoints:**
| Endpoint | Description |
|----------|-------------|
| `get_available_slots(date)` | Available slots based on opening hours |
| `get_available_tables(date, time, duration, no_of_guests)` | Available tables |
| `submit_guest_reservation(...)` | Create reservation (rate limit: 3 active per email) |
| `verify_reservation(token)` | Email link confirmation (double opt-in) |

**Flow:**
1. Guest picks date → sees available time slots
2. Picks slot + number of guests → sees available tables
3. Fills in name/email/phone → submits
4. Receives verification email → clicks link
5. Reservation changes from Pending to Confirmed
6. Confirmation email sent to guest AND restaurant

---

### 4.3 Automated Emails

**Scheduled tasks (hooks.py > scheduler_events > hourly):**
- `send_reminders()` — sends reminder X hours before (configurable in Restaurant Settings)
- `auto_no_show()` — marks overdue reservations as "No Show" after configurable delay

**Emails sent:**
| Email | Trigger | Recipient |
|-------|---------|-----------|
| Verification | Online reservation created | Guest |
| Confirmation | Token verified | Guest + Restaurant |
| Reminder | X hours before | Guest |
| Cancellation | Status → Cancelled | Guest |

---

## 5. Payments & Tips

### 5.1 Split Payment

**Changes:** `POS/src/components/sale/PaymentDialog.vue` (+306 lines)

**Features:**
- Split bar at the top of the payment dialog
- +/- buttons to adjust number of guests
- Per-person amount is clickable and editable (click to type custom amount)
- Each split can use a different payment method
- Automatic remaining balance calculation
- Quick amounts adapt to the split amount (not the total)
- Swiss 5-centime rounding applied to the split amount

---

### 5.2 Tips

**DocType:** `Restaurant Tip`

| Field | Type | Description |
|-------|------|-------------|
| `tip_date` | Date | Tip date |
| `sales_invoice` | Link → Sales Invoice | Associated invoice |
| `restaurant_table` | Link → Restaurant Table | Table |
| `server` | Link → User | Server |
| `amount` | Currency | Tip amount |
| `payment_method` | Data | Payment method |
| `status` | Select | Collected / Distributed / Cancelled |

**Component:** `POS/src/components/restaurant/TipsPanel.vue` (263 lines)
- Tips table with date/server/table filters
- Statistics: total, average, by payment method
- Panel accessible from the POS sidebar in restaurant mode

**Configuration (Restaurant Settings):**
- `enable_tips` — enable tips
- `auto_detect_tip` — automatically detect tip when paid amount > invoice total
- `tip_item` — auto-created tip item
- `tip_account` — transit account (2211)

**Flow in PaymentDialog:**
- Tip input field with quick-select buttons (10%, 15%, 20%)
- If `auto_detect_tip`: overpayment is pre-filled as tip
- Tip is recorded in `Restaurant Tip`, not in the invoice
- Tip passes through Wallee amount but is separated on the accounting side

---

### 5.3 Swiss Rounding (5 Centimes)

**In PaymentDialog.vue:**
- Automatic rounding to nearest 5 centimes (CHF 0.05)
- Display of exact amount vs rounded amount
- Applied only to cash payments in CHF
- Configurable via POS Profile

---

### 5.4 Invoice Email

**API:** `pos_next/api/email.py` (101 lines)

| Endpoint | Description |
|----------|-------------|
| `send_invoice_email(invoice_name, recipients, subject, message, print_format)` | Sends invoice PDF by email |
| `get_invoice_email_context(invoice_name)` | Pre-fills email form (customer email, subject, default message) |

**Component:** `POS/src/components/sale/EmailInvoiceDialog.vue` (170 lines)
- Recipient field pre-filled from customer
- Customizable subject and message
- Print format selector
- Automatic PDF attachment
- Accessible from the success dialog after payment

---

## 6. Cash Management

### 6.1 Cash In/Out

**API:** `pos_next/api/cash_entry.py` (206 lines)

Uses ERPNext **Journal Entry Templates** to create accounting entries from the POS.

| Endpoint | Description |
|----------|-------------|
| `get_cash_entry_templates(company, pos_profile)` | List available templates |
| `create_cash_entry(pos_opening_shift, template_name, amount, remark)` | Creates and submits a Journal Entry |
| `get_cash_entries(pos_opening_shift)` | Movement history for the shift |

**Component:** `POS/src/components/pos/CashInOutDialog.vue` (384 lines)
- Template selector dropdown
- Auto-detected direction (Cash In or Cash Out) based on account type
- Amount + optional remark field
- Movement history for current shift
- Validation: amount > 0, template selected

**Supporting DocType:** `POS Cash Entry Template` (child table on POS Profile)
- Filters available templates per POS Profile

**Swiss ERPNext adaptation:** The code handles the specific structure of Swiss Journal Entry Templates (totalization/counterparty).

---

### 6.2 Withdrawal at Closing

**Changes:** `POS/src/components/ShiftClosingDialog.vue` (+261 lines)

**Features:**
- Suggested opening balance for next shift
- Cash withdrawal option at closing
- Suggested amount = (opening + cash sales) - (cash outs)
- Creates a Journal Entry for cash withdrawal
- Cash in/out movement summary in the recap

---

### 6.3 Enhanced Closing Summary

**Template:** `pos_next/pos_next/doctype/pos_closing_shift/closing_shift_details.html`

New HTML template with 4 sections:
1. **Sales Summary** — Grand Total, Net Total, Total Quantity
2. **Transactions** — Invoice list with number, date, customer, amount
3. **Payment Methods** — Summary by payment method
4. **Taxes** — Detail by VAT rate

**Python:** `pos_closing_shift.py` (+171 lines) — includes cash entries in closing calculation, reconciliation of cash entries vs physical count.

---

## 7. Product Management

### 7.1 Zero-Price Items (Price Entry)

**Component:** `POS/src/components/sale/PriceEntryDialog.vue` (153 lines)

When an item with no price is added to the cart, a dedicated numpad opens for price entry.

**Features:**
- Dedicated numpad dialog
- Handles zero-price items in the card click flow
- Save scope: local (this sale), per card, or global

---

### 7.2 Product Options (Modifiers)

**DocTypes:** `Product Option Group` + children `Product Option`, `Product Option Group Item`, `Product Option Group Item Group`

Structured modifier system for products (sizes, extras, sauces, cooking preferences...).

**Product Option Group fields:**
| Field | Type | Description |
|-------|------|-------------|
| `group_name` | Data | Unique name (e.g., "Size", "Sauce") |
| `selection_type` | Select | Single / Multiple |
| `required` | Check | Selection is mandatory |
| `max_selections` | Int | Max choices (if Multiple) |
| `options` | Table → Product Option | Option list |
| `applicable_items` | Table → Product Option Group Item | Specific items |
| `applicable_item_groups` | Table → Product Option Group Item Group | Item groups |

**Product Option fields:**
| Field | Type | Description |
|-------|------|-------------|
| `option_name` | Data | Name (e.g., "Large", "Extra cheese") |
| `price_adjustment` | Currency | Price surcharge |
| `quantity_value` | Float | Quantity adjustment |
| `is_default` | Check | Pre-selected |

**Editor component:** `POS/src/components/restaurant/ProductOptionsEditor.vue` (393 lines)
- Create/edit modifier groups
- Assignment by item or item group
- Drag-and-drop to reorder
- Duplication and deletion

**Selection component:** `POS/src/components/sale/ItemModifiersDialog.vue` (296 lines)
- Auto-opens when an item with modifiers is added
- Displays each applicable group
- Radio/checkbox based on selection type
- "Required" indicator
- Visible price adjustment
- Special instructions field

**API endpoints:**
- `save_product_option_group(...)` — create/update a group
- `create_product_option_group(group_name)` — quick creation
- `delete_product_option_group(name)` — deletion
- `get_product_options(item_code)` — options applicable to an item
- `get_all_product_option_groups()` — all groups with options

---

### 7.3 Badges & Allergens

**DocTypes:** `Menu Badge` + child `Item Badge`

22 pre-defined badges in fixtures:

**Allergens (14):**
| Badge | Icon | Color |
|-------|------|-------|
| Gluten | gluten.svg | #D97706 |
| Crustaceans | crustaceans.svg | #DC2626 |
| Eggs | eggs.svg | #F59E0B |
| Fish | fish.svg | #3B82F6 |
| Peanuts | peanuts.svg | #92400E |
| Soy | soy.svg | #65A30D |
| Milk | milk.svg | #0EA5E9 |
| Tree Nuts | tree_nuts.svg | #78350F |
| Celery | celery.svg | #16A34A |
| Mustard | mustard.svg | #CA8A04 |
| Sesame | sesame.svg | #A16207 |
| Sulfites | sulfites.svg | #7C3AED |
| Lupin | lupin.svg | #4F46E5 |
| Mollusks | mollusks.svg | #0891B2 |

**Dietary (5):** Vegetarian, Vegan, Lactose-Free, Halal, Kosher

**Quality (3):** Homemade, Local, Organic

**Components:**
- `ItemBadgePanel.vue` (181 lines) — badge assignment panel per item
- `useBadges.js` (85 lines) — composable for loading/saving badges
- Spice level (1-5) configurable per item

**API:**
- `get_menu_badges()` — list all badges
- `get_item_badges(item_code)` — badges for an item
- `update_item_badges(item_code, badges, spice_level)` — update

---

### 7.4 Item Creation from POS

**Component:** `POS/src/components/restaurant/CreateItemDialog.vue` (483 lines)

Create an ERPNext item directly from the card editor.

**Fields:**
- Item code (auto-generated or manual)
- Name, description
- Item group (pre-filled from Stock Settings)
- Price
- Image (upload or Pexels search)
- Badges
- Status

**API:**
- `create_item(...)` — full creation
- `get_item_creation_defaults(pos_profile)` — default values

---

### 7.5 Item Editing (Side Panel)

**Component:** `POS/src/components/restaurant/ItemEditPanel.vue` (593 lines)

Side panel in the POS for editing an item without leaving the interface.

**Editable:**
- Description, image, color
- Price (global or per card)
- Active/inactive status (global or per card)
- Product option groups
- Badges and spice level

**API:**
- `get_item_edit_data(item_code, pos_profile)` — full data
- `update_item_details(item_code, ...)` — update metadata
- `update_item_price(item_code, price, scope, card_name, pos_profile)` — price
- `update_item_active(item_code, disabled, scope, card_name)` — status

---

### 7.6 Images & Colors

**Component:** `POS/src/components/restaurant/ImageSearchDialog.vue` (169 lines)
- Image search via Pexels API
- Pagination
- Download and local save

**Utility:** `POS/src/utils/itemColors.js`
- Assignable colors for items for visual identification in the cart and cards

**API:**
- `search_food_images(query, per_page, page)` — Pexels search
- `download_food_image(image_url, item_name)` — local save

---

## 8. Menu PDF Generator

**API:** `pos_next/api/menu_pdf.py` (320 lines)

**DocType:** `Menu Design Template`

| Field | Type | Description |
|-------|------|-------------|
| `template_name` | Data | Unique name |
| `style_theme` | Select | elegant / modern / bistrot / ardoise |
| `font_header`, `font_body` | Data | Google Fonts |
| `columns` | Int | Number of columns |
| `paper_format` | Select | A4 Portrait / A4 Landscape / A3 / Custom |
| `price_alignment` | Select | right / inline / dotted |
| `show_descriptions`, `show_allergens`, `show_options`, `show_images` | Check | Display toggles |
| `color_primary`, `color_secondary`, `color_accent` | Color | Colors |
| `header_text`, `footer_text` | Small Text | Custom text |
| `custom_css` | Code | Additional CSS |

**4 Jinja themes:**
| Theme | Style | Font | Background |
|-------|-------|------|------------|
| **Modern** | Contemporary minimalist | Helvetica Neue | White #FFFFFF |
| **Elegant** | Classic fine dining | Georgia serif | Cream #FFF8F0 |
| **Bistrot** | Rustic French | Georgia + wine #722F37 | Beige #F5F0EB |
| **Ardoise** | Chalkboard brasserie | Patrick Hand cursive | Slate #2D2D2D |

**Frontend components:**
| Component | Lines | Purpose |
|-----------|-------|---------|
| `MenuDesignerDialog.vue` | 294 | Template selection + color/font/layout customization |
| `MenuSettings.vue` | 426 | Card configuration (name, image, design) |
| `MenuPreview.vue` | 103 | Live menu preview |

**API endpoints:**
| Endpoint | Description |
|----------|-------------|
| `get_design_templates()` | List templates |
| `get_menu_preview_data(card_name, template_name)` | Structured data for rendering |
| `get_menu_preview_html(card_name, ...)` | Rendered HTML (single or multi-card) |
| `save_card_design(card_name, template_name, overrides)` | Save design |
| `generate_menu_pdf(card_name, template_name, overrides, paper_format)` | Generate PDF (wkhtmltopdf) |
| `generate_multi_card_pdf(card_names, ...)` | Multi-card PDF |

---

## 9. General POS Improvements

### 9.1 Improved Customer Creation

**Component:** `POS/src/components/sale/CreateCustomerDialog.vue` (refactored, +556/-300 lines)

- Individual / Company toggle
- Company name field
- Default country: Switzerland
- Customer group auto-selected from POS Profile
- Required fields adapt to type
- Loyalty program with collapsible CTA message

---

### 9.2 Realtime & Synchronization

**File:** `pos_next/realtime_events.py` (24 lines) — 6 Socket.IO events:

| Event | Trigger | Payload |
|-------|---------|---------|
| `pos_stock_update` | Submit/Cancel Sales Invoice | Items, warehouses, quantities |
| `pos_invoice_created` | New POS invoice | Amount, customer, profile |
| `pos_profile_updated` | POS Profile update | Item groups |
| `pos_customer_changed` | Customer CRUD | Customer details, action |
| `pos_card_updated` | Restaurant Card update | Card name, is_active |
| `pos_restaurant_settings_updated` | Restaurant Settings update | Full refresh |

**Realtime composables:**
- `useRealtimeCards.js` — card and settings sync (500ms debounce)
- `useRealtimeCustomers.js` — customer sync (refactored)
- `useRealtimePosProfile.js` — POS profile sync

---

### 9.3 Build & Deployment

- **Build artifacts removed from git tracking** — `pos_next/public/pos/` and `pos_next/www/pos.html` removed from git (the `.gitignore` already existed but files were tracked before). Eliminates the hash mismatch vicious cycle during updates.

---

## 10. New DocTypes

| # | DocType | Type | Description |
|---|---------|------|-------------|
| 1 | Restaurant Settings | Single | Central restaurant configuration |
| 2 | Restaurant Area | List | Physical areas (Dining Room, Terrace...) |
| 3 | Restaurant Table | List | Tables with position/status |
| 4 | Restaurant Card | List | Restaurant cards (menus) |
| 5 | Restaurant Card Item | Child | Items in a card |
| 6 | Restaurant Menu | List | Fixed-price multi-course menus |
| 7 | Restaurant Menu Course | Child | Courses in a menu |
| 8 | Restaurant Opening Hours | Child | Time slots |
| 9 | Preparation Station | List | Kitchen/bar stations |
| 10 | Preparation Station Item | Child | Items assigned to a station |
| 11 | Preparation Station Item Group | Child | Item groups assigned to a station |
| 12 | Preparation Workflow | List | Preparation workflows |
| 13 | Preparation Workflow Step | Child | Workflow steps |
| 14 | Preparation Workflow Item | Child | Workflow items |
| 15 | Product Option Group | List | Modifier groups |
| 16 | Product Option | Child | Individual options |
| 17 | Product Option Group Item | Child | Applicable items |
| 18 | Product Option Group Item Group | Child | Applicable item groups |
| 19 | Restaurant Tip | List | Recorded tips |
| 20 | Restaurant Reservation | List | Reservations with overlap prevention |
| 21 | Restaurant Reservation Table | Child | Tables in a reservation |
| 22 | Guest Order Token | List | QR ordering tokens |
| 23 | Item Badge | Child | Badges assigned to an item |
| 24 | Menu Badge | List | Badge definitions |
| 25 | Menu Design Template | List | Menu PDF design templates |
| 26 | POS Cash Entry Template | Child | Cash entry templates per profile |

**Total: 14 standalone documents + 12 child tables = 26 DocTypes**

---

## 11. New Frontend Routes

| Route | Page | Auth | Description |
|-------|------|------|-------------|
| `/` | POSSale | Yes | Main POS (enriched with restaurant) |
| `/kds` | KDS | Yes | Kitchen display |
| `/runner` | Runner | Yes | Table service display |
| `/takeaway` | Takeaway | Yes | Takeaway order management |
| `/guest/:token` | GuestOrder | No | Guest QR ordering |
| `/order` | TakeawayOrder | No | Takeaway web ordering |
| `/reservation` | GuestReservation | No | Online reservation |
| `/cfd` | CFD | No | Customer Feedback Display |
| `/display` | CustomerDisplay | No | Customer display |

---

## 12. New API Endpoints

### `pos_next/api/restaurant.py` (~50 endpoints)
Table, area, station, card, menu, item, badge, tip, settings, KDS, and takeaway management.

### `pos_next/api/guest_ordering.py` (9 endpoints)
Tokens, guest menu, orders, Wallee payments, receipt PDF.

### `pos_next/api/reservations.py` (9 endpoints)
Reservation CRUD, availability, stats, guest reservations, email verification.

### `pos_next/api/cash_entry.py` (3 endpoints)
Templates, cash movement creation/history.

### `pos_next/api/menu_pdf.py` (6 endpoints)
Design templates, HTML preview, design save, PDF generation.

### `pos_next/api/email.py` (2 endpoints)
Invoice email sending, context pre-fill.

### Custom fields added to ERPNext DocTypes
- **Sales Invoice**: `restaurant_table`, `kds_status`
- **Sales Invoice Item**: `posa_special_instructions`, `preparation_station`, `kds_status`, `posa_item_modifiers`
- **POS Profile**: `posa_cash_entry_templates`, `posa_block_sale_beyond_available_qty`

---

> Document generated on 2026-03-31 from the diff analysis of `version-15..version-15-resto`
