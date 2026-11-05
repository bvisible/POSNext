//// Neoffice — added file (no upstream equivalent). Scanning in the shop (lot 2): the calls of the page a shop's fixed QR
//// code opens (pos_next.api.shop_scan), and the session the page keeps for its tab. A customer has no account here: the
//// calls carry no cookie, as the takeaway page's (TakeawayOrder.vue), and the session's token is their only key.

const API = "/api/method/pos_next.api.shop_scan.";

/** A refusal of the server, or no answer at all, said as the page shows it. `kind`: expired | busy | network | refused. */
export class ShopRefusal extends Error {
	constructor(message, kind = "refused") {
		super(message);
		this.kind = kind;
	}
}

/** The first message the server queued for the answer (a refusal's own words), else "". */
export function serverMessage(data) {
	try {
		const messages = JSON.parse(data?._server_messages || "[]");
		const first = messages.length ? JSON.parse(messages[0]) : null;
		return (first && first.message) || "";
	} catch {
		return "";
	}
}

function refusalOf(status, data) {
	const message = serverMessage(data);
	if (data?.exc_type === "AuthenticationError" || status === 401) {
		return new ShopRefusal(message, "expired");
	}
	if (status === 429) {
		return new ShopRefusal(
			message || __("Too many requests. Please try again later."),
			"busy"
		);
	}
	return new ShopRefusal(message || __("Something went wrong. Please try again."), "refused");
}

/** A POST of the page, as JSON, with no cookie: the server's answer, or a ShopRefusal. */
export async function callShop(method, args) {
	let response;
	try {
		response = await fetch(API + method, {
			method: "POST",
			credentials: "omit",
			cache: "no-store",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify(args || {}),
		});
	} catch {
		throw new ShopRefusal(__("No connection. Please try again."), "network");
	}
	const data = await response.json().catch(() => ({}));
	if (response.ok && data && "message" in data) {
		return data.message;
	}
	throw refusalOf(response.status, data);
}

// The session of a shop, kept for the tab: a page that loads again (a reload, the camera's permission) keeps its cart
const SESSION_PREFIX = "pos_next_shop_session:";

export function keptSession(key) {
	try {
		const kept = JSON.parse(window.sessionStorage.getItem(SESSION_PREFIX + key) || "null");
		return kept && kept.token ? kept : null;
	} catch {
		return null;
	}
}

export function keepSession(key, session) {
	try {
		if (session) window.sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(session));
		else window.sessionStorage.removeItem(SESSION_PREFIX + key);
	} catch {
		// A browser that keeps nothing: the cart then lives for this page only
	}
}

/**
 * The shop of `key` as the page opens it: {token, shopName, shopLogo, cart}. The tab's session is taken again while it is valid; a
 * session the server no longer takes (the till closed, its lifetime passed) gives way to a new one. A refusal to open one
 * (the shop does not let customers scan, the shop is closed) rejects with the server's own words.
 */
export async function openShop(key) {
	const kept = keptSession(key);
	if (kept) {
		try {
			const cart = await callShop("get_shop_cart", { token: kept.token });
			return {
				token: kept.token,
				shopName: kept.shopName || "",
				shopLogo: kept.shopLogo || "",
				cart,
			};
		} catch (error) {
			if (error.kind !== "expired") throw error;
			keepSession(key, null);
		}
	}
	const session = await callShop("start_shop_session", { key });
	keepSession(key, {
		token: session.token,
		shopName: session.shop_name,
		shopLogo: session.shop_logo || "",
	});
	const cart = await callShop("get_shop_cart", { token: session.token });
	return {
		token: session.token,
		shopName: session.shop_name || "",
		shopLogo: session.shop_logo || "",
		cart,
	};
}

export const scanItem = (token, barcode, qty = 1) =>
	callShop("scan_item", { token, barcode, qty });
export const setLineQty = (token, line, qty) => callShop("set_line_qty", { token, line, qty });
export const finishCart = (token) => callShop("finish_shop_cart", { token });
/** Open the payment page of the cart (lot 4): {"payment_url", "intent_name"}; the page then leaves for it. */
export const payCart = (token) => callShop("pay_shop_cart", { token });

/**
 * Back from the payment page: ask the server whether the provider settled the payment, again while it waits for it (a
 * minute by default). The last answer: {"status": "paid" | "awaiting_payment" | "failed", "cart"}.
 */
export async function confirmPayment(token, { tries = 20, delayMs = 3000, wait } = {}) {
	const pause = wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
	let answer = null;
	for (let attempt = 0; attempt < tries; attempt++) {
		answer = await callShop("confirm_shop_payment", { token });
		if (answer?.status !== "awaiting_payment") return answer;
		await pause(delayMs);
	}
	return answer;
}

/** The number of articles of a cart, the free ones apart. */
export function articlesIn(cart) {
	return (cart?.lines || [])
		.filter((line) => !line.is_free_item)
		.reduce((sum, line) => sum + Number(line.qty || 0), 0);
}

/** « 1 article », « 3 articles »: the number of a cart's articles with its noun, agreed. */
export function articlesLabel(count) {
	return Number(count) === 1 ? __("1 article") : __("{0} articles", [count]);
}

/**
 * What the customer pays for the cart: the amount the till takes, its total rounded as the till rounds it (CHF 0.05),
 * which the server answers as `amount_due`; the total itself from a server that does not say it yet.
 */
export function amountDue(cart) {
	return Number(cart?.amount_due ?? cart?.grand_total ?? 0);
}

/** An amount as the customer's phone writes money; the number alone for a currency it does not know. */
export function formatAmount(amount, currency) {
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: currency || "CHF",
			minimumFractionDigits: 2,
		}).format(amount || 0);
	} catch {
		return Number(amount || 0).toFixed(2);
	}
}
