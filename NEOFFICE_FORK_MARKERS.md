# NEOFFICE_FORK_MARKERS — the Neoffice divergence of `bvisible/POSNext`

This repository is **Neoffice's fork** of `BrainWise-DEV/POSNext` (Frappe app `pos_next`).

- **Upstream**: `BrainWise-DEV/POSNext`, branch `version-15`.
- **Common ancestor (BASE)**: `97a4e833e2871439e28b727c230ab1fcf819611b`
  (2026-05-14, *"Merge pull request #262 from BrainWise-DEV/fix/revert-company-isolation-enforcement"*).
- **Divergence at the time of writing**: 782 commits, 499 files, ~105 000 inserted lines.
  **780 of those 782 commits are Neoffice's own work**; the other two (`2623aabe`, `1bd205bb`,
  Ahmed Osama) are content-free merge nodes whose parents are already below BASE. Nothing in
  `BASE..HEAD` is upstream content waiting to be given back, and no commit carries a
  `(cherry picked from …)` trailer.

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
| `pos_next/pos_next/doctype/pos_settings/pos_settings.json` | `section_break_customer_display`, `enable_customer_display`, `enable_customer_display_account_creation`, `column_break_customer_display`, `customer_display_show_address_fields`, `section_break_restaurant`, `enable_restaurant_mode`, `default_restaurant_area`, `column_break_takeaway`, `enable_takeaway`, `takeaway_card`, `section_break_gift_card`, `enable_gift_cards`, `gift_card_item`, `column_break_gift_card`, `enable_gift_card_splitting`, `gift_card_validity_months`, `gift_card_notification`, `section_break_cash_management`, `closing_withdrawal_template` | The single switchboard for the four features upstream does not have: customer display, restaurant mode, takeaway, gift cards — plus the cash-withdrawal template used when closing a shift. `458d81a9`, `82fcc1bf`, `644ad918`, `5783eb27`, `d2a64f30`, `185c3c50`, `c081f418`. `310377d3` also **removed** upstream's `sync_with_erpnext_coupon` field, obsolete once coupons became natively ERPNext. |
| `pos_next/pos_next/doctype/pos_coupon/pos_coupon.json` | `gift_card_section`, `gift_card_amount`, `original_amount`, `column_break_gift_card`, `coupon_code_residual`, `source_invoice` | Gift-card balance carried on the coupon: a partly-spent gift card must keep its residual and point back at the invoice that sold it (`d2a64f30`, 2026-01-12, *"feat(gift-cards): implement phases 1-3 for ERPNext Coupon Code sync"*). The `customer` field also gained a description: setting it restricts the gift card to one customer. |
| `pos_next/pos_next/doctype/pos_closing_shift/pos_closing_shift.json` | `section_break_withdrawal`, `cash_withdrawal_amount`, `column_break_withdrawal`, `cash_remaining_balance` | Upstream closes a shift by counting the drawer and stopping there. Swiss practice is to withdraw the takings and leave a float, so the closing records what was taken out and what stays as the next shift's suggested opening balance (`5783eb27`, 2026-03-28). |
| `pos_next/pos_next/custom/pos_profile.json` | `custom_active_payment_devices` | Binds each `Mode of Payment` routed to a terminal driver to one or more (MoP, device) rows. Required for physical readers (Stripe Reader…), left blank for QR-only channels (TWINT); the cashier gets a picker when several rows match (`958a2264`, `2b6b45de`, 2026-05-15/16). |
| `pos_next/pos_next/print_format/pos_next_receipt/pos_next_receipt.json` | — (renamed) | Renamed *POS Next Receipt* → **Neopos Receipt** and the footer *"Powered by POS Next"* → *"Powered by Neopos"* (`771950bd`, 2026-04-02, *"rebrand: rename POS Next to Neopos"*). The receipt markup itself is upstream's. |

### DocType JSON — doctypes with no upstream equivalent

Whole new doctypes; every field in them is ours. At a merge they can only conflict by name.

- **Restaurant module** (`7b64f6c6` merge, 2026-03-31, and follow-ups): `restaurant_area`,
  `restaurant_table`, `restaurant_card`, `restaurant_card_item`, `restaurant_menu`,
  `restaurant_menu_course`, `restaurant_opening_hours`, `restaurant_reservation`,
  `restaurant_reservation_table`, `restaurant_settings`, `restaurant_tip`.
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
  `pos_cash_entry_template` (`6c598630`, 2026-03-28 — cash in/out through Journal Entry Templates).
- **Report**: `pos_next/pos_next/report/neopos_register/neopos_register.json` (`0a45914d`,
  2026-04-12 — the Neopos Register report; no upstream equivalent).

### Fixtures

| File | Why |
|---|---|
| `pos_next/fixtures/custom_field.json` | 38 Custom Fields on **ERPNext** doctypes — the fork's contract with the ERP. `Sales Invoice`: `posa_pos_opening_shift`, `posa_is_printed`, `posa_coupon_code`, `posa_gift_card_amount_used`, `restaurant_table`, `kds_status`, `is_takeaway`, `takeaway_number`. `Sales Invoice Item`: `posa_special_instructions`, `preparation_station`, `kds_status`, `kds_batch`, `posa_item_modifiers`. `POS Profile`: `posa_cash_mode_of_payment`, `posa_block_sale_beyond_available_qty`, `posa_allow_delete`, `posa_cash_entry_templates`. `Coupon Code`: `pos_next_section`, `pos_next_gift_card`, `gift_card_amount`, `original_gift_card_amount`, `coupon_code_residual`, `source_invoice`, `referral_code`. `Item`: `custom_company`, `custom_color`, `custom_pos_badges_section`, `custom_item_badges`, `custom_spice_level`, `preparation_station`. `Sales Order`: `pos_profile`, `posa_pos_opening_shift`. `Mode of Payment`: `is_wallet_payment`. `Restaurant Card` / `Restaurant Card Item`: `custom_menu_design_section`, `custom_design_template`, `custom_design_overrides`, `custom_price_text`. ⚠ **A Custom Field on an upstream doctype is the one thing that collides silently when the upstream later adds a field of the same name** — check these names at every merge. |
| `pos_next/fixtures/menu_badge.json` | The allergen / diet badge catalogue shipped with the PDF menu generator (`b6e757dd`, `083f043e`, 2026-03-26). |
| `pos_next/fixtures/menu_design_template.json` | The five menu layouts (ardoise, bistrot, elegant, modern, base) plus the 15-font selector; *Moderne* is the default (`b6e757dd`, `0d7b3d06`). |
| `pos_next/fixtures/print_format.json` | Card-payment mentions on the till receipt, printed in the merchant's language and inside the paper width (`10047bb0`, `a026e629`, 2026-08-22). |

### Translations — `pos_next/locale/`

`main.pot`, `fr.po`, `fr.mo`, `ar.po`, `pt_br.po`. Upstream translated through
`translations/*.csv`; Frappe loads `locale/*.po` **before** the CSV, so the PO always wins at
runtime and a fix applied only to the CSV is silently ignored. `883e8a17` (2026-01-12) migrated the
app to PO/MO and added French; `9b22d803` (2026-04-12) translated 567 strings. French is the
product language for Neoffice clients (Suisse romande, vouvoiement). Compiled `fr.mo` is committed
so instances do not need `compile-po-to-mo` to serve a translated POS.
See `docs/Translation-Migration-Guide.md`.

### Images

`pos_next/public/icons/badges/*.svg` (23) and `pos_next/public/icons/badges/png/*.png` (23) — the
allergen and diet badges (gluten, milk, eggs, fish, crustaceans, molluscs, peanuts, tree nuts,
sesame, soy, celery, mustard, lupin, sulfites, vegan, vegetarian, halal, kosher, organic, local,
homemade, lactose-free, chilli). SVG for the screen, PNG for wkhtmltopdf, which does not render
inline SVG. The SVGs carry an inline `<!-- //// Neoffice -->` header; the PNGs cannot.

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

### Root and tooling files

| File | Why |
|---|---|
| `package.json` | `build` no longer runs `cd POS && yarn build` unconditionally: it skips when `pos_next/public/pos/assets` already exists, unless `FORCE_REBUILD=1` (`f38e0911`, `c06b77e4`, 2026-05-07). Rebuilding the SPA during `bench build` OOM-kills 4 GB tenants. |
| `POS/package.json` | Adds `qrcode` (guest-ordering QR codes), `react` + `react-dom` and `@neoffice/nora-learn-react` — the Nora Learn React island embedded in a Vue app (`3939a848`, `05053a5b`). |
| `POS/manifest.webmanifest` | PWA name *POS Next* → **Neopos** (`771950bd`, 2026-04-02). |
| `.bvisible-annotations.json`, `.bvisible-tracked-files` | State of the first-generation annotation tooling (`4e0d3068`, 2026-05-19, *"chore(fork-annotations): bootstrap tooling for upstream divergence tracking"*), consumed by `scripts/annotate_fork.py` and `scripts/check_annotations.py`. Machine-written, no upstream equivalent. Superseded by the `//// Neoffice` markers and this file. |
| `POS/yarn.lock` | Lockfile for the dependencies above. Regenerated, never hand-edited. |

---

## Path index (every non-commentable file that diverges)

The checker matches on the literal path, so each one is named here. Grouped by reason; the
detail is in the sections above.

### New DocType JSON — no upstream equivalent, every field is ours

| Path | Fields |
|---|---|
| `pos_next/pos_next/doctype/guest_order_token/guest_order_token.json` | 11: `token`, `status`, `mode`, `column_break_1`, `table`, `pos_profile`, `pos_opening`, `section_break_2`, `created_by_user`, `expires_at`, `invoice` |
| `pos_next/pos_next/doctype/item_badge/item_badge.json` | 2: `menu_badge`, `badge_type` |
| `pos_next/pos_next/doctype/menu_badge/menu_badge.json` | 8: `badge_name`, `badge_type`, `column_break_1`, `icon`, `color`, `section_break_2`, `is_active`, `description` |
| `pos_next/pos_next/doctype/menu_design_template/menu_design_template.json` | 28: `template_name`, `style_theme`, `column_break_fonts`, `font_header`, `font_body`, `section_break_layout`, `columns`, `paper_format`, `column_break_layout2`, `custom_width_mm`, `custom_height_mm`, `price_alignment`, `section_break_display`, `show_descriptions` … |
| `pos_next/pos_next/doctype/pos_cash_entry_template/pos_cash_entry_template.json` | 1: `journal_entry_template` |
| `pos_next/pos_next/doctype/pos_payment_driver_mapping/pos_payment_driver_mapping.json` | 10: `pos_profile`, `mode_of_payment`, `enabled`, `column_break_1`, `provider`, `channel`, `default_device`, `section_break_options`, `auto_attach_device`, `options_json` |
| `pos_next/pos_next/doctype/pos_profile_payment_device/pos_profile_payment_device.json` | 3: `mode_of_payment`, `payment_device`, `is_default` |
| `pos_next/pos_next/doctype/preparation_station/preparation_station.json` | 20: `section_break_main`, `station_name`, `station_type`, `column_break_1`, `color`, `is_active`, `workflow`, `use_runner`, `section_break_floor_plan`, `show_on_floor_plan`, `area`, `column_break_fp`, `pos_x`, `pos_y` … |
| `pos_next/pos_next/doctype/preparation_station_item/preparation_station_item.json` | 5: `item`, `item_name`, `prep_time`, `priority`, `workflow` |
| `pos_next/pos_next/doctype/preparation_station_item_group/preparation_station_item_group.json` | 3: `item_group`, `prep_time`, `priority` |
| `pos_next/pos_next/doctype/preparation_workflow/preparation_workflow.json` | 6: `workflow_name`, `is_default`, `section_steps`, `steps`, `section_items`, `applicable_items` |
| `pos_next/pos_next/doctype/preparation_workflow_item/preparation_workflow_item.json` | 2: `item`, `item_name` |
| `pos_next/pos_next/doctype/preparation_workflow_step/preparation_workflow_step.json` | 3: `step_name`, `color`, `allow_edit` |
| `pos_next/pos_next/doctype/product_option/product_option.json` | 4: `option_name`, `price_adjustment`, `quantity_value`, `is_default` |
| `pos_next/pos_next/doctype/product_option_group/product_option_group.json` | 10: `group_name`, `selection_type`, `required`, `max_selections`, `section_break_options`, `options`, `section_break_item_groups`, `applicable_item_groups`, `section_break_items`, `applicable_items` |
| `pos_next/pos_next/doctype/product_option_group_item/product_option_group_item.json` | 2: `item`, `item_name` |
| `pos_next/pos_next/doctype/product_option_group_item_group/product_option_group_item_group.json` | 1: `item_group` |
| `pos_next/pos_next/doctype/restaurant_area/restaurant_area.json` | 6: `area_name`, `description`, `sort_order`, `floor_plan_section`, `floor_plan_walls`, `floor_plan_bg` |
| `pos_next/pos_next/doctype/restaurant_card/restaurant_card.json` | 14: `section_break_details`, `card_name`, `description`, `column_break_2`, `image`, `is_active`, `is_permanent`, `is_guest_menu`, `section_break_dates`, `available_from`, `column_break_3`, `available_to`, `section_break_items`, `items` |
| `pos_next/pos_next/doctype/restaurant_card_item/restaurant_card_item.json` | 7: `item_type`, `label`, `item`, `menu`, `price`, `sort_order`, `disabled` |
| `pos_next/pos_next/doctype/restaurant_menu/restaurant_menu.json` | 9: `menu_name`, `price`, `description`, `image`, `is_active`, `available_from`, `available_to`, `section_break_courses`, `courses` |
| `pos_next/pos_next/doctype/restaurant_menu_course/restaurant_menu_course.json` | 4: `course_name`, `item`, `item_name`, `sort_order` |
| `pos_next/pos_next/doctype/restaurant_opening_hours/restaurant_opening_hours.json` | 5: `day_of_week`, `from_time`, `to_time`, `label`, `restaurant_card` |
| `pos_next/pos_next/doctype/restaurant_reservation/restaurant_reservation.json` | 23: `section_reservation`, `status`, `channel`, `column_break_1`, `reservation_date`, `reservation_time`, `duration`, `end_time`, `section_guest`, `no_of_guests`, `guest_name`, `column_break_2`, `phone`, `email` … |
| `pos_next/pos_next/doctype/restaurant_reservation_table/restaurant_reservation_table.json` | 4: `restaurant_table`, `table_name`, `area`, `capacity` |
| `pos_next/pos_next/doctype/restaurant_settings/restaurant_settings.json` | 31: `section_runner`, `enable_runner`, `section_hours`, `opening_hours`, `section_tips`, `enable_tips`, `auto_detect_tip`, `column_break_tips`, `tip_item`, `tip_account`, `section_qr_ordering`, `enable_qr_ordering`, `guest_menu`, `qr_order_validation` … |
| `pos_next/pos_next/doctype/restaurant_table/restaurant_table.json` | 9: `table_name`, `area`, `capacity`, `status`, `pos_x`, `pos_y`, `width`, `height`, `shape` |
| `pos_next/pos_next/doctype/restaurant_tip/restaurant_tip.json` | 12: `tip_date`, `sales_invoice`, `restaurant_table`, `column_break_1`, `server`, `amount`, `payment_method`, `section_distribution`, `status`, `column_break_2`, `distributed_to`, `distribution_date` |

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
| `pos_next/pos_next/custom/pos_profile.json` |
| `pos_next/pos_next/doctype/pos_closing_shift/pos_closing_shift.json` |
| `pos_next/pos_next/doctype/pos_coupon/pos_coupon.json` |
| `pos_next/pos_next/doctype/pos_settings/pos_settings.json` |
| `pos_next/pos_next/print_format/pos_next_receipt/pos_next_receipt.json` |
| `pos_next/pos_next/report/neopos_register/neopos_register.json` |
| `pos_next/public/pos/manifest.webmanifest` |

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
