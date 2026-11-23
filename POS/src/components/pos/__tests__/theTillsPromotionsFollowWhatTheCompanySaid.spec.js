/**
 * //// Neoffice — added file (no upstream equivalent). The till's « Promotions » entry follows what the company said in
 * //// the welcome of its spaces (neoffice_theme, « Do you run promotions? », lot 10 of neoffice-maintenance#2961;
 * //// product owner, 23.11.2026: « Oui, aussi à la caisse »), as the server tells the till (`promotions_said_no` of its
 * //// settings, pos_next.till_welcome). « No »: the rail has no « Promotions » entry and its window no promotions tab;
 * //// the coupons and gift cards that window also holds keep their door, under their own name. Nothing said, the
 * //// welcome's key off, or « Yes »: the till is as it always was.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const settingsStore = vi.hoisted(() => ({ settings: {} }));

vi.hoisted(() => {
	globalThis.__ = (s) => s;
});

const stub = (name) => ({ name, template: "<div><slot /><slot name='prefix' /></div>" });

vi.mock("frappe-ui", () => ({
	FeatherIcon: { props: ["name"], template: "<i :data-icon='name' />" },
	Badge: stub("Badge"),
	Button: stub("Button"),
	Card: stub("Card"),
	FormControl: stub("FormControl"),
	LoadingIndicator: stub("LoadingIndicator"),
	createResource: () => ({ reload() {}, submit() {}, fetch() {}, data: null, loading: false }),
}));
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ can: {}, tipsEnabled: false, isEnabled: false }),
}));
vi.mock("@/stores/posSettings", () => ({ usePOSSettingsStore: () => settingsStore }));
vi.mock("@/stores/itemSearch", () => ({ useItemSearchStore: () => ({}) }));
// every endpoint of the promotions' API is a name here: the window builds its resources from them
vi.mock("@/utils/promoApi", () => ({
	isPromotionsAppInstalled: () => false,
	promoApi: new Proxy({}, { get: () => () => "pos_next.api.promotions.method" }),
}));
vi.mock("@/composables/usePermissions", () => ({
	usePOSPermissions: () => ({
		canCreatePromotion: async () => true,
		canEditPromotion: async () => true,
		canDeletePromotion: async () => true,
	}),
}));
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess() {}, showError() {}, showWarning() {} }),
}));
vi.mock("@/utils/translation", () => ({ __: (s) => s }));
vi.mock("@/components/sale/CouponManagement.vue", () => ({
	default: { name: "CouponManagement", template: "<div data-coupons />" },
}));
vi.mock("@/components/common/SelectInput.vue", () => ({ default: stub("SelectInput") }));
vi.mock("@/components/common/TranslatedHTML.vue", () => ({ default: stub("TranslatedHTML") }));

const { default: ManagementSlider } = await import("../ManagementSlider.vue");
const { default: PromotionManagement } = await import("../../sale/PromotionManagement.vue");

const mocks = { global: { mocks: { __: globalThis.__ } } };

describe("the till's rail follows what the company said of its promotions", () => {
	let wrapper;

	function titles(settings) {
		settingsStore.settings = settings;
		wrapper = mount(ManagementSlider, mocks);
		return wrapper.findAll("button").map((button) => button.attributes("title"));
	}

	afterEach(() => {
		wrapper?.unmount();
	});

	it("shows « Promotions » while nothing was said", () => {
		expect(titles({})).toContain("Promotions");
	});

	it("shows « Promotions » after a « Yes »", () => {
		expect(titles({ promotions_said_no: false })).toContain("Promotions");
	});

	it("has no « Promotions » entry after a « No », and keeps the coupons' door under their own name", () => {
		const said = titles({ promotions_said_no: true });
		expect(said).not.toContain("Promotions");
		expect(said).toContain("Coupons");
		expect(wrapper.text()).not.toContain("Promotions");
	});
});

describe("the window of that entry follows it too", () => {
	let wrapper;

	async function open(settings) {
		settingsStore.settings = settings;
		wrapper = mount(PromotionManagement, {
			props: { modelValue: true, company: "Test Company" },
			...mocks,
		});
		await flushPromises();
		return wrapper;
	}

	afterEach(() => {
		wrapper?.unmount();
	});

	it("opens on the promotions, with both tabs, while nothing was said", async () => {
		await open({});
		expect(wrapper.text()).toContain("Promotional Schemes");
		expect(wrapper.text()).toContain("Promotion & Coupon Management");
		expect(wrapper.find("[data-coupons]").exists()).toBe(false);
	});

	it("after a « No », has no promotions tab and opens on the coupons", async () => {
		await open({ promotions_said_no: true });
		expect(wrapper.text()).not.toContain("Promotional Schemes");
		// nor a title or a subtitle that speaks of them
		expect(wrapper.text()).not.toContain("Promotion & Coupon Management");
		expect(wrapper.text()).not.toContain("Manage promotional schemes and coupons");
		expect(wrapper.find("#promotion-management-title").text()).toBe("Coupons");
		expect(wrapper.find("[data-coupons]").exists()).toBe(true);
	});
});
