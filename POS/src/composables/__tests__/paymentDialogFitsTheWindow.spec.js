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

//// Neoffice — maintenance#2663: in a restaurant, with a customer who holds loyalty points, the split block (its title, a subtitle
//// and the ÷2 ÷3 ÷4 N choices) and the loyalty card together pushed the numpad under the right column's scroll at 1366 × 768. The
//// choices now wait behind one closed « Split » button; a running split and the loyalty card stay on screen as they were. What is
//// drawn is read by evaluating every v-if / v-else between a node and the scroll against a state of the dialog.
describe("the right column at a restaurant table, for a customer with loyalty points", () => {
	const source = fs.readFileSync(
		path.resolve(here, "../../components/sale/PaymentDialog.vue"),
		"utf8",
	);
	const root = parse(source).descriptor.template.ast;
	const all = elements(root);
	const parents = new Map();
	for (const node of [root, ...all]) {
		for (const child of node.children || []) parents.set(child, node);
	}
	const scroll = all.find(
		(node) => attr(node, "data-test")?.value?.content === "payment-right-scroll",
	);
	const toggle = all.find((node) => attr(node, "data-test")?.value?.content === "split-toggle");
	const loyaltyCard = all.find(
		(node) => attr(node, "data-test")?.value?.content === "payment-loyalty-card",
	);
	const handlerOf = (node, event) =>
		node.props?.find((p) => p.type === 7 && p.name === "on" && p.arg?.content === event)?.exp
			?.content || "";
	// The ÷2 ÷3 ÷4 buttons (one v-for node) and the N field: whatever starts a split (not deactivateSplit, which stops it)
	const startsASplit = /\bactivateSplit\(/;
	const choices = all.filter(
		(node) =>
			startsASplit.test(handlerOf(node, "click")) ||
			startsASplit.test(handlerOf(node, "change")),
	);
	// The running split: its person counter and the button that stops it
	const runningSplit = [
		all.find(
			(node) => node.tag === "button" && handlerOf(node, "click") === "deactivateSplit",
		),
		all.find((node) =>
			node.children?.some(
				(c) => c.type === 5 && c.content.content.includes("splitPaymentIndex + 1"),
			),
		),
	];
	// The state the « Split » button opens and closes is the one it announces as expanded
	const open = toggle && attr(toggle, "aria-expanded")?.exp?.content;

	const directive = (node, name) => node.props?.find((p) => p.type === 7 && p.name === name);
	function conditionOf(node) {
		const own = directive(node, "if") || directive(node, "show");
		if (own) return own.exp.content;
		const branch = directive(node, "else-if");
		if (!branch && !directive(node, "else")) return null;
		const siblings = parents.get(node).children.filter((c) => c.type === 1);
		const parts = branch ? [`(${branch.exp.content})`] : [];
		for (let i = siblings.indexOf(node) - 1; i >= 0; i--) {
			const before = directive(siblings[i], "else-if") || directive(siblings[i], "if");
			parts.push(`!(${before.exp.content})`);
			if (directive(siblings[i], "if")) break;
		}
		return parts.join(" && ");
	}
	function holds(expression, state) {
		const scope = new Proxy(state, {
			has: () => true,
			get(target, key) {
				if (typeof key === "symbol") return undefined;
				if (!(key in target))
					throw new Error(`no value for « ${key} » in « ${expression} »`);
				return target[key];
			},
		});
		return Boolean(new Function("scope", `with (scope) { return (${expression}); }`)(scope));
	}
	// Drawn in the right column's scroll for this state: every condition between the node and the scroll holds
	function drawn(node, state) {
		expect(within(scroll, node)).toBe(true);
		for (let at = node; at && at !== scroll; at = parents.get(at)) {
			const condition = conditionOf(at);
			if (condition && !holds(condition, state)) return false;
		}
		return true;
	}
	const table = ({ restaurant = true, splitMode = false, opened = false } = {}) => ({
		restaurantStore: { isEnabled: restaurant },
		loyaltyDetails: { has_loyalty: true, loyalty_points: 1200 },
		splitMode,
		[open]: opened,
	});

	it("draws no split choice until one « Split » button, closed by default, is opened", () => {
		expect(choices.length).toBe(2);
		for (const choice of choices) expect(drawn(choice, table())).toBe(false);
		expect(toggle, "the « Split » button (data-test split-toggle)").toBeTruthy();
		expect(open, "the state the « Split » button opens (its :aria-expanded)").toBeTruthy();
		expect(
			toggle.children.some((c) => c.type === 5 && c.content.content.includes('__("Split")')),
		).toBe(true);
		expect(drawn(toggle, table())).toBe(true);
		for (const choice of choices) expect(drawn(choice, table({ opened: true }))).toBe(true);
	});

	it("keeps a running split on screen as it was, whether the button was opened or not", () => {
		for (const node of runningSplit) {
			expect(node).toBeTruthy();
			expect(drawn(node, table({ splitMode: true }))).toBe(true);
			expect(drawn(node, table({ splitMode: true, opened: true }))).toBe(true);
			expect(drawn(node, table())).toBe(false);
		}
	});

	it("keeps the loyalty card in sight, behind neither the « Split » button nor a running split", () => {
		expect(loyaltyCard, "the loyalty card (data-test payment-loyalty-card)").toBeTruthy();
		for (const state of [
			table(),
			table({ opened: true }),
			table({ splitMode: true }),
			table({ splitMode: true, opened: true }),
		]) {
			expect(drawn(loyaltyCard, state)).toBe(true);
		}
	});

	it("draws neither the « Split » button, nor its choices, nor a split outside a restaurant", () => {
		expect(toggle).toBeTruthy();
		for (const node of [toggle, ...choices, ...runningSplit]) {
			expect(drawn(node, table({ restaurant: false, opened: true }))).toBe(false);
			expect(drawn(node, table({ restaurant: false, splitMode: true }))).toBe(false);
		}
		expect(drawn(loyaltyCard, table({ restaurant: false }))).toBe(true);
	});
});
