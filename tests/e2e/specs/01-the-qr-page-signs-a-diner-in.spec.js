//// Neoffice — added file (no upstream equivalent).
////
//// A diner scans the QR code of a table, orders, gives an address, types the code that came by e-mail, and the
//// table's order is theirs (neoffice-maintenance#2192). The code is the one `frappe.passwordless` mailed, read from
//// the server's mail queue; the accounts and the tables are the suite's own and are taken away after each test.

const {test, expect} = require('@playwright/test');
const {aDiner, aTable, stateOf, cleanUp, leftovers} = require('../fixtures/server');
const {waitForSignInMail} = require('../fixtures/code');

const ADD_TO_CART = /(Add to cart|Ajouter au panier)/i;

async function orderTheDish(page, table) {
	await page.getByText(table.dish, {exact: false}).first().click();
	await page.getByRole('button', {name: ADD_TO_CART}).click();
	await page.locator('.safe-area-bottom button').nth(1).click(); // the cart
	await page.locator('button.bg-green-600').click(); // send the order
	const sent = page.locator('.fixed.inset-0', {hasText: /(Order sent|Commande envoy)/i});
	await expect(sent).toBeVisible();
	await sent.getByRole('button', {name: /^(OK|Ok)$/}).click();
	await expect(sent).toHaveCount(0);
}

async function openTheSheet(page) {
	await page.locator('[data-test="sign-in"]').click();
	await expect(page.locator('[data-test="account-sheet"]')).toBeVisible();
}

async function askForTheCode(page, address) {
	await page.locator('[data-test="account-email"]').fill(address);
	await page.locator('[data-test="account-send-code"]').click();
	await expect(page.locator('[data-test="account-code"]')).toBeVisible();
	return waitForSignInMail(address);
}

test.describe('the QR page of a table', () => {
	let table;
	let second = null;
	let address;

	test.beforeEach(() => {
		table = aTable();
		address = aDiner();
		second = null;
	});

	test.afterEach(() => {
		cleanUp({
			tables: [table.table, ...(second ? [second.table] : [])],
			tokenNames: [table.token_name, ...(second ? [second.token_name] : [])],
			addresses: [address],
		});
	});

	test.afterAll(() => {
		// Nothing of the suite stays on the server
		const left = leftovers([]);
		expect(left.tables).toEqual([]);
	});

	test('a new diner orders, signs in with the mailed code, gives a name, and the order of the table is theirs', async ({page}, info) => {
		await page.goto(`/pos/guest/${table.token}`);
		await orderTheDish(page, table);

		const before = stateOf({tokenName: table.token_name, address});
		expect(before.invoices).toHaveLength(1);
		expect(before.token.customer).toBeNull();
		expect(before.user).toBeNull();

		await openTheSheet(page);
		await page.screenshot({path: `test-results/qr-${info.project.name}-1-address.png`});
		const mail = await askForTheCode(page, address);
		expect(mail.code).toMatch(/^\d{6}$/);
		// An address with no account is told to type the code: the way to open an account is the code, so the mail carries no link for it
		expect(mail.link).toBeNull();
		await page.screenshot({path: `test-results/qr-${info.project.name}-2-code.png`});

		// The sixth digit sends it: there is no button to press
		await page.locator('[data-test="account-code"]').fill(mail.code);
		await expect(page.locator('[data-test="account-name"]')).toBeVisible();
		await page.screenshot({path: `test-results/qr-${info.project.name}-3-name.png`});
		await page.locator('[data-test="account-name"]').fill('E2E Diner');
		await page.locator('[data-test="account-phone"]').fill('+41 79 000 00 00');
		await page.locator('[data-test="account-register"]').click();
		await expect(page.locator('[data-test="account-name-line"]')).toContainText('E2E Diner');
		await page.screenshot({path: `test-results/qr-${info.project.name}-4-signed-in.png`});

		const after = stateOf({tokenName: table.token_name, address});
		expect(after.customer.customer_name).toBe('E2E Diner');
		expect(after.customer.mobile_no).toBe('+41 79 000 00 00');
		expect(after.token.customer).toBe(after.customer.name);
		expect(after.invoices).toHaveLength(1);
		expect(after.invoices[0].customer).toBe(after.customer.name); // the table's order carries the customer
		expect(after.invoices[0].docstatus).toBe(0);
		// A real account: a Website User with the Customer role and nothing of the desk, tied to its customer by a contact
		expect(after.user.user_type).toBe('Website User');
		expect(after.user.enabled).toBe(1);
		expect(after.roles).toContain('Customer');
		expect(after.roles).not.toContain('System Manager');
		expect(after.contact_customer).toBe(after.customer.name);
	});

	test('an address that has an account gets a wrong code refused, then is signed in with the right one, with no name asked', async ({page}) => {
		// The account is made on a first table, then used on a second one
		await page.goto(`/pos/guest/${table.token}`);
		await openTheSheet(page);
		const first = await askForTheCode(page, address);
		await page.locator('[data-test="account-code"]').fill(first.code);
		await page.locator('[data-test="account-name"]').fill('E2E Returning');
		await page.locator('[data-test="account-register"]').click();
		await expect(page.locator('[data-test="account-name-line"]')).toContainText('E2E Returning');

		second = aTable();
		await page.goto(`/pos/guest/${second.token}`);
		await openTheSheet(page);
		await page.locator('[data-test="account-email"]').fill(address);
		await page.locator('[data-test="account-send-code"]').click();
		const mail = await waitForSignInMail(address, {previousCode: first.code});
		const wrong = mail.code === '000000' ? '111111' : '000000';
		await page.locator('[data-test="account-code"]').fill(wrong);
		await expect(page.locator('[data-test="account-error"]')).toBeVisible();
		await expect(page.locator('[data-test="account-name"]')).toHaveCount(0);

		await page.locator('[data-test="account-code"]').fill(mail.code);
		await expect(page.locator('[data-test="account-name-line"]')).toContainText('E2E Returning');
		await expect(page.locator('[data-test="account-name"]')).toHaveCount(0);

		const state = stateOf({tokenName: second.token_name, address});
		expect(state.token.customer).toBe(state.customer.name);
	});
});
