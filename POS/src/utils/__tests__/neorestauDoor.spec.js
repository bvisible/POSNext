//// Neoffice — added file (no upstream equivalent). The door a visitor came through, read from the query of the route
//// (NeoRestau lot 1, task 5): `?mode=restaurant` is the restaurant door NeoRestau opens, anything else is the usual one.
import { describe, expect, it } from "vitest"
import { RESTAURANT_DOOR, doorOf } from "../neorestau"

const route = (query) => ({ query })

describe("the door a visitor came through", () => {
	it("is the restaurant door for ?mode=restaurant", () => {
		expect(RESTAURANT_DOOR).toBe("restaurant")
		expect(doorOf(route({ mode: "restaurant" }))).toBe("restaurant")
	})

	it("is the usual door when the route names no mode", () => {
		expect(doorOf(route({}))).toBeNull()
		expect(doorOf(route({ table: "T4" }))).toBeNull()
	})

	it("is the usual door for any other mode", () => {
		for (const mode of [
			"",
			"kitchen",
			"Restaurant",
			" restaurant",
			"restaurant ",
		]) {
			expect(doorOf(route({ mode }))).toBeNull()
		}
	})

	it("is the usual door when the mode is given twice or is empty", () => {
		// vue-router reads ?mode=a&mode=b as a list, and ?mode as null
		expect(doorOf(route({ mode: ["restaurant", "restaurant"] }))).toBeNull()
		expect(doorOf(route({ mode: [] }))).toBeNull()
		expect(doorOf(route({ mode: null }))).toBeNull()
	})

	it("is the usual door when there is no route to read", () => {
		expect(doorOf(undefined)).toBeNull()
		expect(doorOf(null)).toBeNull()
		expect(doorOf({})).toBeNull()
	})
})
