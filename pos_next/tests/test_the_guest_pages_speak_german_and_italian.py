# //// Neoffice — added file (no upstream equivalent).
"""What a guest reads is in German and Italian too (neoffice-maintenance#2192, 2026-11-04).

The pages a phone opens from a table's QR code, the web takeaway order and the sign-in sheet are read by whoever is at the table: in
Valais, in German or Italian as often as in French. The app had no `de.po` or `it.po`, so a German-speaking guest read the buttons other apps
translate and the sentences of this one in English ("Sign in to earn and use your loyalty points…").

`de.po` and `it.po` carry the guests' pages only. This suite keeps it so: every string the guest files say through `__()` or `_()` has a
translation in both, so a sentence added tomorrow to a guest page cannot ship in English to a German-speaking table without a red test.
A word that is the same in the language (« OK », « Code », « Menu » in Italian…) has no entry on purpose and is listed below with its reason.

The suite reads files: no site data, no database write.
"""

import re
from pathlib import Path

import frappe
from babel.messages.pofile import read_po
from frappe.tests.utils import FrappeTestCase

# What the guest sees: the pages and sheets of the QR order and of the takeaway order, and the two server modules that answer them in words.
GUEST_FILES = (
	"POS/src/components/guest/GuestAccountSheet.vue",
	"POS/src/components/guest/GuestCart.vue",
	"POS/src/components/guest/GuestCheckout.vue",
	"POS/src/components/guest/GuestMenuView.vue",
	"POS/src/pages/GuestOrder.vue",
	"POS/src/pages/GuestReservation.vue",
	"POS/src/pages/PublicMenu.vue",
	"POS/src/pages/TakeawayOrder.vue",
	"POS/src/stores/guestOrder.js",
	"POS/src/utils/publicMenu.js",
	"pos_next/api/guest_ordering.py",
	"pos_next/restaurant/guest_account.py",
)

# The word is the same in that language, so the English key already reads right: no entry, on purpose.
SAME_IN_THE_LANGUAGE = {
	"de": {"Code", "OK", "optional"},
	"it": {"Email", "Menu", "OK"},
}
# An address typed as an example is not a sentence.
NOT_A_SENTENCE = {"your@email.com"}

JS_CALL = re.compile(
	r"""(?<![A-Za-z0-9_$.])__\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\$]|\\.)*)`)""",
	re.S,
)
PY_CALL = re.compile(r"""(?<![A-Za-z0-9_.])_\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')""", re.S)


def repository_root() -> Path:
	# apps/pos_next/pos_next -> apps/pos_next
	return Path(frappe.get_app_path("pos_next")).parent


def guest_strings() -> dict[str, list[str]]:
	"""Every string the guest files translate, and the files that say it."""
	found: dict[str, list[str]] = {}
	for name in GUEST_FILES:
		path = repository_root() / name
		text = path.read_text(encoding="utf8")
		is_python = name.endswith(".py")
		for match in (PY_CALL if is_python else JS_CALL).finditer(text):
			raw = next(group for group in match.groups() if group is not None)
			if "\\" in raw:
				raw = raw.encode("utf8").decode("unicode_escape").encode("latin-1").decode("utf8")
			found.setdefault(raw, []).append(name)
	return found


def translations_of(language: str) -> dict[tuple[str, str | None], str]:
	path = repository_root() / "pos_next" / "locale" / f"{language}.po"
	with path.open("rb") as handle:
		catalog = read_po(handle)
	return {(m.id, m.context): m.string for m in catalog if m.id and m.string}


class TheGuestPagesSpeakGermanAndItalian(FrappeTestCase):
	def test_the_suite_reads_the_guest_files(self):
		# A suite that finds nothing would pass for nothing: the guest files carry well over a hundred strings.
		strings = guest_strings()

		self.assertGreater(len(strings), 120)
		self.assertIn("Send me a code", strings)

	def test_every_guest_string_is_translated(self):
		strings = guest_strings()
		for language in ("de", "it"):
			with self.subTest(language=language):
				translated = translations_of(language)
				bare = {msgid for (msgid, context) in translated if context is None}
				anywhere = {msgid for (msgid, _context) in translated}
				missing = []
				for msgid, files in sorted(strings.items()):
					if msgid in NOT_A_SENTENCE or msgid in SAME_IN_THE_LANGUAGE[language]:
						continue
					# The page's dictionary is keyed by the bare word, which the JavaScript asks for; a server module may say a
					# word through a context, which is its own entry.
					is_server = all(name.endswith(".py") for name in files)
					if msgid not in (anywhere if is_server else bare):
						missing.append(f"{msgid!r} ({files[0]})")
				self.assertEqual(missing, [], f"{language}: strings a guest reads with no translation")

	def test_the_languages_are_what_they_say_they_are(self):
		for language in ("de", "it"):
			with self.subTest(language=language):
				path = repository_root() / "pos_next" / "locale" / f"{language}.po"
				with path.open("rb") as handle:
					catalog = read_po(handle)

				# Frappe compiles a catalogue by its header: an empty or wrong one is not served.
				self.assertEqual(str(catalog.locale), language)
				# One translation is never its own source: Frappe merges every app's catalogue, so an identity here would
				# erase another app's word on every screen.
				identities = [m.id for m in catalog if m.id and m.string == m.id]
				self.assertEqual(identities, [])

	def test_a_german_guest_reads_no_eszett(self):
		# Swiss spelling: « ss », never « ß ».
		path = repository_root() / "pos_next" / "locale" / "de.po"

		self.assertNotIn("ß", path.read_text(encoding="utf8"))
