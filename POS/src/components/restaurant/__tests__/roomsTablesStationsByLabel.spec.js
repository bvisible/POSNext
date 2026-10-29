/**
 * //// Neoffice — added file (no upstream equivalent). A room, a table and a preparation station are named by a
 * //// hash from now on (NeoRestau lot 1, task 2), so every screen that shows one shows its LABEL: the kitchen
 * //// screen, the runner's cards and the reservation desk, while a room is still chosen by its name.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	FeatherIcon: { template: "<i />" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ runnerEnabled: false, ofTheRestaurant: () => ({}) }),
}))

const { default: KDSOrderCard } = await import("../../invoices/KDSOrderCard.vue")
const { default: RunnerOrderCard } = await import("../../invoices/RunnerOrderCard.vue")
const { default: ReservationList } = await import("../ReservationList.vue")
const { default: ReservationForm } = await import("../ReservationForm.vue")

// The templates call __() from the template context
const show = (component, props) =>
	mount(component, { props, global: { mocks: { __: globalThis.__ } } })

const TABLE_NAME = "k3x9q2m7ab"
const STATION_NAME = "h4sh0f4stn"

describe("the kitchen screen shows labels", () => {
	const order = {
		name: "ACC-SINV-2026-00001",
		restaurant_table: TABLE_NAME,
		table_display_name: "T1",
		kds_status: "Pending",
		creation: "2026-10-29 12:00:00",
		modified: "2026-10-29 12:00:00",
		items: [
			{
				name: "row-1",
				item_code: "SOUP",
				item_name: "Soup",
				qty: 1,
				kds_status: "Pending",
				preparation_station: STATION_NAME,
				station_name: "Cuisine",
			},
		],
	}
	const stations = [{ name: STATION_NAME, station_name: "Cuisine", color: "#d68a59" }]

	it("names the table of an order by its label", () => {
		const text = show(KDSOrderCard, { order, stations }).text()

		expect(text).toContain("T1")
		expect(text).not.toContain(TABLE_NAME)
	})

	it("names the station of a line by its label", () => {
		const text = show(KDSOrderCard, { order, stations, showStationBadge: true }).text()

		expect(text).toContain("Cuisine")
		expect(text).not.toContain(STATION_NAME)
	})

	it("still names a table and a station of an older record by the only name they have", () => {
		const legacy = {
			...order,
			restaurant_table: "Table 5",
			table_display_name: undefined,
			items: [{ ...order.items[0], preparation_station: "Bar", station_name: undefined }],
		}

		const text = show(KDSOrderCard, { order: legacy, stations }).text()

		expect(text).toContain("Table 5")
		expect(text).toContain("Bar")
	})
})

describe("the runner's cards show labels", () => {
	it("names the station of a ready line by its label", () => {
		const card = {
			key: "ACC-SINV-2026-00001",
			title: "T1",
			subtitle: "#ACC-SINV-2026-00001",
			invoiceName: "ACC-SINV-2026-00001",
			modified: "2026-10-29 12:00:00",
			items: [
				{
					name: "row-1",
					item_name: "Soup",
					qty: 1,
					preparation_station: STATION_NAME,
					station_name: "Cuisine",
					station_color: "#d68a59",
				},
			],
		}

		const text = show(RunnerOrderCard, { card, viewMode: "table" }).text()

		expect(text).toContain("T1")
		expect(text).toContain("Cuisine")
		expect(text).not.toContain(STATION_NAME)
	})
})

describe("the reservation desk shows labels", () => {
	const reservations = [
		{
			name: "RES-2026-00001",
			status: "Confirmed",
			guest_name: "Jules",
			no_of_guests: 2,
			reservation_time: "20:00:00",
			channel: "Phone",
			tables: [{ restaurant_table: TABLE_NAME, table_name: "T1", area: "r0o1m2h3a4", area_name: "Salle 1" }],
		},
	]

	it("offers a room by its label and chooses it by its name", () => {
		const wrapper = show(ReservationList, {
			reservations,
			areas: [{ name: "r0o1m2h3a4", label: "Salle 1" }],
		})
		const option = wrapper.findAll("option").find((o) => o.text() === "Salle 1")

		expect(option.element.value).toBe("r0o1m2h3a4")
		expect(wrapper.text()).not.toContain("r0o1m2h3a4")
	})

	it("lists the reservations of the room chosen by its name", () => {
		const other = { ...reservations[0], name: "RES-2026-00002", tables: [{ restaurant_table: "x", table_name: "T9", area: "another-room", area_name: "Bar" }] }
		const wrapper = show(ReservationList, {
			reservations: [...reservations, other],
			selectedArea: "r0o1m2h3a4",
			areas: [],
		})

		expect(wrapper.text()).toContain("T1")
		expect(wrapper.text()).not.toContain("T9")
	})

	it("names the tables of a reservation by their labels", () => {
		const text = show(ReservationList, { reservations, areas: [] }).text()

		expect(text).toContain("T1")
		expect(text).not.toContain(TABLE_NAME)
	})
})

describe("the reservation form shows labels", () => {
	const tables = [
		{ name: "t0h1a2s3h4", table_name: "T1", area: "r0o1m2h3a4", area_name: "Salle 1", capacity: 4 },
		{ name: "t5h6a7s8h9", table_name: "B1", area: "r5o6m7h8a9", area_name: "Bar", capacity: 2 },
	]

	it("offers the rooms of the tables by label and each table with the label of its room", async () => {
		const wrapper = show(ReservationForm, { tables })
		await flushPromises()
		const text = wrapper.text()

		expect(wrapper.findAll(".area-tab").map((tab) => tab.text())).toEqual(
			expect.arrayContaining([expect.stringContaining("Salle 1"), expect.stringContaining("Bar")]),
		)
		expect(wrapper.findAll(".table-chip-area").map((chip) => chip.text())).toEqual(["Salle 1", "Bar"])
		expect(text).not.toContain("r0o1m2h3a4")
		wrapper.unmount()
	})

	it("keeps naming a room of an older record by the only name it has", async () => {
		const wrapper = show(ReservationForm, {
			tables: [{ name: "Table 1", table_name: "Table 1", area: "Main Hall", capacity: 4 }],
		})
		await flushPromises()

		expect(wrapper.find(".table-chip-area").text()).toBe("Main Hall")
		wrapper.unmount()
	})
})
