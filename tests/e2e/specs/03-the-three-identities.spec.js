//// Neoffice — added file (no upstream equivalent).
////
//// The new entry points of the guest pages are public, so they are probed as the three people who can reach them: a
//// visitor, a Website User (a customer's account, no desk role) and a member of the staff. None of them may open an account
//// without a proof, be bound to a table by a wrong code, tell an address with an account from one without, or say a takeaway
//// order is paid. Administrator passes everything by construction, which is why it is only the third of three (the sessions
//// are minted the way `bench browse --user` does, with no password).

const {test, expect, request} = require('@playwright/test');
const {aDiner, aTable, aWebsiteUser, aSessionOf, aHeldTakeawayOrder, stateOf, cleanUp} = require('../fixtures/server');

const API = '/api/method/pos_next.api.guest_ordering.';

async function asIdentity(baseURL, sid) {
	const headers = {'Content-Type': 'application/json'};
	if (sid) {
		headers.Cookie = `sid=${sid}`;
		// A signed-in session asks for its page's token with every write, as a browser does
		const page = await (await request.newContext({baseURL, extraHTTPHeaders: {Cookie: `sid=${sid}`}})).get('/app');
		const match = (await page.text()).match(/csrf_token\s*=\s*"([^"]+)"/);
		if (match) headers['X-Frappe-CSRF-Token'] = match[1];
	}
	const context = await request.newContext({baseURL, extraHTTPHeaders: headers});
	return {
		post: async (method, body) => {
			const response = await context.post(API + method, {data: body});
			let json = null;
			try {
				json = await response.json();
			} catch (error) {
				// not JSON: the status says enough
			}
			return {status: response.status(), json};
		},
	};
}

test.describe('the entry points of the guest pages, as the three identities', () => {
	let table;
	let held;
	let customerAddress;
	let websiteUser;
	let probe;
	const sessions = {};

	test.beforeAll(() => {
		table = aTable();
		customerAddress = aDiner();
		held = aHeldTakeawayOrder(customerAddress);
		websiteUser = aDiner();
		aWebsiteUser(websiteUser);
		sessions.visitor = null;
		sessions['website user'] = aSessionOf(websiteUser);
		sessions.staff = aSessionOf('Administrator');
		probe = aDiner();
	});

	test.afterAll(() => {
		cleanUp({
			table: table.table,
			tokenNames: [table.token_name, held.token_name],
			addresses: [customerAddress, websiteUser, probe],
		});
	});

	for (const identity of ['visitor', 'website user', 'staff']) {
		test.describe(identity, () => {
			test('a code is asked for with the same answer for an address that has an account and one that has none', async ({baseURL}) => {
				const who = await asIdentity(baseURL, sessions[identity]);

				const known = await who.post('request_guest_code', {token: table.token, email: websiteUser});
				const unknown = await who.post('request_guest_code', {token: table.token, email: probe});

				expect(known.status).toBe(200);
				expect(unknown.status).toBe(200);
				expect(known.json.message).toEqual(unknown.json.message);
				expect(Object.keys(known.json.message).sort()).toEqual(['expires_in', 'ok', 'resend_in']);
			});

			test('a wrong code binds nobody and tells nothing of the address', async ({baseURL}) => {
				const who = await asIdentity(baseURL, sessions[identity]);

				const wrong = await who.post('confirm_guest_code', {token: table.token, email: probe, code: '000000'});

				expect(wrong.status).toBe(417);
				expect(stateOf({tokenName: table.token_name, address: probe}).token.customer).toBeNull();
				expect(stateOf({tokenName: table.token_name, address: probe}).user).toBeNull();
			});

			test('an account is not opened without the proof of a mailbox', async ({baseURL}) => {
				const who = await asIdentity(baseURL, sessions[identity]);

				for (const proof of ['', 'a-made-up-proof', 'x'.repeat(40)]) {
					const answer = await who.post('register_guest_account', {token: table.token, proof, customer_name: 'E2E Nobody'});
					expect(answer.status).toBe(403);
				}

				const state = stateOf({tokenName: table.token_name, address: probe});
				expect(state.user).toBeNull();
				expect(state.customer).toBeNull();
				expect(state.token.customer).toBeNull();
			});

			test('nobody says a takeaway order is paid: the server waits for the provider', async ({baseURL}) => {
				const who = await asIdentity(baseURL, sessions[identity]);

				const answer = await who.post('confirm_guest_payment', {token: held.token, amount: held.total, tip: 0});

				expect(answer.status).toBe(200);
				expect(answer.json.message).toEqual({status: 'awaiting_payment'});
				const state = stateOf({tokenName: held.token_name, address: customerAddress});
				expect(state.invoices[0].docstatus).toBe(0);
				expect(state.invoices[0].paid_amount).toBe(0);
				expect(state.invoices[0].lines.map((line) => line.kds_status)).toEqual(['Waiting']);
			});
		});
	}

	test('the takeaway order is held and the session has a till, whoever made it', async () => {
		expect(held.status).toBe('awaiting_payment');
		const state = stateOf({tokenName: held.token_name, address: customerAddress});
		expect(state.token.pos_profile).toBeTruthy();
		expect(state.invoices[0].is_takeaway).toBe(1);
	});
});
