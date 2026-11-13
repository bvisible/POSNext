//// Neoffice — added file (no upstream equivalent). The packages of sessions of the customer of the cart (NeoSalon, lots G11, voie 1; product owner, 13.11.2026): the till asks
//// the site (pos_next.api.packages) for the packages the named customer can use today, keeps the last answer, and asks whether a line may be paid by a session of one. The
//// till holds nothing: the site counts the session when the invoice is submitted. Offline nothing is asked and nothing is offered (the packages are the site's).
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { call } from "@/utils/apiWrapper";
import { offlineState } from "@/utils/offline/offlineState";

const API = "pos_next.api.packages";
const answerOf = (answer) => answer?.message ?? answer;

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

	/** The packages of the customer the cart is for: none for no customer (the cash customer has none), none offline. */
	async function load(profile, named) {
		const wanted = String(named || "").trim();
		const mine = ++ticket;
		if (!wanted || !profile || offlineState.isOffline) {
			clear();
			return;
		}
		customer.value = wanted;
		loading.value = true;
		try {
			const answer = answerOf(
				await call(`${API}.get_customer_packages`, {
					pos_profile: profile,
					customer: wanted,
				})
			);
			if (mine !== ticket) return;
			available.value = Boolean(answer?.available);
			packages.value = Array.isArray(answer?.packages) ? answer.packages : [];
		} catch {
			if (mine === ticket) {
				available.value = false;
				packages.value = [];
			}
		} finally {
			if (mine === ticket) loading.value = false;
		}
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
		try {
			const answer = answerOf(
				await call(`${API}.check_package_use`, {
					pos_profile: profile,
					customer: customer.value,
					package: pack.package,
					item_code: row.item_code,
					qty: Number(row.quantity ?? row.qty) || 1,
					in_cart: inCart,
				})
			);
			return answer?.ok === true ? answer : { ok: false, why: answer?.why || "" };
		} catch (error) {
			return { ok: false, why: String(error?.message || "") };
		}
	}

	/** Whether any package of the customer covers the line (the till offers « Use a package » only for such a line). */
	const anyCovers = (row) =>
		packages.value.some((pack) => pack.remaining > 0 && covers(pack, row));
	const usable = computed(() => available.value && packages.value.length > 0);

	return { available, customer, packages, loading, usable, load, clear, check, anyCovers };
});
