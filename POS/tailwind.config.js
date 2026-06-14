import frappeUIPreset from "frappe-ui/tailwind"

export default {
	presets: [frappeUIPreset],
	content: [
		"./index.html",
		"./src/**/*.{vue,js,ts,jsx,tsx}",
		"./node_modules/frappe-ui/src/components/**/*.{vue,js,ts,jsx,tsx}",
	],
	theme: {
		//// align POS design with Neoffice theme and improve customer display — c9d9c1c
		extend: {
			// Neoffice Design System: map every cool accent palette (blue, violet,
			// purple, indigo) to the same clay ramp, so the ~85 files using raw
			// blue-N / violet-N / purple-N utility classes render warm clay instead
			// of blue/violet — one place, no per-file churn.
			colors: (() => {
				const clay = {
					50: "#faefe6",
					100: "#f3decc",
					200: "#e9c5a4",
					300: "#dda479",
					400: "#d68a59",
					500: "#c2723f",
					600: "#a15a2e",
					700: "#7e4523",
					800: "#633619",
					900: "#4a2812",
					950: "#2e190b",
				}
				return { blue: clay, violet: clay, purple: clay, indigo: clay }
			})(),
			borderRadius: {
				"neo-sm": "8px",
				"neo-md": "14px",
				"neo-lg": "18px",
			},
			fontFamily: {
				display: ['"Forum"', "serif"],
			},
			boxShadow: {
				neo: "0 2px 8px 0 rgba(0, 0, 0, 0.04), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
				"neo-md":
					"0 4px 16px 0 rgba(0, 0, 0, 0.06), 0 2px 4px 0 rgba(0, 0, 0, 0.04)",
				"neo-lg":
					"0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 4px 8px 0 rgba(0, 0, 0, 0.04)",
			},
		},
	},
	plugins: [],
}
