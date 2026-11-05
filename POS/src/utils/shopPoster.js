//// Neoffice — added file (no upstream equivalent). The poster of a shop's QR code (scanning in the shop, lot 5): the
//// shop's logo (or its name), « Scan your articles », the code large and the three steps the phone's page says, to show
//// at the entrance and in the aisles. Printed through the hidden frame of the restaurant's public menu (menuQrSheet). The
//// shop shows it to its own customers: it carries the shop's logo as the company keeps it and no Neoffice design, neutral
//// as the phone's page (05.11.2026, design system §7.6): the system's sans-serif face, ink and gray, no web font
//// fetched.
import { escapeHtml, menuQrSvg, printHtml } from "@/utils/menuQrSheet"

const STYLE = `
	@page { size: A4 portrait; margin: 16mm; }
	* { box-sizing: border-box; }
	html, body { margin: 0; background: #ffffff; color: #171717; }
	body { font-family: "Inter", system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
	.poster { display: flex; flex-direction: column; align-items: center; gap: 7mm; padding-top: 8mm; text-align: center; }
	.poster__logo { display: block; max-width: 80mm; max-height: 28mm; width: auto; height: auto; object-fit: contain; }
	.poster__name { margin: 0; max-width: 100%; font-size: 16pt; font-weight: 700; color: #171717; overflow-wrap: anywhere; }
	.poster__title { margin: 0; font-size: 38pt; font-weight: 700; line-height: 1.1; color: #171717; }
	.poster__qr { width: 110mm; max-width: 100%; }
	.poster__qr svg { display: block; width: 100%; height: auto; }
	.poster__steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; width: 100%; margin: 0; padding: 0; list-style: none; text-align: left; }
	.poster__step { display: flex; flex-direction: column; gap: 1.5mm; }
	.poster__step .poster__number { font-size: 22pt; font-weight: 700; line-height: 1; color: #171717; }
	.poster__step strong { font-size: 13pt; color: #171717; }
	.poster__step span { font-size: 11pt; line-height: 1.35; color: #525252; }
	.poster__url { margin: 0; max-width: 100%; font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 9pt; line-height: 1.4; color: #7c7c7c; overflow-wrap: anywhere; }
`

/** The three steps of the phone's page, as the poster writes them: [title, text]. */
export function posterSteps() {
	return [
		[__("Scan"), __("The shop's articles, with their price.")],
		[__("Go to the till"), __("Show your code to the seller.")],
		[__("Checked and paid"), __("A seller checks your cart, then you pay.")],
	]
}

/**
 * The page to print. The name and the address are written as text, escaped; the code is drawn from the address alone. The
 * shop's logo, when the company has one, stands at the top in its own proportions, in place of the name.
 */
export async function shopPosterHtml({ shopName, shopLogo, url }) {
	const svg = await menuQrSvg(url)
	const steps = posterSteps()
		.map(
			([title, text], index) =>
				`<li class="poster__step"><span class="poster__number">${index + 1}</span><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></li>`,
		)
		.join("")
	return `<!DOCTYPE html>
<html lang="${escapeHtml(document.documentElement.lang || "en")}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(shopName)}</title>
<style>${STYLE}</style>
</head>
<body>
<main class="poster">
${shopLogo ? `<img class="poster__logo" src="${escapeHtml(shopLogo)}" alt="${escapeHtml(shopName)}">` : `<p class="poster__name">${escapeHtml(shopName)}</p>`}
<h1 class="poster__title">${escapeHtml(__("Scan your articles"))}</h1>
<div class="poster__qr" data-url="${escapeHtml(url)}">${svg}</div>
<ol class="poster__steps">${steps}</ol>
<p class="poster__url">${escapeHtml(url)}</p>
</main>
</body>
</html>`
}

/** Print the poster of the shop's QR code. */
export async function printShopPoster({ shopName, shopLogo, url }) {
	await printHtml(await shopPosterHtml({ shopName, shopLogo, url }))
}
