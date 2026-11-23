# //// Neoffice — added file (no upstream equivalent).
"""The till follows what the company said of its promotions in the welcome of its spaces (neoffice_theme space_welcome,
« Do you run promotions? », lot 10 of neoffice-maintenance#2961; product owner, 23.11.2026: « Oui, aussi à la caisse »).

The till's settings carry `promotions_said_no` (pos_next.till_welcome, on the seam `pos_next_bootstrap_settings`): the
management rail drops its « Promotions » entry and its window its promotions tab where it is true. It is true only where
the till's company said « No »: nothing said, a proposal kept as it was, another company's answer, or the welcome's key
off, and the till is as it always was. A site without the theme (the fleet's CI site of pos_next) skips.

Played by the till manager, who answers the Point de vente's window and opens the till; Administrator lays the scene.
"""

from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase

KEY = "common.promotions"


class TestTheTillFollowsWhatTheCompanySaidOfItsPromotions(FrappeTestCase):
	def setUp(self):
		super().setUp()
		try:
			from neoffice_theme.space_welcome import api, registry
		except ImportError:
			self.skipTest("the welcome of the spaces (neoffice_theme) is not on this site")
		self.api, self.registry = api, registry
		frappe.set_user("Administrator")
		self.addCleanup(frappe.set_user, "Administrator")
		if not frappe.db.table_exists(api.ANSWER_DOCTYPE):
			self.skipTest("the welcome keeps no answers on this site")
		with as_role("till_manager"):
			self.company = api._company()
		self.till = frappe.db.get_value("POS Profile", {"company": self.company, "disabled": 0}, "name")
		if not self.company or not self.till:
			self.skipTest("no working till of the default company on this site")
		self.kept = set(frappe.get_all(api.ANSWER_DOCTYPE, filters={"question": KEY}, pluck="name"))
		self.addCleanup(self._drop_new_answers)
		self._key(1)

	def _key(self, on):
		conf = patch.dict(frappe.conf, {self.api.FLAG: on})
		conf.start()
		self.addCleanup(conf.stop)

	def _drop_new_answers(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all(self.api.ANSWER_DOCTYPE, filters={"question": KEY}, pluck="name"):
			if name not in self.kept:
				frappe.delete_doc(self.api.ANSWER_DOCTYPE, name, force=True, ignore_permissions=True)

	def _at_the_till(self):
		"""The settings the till reads when it opens, as its manager."""
		from pos_next.pos_next.doctype.pos_settings.pos_settings import get_pos_settings

		with as_role("till_manager"):
			return get_pos_settings(self.till)

	def _said(self, answer, company=None, source=""):
		frappe.set_user("Administrator")
		company = company or self.company
		name = frappe.db.get_value(self.api.ANSWER_DOCTYPE, {"company": company, "question": KEY})
		doc = (
			frappe.get_doc(self.api.ANSWER_DOCTYPE, name) if name else frappe.new_doc(self.api.ANSWER_DOCTYPE)
		)
		doc.update(
			{"company": company, "question": KEY, "space": "Retail", "answer": answer, "source": source}
		)
		doc.flags.ignore_permissions = True
		doc.save()

	def test_the_till_says_nothing_of_promotions_while_nothing_was_said(self):
		if frappe.db.exists(self.api.ANSWER_DOCTYPE, {"company": self.company, "question": KEY}):
			self.skipTest("the company already answered on this site")
		self.assertIs(self._at_the_till()["promotions_said_no"], False)

	def test_a_no_given_in_the_point_de_vente_reaches_the_till_and_a_yes_brings_the_promotions_back(self):
		with as_role("till_manager"):
			self.api.answer("Retail", KEY, self.registry.NO)
		self.assertIs(self._at_the_till()["promotions_said_no"], True)
		with as_role("till_manager"):
			self.api.answer("Retail", KEY, self.registry.YES)
		self.assertIs(self._at_the_till()["promotions_said_no"], False)

	def test_a_proposal_kept_as_it_was_and_another_companys_no_change_nothing(self):
		self._said(self.registry.NO, source=self.api.PROPOSAL)
		self.assertIs(self._at_the_till()["promotions_said_no"], False)
		other = frappe.db.get_value("Company", {"name": ["!=", self.company]}, "name")
		if other:
			self._said(self.registry.YES)
			self._said(self.registry.NO, company=other)
			self.assertIs(self._at_the_till()["promotions_said_no"], False)

	def test_with_the_welcomes_key_off_the_till_is_as_it_always_was(self):
		self._said(self.registry.NO)
		self._key(0)
		self.assertIs(self._at_the_till()["promotions_said_no"], False)
