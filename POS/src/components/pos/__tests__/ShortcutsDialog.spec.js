/**
 * The shortcuts help lists the keys of the keyboard in use.
 * @vitest-environment jsdom
 */
//// Neoffice — added file (no upstream equivalent): it tests ShortcutsDialog, which upstream lacks.
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	globalThis.__ = (s) => s;
});

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div><slot name='body-content' /><slot name='actions' /></div>" },
}));

const { default: ShortcutsDialog } = await import("../ShortcutsDialog.vue");

describe("ShortcutsDialog", () => {
	afterEach(() => vi.restoreAllMocks());

	const keysOn = (platform) => {
		vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
		const wrapper = mount(ShortcutsDialog, {
			props: { modelValue: true },
			global: { mocks: { __: globalThis.__ } },
		});
		return wrapper.findAll("kbd").map((key) => key.text());
	};

	it("writes Cmd keys on a Mac, then the F-keys of a PC keyboard", () => {
		expect(keysOn("MacIntel")).toEqual(["/", "⌘K", "⌘↵", "F4", "F8", "F9"]);
	});

	it("writes Ctrl keys elsewhere", () => {
		expect(keysOn("Win32")).toEqual(["/", "Ctrl K", "Ctrl ↵", "F4", "F8", "F9"]);
	});
});
