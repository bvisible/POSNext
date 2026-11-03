//// Neoffice — added file (no upstream equivalent).
////
//// The web takeaway order, from the page a customer opens to the number they show at pickup (neoffice-maintenance#2132,
//// with the sign-in of #2192): the account first (the mailed code), the order made BEFORE the payment with its lines held,
//// the payment page of the provider for the order's whole total, and, once the provider has settled it (simulated here
//// by the Payment Intent its webhook would make: the hosted page's card form is the provider's), the invoice submitted, the
//// lines at the kitchen and the number on the screen. The page's own word is never a payment.

const {test, expect} = require('@playwright/test');
const {aDiner, stateOf, theProviderSettles, cleanUp} = require('../fixtures/server');
const {waitForSignInMail} = require('../fixtures/code');

const ADD_TO_CART = /(Add to cart|Ajouter au panier)/i;
const DISH = 'Soupe du jour';

test.describe('the web takeaway order', () => {
	let address;
	let tokenName = null;

	test.beforeEach(() => {
		address = aDiner();
		tokenName = null;
	});

	test.afterEach(() => {
		cleanUp({table: null, tokenNames: tokenName ? [tokenName] : [], addresses: [address]});
	});

	test('a customer signs in, orders, pays on the provider\'s word and is given the number to show at pickup', async ({page}, info) => {
		await page.goto('/pos/order');

		// 1. The account is the first step: no menu before it, and the way in is the mailed code
		await expect(page.locator('[data-test="account-sheet"]')).toBeVisible();
		await expect(page.locator('[data-test="account-close"]')).toHaveCount(0);
		await page.screenshot({path: `test-results/takeaway-${info.project.name}-1-account.png`});
		await page.locator('[data-test="account-email"]').fill(address);
		await page.locator('[data-test="account-send-code"]').click();
		await expect(page.locator('[data-test="account-code"]')).toBeVisible();
		const mail = await waitForSignInMail(address);
		await page.locator('[data-test="account-code"]').fill(mail.code);
		await expect(page.locator('[data-test="account-name"]')).toBeVisible();
		await page.locator('[data-test="account-name"]').fill('E2E Takeaway');
		await page.locator('[data-test="account-phone"]').fill('+41 79 000 00 01');
		await page.locator('[data-test="account-register"]').click();

		// 2. The menu is the page's, and the customer is known to the server before anything is ordered
		await expect(page.getByText(DISH).first()).toBeVisible();
		await page.screenshot({path: `test-results/takeaway-${info.project.name}-2-menu.png`});
		const token = await page.evaluate(() => window.sessionStorage.getItem('pos_next_takeaway_token'));
		expect(token).toBeTruthy();
		let state = stateOf({tokenValue: token, address});
		tokenName = state.token.name;
		expect(state.token.mode).toBe('takeaway');
		expect(state.token.pos_profile).toBeTruthy();
		expect(state.token.customer).toBe(state.customer.name);
		expect(state.user.user_type).toBe('Website User');

		// 3. Pay & Order makes the order BEFORE the payment, held, and shows the payment
		await page.getByText(DISH).first().click();
		await page.getByRole('button', {name: ADD_TO_CART}).click();
		await page.locator('.safe-area-bottom button').nth(2).click();
		await expect(page.locator('.safe-area-bottom button').nth(2)).toHaveClass(/text-blue-600/);
		await page.screenshot({path: `test-results/takeaway-${info.project.name}-3-pay.png`});

		await expect.poll(() => stateOf({tokenValue: token, address}).invoices.length, {timeout: 60_000}).toBe(1);
		state = stateOf({tokenValue: token, address});
		const order = state.invoices[0];
		expect(order.docstatus).toBe(0);
		expect(order.is_takeaway).toBe(1);
		expect(order.customer).toBe(state.customer.name);
		expect(order.lines.map((line) => line.kds_status)).toEqual(['Waiting']); // the kitchen has not started it
		expect(order.paid_amount).toBe(0);
		// No tip and no split are drawn for a takeaway order
		await expect(page.getByText(/^(Tip|Pourboire)$/)).toHaveCount(0);

		// 4. The page's word is not a payment: asked to confirm a payment that nobody made, the server waits for the provider
		const answer = await page.evaluate(async (t) => {
			const response = await fetch('/api/method/pos_next.api.guest_ordering.confirm_guest_payment', {
				method: 'POST',
				credentials: 'omit',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({token: t, amount: 1, tip: 0}),
			});
			return (await response.json()).message;
		}, token);
		expect(answer).toEqual({status: 'awaiting_payment'});
		state = stateOf({tokenValue: token, address});
		expect(state.invoices[0].docstatus).toBe(0);
		expect(state.invoices[0].lines[0].kds_status).toBe('Waiting');

		// 5. The payment page of the provider opens, for the order's whole total
		await page.locator('button', {hasText: /^\s*(Pay|Payer)\s+(CHF|\d)/}).click();
		await page.waitForURL((url) => !url.pathname.startsWith('/pos/order'), {timeout: 60_000});
		await page.screenshot({path: `test-results/takeaway-${info.project.name}-4-provider.png`});
		const intents = JSON.parse(
			require('../fixtures/server').onTheServer(
				`print(json.dumps(frappe.get_all("Payment Intent", filters={"reference_name": "${order.name}"}, fields=["status", "amount"])))`
			).split('\n').pop()
		);
		expect(intents.map((intent) => intent.amount)).toEqual([Math.round(order.grand_total * 100)]);

		// 6. The provider settles the order (its webhook): the customer is sent back to the page, which finishes the order
		theProviderSettles(order.name);
		await page.goto(`/pos/order?payment=success&amount=${order.grand_total}&tip=0`);
		await expect(page.getByText(/(Order confirmed|Commande confirm)/i)).toBeVisible({timeout: 90_000});
		await page.screenshot({path: `test-results/takeaway-${info.project.name}-5-confirmed.png`});

		state = stateOf({tokenValue: token, address});
		const paid = state.invoices[0];
		expect(paid.docstatus).toBe(1);
		expect(paid.paid_amount).toBeGreaterThanOrEqual(paid.grand_total);
		expect(paid.lines.map((line) => line.kds_status)).toEqual(['Pending']); // at the kitchen now
		expect(paid.posa_ticket_no).toBeTruthy();
		await expect(page.getByText(String(paid.posa_ticket_no)).first()).toBeVisible(); // the number to show at pickup
		expect(await page.evaluate(() => window.sessionStorage.getItem('pos_next_takeaway_token'))).toBeNull();
	});
});
