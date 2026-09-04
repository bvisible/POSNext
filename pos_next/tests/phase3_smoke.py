#//// Neoffice — added file (no upstream equivalent). Acceptance smoke test for Phase 3 of the move
#//// to the unified Payments app: asserts `payments` is installed, builds a Mock provider +
#//// terminal channel, resolves a POS Payment Driver Mapping and runs pos_start_payment /
#//// pos_cancel_payment end to end. It runs through `bench execute` on a real site on purpose — the
#//// path it guards is a live PSP wiring no unit test can reach (9ff7305f, 2026-05-13
#//// "feat(pos_next): Phase 3 — wire POSNext into unified Payments app").
# Copyright (c) 2026, Neoffice and Contributors
# License: AGPL-3.0
"""Phase 3 acceptance smoke test for POSNext.

Validates that the unified Payments layer is wired into POSNext correctly:

	bench --site <site> execute pos_next.tests.phase3_smoke.run_all

What it does (idempotent):

1. Asserts the ``payments`` app is installed (``required_apps``).
2. Creates a ``Mock`` Payment Provider + ``terminal`` channel + binding.
3. Creates a ``POS Payment Driver Mapping`` for the first available POS Profile +
   the *Cash* mode of payment (or creates a dedicated test mode of payment).
4. Calls ``pos_next.api.payments.pos_start_payment`` end-to-end and checks the
   returned status / Payment Intent state.
5. Cancels the intent via ``pos_cancel_payment`` and checks the FSM transition.

This does NOT touch Wallee — the legacy ``create_guest_payment`` path is left
untouched in Phase 3 backend, and will be unplugged in Phase 3.2 (frontend) by
re-pointing Vue calls at the new whitelisted endpoints.
"""

from __future__ import annotations

import json

import frappe

PROVIDER_NAME = "mock"
CHANNEL_CODE = "terminal"
DRIVER_PATH = "payments.drivers.mock_driver.MockDriver"
TEST_MODE_OF_PAYMENT = "POSNext Phase3 Test"


def _ensure_payments_fixtures() -> None:
	if not frappe.db.exists("Payment Provider", PROVIDER_NAME):
		frappe.get_doc(
			{
				"doctype": "Payment Provider",
				"provider_name": PROVIDER_NAME,
				"display_label": "Mock",
				"enabled": 1,
				"mode": "test",
				"driver_class": DRIVER_PATH,
			}
		).insert(ignore_permissions=True)
	if not frappe.db.exists("Payment Channel", CHANNEL_CODE):
		frappe.get_doc(
			{
				"doctype": "Payment Channel",
				"channel_code": CHANNEL_CODE,
				"display_label": "POS Terminal",
				"ui_kind": "card_present_modal",
				"capabilities_json": json.dumps({"supports_refund": True}),
			}
		).insert(ignore_permissions=True)
	if not frappe.db.get_value(
		"Provider Channel Settings", {"provider": PROVIDER_NAME, "channel": CHANNEL_CODE}, "name"
	):
		frappe.get_doc(
			{
				"doctype": "Provider Channel Settings",
				"provider": PROVIDER_NAME,
				"channel": CHANNEL_CODE,
				"enabled": 1,
			}
		).insert(ignore_permissions=True)


def _ensure_mode_of_payment() -> str:
	if not frappe.db.exists("Mode of Payment", TEST_MODE_OF_PAYMENT):
		frappe.get_doc(
			{
				"doctype": "Mode of Payment",
				"mode_of_payment": TEST_MODE_OF_PAYMENT,
				"type": "Bank",
				"enabled": 1,
			}
		).insert(ignore_permissions=True)
	return TEST_MODE_OF_PAYMENT


def _pick_pos_profile() -> str | None:
	profiles = frappe.get_all("POS Profile", filters={"disabled": 0}, pluck="name")
	if not profiles:
		return None
	return profiles[0]


def _ensure_mapping(pos_profile: str, mop: str) -> str:
	existing = frappe.db.get_value(
		"POS Payment Driver Mapping",
		{"pos_profile": pos_profile, "mode_of_payment": mop},
		"name",
	)
	if existing:
		# Re-set the provider/channel in case it was stale from a prior run.
		doc = frappe.get_doc("POS Payment Driver Mapping", existing)
		doc.provider = PROVIDER_NAME
		doc.channel = CHANNEL_CODE
		doc.enabled = 1
		doc.auto_attach_device = 0
		doc.save(ignore_permissions=True)
		return existing
	return frappe.get_doc(
		{
			"doctype": "POS Payment Driver Mapping",
			"pos_profile": pos_profile,
			"mode_of_payment": mop,
			"provider": PROVIDER_NAME,
			"channel": CHANNEL_CODE,
			"enabled": 1,
			"auto_attach_device": 0,
			"options_json": json.dumps({"source": "phase3_smoke"}),
		}
	).insert(ignore_permissions=True).name


def _cleanup() -> None:
	# Drop intents and events created by this smoke for clean re-runs.
	intents = frappe.get_all(
		"Payment Intent",
		filters={"provider": PROVIDER_NAME, "metadata_json": ["like", "%phase3_smoke%"]},
		pluck="name",
	)
	for name in intents:
		for ev in frappe.get_all("Payment Event", filters={"intent": name}, pluck="name"):
			frappe.delete_doc("Payment Event", ev, force=True, ignore_permissions=True)
		frappe.delete_doc("Payment Intent", name, force=True, ignore_permissions=True)
	frappe.db.commit()


def run_all() -> dict:
	report: dict = {"checks": [], "errors": []}

	def add(name: str, ok: bool, detail: str = "") -> None:
		report["checks"].append({"name": name, "ok": ok, "detail": detail})
		marker = "✅" if ok else "❌"
		print(f"  {marker} {name}: {detail}")

	print("=" * 60)
	print("POSNext Phase 3 — unified Payments wiring smoke")
	print("=" * 60)

	# 1. required_apps respected (the test runs at all means migrate succeeded).
	installed = frappe.get_installed_apps()
	add(
		"payments app installed on this site",
		"payments" in installed,
		f"installed_apps_count={len(installed)}",
	)

	_cleanup()
	_ensure_payments_fixtures()
	mop = _ensure_mode_of_payment()
	pos_profile = _pick_pos_profile()
	if not pos_profile:
		add("POS Profile available", False, "no enabled POS Profile on this site")
		report["all_ok"] = False
		return report
	add("POS Profile available", True, pos_profile)

	mapping_name = _ensure_mapping(pos_profile, mop)
	add("POS Payment Driver Mapping ready", True, mapping_name)

	# 2. pos_get_mapping resolves to our mock binding.
	from pos_next.api import payments as pos_payments

	try:
		resolved = pos_payments.pos_get_mapping(pos_profile, mop)
		ok = (
			resolved["provider"] == PROVIDER_NAME
			and resolved["channel"] == CHANNEL_CODE
			and resolved["mapping_name"] == mapping_name
		)
		add(
			"pos_get_mapping returns expected binding",
			ok,
			f"provider={resolved['provider']} channel={resolved['channel']}",
		)
	except Exception as exc:  # noqa: BLE001
		add("pos_get_mapping", False, repr(exc))
		report["errors"].append({"step": "pos_get_mapping", "error": repr(exc)})

	# 3. pos_start_payment end-to-end (mock driver → requires_action).
	try:
		result = pos_payments.pos_start_payment(
			reference_doctype="POS Profile",  # any DocType that exists; reference_name = pos_profile
			reference_name=pos_profile,
			pos_profile=pos_profile,
			mode_of_payment=mop,
			amount=2500,
			currency="CHF",
			metadata={"source": "phase3_smoke"},
		)
		ok = (
			result["status"] == "requires_action"
			and result["provider"] == PROVIDER_NAME
			and result["channel"] == CHANNEL_CODE
			and (result["provider_intent_id"] or "").startswith("mock_pi_")
		)
		add(
			"pos_start_payment(2500 CHF) round-trip",
			ok,
			f"intent={result['intent_name']} status={result['status']}",
		)
		intent_name = result["intent_name"]
	except Exception as exc:  # noqa: BLE001
		add("pos_start_payment", False, repr(exc))
		report["errors"].append({"step": "pos_start_payment", "error": repr(exc)})
		intent_name = None

	# 4. pos_get_intent_status mirrors create's view.
	if intent_name:
		fetched = pos_payments.pos_get_intent_status(intent_name)
		add(
			"pos_get_intent_status matches",
			fetched["intent_name"] == intent_name and fetched["status"] == "requires_action",
			f"fetched_status={fetched['status']}",
		)

	# 5. pos_cancel_payment moves the intent to canceled.
	if intent_name:
		canceled = pos_payments.pos_cancel_payment(intent_name)
		add(
			"pos_cancel_payment → canceled",
			canceled["status"] == "canceled",
			f"final_status={canceled['status']}",
		)

	# 6. metadata composition: mapping options merged with caller metadata + POS context.
	if intent_name:
		intent_doc = frappe.get_doc("Payment Intent", intent_name)
		md = intent_doc.get_metadata()
		ok = (
			md.get("pos_profile") == pos_profile
			and md.get("mode_of_payment") == mop
			and md.get("source") == "phase3_smoke"  # caller wins overlapping key
		)
		add(
			"metadata composition (mapping + caller + POS context)",
			ok,
			f"keys={sorted(md.keys())}",
		)

	_cleanup()

	all_ok = all(c["ok"] for c in report["checks"])
	print("=" * 60)
	print(f"RESULT: {'ALL GREEN ✅' if all_ok else 'FAILURES ❌'}")
	print(f"Checks: {sum(1 for c in report['checks'] if c['ok'])}/{len(report['checks'])} passed")
	print("=" * 60)
	report["all_ok"] = all_ok
	return report
