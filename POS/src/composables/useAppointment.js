//// Neoffice — added file (no upstream equivalent). The till works the appointments of a salon (NeoSalon, step 2, lot G4; product owner, 10.11.2026):
//// the way it takes a phone's cart over by its code (useShopCart) or a table's order (useOpenTable), plus the gestures of the salon mode: move, cancel,
//// start / pause / finish the time, book. Everything goes through pos_next.api.appointments, which composes the day from the site's lanes.
//// The reservation prepares a draft invoice for the appointment; the till loads its lines into its own cart, each with the person the reservation gave
//// it, PRICED AGAIN at the day's prices (its offers apply, the salon's decision of 10.11), and its payment submits THAT draft (useInvoice.shopCartInvoice),
//// never a second invoice. Offline the cart is made from the agenda the till kept, the sale carries the number of the appointment, and the site
//// replaces the draft when it is synchronised.
import { customerOfTheOrder } from "@/composables/useOpenTable"
import { useToast } from "@/composables/useToast"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSShiftStore } from "@/stores/posShift"
import { call } from "@/utils/apiWrapper"
import { parseError } from "@/utils/errorHandler"
import { modifiersPriceAdjustment } from "@/utils/modifiersPrice"
import { getCachedItem } from "@/utils/offline"
import { offlineState } from "@/utils/offline/offlineState"

const API = "pos_next.api.appointments"

/** What the site answered, whether the wrapper hands it as `{ message }` or as it is. */
const answerOf = (answer) => answer?.message ?? answer

/**
 * One line of a draft (or one step of an appointment, offline) as the cart takes it, at the day's price.
 * The person is the line's own and a line with none is NOT given the person who serves (the work was somebody else's): the payment asks.
 *
 * @param {object} line - `{ item_code, item_name, qty, uom, stock_uom, conversion_factor, image, sales_person, sales_person_name, posa_item_modifiers, price_list_rate }`
 * @param {number|null} dayRate - the unit price of the day, without the options (the till's price list); null: the line's own price
 * @returns {{ item: object, qty: number }}
 */
export function cartLineOfAppointment(line, dayRate = null) {
	const adjustment = modifiersPriceAdjustment(line.posa_item_modifiers)
	const base = Number(dayRate ?? line.price_list_rate ?? line.rate) || 0
	const rate = Math.round((base + adjustment) * 1e6) / 1e6
	return {
		qty: Number(line.qty) || 1,
		item: {
			item_code: line.item_code,
			item_name: line.item_name || line.item_code,
			rate,
			price_list_rate: rate,
			uom: line.uom,
			stock_uom: line.stock_uom || line.uom,
			conversion_factor: line.conversion_factor || 1,
			image: line.image,
			posa_item_modifiers: line.posa_item_modifiers || null,
			_modifiers_applied: adjustment,
			sales_person: line.sales_person || null,
			sales_person_name: line.sales_person_name || null,
			// Whatever the line holds, the person who serves is not given to it
			keeps_its_person: true,
		},
	}
}

export function useAppointment() {
	const { showSuccess, showWarning, showError } = useToast()

	const profile = () => usePOSShiftStore().profileName

	/** Ask the site, and say what it refuses in its own words; null when it did. */
	async function ask(method, args, { quiet = false } = {}) {
		try {
			return answerOf(
				await call(`${API}.${method}`, { pos_profile: profile(), ...args }),
			)
		} catch (error) {
			if (!quiet) showError(parseError(error).message)
			return null
		}
	}

	/**
	 * The agenda of a day of the till. Nothing is asked without the network (the agenda is the site's).
	 * @returns {Promise<object|null>} `{ available, date, visibility, capabilities, mine, people, appointments }`, or null when it could not be read
	 */
	async function loadDay(date = null) {
		if (offlineState.isOffline) return null
		return ask("get_appointments", { date }, { quiet: true })
	}

	/** The price of the day of an item at this till (its price list, for this customer), or null when it cannot be asked. */
	async function dayRateOf(line, customer) {
		if (!offlineState.isOffline) {
			try {
				const details = answerOf(
					await call("pos_next.api.items.get_item_details", {
						item_code: line.item_code,
						pos_profile: profile(),
						customer: customer || undefined,
						qty: Number(line.qty) || 1,
						uom: line.uom,
					}),
				)
				const rate = Number(details?.price_list_rate ?? details?.rate)
				if (Number.isFinite(rate) && rate >= 0) return rate
			} catch {
				// The till's own cache then, and the draft's price in the last resort (a line is never lost for a price)
			}
		}
		const cached = await getCachedItem(line.item_code).catch(() => null)
		const rate = Number(cached?.price_list_rate ?? cached?.rate)
		return Number.isFinite(rate) && rate >= 0 ? rate : null
	}

	/** Put lines in the cart at the day's prices, each with its person. */
	async function fillTheCart(lines, customer) {
		const cartStore = usePOSCartStore()
		await cartStore.clearCart()
		for (const line of lines) {
			const { item, qty } = cartLineOfAppointment(
				line,
				await dayRateOf(line, customer),
			)
			cartStore.addItem(item, qty)
		}
	}

	const cartIsEmpty = () => {
		if (!usePOSCartStore().invoiceItems.length) return true
		showWarning(__("Empty the cart before taking over an appointment."))
		return false
	}

	/**
	 * Take an appointment over: its draft is read, the cart is emptied and takes its lines at the day's prices.
	 * Offline (or with no draft to read) the cart is made from the agenda row: the sale then carries the appointment and the site replaces the draft.
	 * @param {object} appointment - a row of the agenda
	 * @returns {Promise<boolean>} whether the appointment is in the cart; false when it was refused (the message is said) or the cart is not empty
	 */
	async function takeAppointment(appointment) {
		if (!cartIsEmpty()) return false
		const cartStore = usePOSCartStore()
		if (offlineState.isOffline) return takeOffline(appointment)
		const draft = await ask("take_appointment", {
			booking: appointment.booking,
		})
		if (!draft?.invoice) return false
		await fillTheCart(
			draft.items.filter((line) => !line.is_free_item),
			draft.customer,
		)
		// The sale submits the appointment's draft (useInvoice.shopCartInvoice): never the till's local drafts
		cartStore.$patch({
			shopCartInvoice: draft.invoice,
			// What the customer already paid is an amount acquired: the cart shows it and the payment takes it off, like a phone's paid cart
			guestPaidAmount: Number(draft.paid_amount) || 0,
			appointment: {
				booking: draft.booking,
				invoice: draft.invoice,
				customer_name: draft.customer_name || appointment.customer_name || null,
				starts_at: draft.starts_at || appointment.starts_at || null,
				ends_at: draft.ends_at || appointment.ends_at || null,
				paid_amount: Number(draft.paid_amount) || 0,
				payments: draft.payments || [],
			},
		})
		if (draft.customer) await cartStore.setCustomer(customerOfTheOrder(draft))
		showSuccess(
			__("Appointment of {0} taken over.", [
				draft.customer_name || draft.booking,
			]),
		)
		return true
	}

	/** The cart of an appointment made from what the till kept of the agenda, for a till with no network: there is no draft to pay, there is a sale to make. */
	async function takeOffline(appointment) {
		const cartStore = usePOSCartStore()
		const steps = (appointment.steps || []).filter((step) => step?.item_code)
		if (!steps.length) {
			showWarning(__("This appointment cannot be taken without the network."))
			return false
		}
		await fillTheCart(
			steps.map((step) => ({
				item_code: step.item_code,
				item_name: step.label,
				qty: step.qty || 1,
				posa_item_modifiers: step.options,
				sales_person: step.sales_person,
				sales_person_name: step.sales_person_name,
			})),
			appointment.customer,
		)
		cartStore.$patch({
			shopCartInvoice: null,
			appointment: {
				booking: appointment.booking,
				invoice: null,
				customer_name: appointment.customer_name || null,
				starts_at: appointment.starts_at || null,
				ends_at: appointment.ends_at || null,
				paid_amount: 0,
				payments: [],
			},
		})
		if (appointment.customer) {
			await cartStore.setCustomer({
				name: appointment.customer,
				customer_name: appointment.customer_name || appointment.customer,
			})
		}
		showSuccess(
			__("Appointment of {0} taken over.", [
				appointment.customer_name || appointment.booking,
			]),
		)
		return true
	}

	/** Whether an appointment could go to this hour (and to this person): `{ ok, why }`, or null when it could not be asked. */
	function checkMove(booking, startsAt, salesPerson = null) {
		return ask(
			"check_appointment_move",
			{ booking, starts_at: startsAt, sales_person: salesPerson },
			{ quiet: true },
		)
	}

	/** Move an appointment, warning the customer when `notify`. @returns {Promise<object|null>} `{ booking, from, to, provider_changed, notified }` */
	async function move(
		booking,
		startsAt,
		{ salesPerson = null, notify = true } = {},
	) {
		const done = await ask("move_appointment", {
			booking,
			starts_at: startsAt,
			sales_person: salesPerson,
			notify: notify ? 1 : 0,
		})
		if (done) showSuccess(__("The appointment has been moved."))
		return done
	}

	/** Cancel an appointment, or mark it absent (`reason`: `cancelled` | `no_show`). @returns {Promise<object|null>} `{ booking, state, refunded, to_refund }` */
	async function cancel(booking, { reason = "cancelled", notify = true } = {}) {
		const done = await ask("cancel_appointment", {
			booking,
			reason,
			notify: notify ? 1 : 0,
		})
		if (done)
			showSuccess(
				reason === "no_show"
					? __("The appointment is marked absent.")
					: __("The appointment has been cancelled."),
			)
		return done
	}

	/**
	 * A gesture of the time (`start`, `pause`, `finish`): the server reads its clock, the till sends no hour. Needs the network.
	 * @returns {Promise<object|null>} `{ booking, clock }`
	 */
	async function clock(booking, action, salesPerson = null) {
		if (offlineState.isOffline) {
			showWarning(__("The time of an appointment needs the network."))
			return null
		}
		return ask("clock_appointment", {
			booking,
			action,
			sales_person: salesPerson,
		})
	}

	/** What can be booked at this till: `[{ item_code, label, price, duration_minutes, options, people }]`. */
	async function services() {
		return (await ask("get_services", {}, { quiet: true })) || []
	}

	/** The free slots of a day for a chain of services: `[{ starts_at, sales_person, sales_person_name }]`. */
	async function slots(date, items, salesPerson = null) {
		return (
			(await ask("get_slots", {
				date,
				items: JSON.stringify(items),
				sales_person: salesPerson,
			})) || []
		)
	}

	/** Book a new appointment. @returns {Promise<object|null>} `{ booking, starts_at }` */
	async function book(
		customer,
		items,
		startsAt,
		{ salesPerson = null, notify = true } = {},
	) {
		const done = await ask("book_appointment", {
			customer,
			items: JSON.stringify(items),
			starts_at: startsAt,
			sales_person: salesPerson,
			notify: notify ? 1 : 0,
		})
		if (done) showSuccess(__("The appointment is booked."))
		return done
	}

	return {
		loadDay,
		takeAppointment,
		checkMove,
		move,
		cancel,
		clock,
		services,
		slots,
		book,
	}
}
