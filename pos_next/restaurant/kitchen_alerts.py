# //// Neoffice — added file (no upstream equivalent). The popup and the sound of the kitchen's and the runner's screens
# //// (NeoRestau lot 1, Daniel, 01.11: « quand on commande la suite il doit y avoir un popup à la cuisine, et aussi un son
# //// pour aviser […] dans les réglages de la caisse »).
"""The kitchen alerts a till sets, as the kitchen's and the runner's tablets read them.

The five settings live on the till's POS Settings, which is one row per POS Profile ("Réglages de la caisse"):

- `kitchen_next_course_popup` (on): a notice at the top of the kitchen screen when the next course is ordered;
- `kitchen_popup_seconds` (30, 0 = until dismissed): how long it stays;
- `kitchen_next_course_sound` (Bell): the sound that goes with it;
- `runner_ready_sound` (Beep, the runner's own beep until now): the sound of the runner's screen when dishes come up ready;
- `kitchen_alert_volume` (Medium).

The screens of the restaurant run on device accounts (pos_next.restaurant.devices), with no till and no POS Profile behind
them, so they are given the values of the restaurant's till: the POS Settings row that names the restaurant. A restaurant
with several tills follows its oldest enabled row, except for a desk user who has a till open at this restaurant, who gets
the row of that till (a manager changing the settings of the till he works at hears the change on the screen he tries it on).
A restaurant with no till, a disabled row, a value nobody set and a site not migrated yet all read as the defaults.
"""

import frappe
from frappe.utils import cint

# The ids of the sounds the front synthesises (POS/src/utils/alertSounds.js), in the order the doctype offers them: the doctype
# stores the words ("Double beep"), the screens get the ids ("double_beep")
SOUNDS = ("none", "bell", "double_beep", "chime", "gong", "beep")
VOLUMES = ("low", "medium", "high")
# The longest a popup may stay: ten minutes; beyond that a person has to dismiss it
MAX_POPUP_SECONDS = 600

FIELDS = (
	"kitchen_next_course_popup",
	"kitchen_popup_seconds",
	"kitchen_next_course_sound",
	"runner_ready_sound",
	"kitchen_alert_volume",
)

DEFAULTS = {
	"popup": True,
	"popup_seconds": 30,
	"next_course_sound": "bell",
	"runner_sound": "beep",
	"volume": "medium",
}


def sound_id(value, fallback: str) -> str:
	"""The id of a sound from what the doctype stores ("Double beep") or an id ("double_beep"); the fallback for anything else."""
	identifier = "_".join(str(value or "").strip().lower().replace("-", " ").split())
	return identifier if identifier in SOUNDS else fallback


def volume_id(value) -> str:
	"""The id of a volume from what the doctype stores ("High"); medium for anything else."""
	identifier = str(value or "").strip().lower()
	return identifier if identifier in VOLUMES else DEFAULTS["volume"]


def popup_seconds(value) -> int:
	"""How long the popup stays, in seconds, held to 0 (until dismissed) .. MAX_POPUP_SECONDS; the default for no value, or one that is no number."""
	if value is None or value == "":
		return DEFAULTS["popup_seconds"]
	try:
		seconds = int(float(value))
	except (TypeError, ValueError):
		return DEFAULTS["popup_seconds"]
	return max(0, min(seconds, MAX_POPUP_SECONDS))


def resolve(row) -> dict:
	"""The settings a row of POS Settings means (the fields of `FIELDS`, any of them missing or empty), with the defaults for what it does not say."""
	row = row or {}
	popup = row.get("kitchen_next_course_popup")
	return {
		"popup": DEFAULTS["popup"] if popup is None or popup == "" else bool(cint(popup)),
		"popup_seconds": popup_seconds(row.get("kitchen_popup_seconds")),
		"next_course_sound": sound_id(row.get("kitchen_next_course_sound"), DEFAULTS["next_course_sound"]),
		"runner_sound": sound_id(row.get("runner_ready_sound"), DEFAULTS["runner_sound"]),
		"volume": volume_id(row.get("kitchen_alert_volume")),
	}


def kitchen_alert_settings(restaurant: str | None, pos_profile: str | None = None) -> dict:
	"""The alerts of a restaurant: the row of POS Settings of its till, read as `resolve` says; the defaults when it has none.

	`pos_profile` is the till the caller works at, if any (a desk user's open shift): its row is preferred when it names this
	restaurant. A device account has none.
	"""
	if not restaurant:
		return resolve(None)
	try:
		row = None
		if pos_profile:
			row = frappe.db.get_value(
				"POS Settings",
				{"pos_profile": pos_profile, "restaurant": restaurant, "enabled": 1},
				list(FIELDS),
				as_dict=True,
			)
		if not row:
			rows = frappe.get_all(
				"POS Settings",
				filters={"restaurant": restaurant, "enabled": 1},
				fields=list(FIELDS),
				order_by="creation asc, name asc",
				limit=1,
			)
			row = rows[0] if rows else None
	except Exception as error:
		if frappe.db.is_missing_column(error) or frappe.db.is_table_missing(error):
			# The code is updated and the site is not migrated yet: no till has these settings, so they are the defaults
			return resolve(None)
		raise
	return resolve(row)
