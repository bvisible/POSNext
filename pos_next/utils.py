"""Utility helpers shared across the POS Next backend."""

from __future__ import annotations

import json
import time
from pathlib import Path

from pos_next import __version__ as app_version

_BASE_DIR = Path(__file__).resolve().parent
_VERSION_FILE = _BASE_DIR / "public" / "pos" / "version.json"
_MANIFEST_FILE = _BASE_DIR / "public" / "pos" / "manifest.webmanifest"
_FALLBACK_VERSION: str | None = None


def _read_version_file() -> str | None:
	"""
	Read version from version.json file.

	Returns:
		str | None: Version string or None if file doesn't exist or is invalid
	"""
	if not _VERSION_FILE.exists():
		return None
	try:
		data = json.loads(_VERSION_FILE.read_text(encoding="utf-8"))
	except (json.JSONDecodeError, OSError, ValueError):
		return None
	version = data.get("version") or data.get("buildVersion")
	return str(version) if version else None


def _manifest_mtime_version() -> str | None:
	"""
	Get version based on manifest file modification time.

	Returns:
		str | None: Version string based on mtime or None if file doesn't exist
	"""
	if not _MANIFEST_FILE.exists():
		return None
	try:
		return str(int(_MANIFEST_FILE.stat().st_mtime))
	except OSError:
		return None


def get_build_version() -> str:
	"""
	Return a string that uniquely identifies the current asset build.

	This function tries multiple strategies to get a unique build version:
	1. Read from version.json (generated during build)
	2. Use manifest.webmanifest modification time
	3. Fall back to app version + timestamp

	Returns:
		str: Unique build version identifier
	"""
	# Try reading from version.json first
	version = _read_version_file()
	if version:
		return version

	# Fall back to manifest modification time
	mtime_version = _manifest_mtime_version()
	if mtime_version:
		return mtime_version

	# Ultimate fallback: app version + timestamp
	global _FALLBACK_VERSION
	if _FALLBACK_VERSION is None:
		_FALLBACK_VERSION = f"{app_version}-{int(time.time())}"
	return _FALLBACK_VERSION


def get_app_version() -> str:
	"""
	Get the application version from __init__.py

	Returns:
		str: Application version
	"""
	return app_version


# //// Neoffice — added (#951). Name of the savepoint one cancel runs under.
_CANCEL_SAVEPOINT = "pos_next_cancel"


# //// Neoffice — added (#951): cancels that are caught and carried on from (the credit redemption entries
# //// of a cancelled invoice, the wallet transactions of a return) must not keep a cancel Frappe refused.
def cancel_or_undo(doc):
	"""Cancel `doc`; when Frappe refuses, put back what the refused cancel already wrote, then re-raise.

	Frappe cancels by writing docstatus 2 to the row, running on_cancel (the reversal entries, the wallet
	balance) and only then checking that no submitted document still links to it. When that check raises
	LinkExistsError the row and what on_cancel wrote are already there, so a caller that catches the error
	and carries on commits a cancellation that half happened. The savepoint undoes it; whatever the caller
	does with the error, logging included, then runs on the state as it was before the cancel.
	"""
	import frappe

	frappe.db.savepoint(_CANCEL_SAVEPOINT)
	try:
		doc.cancel()
	except Exception:
		frappe.db.rollback(save_point=_CANCEL_SAVEPOINT)
		raise
	frappe.db.release_savepoint(_CANCEL_SAVEPOINT)
