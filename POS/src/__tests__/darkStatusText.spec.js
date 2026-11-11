/**
 * //// Neoffice — added file (no upstream equivalent). The till's dark theme gives the green, red and amber TEXT the design system's dark
 * //// ramp (maintenance#2256): a « Payé » pill (bg-green-50 text-green-800) read dark green on dark green. Read in the stylesheet itself: each
 * //// shade has its rule in the dark scope, an element that chose its own dark colour keeps it, the alerts' own rules still come after and
 * //// win, and the colour reads on the tint it is written on (contrast computed over the dark card, WCAG AA: 4.5:1).
 * @vitest-environment node
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const CSS = fs.readFileSync(path.resolve(here, "../index.css"), "utf8");
const root = postcss.parse(CSS);

/** The colour a dark-scope rule gives to `className` when the element has no `dark:text-` class of its own; null when none does. */
function darkColorOf(className) {
	let color = null;
	root.walkRules((rule) => {
		const hits = rule.selectors.includes(
			`[data-theme='dark'] .${className}:not([class*="dark:text-"])`
		);
		if (!hits) return;
		rule.walkDecls("color", (decl) => {
			color = decl.value.replace(/\s*!important/, "");
		});
	});
	return color;
}

const CARD = [0x1c, 0x1f, 0x26]; // the dark card, bg-white in the dark theme
const hex = (value) => [1, 3, 5].map((at) => Number.parseInt(value.slice(at, at + 2), 16));
const over = ([r, g, b, a], [R, G, B]) => [
	r * a + R * (1 - a),
	g * a + G * (1 - a),
	b * a + B * (1 - a),
];
const luminance = (rgb) => {
	const [r, g, b] = rgb.map((channel) => {
		const c = channel / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (one, two) => {
	const [light, dark] = [luminance(one), luminance(two)].sort((a, b) => b - a);
	return (light + 0.05) / (dark + 0.05);
};

// The tints the till's dark theme paints the light status grounds with (index.css), over the dark card: -50, then -100
const TINTS_50 = {
	green: over([34, 197, 94, 0.14], CARD),
	red: over([239, 68, 68, 0.14], CARD),
	amber: over([245, 158, 11, 0.14], CARD),
};
const TINTS = {
	green: over([34, 197, 94, 0.24], CARD),
	red: over([239, 68, 68, 0.24], CARD),
	amber: over([245, 158, 11, 0.24], CARD),
};

// Every light ground of these hues the till's sources write, which the text above may sit on: light text on a light ground is the defect turned over
function lightGroundsInTheSources() {
	const grounds = new Set();
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.name === "__tests__" || entry.name === "node_modules") continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (/\.(vue|js|ts)$/.test(entry.name))
				for (const match of fs
					.readFileSync(full, "utf8")
					.matchAll(/(?<![\w:/-])bg-(green|emerald|red|rose|amber|yellow)-(50|100|200|300)(?![\w/-])/g))
					grounds.add(match[0]);
		}
	};
	walk(path.resolve(here, ".."));
	return [...grounds].sort();
}

/** The background a dark-scope rule gives to `className`; null when none does. */
function darkBackgroundOf(className) {
	let painted = null;
	root.walkRules((rule) => {
		if (rule.selectors.includes(`[data-theme='dark'] .${className}`))
			rule.walkDecls("background-color", (decl) => {
				painted = decl.value;
			});
	});
	return painted;
}

describe("green, red and amber text in the dark theme", () => {
	const RAMP = {
		green: { 600: "#3DBE74", 700: "#3DBE74", 800: "#CBEDD7", 900: "#CBEDD7" },
		emerald: { 600: "#3DBE74", 700: "#3DBE74", 800: "#CBEDD7", 900: "#CBEDD7" },
		red: { 600: "#FF6369", 700: "#FF6369", 800: "#F6D2C9", 900: "#F6D2C9" },
		rose: { 600: "#FF6369", 700: "#FF6369", 800: "#F6D2C9", 900: "#F6D2C9" },
		amber: { 600: "#E6A93B", 700: "#E6A93B", 800: "#F8E2B4", 900: "#F8E2B4" },
		yellow: { 600: "#E6A93B", 700: "#E6A93B", 800: "#F8E2B4", 900: "#F8E2B4" },
	};

	for (const [hue, shades] of Object.entries(RAMP))
		for (const [shade, color] of Object.entries(shades))
			it(`text-${hue}-${shade} takes ${color}, the design system's dark ramp`, () => {
				expect(darkColorOf(`text-${hue}-${shade}`)).toBe(color);
			});

	it("reads on the dark card and on the tint it is written on", () => {
		for (const [hue, tint] of Object.entries(TINTS)) {
			for (const shade of [600, 700, 800, 900]) {
				const color = hex(darkColorOf(`text-${hue}-${shade}`));
				expect(
					contrast(color, CARD),
					`text-${hue}-${shade} on the card`
				).toBeGreaterThanOrEqual(4.5);
				expect(
					contrast(color, TINTS_50[hue]),
					`text-${hue}-${shade} on bg-${hue}-50`
				).toBeGreaterThanOrEqual(4.5);
			}
			for (const shade of [800, 900])
				expect(
					contrast(hex(darkColorOf(`text-${hue}-${shade}`)), tint),
					`text-${hue}-${shade} on bg-${hue}-100`
				).toBeGreaterThanOrEqual(4.5);
			// A ramp shade written on the stronger tint takes the pale shade of its hue
			for (const shade of [600, 700]) {
				const color = darkColorOf(`bg-${hue}-100.text-${hue}-${shade}`);
				expect(color, `bg-${hue}-100 text-${hue}-${shade}`).toBe(
					darkColorOf(`text-${hue}-800`)
				);
				expect(contrast(hex(color), tint)).toBeGreaterThanOrEqual(4.5);
			}
		}
	});

	it("leaves the alerts' own text colours the last word: their rules come after", () => {
		const ours = CSS.indexOf("maintenance#2256");
		const alerts = CSS.indexOf('.border-s-4.bg-green-50 [class*="text-green-"]');
		expect(ours).toBeGreaterThan(-1);
		expect(alerts).toBeGreaterThan(ours);
	});

	it("remaps every light ground of these hues the till writes, so that the pale text never sits on a light one", () => {
		const grounds = lightGroundsInTheSources();
		// The kitchen's « À faire » pill is one of them (bg-yellow-100 text-yellow-800)
		expect(grounds).toContain("bg-yellow-100");
		for (const ground of grounds) expect(darkBackgroundOf(ground), ground).toMatch(/^rgba\(/);
	});
});
