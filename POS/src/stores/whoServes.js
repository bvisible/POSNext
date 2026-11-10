//// Neoffice — added file (no upstream equivalent). « Who serves? » at the head of the cart (NeoSalon, lot G1, product owner, 09.11.2026).
//// The person a new line of the cart is given, shown above the cart (components/sale/WhoServesBar.vue): the cashier's own sales person if the account has one, else the one
//// chosen before on this shared till, else nobody. A line already in the cart keeps the person it has; the next line takes the new one. The rules are in utils/whoServes.js.
import { defineStore } from "pinia"
import { ref } from "vue"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { loadItemKinds, kindOf, PRODUCT } from "@/utils/itemKinds"
import { loadSalesPersonsForProfile } from "@/utils/salesPersonsList"
import {
	asLinePerson,
	hasOwnPerson,
	pickWhoServes,
	rememberedWhoServes,
	rememberWhoServes,
} from "@/utils/whoServes"

export const useWhoServesStore = defineStore("whoServes", () => {
	const settings = usePOSSettingsStore()

	const forProfile = ref(null)
	const persons = ref([])
	// { sales_person, sales_person_name } or null
	const person = ref(null)
	// "mine" (the account's own), "remembered" (a shared till's last choice) or "chosen" (picked in this sale)
	const origin = ref("")
	const loading = ref(false)

	const isOn = () => Boolean(settings.enableSalesPersons)
	const productsTracked = () => Boolean(settings.trackProductSalesByPerson)

	function settle() {
		if (!isOn() || person.value) return
		const picked = pickWhoServes({
			persons: persons.value,
			remembered: rememberedWhoServes(forProfile.value),
		})
		if (!picked) return
		person.value = asLinePerson(picked)
		origin.value = picked.is_mine ? "mine" : "remembered"
	}

	/** Load the till's sales persons (and whether the site tells services from products), then choose who serves. */
	async function load(posProfile) {
		if (!posProfile || !isOn()) return
		forProfile.value = posProfile
		loading.value = true
		try {
			const [list] = await Promise.all([
				loadSalesPersonsForProfile(posProfile),
				loadItemKinds(posProfile, []),
			])
			persons.value = list || []
			settle()
		} finally {
			loading.value = false
		}
	}

	/** The cashier picks a person from the list (a row of get_sales_persons). */
	function choose(row) {
		person.value = asLinePerson(row)
		origin.value = "chosen"
		// A shared till remembers its choice; an account that is a person's own starts each sale with that person
		if (person.value && !hasOwnPerson(persons.value))
			rememberWhoServes(forProfile.value, row.name)
	}

	function clear() {
		person.value = null
		origin.value = ""
		if (!hasOwnPerson(persons.value)) rememberWhoServes(forProfile.value, null)
	}

	/** A sale is over: the next one starts with the account's own person (or the shared till's last choice) again. */
	function newSale() {
		person.value = null
		origin.value = ""
		settle()
	}

	/**
	 * What a line about to be added is given: the person who serves, unless the line already has one, nobody serves, or the site says the
	 * item is a product and products are not followed (a product then asks for nobody).
	 * @returns {{ sales_person: string, sales_person_name: string, sales_person_posed: boolean }|null}
	 */
	function personForNewLine(item) {
		//// A line that keeps its person (an appointment's: the booked work was somebody else's, even when nobody is named) is given none
		if (
			!isOn() ||
			!person.value ||
			item?.sales_person ||
			item?.keeps_its_person
		)
			return null
		if (!productsTracked() && kindOf(item?.item_code) === PRODUCT) return null
		return { ...person.value, sales_person_posed: true }
	}

	/** Sign-out or a change of till: nothing of the previous cashier stays. */
	function reset() {
		forProfile.value = null
		persons.value = []
		person.value = null
		origin.value = ""
		loading.value = false
	}

	return {
		forProfile,
		persons,
		person,
		origin,
		loading,
		load,
		choose,
		clear,
		newSale,
		personForNewLine,
		reset,
	}
})
