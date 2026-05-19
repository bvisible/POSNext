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
