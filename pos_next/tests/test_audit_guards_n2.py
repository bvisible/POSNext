# //// Neoffice — added file (no upstream equivalent).
"""The second lot of the till's audit (neoffice-maintenance#2296): finding 23 and the Wallee provider of a guest.

- 23: the coupons and the referral codes stay in the companies a User Permission keeps the caller to, and the
  details of a referral code ask a desk account, as their list does.
- The Wallee provider of a guest's payment follows the shop's rule (payments.drivers.registry.pick_provider).

Nothing here commits, and no provider is called.
"""

import json

import frappe

from pos_next.api import guest_ordering, promotions
from pos_next.tests.test_audit_guards_n1 import KEPT, PORTAL, SALES_MANAGER, TillCase, keep_to
from pos_next.tests.test_till_writes_need_the_till import _user

MARK = "AUDITN2"


class TestTheCodesStayInTheUsersCompany(TillCase):
	def setUp(self):
		super().setUp()
		self.other = frappe.db.get_value("Company", {"name": ["!=", self.fx.company]}, "name")
		if not self.other:
			self.skipTest("a second company is needed")
		keep_to(KEPT, "Company", self.fx.company)

	def a_coupon(self, code, company):
		return self.as_user(
			SALES_MANAGER,
			promotions.create_coupon,
			json.dumps(
				{
					"coupon_name": code,
					"coupon_type": "Promotional",
					"coupon_code": code,
					"discount_type": "Percentage",
					"discount_percentage": 10,
					"company": company,
					"maximum_use": 5,
				}
			),
		)["name"]

	def test_a_user_kept_to_a_company_lists_only_its_coupons(self):
		ours = self.a_coupon(f"{MARK}OURS", self.fx.company)
		theirs = self.a_coupon(f"{MARK}THEIRS", self.other)

		listed = {row.name for row in self.as_user(KEPT, promotions.get_coupons)}
		self.assertIn(ours, listed)
		self.assertNotIn(theirs, listed)
		with self.assertRaises(frappe.PermissionError):
			self.as_user(KEPT, promotions.get_coupons, self.other)
		with self.assertRaises(frappe.PermissionError):
			self.as_user(KEPT, promotions.get_coupon_details, theirs)
		self.assertEqual(self.as_user(KEPT, promotions.get_coupon_details, ours)["name"], ours)

	def test_an_account_with_no_restriction_lists_every_company(self):
		ours = self.a_coupon(f"{MARK}OURS2", self.fx.company)
		theirs = self.a_coupon(f"{MARK}THEIRS2", self.other)
		listed = {row.name for row in self.as_user(SALES_MANAGER, promotions.get_coupons)}
		self.assertTrue({ours, theirs} <= listed)

	def test_a_user_kept_to_a_company_reads_no_referral_code_of_another(self):
		with self.assertRaises(frappe.PermissionError):
			self.as_user(KEPT, promotions.get_referral_codes, self.other)
		self.assertIsInstance(self.as_user(KEPT, promotions.get_referral_codes, self.fx.company), list)


class TestTheDetailsOfAReferralCodeAskADeskAccount(TillCase):
	def test_a_portal_account_is_refused_before_anything_is_looked_up(self):
		# A portal account given a role that reads the promotions: a role does not make it a desk account
		_user(PORTAL, ["Customer", "Sales Manager"], "Website User")
		with self.assertRaises(frappe.PermissionError):
			self.as_user(PORTAL, promotions.get_referral_details, f"{MARK}-NO-SUCH-CODE")


class TestTheWalleeProviderOfAGuestDoesNotDependOnTheLastSave(TillCase):
	DRIVER = "payments.drivers.wallee.web_driver.WalleeWebDriver"
	LIVE = "auditn2_wallee_live"
	TEST = "auditn2_wallee_test"

	def setUp(self):
		super().setUp()
		try:
			from payments.drivers.registry import pick_provider  # noqa: F401
		except ImportError:
			self.skipTest("the payments app of this site has no pick_provider")
		for name in frappe.get_all(
			"Payment Provider",
			filters={"driver_class": ["like", "payments.drivers.wallee.%"], "enabled": 1},
			pluck="name",
		):
			frappe.db.set_value("Payment Provider", name, "enabled", 0, update_modified=False)
		for name, mode in ((self.LIVE, "live"), (self.TEST, "test")):
			provider = frappe.new_doc("Payment Provider")
			provider.update(
				{
					"name": name,
					"provider_name": name,
					"display_label": name,
					"enabled": 1,
					"mode": mode,
					"driver_class": self.DRIVER,
				}
			)
			provider.db_insert()

	def test_the_live_provider_takes_the_guests_payment_whichever_was_saved_last(self):
		for newest in (self.TEST, self.LIVE, self.TEST):
			frappe.db.set_value(
				"Payment Provider", newest, "modified", frappe.utils.now_datetime(), update_modified=False
			)
			with self.subTest(saved_last=newest):
				self.assertEqual(self.as_user("Guest", guest_ordering._resolve_wallee_provider), self.LIVE)
