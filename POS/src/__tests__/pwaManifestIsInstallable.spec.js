/**
 * //// Neoffice — added file (no upstream equivalent). The till can be installed as an app (NeoResto lot 1, Daniel, 01.11: the shortcut he made from Chrome opened a browser tab, « pas en web app »). Chrome
 * //// mints a real app only for a manifest it finds installable: PNG icons of 192 and 512 px (SVG icons alone are not taken on Android), a start URL inside the scope, a standalone display and a stable id.
 * //// The manifest is written in vite.config.js and built from it, so it is read from there, and the icon files it names are looked for in public/.
 * @vitest-environment node
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "../..")
const config = readFileSync(path.join(ROOT, "vite.config.js"), "utf8")
const html = readFileSync(path.join(ROOT, "index.html"), "utf8")

/** The icons the manifest lists: { src, sizes, type, purpose }. */
function icons() {
	const block = config.slice(config.indexOf("icons: ["), config.indexOf("workbox:"))
	// (a `////` marker may stand on the line of a value: it is taken out before the objects are read)
	return [...block.replace(/\s*\/\/\/\/[^\n]*/g, "").matchAll(/\{\s*src: "([^"]+)",\s*sizes: "([^"]+)",\s*type: "([^"]+)",\s*purpose: "([^"]+)",?\s*\}/g)].map(
		([, src, sizes, type, purpose]) => ({ src, sizes, type, purpose }),
	)
}
const fileOf = (src) => path.join(ROOT, "public", path.basename(src))

describe("the manifest of the till", () => {
	it("lists a PNG icon of 192 px and one of 512 px for any use: what Chrome needs to install the app", () => {
		const any = icons().filter((icon) => icon.purpose === "any")

		for (const size of ["192x192", "512x512"]) {
			const icon = any.find((candidate) => candidate.sizes === size)
			expect(icon, size).toBeDefined()
			expect(icon.type).toBe("image/png")
		}
	})

	it("lists maskable PNG icons too, for the shape an Android launcher cuts", () => {
		const maskable = icons().filter((icon) => icon.purpose === "maskable")

		expect(maskable.map((icon) => icon.sizes).sort()).toEqual(["192x192", "512x512"])
		for (const icon of maskable) expect(icon.type).toBe("image/png")
	})

	it("lists no SVG icon: Chrome on Android does not take them, and it left the app a mere shortcut", () => {
		expect(icons().filter((icon) => icon.type !== "image/png")).toEqual([])
	})

	it("names icon files that exist, each as big as it says", () => {
		for (const icon of icons()) {
			const file = fileOf(icon.src)
			expect(existsSync(file), icon.src).toBe(true)
			const png = readFileSync(file)
			expect(png.subarray(1, 4).toString("ascii"), icon.src).toBe("PNG")
			const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)]
			expect(`${width}x${height}`, icon.src).toBe(icon.sizes)
		}
	})

	it("starts inside its scope, standalone, with an id of its own", () => {
		expect(config).toContain('display: "standalone"')
		expect(config).toContain('scope: "/pos"')
		expect(config).toContain('start_url: "/pos"')
		expect(config).toContain('id: "/pos"')
	})

	it("carries the page's own colours, not upstream's indigo", () => {
		expect(config).toContain('theme_color: "#D68A59"')
		expect(config).not.toContain("#4F46E5")
	})

	it("gives iOS a PNG home-screen icon, and the file is there", () => {
		expect(html).toContain('rel="apple-touch-icon" href="/assets/pos_next/pos/apple-touch-icon.png"')
		expect(existsSync(path.join(ROOT, "public/apple-touch-icon.png"))).toBe(true)
	})
})
