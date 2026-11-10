# NEOFFICE_FORK_MARKERS — the Neoffice divergence of `bvisible/POSNext`

This repository is **Neoffice's fork** of `BrainWise-DEV/POSNext` (Frappe app `pos_next`).

- **Upstream**: `BrainWise-DEV/POSNext`. Its releases are tags on `develop`; its `version-15` branch
  stopped on 2026-06-17. We merge release tags; the merge of 2026-10-28 took `develop` itself, at a
  frozen commit.
- **Last upstream merge**: upstream `develop` at **`f7c55a30`** (2026-10-28, past the `v2.0.0` tag),
  merged on 2026-10-28 (see *Merged from upstream develop* below). Before it came tag **`v2.0.0`**
  (`e0a52c54`, 2026-09-08), merged on 2026-10-04, and before that `97a4e833` (2026-05-14).
- **Divergence after the v2.0.0 merge** (2026-10-04): 394 files, ~74 700 inserted lines (committed SPA build and
  catalogues excluded). The v2.0.0 merge also gave 32 files back to upstream as committed, because
  our side had only reformatted them, and moved our customer form into a file of its own (see
  *Merged from upstream v2.0.0* below).

Every change we make to code that is not ours carries an inline `//// Neoffice — …` comment that
says **why**. `grep -rn "////"` gives the complete map of the divergence.

**This file is the complement**: it covers the files that *cannot carry a comment* — pure JSON,
compiled catalogues, images, lockfiles, and the committed SPA build. For everything else, read the
`////` markers in the code.

> Note: `BVISIBLE-MODS.md` is the machine-generated field-by-field JSON registry produced by
> `scripts/json_diff_to_registry.py`. It lists *what* changed. This file says *why*.

---

## What the fork adds, in one screen

| Theme | Why upstream is not enough |
|---|---|
| **Restaurant / table service** | Upstream POSNext is a retail POS with no table service. Neoffice sells POS to restaurants: floor plan (areas, tables, walls, doors), table state, cards/menus/courses, product options (modifiers), preparation stations & workflow (KDS + runner), reservations, tips. |
| **Guest ordering / takeaway** | QR self-ordering at the table and web takeaway. No upstream equivalent. |
| **Customer display (CFD)** | A second, customer-facing screen mirroring the cart, with realtime sync, ads carousel and TWINT QR mirroring. |
| **Gift cards on native ERPNext coupons** | Upstream keeps its own `POS Coupon` doctype; the POS and the ERP then disagree. We migrated onto ERPNext's native `Coupon Code` / `Promotional Scheme`. |
| **Swiss payments** | TWINT QR, card-present terminals, payment drivers/devices, partial payments, cash in/out through `Journal Entry Template` following the erpnextswiss structure, CHF 0.05 rounding. |
| **Neoffice branding** | Upstream ships a `BrainWise Branding` doctype plus a branding monitor task. Both are removed; the product is *Neopos* and follows the Neoffice design system. |
| **i18n** | Upstream ships CSV translations. Frappe loads `locale/*.po` *before* `translations/*.csv`, so a fix applied only in CSV is silently ignored. We moved to PO/MO (French first, Suisse romande, vouvoiement). |
| **Offline-first hardening** | The fleet runs on modest hardware and flaky networks: large-catalog optimisation, IndexedDB caching, an offline state machine, resilient sync. |
| **Structured address** | Street + N° split across the POS customer dialogs (ADR-002). |

---

## pos_next

### DocType JSON — upstream doctypes we extended

Frappe DocType definitions are pure JSON and cannot carry a comment. These are upstream doctypes
whose schema we widened; **the field names below are ours** and are what a merge must preserve.

| File | Added `fieldname`s | Why |
|---|---|---|
| `pos_next/pos_next/doctype/pos_settings/pos_settings.json` | `section_break_customer_display`, `enable_customer_display`, `enable_customer_display_account_creation`, `column_break_customer_display`, `customer_display_show_address_fields`, `section_break_restaurant`, `enable_restaurant_mode`, `restaurant`, `default_restaurant_area`, `column_break_takeaway`, `enable_takeaway`, `takeaway_card`, `section_break_gift_card`, `enable_gift_cards`, `gift_card_item`, `column_break_gift_card`, `enable_gift_card_splitting`, `gift_card_validity_months`, `gift_card_notification`, `section_break_cash_management`, `closing_withdrawal_template`, `keep_signed_in_days`, `session_lock_on_leave`, `tiles_per_row`, `phone_card_pictures`, `till_card_pictures`, `tile_colors`, `section_break_kitchen_alerts`, `kitchen_next_course_popup`, `kitchen_popup_seconds`, `column_break_kitchen_alerts`, `kitchen_next_course_sound`, `runner_ready_sound`, `kitchen_alert_volume`, `section_break_floor_alerts`, `floor_guest_popup`, `floor_popup_seconds`, `column_break_floor_alerts`, `floor_guest_sound`, `section_break_shop_scan`, `enable_shop_scan`, `shop_cart_lifetime_hours`, `shop_scan_key`, `enable_till_tips`, `till_tips_auto_detect`, `till_tip_goes_to`, `till_tip_item`, `till_tip_account`, `track_product_sales_by_person`, `till_tips_visible_to`, `enable_appointments` | The single switchboard for the four features upstream does not have: customer display, restaurant mode, takeaway, gift cards — plus the cash-withdrawal template used when closing a shift. `458d81a9`, `82fcc1bf`, `644ad918`, `5783eb27`, `d2a64f30`, `185c3c50`, `c081f418`. `310377d3` also **removed** upstream's `sync_with_erpnext_coupon` field, obsolete once coupons became natively ERPNext. NeoResto lot 1 added `restaurant` (a Link to `Restaurant`, mandatory once restaurant mode is on): the restaurant a till works for, which everything the till reads of the restaurant module is scoped to. Also in lot 1 (task 4), `section_break_restaurant` carries `depends_on` = `eval:frappe.boot.neoresto_active` (`pos_next.restaurant.mode.extend_boot`, on the `boot_session` hook): the whole Restaurant section, the tick that makes a till a restaurant till included, shows on the desk only where the site runs NeoResto; the tick stays on the desk, the till's own settings screen never offers it, and `update_pos_settings` neither writes it nor answers it as stored (it answers the settings as the till reads them, through the same seam as the reads). NeoResto lot 1 (01.11.2026) added `keep_signed_in_days` (Int, in the Security section, default 0): how long the till keeps its staff signed in, in days; 0 follows the site's session length. `POSSettings.validate_keep_signed_in_days` holds it to 0..90 and gives 30 to a till that becomes a restaurant till; `pos_next.api.session.keep_signed_in` stamps the session with it (the frappe fork honours a session's own expiry), and the patch `neoresto.keep_restaurant_staff_signed_in` gives 30 once to the restaurant tills that already existed. NeoResto lot 1 (01.11.2026) added `session_lock_on_leave` (Check, in the Security section, default 0, shown with the lock): whether leaving the screen (the tab hidden, the phone asleep) locks the till AT ONCE (what every lock did until then) or only after `session_lock_timeout` minutes without use, which is what a waiter's phone needs; the patch `neoresto.keep_the_screen_lock_of_the_tills_that_lock` ticks it once for the tills whose lock was already on, so that none of them changes behaviour. The description of `enable_session_lock` now says the lock opens with the user's personal till code (`pos_next.api.till_code`, kept in `__Auth` beside the account password, never in its place) or with the password. Task 13 added `tiles_per_row` (Select `Automatic` / `3` … `8`, default `Automatic`, after `display_item_code`): how many tiles a row of the till's catalogue grids shows (the shop's item grid and the restaurant's card grid, `POS/src/utils/tileGrid.js`); `Automatic` keeps the grids as upstream draws them, and Frappe's own Select check refuses any other value. Task 27 added `phone_card_pictures` (Check, default `0`, after `tiles_per_row`, shown on the desk for a restaurant till only): whether a phone shows each item's picture on the buttons of the restaurant card (`POS/src/components/restaurant/phone/`); off, a button is the waiter mockup's name and price, and more of them fit on the screen. | NeoResto lot 1 (01.11.2026, Daniel) added the **Kitchen alerts** section (`section_break_kitchen_alerts`, shown with the Restaurant section where the site runs NeoResto): `kitchen_next_course_popup` (Check, default 1: a notice on the kitchen screen when the next course of a table is ordered), `kitchen_popup_seconds` (Int, default 30, 0 = until dismissed, held to 0..600 by `POSSettings.validate_kitchen_popup_seconds`), `kitchen_next_course_sound` (Select None/Bell/Double beep/Chime/Gong/Beep, default Bell), `runner_ready_sound` (same choices, default Beep: the runner's own beep until then) and `kitchen_alert_volume` (Select Low/Medium/High, default Medium). The kitchen's and the runner's tablets have no till: `pos_next.restaurant.kitchen_alerts` resolves the values from the POS Settings row that names the restaurant (the oldest enabled row, or the row of the till a desk user has open) and `get_restaurant_settings` answers them as `kitchen_alerts`, to a desk user and, cut to its own restaurant, to a kitchen or runner tablet. Every field has a default, so a site not migrated yet reads the defaults. NeoResto lot 1 (01.11.2026, Daniel: « regarde comment la caisse sommelier reçoit l'info (popup et autre) ») added the **Floor alerts** section (`section_break_floor_alerts`, shown with the Restaurant section where the site runs NeoResto), after the Kitchen alerts: the notice and the sound of the TILL itself when a guest orders or pays from the QR code of a table. `floor_guest_popup` (Check, default 1), `floor_popup_seconds` (Int, default 30, 0 = until dismissed, held to 0..600 by `POSSettings.validate_floor_popup_seconds`) and `floor_guest_sound` (Select None/Bell/Double beep/Chime/Gong/Beep, default Chime); the volume is the Kitchen alerts' `kitchen_alert_volume`. The till reads them with the rest of its settings: the four keys are in `POS_SETTINGS_FIELDS` and `DEFAULT_POS_SETTINGS` (`pos_next/api/constants.py`, marked in place), and `POS/src/utils/floorAlerts.js` gives the defaults to a till whose settings do not carry them. They are settings of the till (the General tab, `pos_next/till_settings/registry.py`, group `floor_alerts`), not of the restaurant's managers (ruling 63). The realtime alerts `guest_order_submitted` and `guest_order_pending` (`pos_next/api/guest_ordering.py`, marked in place) now carry `items` (`item_name`, `qty`; five at most), `count` and `validation_mode`; only keys are added to `guest_order_submitted`, and `guest_order_pending` carried the guest's raw lines as `items`, which no listener has ever read. **Scan in the shop (04.11.2026)** added the `section_break_shop_scan` section, before the Restaurant one: `enable_shop_scan` (Check, default 0: customers scan the till's items with their phone from the shop's fixed QR code, a shop till only), `shop_cart_lifetime_hours` (Int, default 4: a phone's cart neither paid nor taken over is deleted after it) and `shop_scan_key` (Data, read only: the key in the shop's QR code, set by `pos_next.shop_scan.session.shop_key`). They are set aside in the till's registry until the phone's page ships (`NOT_LISTED`). **Tips at a shop till (NeoCoiffeur study, 09.11.2026)** added `enable_till_tips` (Check, default 0), `till_tips_auto_detect` (Check, default 0: the overpayment becomes the tip by itself; off, the change shows a button), `till_tip_goes_to` (Select `Person who served` / `Common pot`) and, set by the system when tips are switched on (`pos_next.till_tips.provision`, from `POSSettings.validate`), `till_tip_item` and `till_tip_account` (the TIP item and the transit account 2211 of the till's company), right before `enable_sales_persons`. They are a shop till's tips, as the restaurant's are its restaurant's; the three first are in `POS_SETTINGS_FIELDS` and `DEFAULT_POS_SETTINGS` and on the till's settings screen (group `till_tips`, `sales` tab), the last two are set aside (`NOT_LISTED`). On 10.11.2026 `till_tips_visible_to` (Select `Everyone` / `Each their own share`, default `Everyone`, after `till_tip_goes_to`) says who sees the tips of the till: at « each their own share » a member of its staff lists and opens only his own tips (`pos_next.till_tips.tips_query_conditions` and `may_read_tip`, the `permission_query_conditions` and `has_permission` hooks of Restaurant Tip, marked in `hooks.py`); the managers and the accountants see every tip. NeoSalon lot G1 (09.11.2026) added `track_product_sales_by_person` (Check, default 0, right after `enable_sales_persons`, shown while a sales person is asked): off, only the services of a sale ask for their sales person; on, a product asks too and counts in that person's statistics. What a line is, a service or a product, is told by the hook `pos_next_item_kind` (`pos_next/sales_person_lines.py`): without the hook every line is a service, so a till that is not a salon sees no change. It is in `POS_SETTINGS_FIELDS` and `DEFAULT_POS_SETTINGS` and on the till's settings screen (group `sales_persons`, `sales` tab, drawn under the choice of the sales persons). NeoSalon lot G4 (10.11.2026) added `enable_appointments` (Check, default 0, after `track_product_sales_by_person`): the till shows the day's appointments of the site's reservation app and takes one over, its draft invoice loaded into the cart and paid (`pos_next/api/appointments.py`). POS Next names no reservation app: it calls two extension points of `hooks.py` (`pos_next_appointments_of_the_day`, `pos_next_appointment_draft`, empty lists upstream does not have). It is in `POS_SETTINGS_FIELDS` and `DEFAULT_POS_SETTINGS` and on the till's settings screen (group `appointments`, `sales` tab, a shop till only, greyed where the site has no reservation app). |
| `pos_next/pos_next/doctype/pos_coupon/pos_coupon.json` | `gift_card_section`, `gift_card_amount`, `original_amount`, `column_break_gift_card`, `coupon_code_residual`, `source_invoice` | Gift-card balance carried on the coupon: a partly-spent gift card must keep its residual and point back at the invoice that sold it (`d2a64f30`, 2026-01-12, *"feat(gift-cards): implement phases 1-3 for ERPNext Coupon Code sync"*). The `customer` field also gained a description: setting it restricts the gift card to one customer. |
| `pos_next/pos_next/doctype/pos_closing_shift/pos_closing_shift.json` | `section_break_withdrawal`, `cash_withdrawal_amount`, `column_break_withdrawal`, `cash_remaining_balance`, `section_break_cash_movements`, `cash_movements` | Upstream closes a shift by counting the drawer and stopping there. Swiss practice is to withdraw the takings and leave a float, so the closing records what was taken out and what stays as the next shift's suggested opening balance (`5783eb27`, 2026-03-28). NeoResto lot 1 (task 15) adds `cash_movements` (a table of `POS Closing Shift Cash Movement`, ours): the drawer movements (« Entrées/Sorties de caisse ») of the shift, rebuilt from the ledger when the closing is validated, so the closing keeps what moved in and out of the drawer and the end-of-day print lists it. |
| `pos_next/pos_next_auth_gate/doctype/pos_authorization_rule/pos_authorization_rule.json` | — (an option) | The `action` Select lists **Offer an item**, the action of ours the gate registers in `pos_next/authorization/actions/offered_item.py` (NeoResto lot 1, task 24): the opt-in manager PIN for the lines a cashier offers. The registry requires every registered action in this Select (`registry.all_actions`). |
| `pos_next/pos_next_auth_gate/doctype/pos_authorization_rule/pos_authorization_rule.json` | — (one `action` option) | The `action` Select gains **Open a card outside its hours**: opening, at the restaurant till, a card the opening hours keep off it (from the « ⋯ » of the card row or of the floor plan; ours, `pos_next.api.restaurant.open_card_outside_hours`) asks a manager's PIN when a rule names it, like upstream's *Void POS Expense*. The gate is opt-in and OFF by default: a lunch card's prices at dinner are the owner's call. The action registers from a module of ours, `pos_next/authorization/actions/card_hours.py`, imported by upstream's `actions/__init__.py` (one marked line) and bound in `request_grant` (one marked branch); the registry docstring asks that every registered name be in this Select (NeoResto lot 1, task 25). |
| `pos_next/pos_next/custom/pos_profile.json` | `custom_active_payment_devices` | Binds each `Mode of Payment` routed to a terminal driver to one or more (MoP, device) rows. Required for physical readers (Stripe Reader…), left blank for QR-only channels (TWINT); the cashier gets a picker when several rows match (`958a2264`, `2b6b45de`, 2026-05-15/16). |
| `pos_next/pos_next_auth_gate/doctype/pos_authorization_rule/pos_authorization_rule.json` | — (one `action` option) | The `action` Select gains **Void Cash Movement**: cancelling a drawer movement at the till (ours, `pos_next.api.cash_entry.cancel_cash_entry`) asks a manager's PIN when a rule names it, like upstream's *Void POS Expense*. The action registers from a module of ours, `pos_next/authorization/actions/cash_movement.py`, imported by upstream's `actions/__init__.py` (one marked line); the registry docstring asks that every registered name be in this Select (NeoResto lot 1, task 15). |
| `pos_next/pos_next/print_format/pos_next_receipt/pos_next_receipt.json` | — (renamed) | Renamed *POS Next Receipt* → **Neopos Receipt** and the footer *"Powered by POS Next"* → *"Powered by Neopos"* (`771950bd`, 2026-04-02, *"rebrand: rename POS Next to Neopos"*). The receipt markup itself is upstream's, except that every static label now goes through `_()` (same labels as `fixtures/print_format.json`, which is the copy imported last and so the one in force): upstream printed them as bare English text. |

### DocType JSON — doctypes with no upstream equivalent

Whole new doctypes; every field in them is ours. At a merge they can only conflict by name.

- **Restaurant module** (`7b64f6c6` merge, 2026-03-31, and follow-ups): `restaurant_area`,
  `restaurant_table`, `restaurant_card`, `restaurant_card_item`, `restaurant_menu`,
  `restaurant_menu_course`, `restaurant_opening_hours`, `restaurant_reservation`,
  `restaurant_reservation_table`, `restaurant_settings`, `restaurant_tip`; and, since NeoResto lot 1,
  `restaurant` (a restaurant and its own settings: the fields the site-wide `restaurant_settings` single
  held, now one set per restaurant; the single stays in place and a patch,
  `pos_next.patches.neorestau.move_restaurant_settings_to_a_restaurant`, moves it into a default restaurant).
  Also since NeoResto lot 1: `restaurant_area`, `restaurant_table`, `preparation_station`, `restaurant_card`,
  `restaurant_menu`, `restaurant_reservation` and `restaurant_tip` carry a `restaurant` link (a table's is its
  room's), and `pos_settings` names the restaurant a till works for. A room, a table and a preparation station are
  named by a hash from now on (`autoname: hash`; the ones that exist keep their names, which the invoices link to),
  their label (`area_name`, `table_name`, `station_name`) is no longer unique on the site but within its restaurant
  (`pos_next.restaurant.scope.validate_label_unique_in_restaurant`), and the patch
  `pos_next.patches.neorestau.attach_records_to_the_default_restaurant` attaches what the site already has to the
  default restaurant. The cards and menus keep their names (`field:card_name`, `field:menu_name`), so a card name is
  still unique on the whole site. Since NeoResto lot 1, task 16: `restaurant_device` (a kitchen's or runner's
  tablet: the binding of its own device account, a portal account with no role, to one restaurant and one screen)
  and `restaurant_device_pairing` (the one-time tokens that pair a tablet by a QR code shown at the till, kept as
  their SHA-256 hash only); `hooks.py` lists both in `ignore_links_on_delete`, removes a deleted restaurant's tablets
  (`Restaurant` `after_delete`), guards the User and OAuth Bearer Token of a tablet's account, refuses its sign-in by
  any other path (`on_login`) and confines its session to its screens (`auth_hooks`) (see
  `pos_next.restaurant.devices`).
- **Preparation / KDS** (`831857f`, `4df0caf` and follow-ups): `preparation_station`,
  `preparation_station_item`, `preparation_station_item_group`, `preparation_workflow`,
  `preparation_workflow_item`, `preparation_workflow_step`.
- **Product options (modifiers)**: `product_option`, `product_option_group`,
  `product_option_group_item`, `product_option_group_item_group`. Renamed from "Modifier" by
  `pos_next/patches/rename_modifier_to_product_option.py`.
- **Menu design**: `menu_badge`, `item_badge`, `menu_design_template` (`b6e757dd`, `0d7b3d06`,
  2026-03-26 — the PDF menu generator with allergen/diet badges and a font selector).
- **Guest ordering**: `guest_order_token` (`3939a848`, 2026-03-28 — a short-lived token is the only
  credential a QR guest ever holds).
- **Payments**: `pos_payment_driver_mapping`, `pos_profile_payment_device` (`958a2264`, `2b6b45de`),
  `pos_cash_entry_template` (`6c598630`, 2026-03-28 — cash in/out through Journal Entry Templates),
  `pos_closing_shift_cash_movement` (`pos_next/pos_next/doctype/pos_closing_shift_cash_movement/pos_closing_shift_cash_movement.json`,
  NeoResto lot 1 task 15 — the drawer movements of a shift, stored on its closing like upstream's `POS Closing Shift Expense`).
- **Report**: `pos_next/pos_next/report/neopos_register/neopos_register.json` (`0a45914d`,
  2026-04-12 — the Neopos Register report; no upstream equivalent).
- **Report**: `pos_next/pos_next/report/tips_by_server/tips_by_server.json` (NeoResto lot 1, 04.11.2026 — the tips of a
  restaurant by server and by way of paying, for the end of a day or a week; no upstream equivalent. Its `.py` and `.js`
  carry the `////` header).

### Fixtures

| File | Why |
|---|---|
| `pos_next/fixtures/custom_field.json` | 40 Custom Fields on **ERPNext** doctypes — the fork's contract with the ERP. `Sales Invoice`: `posa_pos_opening_shift`, `posa_is_printed`, `posa_coupon_code`, `posa_gift_card_amount_used`, `restaurant_table`, `restaurant_covers` (NeoResto lot 1, covers, 05.11.2026: how many people are seated at the table of an order, the covers; Int, hidden, read-only, `no_copy`, `non_negative`, placed after `restaurant_table`; written by the till's save (`update_invoice`, when its payload carries it) and by `restaurant.set_table_covers`, never by a payment; 0 or nothing stores 0 (an Int column is NOT NULL), read back as none; read back by `open_table`, `get_table_order`, the tables' `order_summary` and the kitchen's and the runner's orders as `covers`, next to `family_counts`, the portions of each food course the whole order holds), `restaurant_note` and `restaurant_note_name` (NeoResto lot 1, notes, 05.11.2026: a note is a draft Sales Invoice on a table and a table may hold several, told .1, .2, .3; `restaurant_note` is the RANK of the order on its table, Int, hidden, read-only, `no_copy`, `non_negative`, placed after `restaurant_covers`, 0 stored means unset and reads as rank 1, and two OPEN drafts of one table never share an effective rank; `restaurant_note_name` is the optional NAME of the party, a Small Text (hidden, read-only, `no_copy`; the server keeps it to 60 characters; a `text` column costs the row 10 bytes where a 60-character varchar costs 242, and the `Sales Invoice` table has no room for the second: measured on a clone of the working site, a varchar(100) is refused with « Row size too large »), stored '' for none and read back as none; both written by the till's save (`update_invoice`, when its payload carries them) and the name by `restaurant.set_table_note_name`, never by a payment; read back by `open_table` and `get_table_order` (`note`, `note_name`, `notes`), the tables' `order_summary` (`notes_count`, `note_names`, the totals of all the notes) and the kitchen's and the runner's orders (`note`, `note_name`, `notes_count`, `table_label`); the table is freed only when no open note remains), `kds_status`, `is_takeaway`, `takeaway_number`, `posa_ticket_no` and `posa_ticket_day` (NeoResto lot 1, task 38b: the restaurant's ticket number of an order and the business day it was counted in, given by the server at the order's first save, `no_copy`, never taken from a till). `Sales Invoice Item`: `posa_special_instructions`, `preparation_station`, `kds_status`, `kds_batch`, `kds_ready_qty` and `kds_delivered_qty` (NeoResto lot 1, kitchen test of 01.11: the units of a line the kitchen has cooked and the runner has delivered so far, cumulative, hidden, read-only, `no_copy`, written by the kitchen's and the runner's calls and handed back to the rebuilt lines when the till saves a table's order again), `kds_sent_at` (NeoResto lot 1, kitchen test of 01.11: the time a line LEFT for the kitchen, hidden, read-only Datetime, `no_copy`, stamped by the save that sends it and kept by the later saves, read by the kitchen ticket's timer; a line held back or sent before the field existed has none), `kds_ahead` and `kds_called_at` (NeoResto lot 1, the service rhythm, Daniel 01.11: where the kitchen prepares ahead, a food line that the room's rhythm would have held leaves at « Valider » with `kds_ahead` = 1 (Check) and the room's call (`restaurant.call_next_course`) stamps `kds_called_at` (Datetime) on it; both hidden, read-only, `no_copy`, `allow_on_submit`, kept by the later saves like `kds_sent_at`. The time a line counts from is `kds_called_at` for a line sent ahead (empty until it is called, so it counts for nothing: no timer, no late colour, never offered to the runner) and `kds_sent_at` for any other), `posa_item_modifiers`. `POS Profile`: `posa_cash_mode_of_payment`, `posa_block_sale_beyond_available_qty`, `posa_allow_delete`, `posa_cash_entry_templates`. `Coupon Code`: `pos_next_section`, `pos_next_gift_card`, `gift_card_amount`, `original_gift_card_amount`, `coupon_code_residual`, `source_invoice`, `referral_code`. `Item`: `custom_color`, `custom_pos_badges_section`, `custom_item_badges`, `custom_spice_level`, `preparation_station`. `Sales Order`: `pos_profile`, `posa_pos_opening_shift`. `Mode of Payment`: `is_wallet_payment`. `Restaurant Card` / `Restaurant Card Item`: `custom_menu_design_section`, `custom_design_template`, `custom_design_overrides`, `custom_price_text`. `Item-custom_company` left this fixture in the v2.0.0 merge: upstream dropped its single-database company isolation (`63581b59`) and its `v2_0_0.remove_custom_company_fields` patch deletes the field; kept here, every migrate would have recreated it. ⚠ **A Custom Field on an upstream doctype is the one thing that collides silently when the upstream later adds a field of the same name** — check these names at every merge.  NeoResto lot 1 (task 15) adds 10 on **Journal Entry** — `posa_cash_movement_section`, `posa_cash_movement` (In/Out, the drawer's direction), `posa_cash_movement_shift` (Link POS Opening Shift), `posa_cash_movement_closing` (Link POS Closing Shift, a closing's withdrawal), `posa_cash_entry_template`, `posa_cash_movement_column_break`, `posa_cash_movement_account` (the till's cash account, whose rows give the amount), `posa_cash_movement_no_vat`, `posa_cash_movement_note`, `posa_cash_movement_offline_id` (the offline queue's id the server books once) — and `posa_cash_movement_out_limit` on **POS Profile** (the optional cap on money out per shift); `posa_cash_entry_templates` is relabelled *Cash In/Out Operations* and is a control now (empty: no movement). The till's movements are read from these fields, never from upstream's POS expense fields (`posa_pos_opening_shift`, `posa_pos_profile`), whose queries anchor on `posa_is_pos_expense`.. Also `Sales Invoice Item.service_family` (NeoResto lot 1, service families: the course a line was ordered under, Drink / Starter / Main / Dessert; hidden, read-only, `no_copy`; given by the server from the article's group or by the waiter for one line) and `Item Group.service_family` (the family of a menu category, a sub-group inheriting its parent's); `Item Group.service_color` (NeoResto lot 1, Daniel's request of 01.11: the OPTIONAL colour of a menu category, a `Color` field placed after `service_family`, a sub-group inheriting its parent's; the kitchen and runner tickets tint the dishes of the category with a very pale shade of it, and only a strict `#RRGGBB` is ever returned or used) **Purchases (NeoResto purchases, lot A, 02.11.2026):** `Item`: `is_restaurant_supply` (the article is one of the restaurant's regular purchases; set by NeoResto's Achats screen, never by the till) and `supply_place` (where it is kept, optional); `Item Supplier`: `supply_uom` (the packaging, a unit of the item, this supplier sells it in: one row per packaging, so that the link survives an owner who types no price). Nothing of the purchases catalogue is stored in a table of our own: packaging = a unit of the item, who sells it = the item's table of suppliers, price = a buying Item Price. **Shopping list (lot B):** `Supplier`: `restaurant_purchases_section`, `order_mode` (e-mail, phone or on site; on site by default), `order_email` and `usual_delivery`: how the restaurant orders from that supplier. **Dishes (lot E):** `Item`: `dish_ingredients_section` and `dish_ingredients` (a table of `Restaurant Dish Ingredient`: the articles a dish needs, a reminder and never a bill of materials). **Scan in the shop (04.11.2026):** `Item` and `Item Group`: `requires_counter_validation` (a seller checks the article before it is sold; a group's tick holds for its sub-groups). Nothing is added to `Sales Invoice` for it: its table is at MariaDB's row size on a fleet site, and the code and state of a phone's cart are fields of `Guest Order Token`. |
| `pos_next/fixtures/menu_badge.json` | The allergen / diet badge catalogue shipped with the PDF menu generator (`b6e757dd`, `083f043e`, 2026-03-26). |
| `pos_next/fixtures/menu_design_template.json` | The five menu layouts (ardoise, bistrot, elegant, modern, base) plus the 15-font selector; *Moderne* is the default (`b6e757dd`, `0d7b3d06`). |
| `pos_next/fixtures/print_format.json` | Card-payment mentions on the till receipt, printed in the merchant's language and inside the paper width (`10047bb0`, `a026e629`, 2026-08-22). The footer's "Powered by Neopos" now goes through `_("Powered by {0}")` too (2026-10-04): it was the last bare English label on the receipt. An offered line (« Offert », NeoResto lot 1, task 24, flagged `posa_is_offered`) prints its list price, 0.00 charged, and « Offert » under it (`_("Offered", context="Given for free")`) instead of a discount line; its two French template comments were put in English at the same time; `modified` moved to 2026-10-31 so the fixture is imported again. |
| `pos_next/tests/fixtures/till_invoice_parity.json` | **Test data, not an app fixture** (it lies outside `pos_next/fixtures/`, so no migrate imports it). NeoResto lot 1, Ruling 70: the till's VAT and totals equal the submitted invoice's, to the cent. The carts that `POS/src/composables/__tests__/useInvoice.invoiceParity.spec.js` rings through the till's own code, with the rows the till sends and the figures it shows; `pos_next/tests/test_till_totals_match_the_invoice.py` submits each as a real invoice and compares. Written by the spec (`UPDATE_PARITY_FIXTURE=1`), never by hand; the spec fails when the table and the till disagree. |
| `pos_next/tests/service_family_cases.json` | **Test data, not an app fixture.** NeoResto lot 1, service families: the table of examples of what a send puts on the pass and what it holds back (drinks and the first food family go, the other food waits; nothing is held outside a table's service), and of which course « Commander la suite » releases. The server's `restaurant/service_families.py` (`test_service_families.py`) and the till's `utils/serviceFamilies.js` (`serviceFamilies.spec.js`) are each tested against this one file, so that the boxes the kitchen dialog ticks are the lines the server sends. |
| `pos_next/tests/room_code_cases.json` | **Test data, not an app fixture.** NeoResto lot 1, task 38b: the table of examples of a room's short code (Salle 1 is S01, Terrasse is TER, a takeaway is EMP). The client's `kitchenRoomCode.js` (`kitchenRoomCode.spec.js`) and the server's `restaurant/room_code.py` (`test_room_code.py`) are each tested against this one file, so that the two derivations cannot drift apart. |
| `pos_next/tests/kitchen_status_cases.json` | **Test data, not an app fixture.** NeoResto lot 1, task 38b: the table of examples of the status an order shows from the statuses of its dishes (Ready and a held-back dish is Ready; a delivered dish and a Pending one is Pending). The client's `kitchenStatusOf` (`kitchenBands.spec.js`) and the server's `_order_status_of` (`test_kitchen_order_status_follows_its_dishes.py`) are each tested against this one file, so that the status written on the order and the one the screen works out cannot disagree. |
| `pos_next/tests/kitchen_pass_cases.json` | **Test data, not an app fixture.** NeoResto lot 1, kitchen test of 01.11: the table of examples of how many units of a line wait AT THE PASS (the units the runner carries) from its status, its quantity and its two counters (a Ready line waits whole, a line cooked in part waits for the units cooked less those delivered, a delivered line for none). The client's `unitsAtThePass` (`kitchenRunner.spec.js`) and the server's `_units_at_the_pass` (`test_kitchen_partial_ready.py`) are each tested against this one file, so that what the runner is told to carry and what the kitchen's screen counts as sent cannot disagree. |

### Upstream customisations we neutralise

| File | Why |
|---|---|
| `pos_next/pos_next/print_format/pos_next_eod_report/pos_next_eod_report.json` | Upstream's v2.0.0 end-of-day report, printed at every shift close. It read `POS Profile.address`, a field ERPNext v15 does not have, so every print failed with "Unknown column 'address'" and the closing ended on "EOD report did not print": it now reads the profile's `company_address`. Its 33 labels were bare English on a ticket handed over at a Swiss till: they go through `_()`. Dates print through `format_datetime` instead of raw timestamps with microseconds, a tax rate of 0 (the closing shift does not store it) is no longer printed as "(0.00%)", and the brand fallback reads Neopos like the receipt. 2026-10-04, found by closing a real shift on osiris after the merge.  NeoResto lot 1 (task 15) adds a *Cash Movements* section before the final summary: the closing's `cash_movements` rows (operation, note, signed amount) and their in / out totals, shown only when the shift had any. NeoResto lot 1 (task 24) adds, under the Grand Total, one line « Offerts : n articles, valeur CHF x » when the shift offered something, from the Jinja method `get_offered_line` (`pos_next.offered`, registered in `hooks.py`, guarded by `is defined`); `modified` moved to 2026-11-01 16:00 so the print format is imported again. |
| `pos_next/pos_next/custom/customer.json` | Upstream's v2.0.0 adds `custom_governorate` and `custom_district` to **Customer** (Link fields to its `Governorate` / `District` doctypes): a Middle-East address model, shown in the desk form, the list view and the preview. Our customers carry a structured Swiss address (ADR-002), so both fields are set `hidden: 1`, `in_list_view: 0`, `in_preview: 0` here; the till never shows them (`CustomerFormDialog.vue`). The doctypes and upstream's code that fills the fields stay as they are. Decision of 2026-10-04. |
| `pos_next/pos_next/custom/sales_invoice_item.json` | Upstream (`0ca15cae`, 2026-09-22) adds a `sales_person` Link to every line of a sales invoice and shows it as a **column of the items grid**. The till's sales-person feature is off on our tills (`enable_sales_persons` is `Disabled`; no line of 2 933 has one) and the field is **not required** (`reqd: 0`; only `validate_sales_person_coverage` asks for one, and only on a till that turned the feature on), so the column is `in_list_view: 0` here. The field itself stays: the till's code reads and writes it. Decision of 2026-11-02 (product owner: « un vendeur affiché dans la table des articles, qu'on ne remplit jamais »). |

### Translations — `pos_next/locale/`

`main.pot`, `fr.po`, `fr.mo`, `ar.po`, `pt_br.po`. Upstream translated through
`translations/*.csv`; Frappe loads `locale/*.po` **before** the CSV, so the PO always wins at
runtime and a fix applied only to the CSV is silently ignored. `883e8a17` (2026-01-12) migrated the
app to PO/MO and added French; `9b22d803` (2026-04-12) translated 567 strings. French is the
product language for Neoffice clients (Suisse romande, vouvoiement). Compiled `fr.mo` is committed
so instances do not need `compile-po-to-mo` to serve a translated POS.
See `docs/Translation-Migration-Guide.md`.

NeoResto lot 1, task 44 (the printer button of the kitchen's and the runner's cards) appends 15 entries to the end of
`main.pot` and `fr.po` (the settings of the print button and its words, the two refusals of
`pos_next/api/kitchen_events.py`); the French is Haiku's. A `.po` cannot carry a comment, so they are recorded here.
The same task lists three calls in `TABLET_METHODS` (`pos_next/restaurant/devices.py`, marked in place) and names three hooks
in `pos_next/api/kitchen_events.py` (`pos_next_kitchen_reprint`, `pos_next_kitchen_reprint_status`,
`pos_next_kitchen_printers`), listened to by the `cloudprnt` app.

NeoResto lot 1, task 53 (the Print button of a table's QR dialog puts a ticket on the till's receipt printer instead of opening the
browser's print window) appends 7 entries to the end of `main.pot` and `fr.po` (the button's states, the browser fallback, the three
refusals of `pos_next/api/table_qr_ticket.py`); the French is Haiku's. A `.po` cannot carry a comment, so they are recorded here.
The same task names one hook in `pos_next/api/table_qr_ticket.py` (`pos_next_table_qr_print`), listened to by the `cloudprnt` app,
and moves the address a table's code opens into `guest_ordering.guest_link`, so that the dialog's link and the printed link are one
function. The endpoint is not in `TABLET_METHODS` on purpose: a paired tablet cannot call it.

NeoResto lot 1, the floor alerts (a notice and a sound on the till when a guest orders or pays from the QR code of a table, Daniel, 01.11) appends 18 entries to the end of
`main.pot` and `fr.po` (the notice's titles, its button, the group and the three settings of the till's settings screen with their help, the three warnings of « View table »);
the French is Haiku's, except « Voir la table », the product owner's own words. A `.po` cannot carry a comment, so they are recorded here.
The same lot makes `composables/useOpenTable.js` out of the body of `FloorPlanEditor.vue`'s `selectTable` (marked in place), so that the floor's list and the notice open a table through one function.

The guests' pages in German and Italian (neoffice-maintenance#2192, 2026-11-04): `de.po` and `it.po` are **added files** (no upstream
equivalent) and carry only what a guest reads: the QR page of a table, the web takeaway order, the sign-in sheet and the refusals those
endpoints say (177 strings, found by reading `__()` / `_()` in `components/guest/`, `GuestOrder.vue`, `GuestReservation.vue`,
`PublicMenu.vue`, `TakeawayOrder.vue`, `stores/guestOrder.js`, `utils/publicMenu.js`, `api/guest_ordering.py`,
`restaurant/guest_account.py`); the German (Swiss spelling, « Sie ») and the Italian (« Lei ») are Haiku's. The rest of the app stays English in
these two languages, and on a site whose POS Settings list no allowed language, the till's language switcher now offers them (it lists the
`locale/*.po` files). The bare states a guest's cart prints (« Preparing », « Ready », « Waiting », « Delivered ») and « of {0} », « Phone »,
the address placeholder are written as bare entries by hand: the page's dictionary is keyed by the bare word, and the translator's tool leaves a
word empty when the catalogue says it through a context. A `.po` cannot carry a comment, so they are recorded here.

The takeaway customer's pickup mail (neoffice-maintenance#2132, 2026-11-04): `templates/emails/pos_next_takeaway_pickup.html` is an **added file** (no upstream
equivalent), sent by `guest_ordering.send_the_pickup_email` when the order's lines leave the kitchen's hold. Its seven strings (the subject, the title, the
thanks, « Your pickup number », the sentence about showing it, « Your order summary », « Total paid ») are appended to the end of `main.pot`, `fr.po`, `de.po` and
`it.po`, five of them under the context « Takeaway pickup email »; the French, German and Italian are Haiku's. The takeaway order's Sales Invoice now carries the
`language` of the page it was made on (`submit_guest_order`), which is what the mail is written in.

NeoResto lot 1, the report of the tips by server (product owner, 04.11.2026): its name and the row of a tip that names no server («Tips by Server», «No server») are appended to the
end of `fr.po`; the French is Haiku's. `main.pot` is left as it was, the next run of the template rewrites it. A `.po` cannot carry a comment, so they are recorded here.

### Images

`pos_next/public/icons/badges/*.svg` (23) and `pos_next/public/icons/badges/png/*.png` (23) — the
allergen and diet badges (gluten, milk, eggs, fish, crustaceans, molluscs, peanuts, tree nuts,
sesame, soy, celery, mustard, lupin, sulfites, vegan, vegetarian, halal, kosher, organic, local,
homemade, lactose-free, chilli). SVG for the screen, PNG for wkhtmltopdf, which does not render
inline SVG. The SVGs carry an inline `<!-- //// Neoffice -->` header; the PNGs cannot.

| Binary | Why |
|---|---|
| `pos_next/public/icons/badges/png/*.png` | PNG twins of the badge SVGs, for wkhtmltopdf (see above). |
| `POS/public/icon-*.png` | The till's app icons as PNG, resized from the design system's Neoffice icon (`assets/logo/app-icon.png`, `adaptive-icon.png`, `apple-touch-icon.png`): Chrome on Android installs a web app only from PNG icons, and offered a mere shortcut from the SVG ones (the manifest in `vite.config.js`). |
| `pos_next/public/pos/icon-*.png`, `pos_next/public/pos/apple-touch-icon.png` | The same icons in the built folder the site serves (copied by the build; tracked because the CI's artifacts commit did not carry ignored PNGs). |
| `POS/public/apple-touch-icon.png` | The iOS home-screen icon, copied from the design system (`assets/logo/apple-touch-icon.png`): iOS does not take an SVG in a data URL. |

### Committed SPA build — `pos_next/public/pos/**`

**Out of scope for markers, by design.** `POS/` (Vue 3 + Vite) builds into `pos_next/public/pos/`,
and `c06b77e4` (2026-05-07, *"commit built frontend so instances pull, no rebuild on prod"*) made
that output part of the repository so instances pull ready-made assets; `f38e0911` then made
`yarn build` a no-op when the artefacts are already present, because rebuilding on a 4 GB tenant
gets OOM-killed. Everything under that directory — `assets/**`, `index.html`, `offline.html`,
`sw.js`, `workbox-*.js`, `workers/offline.worker.js`, `manifest.webmanifest`, `icon.svg`,
`icon-maskable.svg`, `version.json` — is **generated**: mark the source in `POS/`, never the build.
A marker written there would be erased by the next build and would fight the build bot at every
rebase.

One generated copy lives outside that directory: `yarn build` also copies `sw.js` to
`pos_next/www/pos-sw.js` (upstream's `POS/src/main.js` registers `/pos-sw.js` with scope `/pos`, so
the worker must be served from the root and not from `/assets/...`), and `build-frontend.yml`
commits it with the rest. Same rule: generated, never marked, listed in the table below.

| Artifact | Why |
|---|---|
| `pos_next/public/pos/*` | The committed build of `POS/` (see above): `icon.svg` and `icon-maskable.svg` included. |
| `pos_next/www/pos-sw.js` | Copy of the generated `sw.js`, written by `yarn build`, committed by `build-frontend.yml`. |

### Root and tooling files

| File | Why |
|---|---|
| `package.json` | `build` no longer runs `cd POS && yarn build` unconditionally: it skips when `pos_next/public/pos/assets` already exists, unless `FORCE_REBUILD=1` (`f38e0911`, `c06b77e4`, 2026-05-07). Rebuilding the SPA during `bench build` OOM-kills 4 GB tenants. |
| `POS/package.json` | Adds `qrcode` (guest-ordering QR codes), `react` + `react-dom` and `@neoffice/nora-learn-react` — the Nora Learn React island embedded in a Vue app (`3939a848`, `05053a5b`). Scanning in the shop (04.11.2026) adds `@zxing/browser` 0.1.5 and `@zxing/library` 0.21.3, pinned (0.22 and later ask for Node 24; the build runs Node 20): the barcode reader of a customer's phone where the browser has none of its own (Safari on an iPhone), loaded only by the shop's page (`POS/src/utils/barcodeReader.js`). |
| `POS/manifest.webmanifest` | PWA name *POS Next* → **Neopos** (`771950bd`, 2026-04-02). |
| `.bvisible-annotations.json`, `.bvisible-tracked-files` | State of the first-generation annotation tooling (`4e0d3068`, 2026-05-19, *"chore(fork-annotations): bootstrap tooling for upstream divergence tracking"*), consumed by `scripts/annotate_fork.py` and `scripts/check_annotations.py`. Machine-written, no upstream equivalent. Superseded by the `//// Neoffice` markers and this file. |
| `POS/yarn.lock` | Lockfile for the dependencies above. Regenerated, never hand-edited. |
| `tests/e2e/package.json` | Added file (no upstream equivalent): the manifest of the browser tests of the guest pages (`@playwright/test`, pinned to the version whose browsers are installed on the Macs), neoffice-maintenance#2192 and #2132. A JSON file cannot carry the marker. |

### Toolchain taken from upstream develop `f7c55a30` (2026-10-28)

Kept as a commit of its own, ahead of the merge of `develop`, so that the toolchain change can be
reviewed apart from the conflict resolution. It was built locally on its own; CI sees it together
with the merge. None of it can carry a `////` comment (JSON, lockfile), hence this entry.

- `POS/package.json` is upstream's manifest at `f7c55a30`: `vite` ^6.4.3 (also pinned in
  `resolutions`), `vitest` and `@vitest/coverage-v8` ^4.1.11, `vite-plugin-static-copy` ^2.3.2,
  `@vitejs/plugin-vue` ^5.2.4, `reka-ui` ^2.5.0, version 2.0.0, and a `build` script that also copies
  the generated `sw.js` to `pos_next/www/pos-sw.js` (upstream's `POS/src/main.js` registers `/pos-sw.js`).
- **Kept on top of it, ours**: `qrcode`, `react`, `react-dom` and `@neoffice/nora-learn-react` (a git
  dependency, still locked on the same commit `7f5b233f`), at the ranges we already had.
- `POS/yarn.lock`: upstream commits no lockfile (it ignores `yarn.lock`), so there is nothing to take.
  Ours was updated in place with `yarn install`: every locked version that still satisfies the manifest
  stays, only `vite` (5.4.21 to 6.4.5), `vitest` and `@vitest/coverage-v8` (2.1.9 to 4.1.12),
  `vite-plugin-static-copy` (1.0.6 to 2.3.2) and what they pull in moved. CI keeps `--frozen-lockfile`.
- `.github/workflows/build-frontend.yml`: the artefact commit also stages `pos_next/www/pos-sw.js`
  (marked in place; the file itself is declared in the `Artifact` table above).

### Files removed (NeoResto lot 1, task 9)

A deleted file leaves no line to carry a marker, so the removal is written here. Both files were added with the
restaurant module, and both were dead code.

| Path | Why it went |
|---|---|
| `POS/src/components/restaurant/ItemBadgePanel.vue` | Added by `b6e757dd` (2026-03-26) to give a dish its allergen and diet badges. Imported by no component and rendered nowhere: the badges are edited in the item sheet (`ItemEditPanel.vue`: it reads the badge catalogue through `useBadges.js` and saves a dish's badges itself, with `update_item_badges`). `useBadges.js` lost its two functions for a single dish's badges (`loadItemBadges`, `saveItemBadges`) when their only caller went. |
| `POS/src/components/pos/TableSelector.vue` | Added by `458d81a9` (2026-03-20): a list of the tables with area tabs. `POSSale.vue` imported it (that import is removed, marked in place) but never rendered it: the floor plan (`FloorPlanEditor.vue`) selects the table, and its `table-selected` event is the `handleTableSelected` of `POSSale.vue`. |

`POS/components.d.ts` (generated by `unplugin-vue-components`) lost the two declarations. The source references of
`pos_next/locale/*.po` and `main.pot` still name the two files until the catalogues are next regenerated.

---

## Merged from upstream v2.0.0 (2026-10-04) — what was not taken, and why

The decisions a later merge will meet again. Each one is also marked in the code where it lives.

| Upstream v2.0.0 | Here | Why |
|---|---|---|
| Governorate / district on Customer | hidden (`custom/customer.json`), not in the till | Middle-East address model; ours is the Swiss structured address. |
| Customer creation dialog changes (Selling Settings defaults, governorate, mobile required) | `CustomerFormDialog.vue`, ours; upstream's `CreateCustomerDialog.vue` kept byte-identical and unused | Our form (type toggle, address, edit mode) is a full rewrite; a separate file keeps upstream's later changes conflict-free. |
| Mobile number required when editing a customer | not taken | Legacy customers without a mobile could no longer be saved (fixed here in `8c59b735`); ours requires mobile + e-mail on creation. |
| `nexus_demo` countdown loader in `POS/index.html` | not taken | Upstream's private demo app; it exists on none of our instances. |
| `pypdf>=6.12.0` in `pyproject.toml` | not taken | Nothing in the app imports pypdf; our frappe pins `pypdf~=6.1.3`. |
| Transaction-rule header discount written into `additionalDiscount` (`8e6bc21c`) | ours kept (`ruleHeaderDiscount`, cashier bypass) | Upstream's overwrote a coupon or manual discount the cashier typed, and reported a percentage rule as 0. Its rule attribution was taken. |
| Coupon validation refusing a missing customer (#333) | not taken | Gift cards are bearer cards; named promotional coupons stay refused for someone else. |
| Customer group / territory fallback on "All Customer Groups" / "All Territories" | ours kept | A French site has no such names; ours resolves Selling Settings, then the first leaf, then throws. |
| Default 0 in shift-closing counted amounts (#299) | ours kept (empty field) | A 0 reads as a counted zero and shows a deficit before anything is typed (`c91af424`). |
| Single-database company isolation removal (`63581b59`) | **taken** | Every client instance runs one company (checked on the fleet, 2026-10-04); `validations.py` went with it, the Item link search now uses ERPNext's `item_query` and the theme's permission query conditions. |
| Bank deposits, credit sales / pay on receivable account, one-time offers, min/max discounts, EOD report, product management, shift history, Item Price validity windows | **taken** | Upstream features and fixes we want. |

Fixed while merging: two `"POS Invoice"` keys in `doc_events` (the second would have dropped our
gift-card hooks), `finalizePayment` using variables of `completePayment`'s scope after our split of
the two, and upstream's missing `cint` import in `get_receivable_accounts` (fixed on their `develop`).

## Merged from upstream develop `f7c55a30` (2026-10-28) — what was not taken, and why

Upstream `develop` taken at the frozen commit `f7c55a30`, so that the restaurant work to come starts
from its code. These are the places where we did not follow it, or follow it with a switch left off: a later
merge will meet them again. Each line is also marked in the code where it lives.

| Upstream develop | Here | Why |
|---|---|---|
| Min/Max discounts, `pos_only` and the non-POS rule filter moved out of the core into the optional app `posnext_promotions` (`pos_next/overrides/pricing_rule.py`, `public/js/pricing_rule.js`, `public/js/promotional_scheme.js` and the custom fields deleted) | **taken**: `pos_next/overrides/pricing_rule.py` (the module that carried our margin fix, #1748) is deleted with our test `tests/test_min_max_rule_margin_is_applied_once.py`, and so are the two scripts and `custom/promotional_scheme_price_discount.json`; `custom/pricing_rule.json` and `custom/promotional_scheme.json` are upstream's again. Every hook of the module is unregistered: `validate` on Sales Invoice, Sales Order, Quotation, Delivery Note, Pricing Rule and Promotional Scheme, `on_update` on Promotional Scheme, and the one on our `"POS Invoice"` key; the two `doctype_js` entries upstream left pointing at the deleted scripts are removed. No patch: the Custom Fields `apply_discount_on_price`, `min_or_max_discount_qty_limit`, `pos_only` stay in the databases with their data | 0 Min/Max rule on 12 instances (measured 2026-10-28), 0 `pos_only` rule on the four instances that had the column (2026-10-24); `posnext_promotions` is installed nowhere. |
| `_resolve_leaf_customer_group` / `_resolve_leaf_territory` in `create_customer` | not taken, ours kept | The group side equals ours; the territory side ignores a group territory set in Selling Settings and still ends on "All Territories". |
| Header discount: rule amount written into `additionalDiscount` through `offerHeaderDiscount`, a whole-cart coupon and an order discount never together | ours kept (`ruleHeaderDiscount`, cashier bypass); `offerHeaderDiscount` stays 0. While a rule applies its amount is the header discount; a coupon, gift card or manual discount stays applied in `additionalDiscount` and is back in force when the rule stops or the cashier bypasses it | Same reason as at v2.0.0: a rule must not overwrite or remove the coupon, gift card or manual discount the cashier entered. The three cases of upstream's `posCartHeaderDiscount.spec.js` that encode its design are skipped and point here; ours are in `posCartRuleDiscount.spec.js`. |
| `cart_lifo` setting (newest line first, off by default) | ours kept: newest first, always | The till and the customer display agree on that order; a default of "off" would have turned every till back to oldest first. |
| Outlined "Pay on Account" button next to "Exact cash" | not taken: our discrete link stays (2584aa58), with upstream's second-click confirmation | Side by side, cashiers put sales on account by mistake. |
| Header bar of a fixed 52 px with a "POS Next" title | ours kept (flush glass bar, logo, no title) | Neoffice header and branding (87f168fe, 771950bd). |
| `padding-bottom` reserved for `POSFooter` on the sale page | not taken | The footer was removed with the BrainWise branding (458d81a9). |
| Coupon or gift card dropped when the customer is cleared ("No customer selected"), without asking the server | not taken: no verdict without a customer; the next customer picked is re-checked, and the server re-validates at submit | Our customer card clears the customer on every "change customer" tap, and a gift card is a bearer card that `validate_coupon` accepts without a customer. Upstream's case in `posCartQuantity.spec.js` is skipped and points here; ours is `posCartCustomerChange.spec.js`. |
| Amounts written with `Intl` in the user's language (`toLocale(frappe.boot.lang)`: a French user saw "1 234,50") | not taken: amounts follow the SITE's number format (System Settings › Number Format, sent by the bootstrap; a Desk boot's `sysdefaults` otherwise; `#'###.##` when neither is there), symbol placement unchanged (`CHF 1'234.50`); negatives are written like the desk, `CHF -5.00` (upstream puts the minus before the symbol, `-CHF 5.00`; its own expectation in `POS/src/utils/__tests__/localeFormat.spec.js` was edited to match, marked); an amount is rounded with the site's method (`roundCurrency`) before it is written, so the till shows what it stores; the till's other amount formatters (receipt `printInvoice.js`, `useFormatters`, terminal and QR dialogs, tips, coupons, gift card, cash in/out, warehouse prices, customer display, takeaway) go through the same helper | Product owner's decision (2026-10-28): the till writes amounts like the desk, never in the user's language nor the device's. The public guest pages (QR ordering, `/order`) still use the guest's device locale. Upstream's `localeFormat.spec.js` case sets a `#,###.##` site; ours is `siteNumberFormat.spec.js`. |
| Customer card: click opens the search over the current customer | ours kept on tap (clears and re-opens the search, no red X, 4a0dd461); upstream's flow is used by its F8 shortcut | One tap to change customer, decided 2026-07-09. |
| POS expenses, new in upstream develop (expense dialog, expenses table on the closing shift, offline expense queue, the `posa_*expense*` Custom Fields on POS Profile, the `Nexus POS Manager` role, which the fork calls `POSNext Manager`, see « Role names ») | **taken, switched off**: `posa_allow_pos_expense = 0` on every POS Profile, set explicitly on our instances at deploy (no patch); every entry point of the till (cart button, sale page, offline preload) tests that field. `POSNext Cashier` gets no Journal Entry right: `install.grant_cashier_permissions()` is as it was, and upstream's rule in `setup/custom_docperm.json` is for `Nexus POS Manager` only | Taken so that the code stays upstream's and the next merge is quiet; not offered to a till until its accounts, its ceiling and its cancel roles are decided. If it is ever switched on, the cashier role's Journal Entry permission is the first thing to decide. |
| Per-line sales persons and commissions, new in upstream develop (`POS Settings.enable_sales_persons`: Disabled / Single / Multiple, the sales person picker, `sales_team` in the invoice payload, commission tables on Sales Person validated by `sales_person_commission.py`) | **taken, switched off**: `enable_sales_persons = "Disabled"` (the field's default, set explicitly on our instances at deploy). While it is "Disabled" the till neither asks for a person nor refuses "Pay on Account" for lack of one (`isSalesPersonValid`) | Same as expenses: the code stays upstream's, the feature is not offered until it is decided how a till should use it. |
| Enter as the "Exact cash" shortcut, the credit sale and the completion of a payment, which do not know that a card or TWINT payment is under way | **upstream's, with our guard on top**: `POS/src/utils/terminalPaymentGuard.js`; `PaymentDialog.vue` refuses the keypad (Enter and digits), `payExactCash`, `confirmCreditSale`, `addCreditAccountPayment`, `completePayment` and `finalizePayment` while a card-present or QR dialog is on screen or a terminal payment is in flight (the terminal's own success path is not blocked); a mapping whose channel has no dialog at the till (the web channels) is refused with a warning instead of opening nothing. Test: `terminalPaymentEnterGuard.spec.js` | Enter pressed during a card or TWINT payment booked the sale as cash (or on account): a payment under way must finish or be cancelled first. |
| "Sales Person" and "Coupon" lines on the receipt, new in upstream's `pos_next_receipt.json` | taken in that file, labels through `_()`; **not added** to `fixtures/print_format.json`, the receipt in force | The coupon line would also print a gift card's code on the customer's copy. |
| Service worker served from the site root: `yarn build` copies `sw.js` to `pos_next/www/pos-sw.js` because `POS/src/main.js` registers `/pos-sw.js` with scope `/pos` | **taken as a CI build artefact**: never edited, never marked, and not in the tree until `build-frontend.yml` commits it (its artefact commit stages `pos_next/www/pos-sw.js` next to `pos_next/public/pos` and `pos_next/www/pos.html`); declared in the `Artifact` table above | Without it the installed web app has no service worker; like the rest of the build it is committed, because rebuilding on an instance gets a 4 GB tenant OOM-killed. |

## Role names — the till manager is `POSNext Manager`, not upstream's `Nexus POS Manager` (09.11.2026)

Product owner: « c'est quoi ce rôle Nexus ? […] je veux pas de rôle comme ça ». Upstream writes the name in dozens of permission rows (JSON, which cannot carry a marker), in role lists in Python and Vue, in its fixtures and in the translation catalogue. The fork's role is `POSNext Manager`, the twin of `POSNext Cashier` (shown « Responsable POSNext » beside « Caissier POSNext »).

- `scripts/rename_the_till_manager_role.py` rewrites the name in every tracked file (`--check` only reports). **Run it after every merge of upstream**, then read `git diff --stat`: only permission rows, role lists and the strings that name the role should move. The history (`CHANGELOG.md`), this manifest, the script, the patch and its suite keep the old name on purpose.
- `pos_next/patches/rename_the_till_manager_role.py` (`[pre_model_sync]`) renames the role and everything that points at it (accounts, DocPerm, Custom DocPerm, workspaces, pages, reports) on the sites that exist, before the doctype sync writes the permission rows of the new name. Suite: `pos_next/tests/test_the_till_manager_role_is_renamed.py`.
- The `neoffice-theme` (`access_model.py`: the Manager level of Point de vente, the complements; `api.py`: the role groups of a user form) and the `frappe` fork (`frappe/tests/roles.py`: the till manager persona) name the same role and moved with it.

| Contract | Rule | Pattern | Why |
| --- | --- | --- | --- |
| `pos_next/*.json` | absent | `Nexus POS Manager` | upstream's role name is back in a permission row or a fixture: run scripts/rename_the_till_manager_role.py (product owner, 09.11.2026) |
| `pos_next/hooks.py` | absent | `Nexus POS Manager` | the Role fixture filter names the fork's role |
| `pos_next/api/cash_entry.py` | absent | `Nexus POS Manager` | `TILL_MANAGER_ROLES`, the one list of the till managers |
| `pos_next/api/bootstrap.py` | absent | `Nexus POS Manager` | `can_switch_to_desk` reads the fork's role |
| `pos_next/api/expenses.py` | absent | `Nexus POS Manager` | the Journal Entry list limit reads the fork's role |
| `pos_next/restaurant/permissions.py` | absent | `Nexus POS Manager` | `TILL_MANAGER_ROLE` |
| `pos_next/locale/fr.po` | absent | `Nexus POS Manager` | the catalogue names the role the code names |

Permission rows and fixtures that name the role and that no other section of this manifest lists (the paths are written here so that the marker check, which cannot read a JSON file, finds them):

| File | Why |
|---|---|
| `pos_next/fixtures/role.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/pos_next/doctype/bank_deposits/bank_deposits.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/pos_next/doctype/one_time_customer_offer_usage/one_time_customer_offer_usage.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/pos_next/doctype/pos_offer/pos_offer.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/pos_next/doctype/pos_opening_shift/pos_opening_shift.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/pos_next/doctype/referral_code/referral_code.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/pos_next/report/cashier_performance_report/cashier_performance_report.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/pos_next/report/inventory_impact_and_fast_movers_report/inventory_impact_and_fast_movers_report.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/pos_next/report/offline_sync_and_system_health_report/offline_sync_and_system_health_report.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/pos_next/report/payments_and_cash_control_report/payments_and_cash_control_report.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/pos_next/report/pos_expense_report/pos_expense_report.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/pos_next/report/sales_vs_shifts_report/sales_vs_shifts_report.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/pos_next/workspace/posnext/posnext.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/pos_next_auth_gate/doctype/pos_authorization_log/pos_authorization_log.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |
| `pos_next/setup/custom_docperm.json` | the role of a permission row (or the fixture of the role itself): `POSNext Manager` |

## Path index (every non-commentable file that diverges)

The checker matches on the literal path, so each one is named here. Grouped by reason; the
detail is in the sections above.

### New DocType JSON — no upstream equivalent, every field is ours

| Path | Fields |
|---|---|
| `pos_next/pos_next/doctype/guest_order_token/guest_order_token.json` | 12: `token`, `status`, `mode`, `column_break_1`, `table`, `pos_profile`, `pos_opening`, `section_break_2`, `created_by_user`, `expires_at`, `invoice`, `customer` (the customer a guest signed in as on the QR page); `mode` also takes `shop` (a phone scanning in a shop, 04.11.2026), with `cart_code` and `cart_status` (the code the phone shows for its cart, by which the till takes it over, and where the cart stands), and `pos_opening_shift` (10.11.2026, maintenance#2473: the till's POS Opening Shift a shop session is bound to and dies with; `pos_opening` links ERPNext's POS Opening Entry, which this till never opens) |
| `pos_next/pos_next/doctype/item_badge/item_badge.json` | 2: `menu_badge`, `badge_type` |
| `pos_next/pos_next/doctype/menu_badge/menu_badge.json` | 8: `badge_name`, `badge_type`, `column_break_1`, `icon`, `color`, `section_break_2`, `is_active`, `description` |
| `pos_next/pos_next/doctype/menu_design_template/menu_design_template.json` | 28: `template_name`, `style_theme`, `column_break_fonts`, `font_header`, `font_body`, `section_break_layout`, `columns`, `paper_format`, `column_break_layout2`, `custom_width_mm`, `custom_height_mm`, `price_alignment`, `section_break_display`, `show_descriptions` … |
| `pos_next/pos_next/doctype/restaurant_dish_ingredient/restaurant_dish_ingredient.json` | 3: `item`, `qty_per_portion` (optional), `unit_text` (child table of an Item: what a dish needs; adding the dish puts its ingredients on the shopping list; no stock, no bill of materials) |
| `pos_next/pos_next/doctype/restaurant_shopping_list/restaurant_shopping_list.json` | 11: `list_date`, `status`, `company`, `cost_center`, `section_lines`, `lines`, `section_totals`, `estimated_total`, `priced_lines`, `counted_lines`, `note` (NeoResto purchases, lot B: the owner's shopping list, one per restaurant; rules in `pos_next/restaurant/shopping.py`) |
| `pos_next/pos_next/doctype/restaurant_shopping_list_line/restaurant_shopping_list_line.json` | 14: `item`, `free_text`, `item_name`, `qty`, `uom`, `unit_text`, `supplier`, `line_state`, `estimated_rate`, `taken_qty`, `paid_rate`, `origin`, `purchase_order`, `purchase_invoice` (child table: an article in a packaging at a supplier, or a free line) |
| `pos_next/pos_next/doctype/pos_cash_entry_template/pos_cash_entry_template.json` | 1: `journal_entry_template` |
| `pos_next/pos_next/doctype/pos_payment_driver_mapping/pos_payment_driver_mapping.json` | 10: `pos_profile`, `mode_of_payment`, `enabled`, `column_break_1`, `provider`, `channel`, `default_device`, `section_break_options`, `auto_attach_device`, `options_json` |
| `pos_next/pos_next/doctype/pos_profile_payment_device/pos_profile_payment_device.json` | 3: `mode_of_payment`, `payment_device`, `is_default` |
| `pos_next/pos_next/doctype/preparation_station/preparation_station.json` | 23: `section_break_main`, `restaurant`, `station_name`, `station_type`, `column_break_1`, `color`, `is_active`, `workflow`, `use_runner`, `paper_only`, `ticket_text_size`, `section_break_floor_plan`, `show_on_floor_plan`, `area`, `column_break_fp`, `pos_x`, `pos_y` … |
| `pos_next/pos_next/doctype/preparation_station_item/preparation_station_item.json` | 5: `item`, `item_name`, `prep_time`, `priority`, `workflow` |
| `pos_next/pos_next/doctype/preparation_station_item_group/preparation_station_item_group.json` | 3: `item_group`, `prep_time`, `priority` |
| `pos_next/pos_next/doctype/preparation_workflow/preparation_workflow.json` | 6: `workflow_name`, `is_default`, `section_steps`, `steps`, `section_items`, `applicable_items` |
| `pos_next/pos_next/doctype/preparation_workflow_item/preparation_workflow_item.json` | 2: `item`, `item_name` |
| `pos_next/pos_next/doctype/preparation_workflow_step/preparation_workflow_step.json` | 3: `step_name`, `color`, `allow_edit` |
| `pos_next/pos_next/doctype/product_option/product_option.json` | 4: `option_name`, `price_adjustment`, `quantity_value`, `is_default` |
| `pos_next/pos_next/doctype/product_option_group/product_option_group.json` | 10: `group_name`, `selection_type`, `required`, `max_selections`, `section_break_options`, `options`, `section_break_item_groups`, `applicable_item_groups`, `section_break_items`, `applicable_items` |
| `pos_next/pos_next/doctype/product_option_group_item/product_option_group_item.json` | 2: `item`, `item_name` |
| `pos_next/pos_next/doctype/product_option_group_item_group/product_option_group_item_group.json` | 1: `item_group` |
| `pos_next/pos_next/doctype/restaurant/restaurant.json` | 45: `restaurant_name`, `company`, `enabled`, `column_break_identity`, `logo`, `address`, `section_taxes`, `takeaway_tax_category`, `section_runner`, `enable_runner`, `section_hours`, `opening_hours`, `section_tips`, `enable_tips` … |
| `pos_next/pos_next/doctype/restaurant_area/restaurant_area.json` | 8: `restaurant`, `area_name`, `short_code`, `description`, `sort_order`, `floor_plan_section`, `floor_plan_walls`, `floor_plan_bg` |
| `pos_next/pos_next/doctype/restaurant_card/restaurant_card.json` | 15: `section_break_details`, `restaurant`, `card_name`, `description`, `column_break_2`, `image`, `is_active`, `is_permanent`, `is_guest_menu`, `section_break_dates`, `available_from`, `column_break_3`, `available_to`, `section_break_items`, `items` |
| `pos_next/pos_next/doctype/restaurant_card_item/restaurant_card_item.json` | 8: `item_type`, `label`, `is_subcategory`, `item`, `menu`, `price`, `sort_order`, `disabled` |
| `pos_next/pos_next/doctype/restaurant_device/restaurant_device.json` | 12: `device_name`, `restaurant`, `screen`, `station`, `device_key`, `column_break_account`, `user`, `paired_by`, `paired_at`, `last_seen`, `disconnected`, `disconnected_at` |
| `pos_next/pos_next/doctype/restaurant_device_pairing/restaurant_device_pairing.json` | 9: `token_hash`, `restaurant`, `screen`, `station`, `device_name`, `column_break_use`, `expires_at`, `used_at`, `device` |
| `pos_next/pos_next/doctype/restaurant_menu/restaurant_menu.json` | 10: `restaurant`, `menu_name`, `price`, `description`, `image`, `is_active`, `available_from`, `available_to`, `section_break_courses`, `courses` |
| `pos_next/pos_next/doctype/restaurant_menu_course/restaurant_menu_course.json` | 4: `course_name`, `item`, `item_name`, `sort_order` |
| `pos_next/pos_next/doctype/restaurant_opening_hours/restaurant_opening_hours.json` | 5: `day_of_week`, `from_time`, `to_time`, `label`, `restaurant_card` |
| `pos_next/pos_next/doctype/restaurant_reservation/restaurant_reservation.json` | 25: `section_reservation`, `restaurant`, `status`, `channel`, `column_break_1`, `reservation_date`, `reservation_time`, `duration`, `end_time`, `section_guest`, `no_of_guests`, `guest_name`, `column_break_2`, `phone`, `email` … |
| `pos_next/pos_next/doctype/restaurant_reservation_table/restaurant_reservation_table.json` | 4: `restaurant_table`, `table_name`, `area`, `capacity` |
| `pos_next/pos_next/doctype/restaurant_service_closing/restaurant_service_closing.json` | 15: `service_day`, `closed_at`, `closed_by`, `column_break_one`, `restaurant`, `pos_profile`, `section_done`, `orders_settled`, `settled_total`, `empty_orders_removed`, `column_break_two`, `tables_freed`, `dishes_delivered`, `section_details`, `details` |
| `pos_next/pos_next/doctype/restaurant_settlement/restaurant_settlement.json` | 21: `order`, `table_label`, `issue`, `column_break_one`, `total`, `consumed`, `reason`, `complaint_filed`, `section_who`, `waiter`, `settled_by`, `approved_by`, `column_break_two`, `restaurant`, `pos_profile`, `service_day`, `settled_at`, `section_result`, `invoice`, `customer`, `lines` |
| `pos_next/pos_next/doctype/restaurant_settings/restaurant_settings.json` | 31: `section_runner`, `enable_runner`, `section_hours`, `opening_hours`, `section_tips`, `enable_tips`, `auto_detect_tip`, `column_break_tips`, `tip_item`, `tip_account`, `section_qr_ordering`, `enable_qr_ordering`, `guest_menu`, `qr_order_validation` … |
| `pos_next/pos_next/doctype/restaurant_table/restaurant_table.json` | 10: `table_name`, `area`, `restaurant`, `capacity`, `status`, `pos_x`, `pos_y`, `width`, `height`, `shape` |
| `pos_next/pos_next/doctype/restaurant_ticket_counter/restaurant_ticket_counter.json` | 4: `counter_key`, `restaurant`, `business_day`, `last_number` |
| `pos_next/pos_next/doctype/restaurant_tip/restaurant_tip.json` | 17: `restaurant`, `tip_date`, `sales_invoice`, `restaurant_table`, `column_break_1`, `server`, `sales_person`, `employee`, `common_pot`, `pos_profile`, `amount`, `payment_method`, `section_distribution`, `status`, `column_break_2`, `distributed_to`, `distribution_date`. Tips at a shop till (NeoCoiffeur study, 09.11.2026) added `sales_person`, `employee` (the person the tip is for, from the sale's sales team), `common_pot` (a tip that is nobody's) and `pos_profile` (the shop till that took it, a tip that names its till belongs to no restaurant). On 10.11.2026 `employee` and `distributed_to` were given `ignore_user_permissions` (the Employee user permission every user holds on his own employee hid his colleagues' tips: who sees the tips is the till's setting, `pos_next.till_tips`), and `RestaurantTip.validate` empties `distributed_to` and `distribution_date` of a tip that is not Distributed (Frappe filled them with the cashier's employee); the patch `tips.a_tip_not_handed_out_names_nobody_it_was_handed_to` clears the rows written before |
| `pos_next/pos_next/doctype/restaurant_portion/restaurant_portion.json` | 4: `item`, `counted`, `service_date`, `made` (the portions the kitchen made of a product, NeoResto lot 1) |

### Already detailed above

| Path |
|---|
| `.bvisible-annotations.json` |
| `POS/manifest.webmanifest` |
| `POS/package.json` |
| `package.json` |
| `pos_next/fixtures/custom_field.json` |
| `pos_next/fixtures/menu_badge.json` |
| `pos_next/fixtures/menu_design_template.json` |
| `pos_next/fixtures/print_format.json` |
| `pos_next/tests/fixtures/till_invoice_parity.json` |
| `pos_next/tests/room_code_cases.json` |
| `pos_next/tests/kitchen_status_cases.json` |
| `pos_next/tests/service_family_cases.json` |
| `pos_next/pos_next/custom/customer.json` |
| `pos_next/pos_next/custom/pos_profile.json` |
| `pos_next/pos_next/custom/sales_invoice_item.json` |
| `pos_next/pos_next/print_format/pos_next_eod_report/pos_next_eod_report.json` |
| `pos_next/pos_next/doctype/pos_closing_shift/pos_closing_shift.json` |
| `pos_next/pos_next/doctype/pos_coupon/pos_coupon.json` |
| `pos_next/pos_next/doctype/pos_settings/pos_settings.json` |
| `pos_next/pos_next/print_format/pos_next_receipt/pos_next_receipt.json` |
| `pos_next/pos_next/report/neopos_register/neopos_register.json` |
| `pos_next/public/pos/manifest.webmanifest` |
| `tests/e2e/package.json` |

### Generated / binary, listed for completeness

| Path |
|---|
| `pos_next/locale/main.pot` |
| `pos_next/locale/fr.po` |
| `pos_next/locale/fr.mo` |
| `pos_next/locale/ar.po` |
| `pos_next/locale/pt_br.po` |
| `pos_next/public/icons/badges/png/` |
| `pos_next/public/pos/` |
| `POS/yarn.lock` |

### English msgids instead of French source strings (2026-10-04)

House rule: the source text of a translatable string is English; the French lives in the
catalogue and the French screen is unchanged. JSON and `.po` files cannot carry a comment, so
those edits are recorded here (the code edits are marked in place with `//// Neoffice`).

- `pos_next/locale/fr.po` — the entry `articles` is dropped: the code asks for `items` now, which already existed with the same French. The Vue component is marked in place.
- Left as it is on purpose: `GuestCheckout.vue` keeps `__('TVA')`: the QR self-ordering page is used by a guest and the translation endpoint of the POS is not open to guests, so an English msgid would show `VAT` to a French guest.

## Auto-marked (fork-markers workflow)

- `pos_next/pos_next/page/neoresto_purchases/neoresto_purchases.json` — new Page, no upstream equivalent (title "Purchases", roles Restaurant Manager / Item Manager / Admin / System Manager) — the Achats page, NeoResto purchases lot A (439df202 "feat(neoresto-purchases): the supplies a restaurant buys are written in the ERP's own fiches, and the Achats page reads them")
- `pos_next/pos_next/page/neoresto_shopping/neoresto_shopping.json` — new Page, no upstream equivalent (title "Shopping list", same four roles) — the shopping list page, NeoResto purchases lot B (b8a324b7 "feat(neoresto-purchases): the shopping list of a restaurant, grouped by supplier, with an estimate that says on how many lines it rests")
- `pos_next/pos_next/page/till_settings/till_settings.json` — new Page, no upstream equivalent (title "Till settings", roles POSNext Manager / Restaurant Manager / Admin / System Manager) — the office's page of a till's settings, NeoResto lot 1 task 13b: it draws the same list as the till's own screen (`pos_next/till_settings/registry.py`) with the office's own settings added; its `.py` and `.js` carry the `////` header
- `pos_next/pos_next/print_format/restaurant_shopping_list/restaurant_shopping_list.json` — new Print Format, no upstream equivalent (Jinja, includes `pos_next/templates/restaurant_shopping_list.html`) — prints the shopping list on A4, one block per supplier (1846ec56 "feat(neoresto-purchases): the shopping list prints on A4, one block per supplier with a box to tick")
- `pos_next/pos_next/doctype/restaurant_recipe/restaurant_recipe.json` — new DocType, no upstream equivalent (a restaurant's recipe: name, family, portions, ingredients, steps, allergens, status Draft/To review/Validated, and a Source section recording a library fiche's title, author, licence, revision and fingerprint when the recipe comes from one) — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/pos_next/doctype/restaurant_recipe_ingredient/restaurant_recipe_ingredient.json` — new DocType (child table of Restaurant Recipe), no upstream equivalent (an ingredient's name, quantity, unit, a "without quantity" flag for to-taste items, a "unit to convert" flag for non-metric source units, an optional shelf, and an optional link to an Item) — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-aelplermagronen.json` — new file, the French draft of a public-domain recipe from the free library (title, portions, ingredients, steps, allergens, provenance with source licence/revision/content hash), becomes a restaurant's "To review" recipe only when picked — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-aglio-e-olio.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-autumn-soup.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-baked-pasta-with-broccoli.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-bean-salad.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-cannellini-bean-salad.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-cinque-pi.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-classic-bechamel-sauce.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-croque-monsieur.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-finnish-salmon-soup.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-frittata.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-greek-salad.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-potato-leek-soup.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-ratatouille.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-red-lentil-dahl.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-roesti.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-shakshouka.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-spanish-tortilla.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-stracciatella-soup.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-tabouleh.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-tomato-and-grilled-paprika-soup.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-turkish-red-lentil-soup.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-tzatziki.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/recipe_data/based-zarangollo.json` — new file, same free-library recipe draft pattern as above — NeoResto lot R3 (394089f4 "feat(recipes): a restaurant keeps its recipes, and the free library adds them only when someone picks a fiche (NeoResto lot R3)")
- `pos_next/restaurant/season_data/switzerland.json` — new file, no upstream equivalent (113 products of the Saisonkalender 2025 of the Schweizer Bäuerinnen und Bauern — vegetables, fruits, herbs — each with its harvest months and stored-produce months, a French name and the spellings a recipe may use; the months were read from the shapes of the published PDF and checked against its rendering, none of its text or layout reproduced, and the sibling `manifest.json` records the source, that the document carries no licence statement, and keeps "reviewed" empty until someone of the restaurant's side has read it) — NeoResto recipes, the season calendar (fbded35f "feat(recipes): the Swiss season calendar ships with the app, read from the farmers' published calendar and not yet read through by anyone (#2197)")
