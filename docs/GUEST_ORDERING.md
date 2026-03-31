# Guest Ordering — QR Self-Ordering & Takeaway Web

## Overview

Guest ordering allows restaurant customers to browse the menu, place orders, and pay directly from their phone — without installing an app or creating an account. It also provides a web-based takeaway ordering flow for pickup customers.

Two entry points, one shared engine:
- **QR Restaurant**: Server opens table → QR code → customer scans → orders → pays (split payment supported)
- **Takeaway Web**: Customer visits `/pos/order` → creates account → orders → pays → picks up

## Setup

### 1. Enable in Restaurant Settings

Navigate to **Restaurant Settings** and configure:

| Setting | Options | Description |
|---------|---------|-------------|
| Enable QR Ordering | Check | Activates QR ordering for restaurant tables |
| Guest Menu | Link → Restaurant Card | Which menu to show guests (or flag a card as "Guest Menu") |
| Order Validation | Direct to Kitchen / Server Approval | Whether guest orders go straight to kitchen or need server confirmation |
| Guest Account Mode | Not Proposed / Optional / Mandatory | Whether to prompt guests for account creation at payment |
| Token Expiry Mode | On Table Close / On Payment / Timed | When guest access tokens expire |
| Token Expiry Days | Integer | Number of days before timed tokens expire |
| Enable Web Takeaway | Check | Activates the `/pos/order` takeaway page |
| Takeaway Menu | Link → Restaurant Card | Which menu to show takeaway customers |

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
| `validate_token(token)` | Yes | Validates token, returns table info + settings |
| `get_guest_menu(token)` | Yes | Returns categories + items from guest menu card |
| `submit_guest_order(token, items)` | Yes | Adds items to the table's Sales Invoice |
| `get_order_status(token)` | Yes | Returns current items, totals, paid amount |
| `create_guest_payment(token, amount, payment_items)` | Yes | Creates Wallee transaction for payment |
| `create_table_token(table, pos_profile)` | No (POS User) | Generates token for a table |
| `create_takeaway_token()` | Yes | Generates token for takeaway (rate-limited) |
| `submit_takeaway_order(token, items, customer)` | Yes | Finalizes takeaway after payment verified |

### Token Lifecycle

```
Server opens table → create_table_token() → Guest Order Token created
                                           ↓
                               Token: Active, linked to table + POS Opening
                                           ↓
                               Customer scans QR → validate_token()
                                           ↓
                               Orders/payments via token
                                           ↓
                               POS closes OR token expires → is_valid() = false
```

Tokens are validated on every API call. A token is invalid if:
- Status is not "Active"
- The linked POS Opening Entry is no longer "Open"
- `expires_at` has passed (when using Timed expiry mode)

### Doctype: Guest Order Token

| Field | Type | Description |
|-------|------|-------------|
| token | Data (unique) | Crypto-random URL-safe string (43 chars) |
| status | Select | Active / Expired / Closed |
| mode | Select | restaurant / takeaway |
| table | Link → Restaurant Table | Only for restaurant mode |
| pos_profile | Link → POS Profile | POS context |
| pos_opening | Link → POS Opening Entry | Must be Open for token to be valid |
| invoice | Link → Sales Invoice | The linked POS Invoice |
| expires_at | Datetime | Auto-set from settings at creation |

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `GuestMenuView.vue` | Mobile menu browser with category tabs, item cards, modifier selection |
| `GuestCart.vue` | Cart with quantity controls, total, "Send Order" button |
| `GuestCheckout.vue` | Split payment (amount/items tabs), account creation, Wallee iframe |
| `GuestOrder.vue` | Main page — 3-tab navigation (Menu/Cart/Pay) |
| `TakeawayOrder.vue` | Takeaway page — mandatory account + payment before order |
| `TableQRCode.vue` | QR code display with print button |
| `guestOrder.js` | Pinia store — cart, API calls via fetch(), realtime subscription |

### Realtime Sync

Multi-device ordering uses Frappe realtime with room-scoped events:

- **Room**: `guest_table_{table_name}` (server publishes, clients subscribe)
- **Events**: `guest_order_update` (order submitted, payment initiated), `guest_order_pending` (server approval needed), `takeaway_web_order` (new web takeaway)
- Server POS listens for `guest_order_submitted` and `guest_payment_received` in `restaurant.js` store

### Payment Flow

Guest payments use `wallee_integration.api.transaction.create_transaction()`:

1. Guest selects amount (free entry) or items (checkboxes)
2. Frontend calls `create_guest_payment` → backend creates Wallee transaction
3. Wallee returns `payment_url` → displayed in iframe
4. Frontend polls `get_order_status` every 5s to detect payment completion
5. On payment detected → UI updates, `order-confirmed` emitted

**Takeaway**: Payment is mandatory before order submission. Backend verifies a completed Wallee Transaction exists before `submit_takeaway_order` creates the invoice.

**Restaurant**: Payment is optional/at-end. Split payment supported — multiple partial payments tracked against the same invoice.

## Important Implementation Notes

- Guest components use `fetch()` directly — never `createResource` or `window.frappe.call`
- Guest components must NOT import offline workers, IndexedDB, or heavy POS stores
- All guest routes have `meta: { allowGuest: true }` — bypasses POS login check
- Token generation uses `secrets.token_urlsafe(32)` (Python stdlib)
- `GuestCart` has a `hideSendOrder` prop — used by TakeawayOrder to hide the button (payment first)
- `GuestCheckout` emits `order-confirmed` after successful payment
- `create_takeaway_token` is rate-limited (50 tokens/hour)
- Customer validation in `submit_takeaway_order` checks Customer doctype exists
