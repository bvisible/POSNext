/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen ticket and the runner card are readable in DARK mode (NeoRestau
 * //// lot 1, task 46). On a tablet in dark mode the main buttons were a blank white square (the Button's own fill turns to bright
 * //// paper in dark and the cards forced white text on it), the "In preparation" badge was a patch of one colour (the till's dark
 * //// remap lightens the text and leaves the background as light), the late timer's red was 3.1:1 and its pulse took it to 1.6:1,
 * //// and so on. A browser measures the contrast (task 46's harness); these specs pin the classes that carry it, and that the light
 * //// mode keeps every class it had: a dark variant is always ADDED beside the light one, never in its place.
 * //// jsdom has no stylesheet, so a class is read as a class: `utils/__tests__/kitchenDarkModeStylesheet.spec.js` compiles them.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))
const restaurantStore = vi.hoisted(() => ({ runnerEnabled: false }))

vi.hoisted(() => {
	// The app's `__`: indexed placeholders
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

// The REAL Button, reached by its path (the package's `exports` map does not offer the file): the classes it adds are part of the bug
vi.mock("frappe-ui", async () => {
	const { default: Button } = await import(
		"../../../../node_modules/frappe-ui/src/components/Button/Button.vue"
	)
	return { Button }
})
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))

const { default: KDSOrderCard } = await import("../KDSOrderCard.vue")
const { default: RunnerOrderCard } = await import("../RunnerOrderCard.vue")

// 12:30 on a Friday: a ticket is as late as the minutes between its `modified` and this
const NOW = new Date(2026, 9, 30, 12, 30, 0)
const pad = (n) => String(n).padStart(2, "0")
const minutesAgo = (minutes) => {
	const d = new Date(NOW.getTime() - minutes * 60000)
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** A ticket whose dishes are at the statuses given, `minutes` late. */
function ticket(statuses, { minutes = 1, extra = {} } = {}) {
	return {
		name: "SINV-DARK",
		restaurant_table: "T1",
		table_display_name: "T1",
		kds_status: "Preparing",
		creation: minutesAgo(minutes + 20),
		modified: minutesAgo(minutes),
		items: statuses.map((status, index) => ({
			item_code: `ITEM-${index}`,
			item_name: `Dish ${index + 1}`,
			qty: 1,
			kds_status: status,
			kds_batch: 1,
			preparation_station: index % 2 ? "bar" : "kit",
		})),
		...extra,
	}
}

const STATIONS = [
	{ name: "kit", station_name: "Kitchen", color: "#D68A59" },
	{ name: "bar", station_name: "Bar", color: "#2C4FA8" },
]

let opened = []
function show(order, props = {}) {
	const wrapper = mount(KDSOrderCard, {
		props: { order, stations: STATIONS, ...props },
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
const classesOf = (wrapper) => wrapper.classes()
const timerOf = (wrapper) => wrapper.get('[data-test="ticket-timer"]')
const pillOf = (wrapper) => wrapper.get('[data-test="ticket-status"]')
const mainButton = (wrapper) =>
	wrapper.get('[data-test="ticket-actions"] button')

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(NOW)
	opened = []
	call.mockClear()
	restaurantStore.runnerEnabled = false
	window.innerWidth = 1280
	window.innerHeight = 800
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("the kitchen ticket's main buttons in dark mode (task 46)", () => {
	it("Start gives its text colour back to the Button in dark, and keeps the white it had in light", () => {
		const names = classesOf(mainButton(show(ticket(["Pending", "Pending"]))))

		expect(names).toContain("text-white")
		expect(names).toContain("dark:enabled:text-ink-white")
	})

	it("Ready (a ticket being prepared) does the same", () => {
		const button = mainButton(show(ticket(["Preparing", "Pending"])))

		expect(button.text()).toBe("Mark ready")
		expect(classesOf(button)).toContain("text-white")
		expect(classesOf(button)).toContain("dark:enabled:text-ink-white")
	})

	it("is only for a button that can be pressed: a loading button is greyed and keeps the white, which reads on the grey", () => {
		// `enabled:` is the whole point: the Button greys itself while it loads (`:disabled`), and a dark text there would vanish
		const names = classesOf(mainButton(show(ticket(["Pending"]))))

		// (the Button's own `text-ink-white` is its light-mode pair of the paper fill and is not what is asked about)
		expect(
			names.filter(
				(name) =>
					name.startsWith("dark:") &&
					name.includes("ink-white") &&
					!name.includes("enabled:"),
			),
		).toEqual([])
	})

	it("leaves the Delivered button as it was: an outline that already reads in dark", () => {
		const wrapper = show(
			ticket(["Ready", "Ready"], { extra: { kds_status: "Ready" } }),
		)

		const button = mainButton(wrapper)
		expect(button.text()).toBe("Deliver")
		expect(classesOf(button)).toContain("dark:text-gray-300")
		expect(
			classesOf(button).filter((name) => name.startsWith("dark:enabled:")),
		).toEqual([])
	})

	it("puts the warning colour of the dark ramp on the confirmation panel's text, on top of the amber it had", async () => {
		restaurantStore.runnerEnabled = true
		const wrapper = show(
			ticket(["Ready", "Ready"], { extra: { kds_status: "Ready" } }),
		)

		await mainButton(wrapper).trigger("click")

		const text = wrapper.get(".bg-amber-50 p")
		expect(text.classes()).toContain("text-amber-800")
		expect(text.classes()).toContain("dark:text-ds-warning")
	})
})

describe("the kitchen ticket's badges in dark mode (task 46)", () => {
	it("tints the 'In preparation' header badge in dark: it was one patch of clay with its text lost in it", () => {
		const names = classesOf(pillOf(show(ticket(["Preparing", "Pending"]))))

		expect(names).toContain("bg-blue-200")
		expect(names).toContain("text-blue-800")
		expect(names).toContain("dark:bg-blue-400/25")
	})

	it("leaves the badges that already read in dark as they were", () => {
		expect(classesOf(pillOf(show(ticket(["Pending"]))))).toEqual(
			expect.arrayContaining(["bg-yellow-200", "text-yellow-800"]),
		)
		const ready = classesOf(
			pillOf(
				show(ticket(["Ready", "Ready"], { extra: { kds_status: "Ready" } })),
			),
		)
		expect(ready).toEqual(
			expect.arrayContaining(["bg-green-200", "text-green-800"]),
		)
		expect(ready.filter((name) => name.startsWith("dark:"))).toEqual([])
	})

	it("gives a dish's 'Ready' badge pale text in dark: the till's remap tints its background dark green and the text stayed dark green", () => {
		const wrapper = show(ticket(["Ready", "Preparing", "Pending", "Delivered"]))

		const pills = wrapper
			.findAll('[data-test="ticket-line"] span.rounded-full')
			.filter((p) => /^[A-Z]/.test(p.text()))
		const byLabel = Object.fromEntries(
			pills.map((p) => [p.text(), classesOf(p)]),
		)
		expect(byLabel.Ready).toEqual(
			expect.arrayContaining([
				"bg-green-100",
				"text-green-800",
				"dark:text-ds-success-soft",
			]),
		)
		// The others read in dark already, and stay what they were
		expect(byLabel.Preparing).toEqual(
			expect.arrayContaining(["bg-blue-100", "text-blue-800"]),
		)
		expect(byLabel.Pending).toEqual(
			expect.arrayContaining(["bg-yellow-100", "text-yellow-800"]),
		)
		expect(byLabel.Delivered).toEqual(
			expect.arrayContaining(["bg-gray-100", "text-gray-800"]),
		)
		for (const label of ["Preparing", "Pending", "Delivered"])
			expect(
				byLabel[label].filter((name) => name.startsWith("dark:")),
				label,
			).toEqual([])
	})

	it("writes a dish's 'Ready' choice in the dark ramp's green in the status menu", async () => {
		const wrapper = show(ticket(["Pending", "Pending"]))

		await wrapper.findAll('[data-test="ticket-line"]')[0].trigger("click")

		const ready = wrapper
			.findAll('[data-test="ticket-line-menu"] button')
			.find((b) => b.text() === "Mark ready")
		expect(classesOf(ready)).toEqual(
			expect.arrayContaining(["text-green-700", "dark:text-ds-success"]),
		)
	})

	it("dims the preview of dishes not sent yet less in dark, and as much as before in light", () => {
		const order = ticket(["Pending"])
		order.items.push({
			item_code: "ITEM-W",
			item_name: "Dessert",
			qty: 1,
			kds_status: "Waiting",
			kds_batch: 1,
		})
		const wrapper = show(order)

		const preview = wrapper
			.findAll("[data-ticket-line]")
			.find((line) => line.text().includes("Dessert"))
		expect(classesOf(preview)).toEqual(
			expect.arrayContaining(["opacity-50", "dark:opacity-75"]),
		)
	})
})

describe("the kitchen ticket's timers in dark mode (task 46)", () => {
	it("a late ticket (more than 15 minutes): a lighter red in dark and a pulse that does not fade the text, the light red and pulse kept for light", () => {
		const names = classesOf(timerOf(show(ticket(["Pending"], { minutes: 18 }))))

		expect(names).toEqual(
			expect.arrayContaining(["text-red-600", "animate-pulse"]),
		)
		expect(names).toContain("dark:text-ds-danger")
		expect(names).toContain("dark:animate-late-pulse")
	})

	it("a slow ticket (more than 10 minutes): the lighter orange in dark, no pulse", () => {
		const names = classesOf(timerOf(show(ticket(["Pending"], { minutes: 12 }))))

		expect(names).toContain("text-orange-500")
		expect(names).toContain("dark:text-ds-warning")
		expect(names.some((name) => name.includes("pulse"))).toBe(false)
	})

	it("a ticket within its time, and a ticket that is ready (green), are left as they were", () => {
		const fresh = classesOf(timerOf(show(ticket(["Pending"], { minutes: 2 }))))
		expect(fresh).toEqual(
			expect.arrayContaining(["text-gray-800", "dark:text-gray-200"]),
		)
		expect(
			fresh.filter(
				(name) => name.startsWith("dark:") && !name.includes("gray-200"),
			),
		).toEqual([])

		const ready = classesOf(
			timerOf(
				show(
					ticket(["Ready", "Ready"], {
						minutes: 20,
						extra: { kds_status: "Ready" },
					}),
				),
			),
		)
		expect(ready).toContain("text-green-600")
		expect(ready.filter((name) => name.startsWith("dark:"))).toEqual([])
	})

	it("the small second timer (the table's total time) is grey, never red or orange, so it has nothing to change", () => {
		const wrapper = show(ticket(["Pending"], { minutes: 40 }))

		const total = wrapper.get('[title="Total time"]')
		expect(total.classes()).toContain("text-gray-400")
		expect(total.classes().some((name) => /red|orange|pulse/.test(name))).toBe(
			false,
		)
	})
})

describe("a station's pill in dark mode (task 46)", () => {
	it("writes white on a dark station and ink on a light one, in dark only: the variable and the class are there, `text-white` stays for light", () => {
		const wrapper = show(ticket(["Pending", "Pending"]))

		// Dish 1 is at the kitchen (clay), dish 2 at the bar (blue)
		const pills = wrapper
			.findAll("span.rounded-full")
			.filter((p) => p.element.style.getPropertyValue("--station-ink"))
		expect(pills).toHaveLength(2)
		const [clay, blue] = pills
		expect(clay.element.style.getPropertyValue("--station-ink")).toBe("#141414")
		expect(blue.element.style.getPropertyValue("--station-ink")).toBe("#FFFFFF")
		for (const element of [clay, blue]) {
			expect(classesOf(element)).toContain("text-white")
			expect(classesOf(element)).toContain(
				"dark:text-[color:var(--station-ink)]",
			)
		}
		// The light mode draws what it drew: the station's colour as the background
		expect(clay.element.style.backgroundColor).toBe("rgb(214, 138, 89)")
		expect(blue.element.style.backgroundColor).toBe("rgb(44, 79, 168)")
	})
})

describe("the runner card in dark mode (task 46)", () => {
	const card = (items, { modified = minutesAgo(1) } = {}) => ({
		key: "SINV-DARK",
		title: "T1",
		subtitle: "#SINV-DARK",
		invoiceName: "SINV-DARK",
		creation: modified,
		modified,
		items,
		tableGroups: [],
	})
	const dish = (extra = {}) => ({
		name: "line-1",
		item_name: "Soup",
		qty: 1,
		preparation_station: "bar",
		station_name: "Bar",
		station_color: "#2C4FA8",
		...extra,
	})
	function runner(items, props = {}) {
		const wrapper = mount(RunnerOrderCard, {
			props: { card: card(items, props.card), viewMode: "table" },
			attachTo: document.body,
			global: { mocks: { __: globalThis.__ } },
		})
		opened.push(wrapper)
		return wrapper
	}

	it("Mark Delivered gives its text colour back to the Button in dark, and keeps the white it had in light", () => {
		const button = runner([dish()]).get("button")

		expect(button.classes()).toEqual(
			expect.arrayContaining(["text-white", "dark:enabled:text-ink-white"]),
		)
	})

	it("its timer is the kitchen's: the lighter red with a pulse that does not fade (more than 10 minutes), the lighter orange (more than 5), the green kept", () => {
		const late = runner([dish()], { card: { modified: minutesAgo(13) } })
			.get('[data-test="ticket-timer"]')
			.classes()
		expect(late).toEqual(
			expect.arrayContaining([
				"text-red-600",
				"animate-pulse",
				"dark:text-ds-danger",
				"dark:animate-late-pulse",
			]),
		)

		const slow = runner([dish()], { card: { modified: minutesAgo(7) } })
			.get('[data-test="ticket-timer"]')
			.classes()
		expect(slow).toEqual(
			expect.arrayContaining(["text-orange-500", "dark:text-ds-warning"]),
		)

		const fresh = runner([dish()], { card: { modified: minutesAgo(2) } })
			.get('[data-test="ticket-timer"]')
			.classes()
		expect(fresh).toContain("text-green-600")
		expect(fresh.filter((name) => name.startsWith("dark:"))).toEqual([])
	})

	it("the order number under the title is lighter in dark: the till's remap of `.text-gray-500` is `!important`, a doubled selector outranks it", () => {
		const number = runner([dish()]).get('[data-test="ticket-number"]')

		expect(number.classes()).toContain("text-gray-500")
		expect(number.classes()).toContain("dark:[&&]:!text-gray-300")
	})

	it("a station's pill in table mode: its colour moves from the inline style to a variable the class reads, and dark takes the same colour lightened", () => {
		const wrapper = runner([dish()])

		const pill = wrapper.findAll("li span.rounded-full")[0]
		const style = pill.element.style
		expect(pill.classes()).toContain("text-[color:var(--station-color)]")
		expect(pill.classes()).toContain("dark:text-[color:var(--station-on-dark)]")
		expect(style.getPropertyValue("--station-color")).toBe("#2C4FA8")
		// Lightened: not the dark blue itself, and written as a colour
		expect(style.getPropertyValue("--station-on-dark")).toMatch(
			/^#[0-9A-F]{6}$/,
		)
		expect(style.getPropertyValue("--station-on-dark")).not.toBe("#2C4FA8")
		// The inline style no longer holds a colour of its own (a class cannot beat it), the tint and the border are as they were
		expect(style.color).toBe("")
		expect(style.backgroundColor).toBe("rgba(44, 79, 168, 0.125)")
		expect(style.border).toContain("1px solid")
	})
})
