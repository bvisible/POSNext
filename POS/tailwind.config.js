import frappeUIPreset from "frappe-ui/tailwind";

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
				};
				return {
					blue: clay,
					violet: clay,
					purple: clay,
					indigo: clay,
					//// Neoffice — upstream develop's POS tokens, merged into the same `colors` object
					//// as our clay ramp (two `colors` keys would drop one of them).
					// POS tokens (see :root in src/index.css); frappe-ui already owns ink/surface
					pos: {
						ink: "var(--pos-ink)",
						muted: "var(--pos-ink-muted)",
						surface: "var(--pos-surface)",
						panel: "var(--pos-panel)",
						line: "var(--pos-line)",
						action: "var(--pos-action)",
						"action-hover": "var(--pos-action-hover)",
						"action-soft": "var(--pos-action-soft)",
						saving: "var(--pos-saving)",
						caution: "var(--pos-caution)",
						danger: "var(--pos-danger)",
					},
					//// Neoffice — the design system's DARK tokens for the kitchen and runner screens (NeoResto lot 1, task 46). Their
					//// `dark:` classes used greys, or nothing at all, and the till's own dark remap (index.css) turns many light classes into
					//// colours that no longer pair (a pill's text and its background came out the same colour). Names and values are the
					//// system's: `tokens/colors.css` in its dark scope for paper and ink, and the dark ramp of readme 9.1 for the status colours,
					//// the only dark ramp the system gives them.
					ds: {
						paper: "#FFFDF8", // --paper-bright: text on a dark ground
						ink: "#141414", // --sand-950: text on a bright fill
						"sand-300": "#BFB5A4", // --text-secondary on dark
						"sand-400": "#968C7C", // --text-tertiary on dark
						success: "#3DBE74", // success, dark ramp
						"success-soft": "#CBEDD7", // --green-100: a pale mint, for text on a green tint
						warning: "#E6A93B", // warning, dark ramp: the lighter orange of a slow timer
						danger: "#FF6369", // destructive, dark ramp: the lighter red of a late timer
						"danger-soft": "#F6D2C9", // --red-100: the pale phase of the late timer's pulse
						//// Neoffice — the two solid reds of the « Undo » banner of the kitchen and runner screens (white text on the first is 5.5:1, the second on white 8:1)
						"red-600": "#C1372C", // --red-600: the banner
						"red-700": "#9C2920", // --red-700: the text of its white button
					},
				};
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
				"neo-md": "0 4px 16px 0 rgba(0, 0, 0, 0.06), 0 2px 4px 0 rgba(0, 0, 0, 0.04)",
				"neo-lg": "0 8px 32px 0 rgba(0, 0, 0, 0.08), 0 4px 8px 0 rgba(0, 0, 0, 0.04)",
			},
			fontSize: {
				"pos-sm": ["var(--pos-text-sm)", { lineHeight: "1.35" }],
				"pos-md": ["var(--pos-text-md)", { lineHeight: "1.3" }],
				"pos-lg": ["var(--pos-text-lg)", { lineHeight: "1.25" }],
				"pos-xl": ["var(--pos-text-xl)", { lineHeight: "1.15" }],
			},
			minHeight: { target: "var(--pos-target)" },
			minWidth: { target: "var(--pos-target)" },
			//// Neoffice — two pulses for the dark mode of the kitchen and runner screens (NeoResto lot 1, task 46). Tailwind's `animate-pulse`
			//// halves the OPACITY, which on a dark card takes a late timer's red down to about 1.6:1 at its dimmest. These two never fade
			//// the text: the late timer swings between two light reds and breathes a glow (it still blinks, and every phase reads at 4.5:1
			//// or more), and a ready badge swells. Used only behind `dark:`, the light mode keeps `animate-pulse`.
			keyframes: {
				"late-pulse": {
					"0%, 100%": { color: "#FF6369", textShadow: "0 0 0 rgba(255, 99, 105, 0)" },
					"50%": { color: "#F6D2C9", textShadow: "0 0 10px rgba(255, 99, 105, 0.85)" },
				},
				"ready-pulse": {
					"0%, 100%": { transform: "scale(1)" },
					"50%": { transform: "scale(1.15)" },
				},
			},
			animation: {
				"late-pulse": "late-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
				"ready-pulse": "ready-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
			},
		},
	},
	plugins: [],
};
