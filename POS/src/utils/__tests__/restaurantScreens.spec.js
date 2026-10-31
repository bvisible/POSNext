/**
 * //// Neoffice — added file (no upstream equivalent). The screens of the restaurant and the way from one to another (NeoRestau lot 1, task 38a-2,
 * //// ruling 132): which screens a session may go to, and where each one is with the filters the user has on.
 */
import { describe, expect, it } from "vitest"
import {
	SCREEN_PLAN,
	SCREEN_PREPARATION,
	SCREEN_RUNNER,
	screenLocation,
	screensToChooseFrom,
} from "@/utils/restaurantScreens"

describe("the screens a session may go to", () => {
	it("are the three for a desk user: what is cooked, what is carried, the dining room", () => {
		expect(
			screensToChooseFrom({ current: SCREEN_PREPARATION, deskSession: true }),
		).toEqual([SCREEN_PREPARATION, SCREEN_RUNNER, SCREEN_PLAN])
		expect(
			screensToChooseFrom({ current: SCREEN_RUNNER, deskSession: true }),
		).toEqual([SCREEN_PREPARATION, SCREEN_RUNNER, SCREEN_PLAN])
	})

	it("are the screen's own alone for a tablet signed in with its own account", () => {
		expect(
			screensToChooseFrom({ current: SCREEN_PREPARATION, deskSession: false }),
		).toEqual([SCREEN_PREPARATION])
		expect(
			screensToChooseFrom({ current: SCREEN_RUNNER, deskSession: false }),
		).toEqual([SCREEN_RUNNER])
	})

	it("leave the runner out when the restaurant has switched it off, unless that is the screen the user is on", () => {
		expect(
			screensToChooseFrom({
				current: SCREEN_PREPARATION,
				deskSession: true,
				runnerEnabled: false,
			}),
		).toEqual([SCREEN_PREPARATION, SCREEN_PLAN])
		expect(
			screensToChooseFrom({
				current: SCREEN_RUNNER,
				deskSession: true,
				runnerEnabled: false,
			}),
		).toContain(SCREEN_RUNNER)
	})
})

describe("where a screen is", () => {
	it("carries the restaurant, the station and the room that are on, in the address", () => {
		expect(
			screenLocation(SCREEN_RUNNER, {
				restaurant: "The Bistro",
				station: "bar",
				room: "r1",
			}),
		).toEqual({
			path: "/runner",
			query: { restaurant: "The Bistro", station: "bar", room: "r1" },
		})
		expect(screenLocation(SCREEN_PREPARATION, { station: "kit" })).toEqual({
			path: "/kds",
			query: { station: "kit" },
		})
	})

	it("writes no filter that is not set: all stations stay all stations", () => {
		expect(
			screenLocation(SCREEN_RUNNER, {
				restaurant: null,
				station: "",
				room: undefined,
			}),
		).toEqual({ path: "/runner", query: {} })
		expect(screenLocation(SCREEN_RUNNER)).toEqual({
			path: "/runner",
			query: {},
		})
	})

	it("sends the floor plan to the till, which has none of these filters", () => {
		expect(screenLocation(SCREEN_PLAN, { station: "bar", room: "r1" })).toEqual(
			{
				path: "/",
			},
		)
	})
})
