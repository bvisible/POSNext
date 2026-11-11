/**
 * //// Neoffice — added file (no upstream equivalent). The payment dialog stays in the window on a desktop, its main button in sight
 * //// (maintenance#1976): at 1366 × 768 a table's payment ran to 784px and « Exact cash » lay under the bottom of the window. The height the
 * //// columns keep is the composable's; that the button stands below the right column's scroll, never in it, is read in the dialog's template
 * //// (PaymentDialog.vue is too large to mount here). The measurement in a real window is the issue's.
 * @vitest-environment jsdom
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@vue/compiler-sfc";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent, nextTick } from "vue";
import { useResponsivePayment } from "@/composables/useResponsivePayment";

const here = path.dirname(fileURLToPath(import.meta.url));

async function sizesAt(width, height) {
	window.innerWidth = width;
	window.innerHeight = height;
	let sizes;
	mount(
		defineComponent({
			setup() {
				sizes = useResponsivePayment();
				return () => null;
			},
		}),
	);
	await nextTick();
	return sizes;
}

describe("the height the payment dialog keeps", () => {
	it("on a desktop of 1366 × 768 leaves the dialog's offset, title and padding: 10rem under the window", async () => {
		const sizes = await sizesAt(1366, 768);

		expect(sizes.paymentBodyMaxHeight.value).toBe("min(668px, calc(100dvh - 10rem))");
	});

	it("is the compact layout on a till of 1366 × 768, and the full one from 800px of height", async () => {
		expect((await sizesAt(1366, 768)).isCompactMode.value).toBe(true);
		expect((await sizesAt(1920, 1080)).isCompactMode.value).toBe(false);
	});

	it("is no maximum on a tablet or a phone, where the dialog scrolls as a whole", async () => {
		expect((await sizesAt(800, 1280)).paymentBodyMaxHeight.value).toBe("none");
		expect((await sizesAt(390, 844)).paymentBodyMaxHeight.value).toBe("none");
	});
});

function elements(node, found = []) {
	if (node.type === 1) found.push(node);
	for (const child of node.children || []) elements(child, found);
	return found;
}
const attr = (node, name) =>
	node.props?.find((p) => p.name === name || p.rawName === name || p.arg?.content === name);
const within = (outer, inner) => elements(outer).includes(inner);

describe("the right column of the payment dialog", () => {
	const source = fs.readFileSync(
		path.resolve(here, "../../components/sale/PaymentDialog.vue"),
		"utf8",
	);
	const all = elements(parse(source).descriptor.template.ast);
	const column = all.find((node) => attr(node, "ref")?.value?.content === "rightColumnRef");
	const scroll = all.find(
		(node) => attr(node, "data-test")?.value?.content === "payment-right-scroll",
	);
	// The desktop's buttons are the last of their kind (a phone's own, in the stacked layout, come earlier and scroll with it)
	const last = (handler) =>
		all
			.filter(
				(node) => node.tag === "button" && attr(node, "click")?.exp?.content === handler,
			)
			.pop();
	const exactCash = last("payExactCash");
	const complete = last("completePayment");

	it("scrolls inside, and keeps its bounds on a desktop", () => {
		expect(column && scroll).toBeTruthy();
		expect(within(column, scroll)).toBe(true);
		expect(attr(column, "style")?.exp?.content).toContain("rightColumnBounds");
	});

	it("keeps « Exact cash » and « Complete payment » below the scroll, in sight", () => {
		for (const button of [exactCash, complete]) {
			expect(button).toBeTruthy();
			expect(within(column, button)).toBe(true);
			expect(within(scroll, button)).toBe(false);
		}
	});
});
