//// Neoffice — added file (no upstream equivalent). The packages of sessions of the customer of the cart (NeoSalon, lots G11, voie 1; product owner, 13.11.2026): the till asks
//// the site (pos_next.api.packages) for the packages the named customer can use today, keeps the last answer, and asks whether a line may be paid by a session of one. The
//// till holds nothing: the site counts the session when the invoice is submitted. Offline nothing is asked and nothing is offered (the packages are the site's).
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { call } from "@/utils/apiWrapper";
import { offlineState } from "@/utils/offline/offlineState";
//// Neoffice — the title of a package arrives escaped for a page (the audit of 18.11, voie 4).
import { plainText } from "@/utils/plainText";

const API = "pos_next.api.packages";
const answerOf = (answer) => answer?.message ?? answer;
//// Neoffice — a question to the site that is not answered after this long is given up and said so: a button never works for ever (the audit of 18.11, voie 4).
const WAIT_MS = 15000;
function within(asking, ms = WAIT_MS) {
	let timer = null;
	return Promise.race([
		asking,
		new Promise((_, reject) => {
			timer = setTimeout(() => {
				const error = new Error(__("The till did not get an answer in time."));
				error.timedOut = true;
				reject(error);
			}, ms);
		}),
	]).finally(() => clearTimeout(timer));
}
const tidy = (list) => list.map((pack) => ({ ...pack, title: plainText(pack?.title) }));

/** Whether a package covers a line of the cart: the line's item is one of the package's, or the line's group is one of its groups. */
export function covers(pack, row) {
	if (!pack || !row) return false;
	return (
		(pack.items || []).includes(row.item_code) ||
		Boolean(row.item_group && (pack.item_groups || []).includes(row.item_group))
	);
}

export const useCustomerPackagesStore = defineStore("customerPackages", () => {
	// Whether the site runs packages for this till, and the customer the list was read for
	const available = ref(false);
	const customer = ref("");
	const packages = ref([]);
	const loading = ref(false);
	// A late answer for a customer the cashier has left is dropped
	let ticket = 0;
	// What the cart last asked for, kept while offline: the packages come back by themselves when the till does
	let wanted = { profile: "", who: "" };

	/** The packages of the customer the cart is for: none for no customer (the cash customer has none), none offline. */
	async function load(profile, named) {
		const who = String(named || "").trim();
		const mine = ++ticket;
		wanted = { profile, who };
		if (!who || !profile || offlineState.isOffline) {
			clear();
			return;
		}
		customer.value = who;
		loading.value = true;
		try {
			const answer = answerOf(
				await within(
					call(`${API}.get_customer_packages`, {
						pos_profile: profile,
						customer: who,
					})
				)
			);
			if (mine !== ticket) return;
			available.value = Boolean(answer?.available);
			packages.value = Array.isArray(answer?.packages) ? tidy(answer.packages) : [];
		} catch {
			if (mine === ticket) {
				available.value = false;
				packages.value = [];
			}
		} finally {
			if (mine === ticket) loading.value = false;
		}
	}

	/**
	 * The packages of the same customer again, after a refusal: the sessions or the validity the site just refused on may have moved since the last reading. What the till
	 * had stays when this fails or answers something else (a refusal is no reason to empty the banners).
	 */
	async function refresh(profile) {
		if (!customer.value || !profile || offlineState.isOffline) return;
		const mine = ticket;
		try {
			const answer = answerOf(
				await within(
					call(`${API}.get_customer_packages`, { pos_profile: profile, customer: customer.value }),
					5000
				)
			);
			if (mine !== ticket || !Array.isArray(answer?.packages)) return;
			available.value = Boolean(answer.available);
			packages.value = tidy(answer.packages);
		} catch {
			// kept as it was
		}
	}

	// The packages are the site's: nothing is offered while the till is cut off (the banners go, and a press on one no longer ends in « Failed to fetch »), and back online
	// they ask again for the customer the cart is for (once, when the till came back)
	if (typeof offlineState.subscribe === "function") {
		offlineState.subscribe((state) => {
			if (state?.transition === "went-offline") {
				ticket++;
				clear();
			} else if (state?.transition === "went-online" && wanted.who && !available.value) {
				load(wanted.profile, wanted.who);
			}
		});
	}

	function clear() {
		available.value = false;
		customer.value = "";
		packages.value = [];
		loading.value = false;
	}

	/**
	 * May a line be paid by a session of a package. Writes nothing.
	 * @returns {Promise<{ok: boolean, line?: object, remaining_after?: number, label?: string, why?: string}>}
	 */
	async function check(profile, pack, row, inCart = 0) {
		let refused = { ok: false, why: "" };
		try {
			const answer = answerOf(
				await within(
					call(`${API}.check_package_use`, {
						pos_profile: profile,
						customer: customer.value,
						package: pack.package,
						item_code: row.item_code,
						qty: Number(row.quantity ?? row.qty) || 1,
						in_cart: inCart,
					})
				)
			);
			if (answer?.ok === true) return answer;
			refused = { ok: false, why: answer?.why || "" };
		} catch (error) {
			//// Neoffice — a request that never reached the site says so in the till's words, not the browser's (« Failed to fetch ») (the audit of 18.11)
			const message = String(error?.message || "");
			const unreachable = error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(message);
			refused = { ok: false, why: unreachable ? __("The till could not reach the site.") : message };
			// A slow site is not asked a second question on top of the first
			if (error?.timedOut) return refused;
		}
		// A refusal says the packages moved, or may have: read them again before the cashier tries another
		await refresh(profile);
		return refused;
	}

	/** Whether any package of the customer covers the line (the till offers « Use a package » only for such a line). */
	const anyCovers = (row) =>
		packages.value.some((pack) => pack.remaining > 0 && covers(pack, row));
	const usable = computed(() => available.value && packages.value.length > 0);

	return { available, customer, packages, loading, usable, load, refresh, clear, check, anyCovers };
});
