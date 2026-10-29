/** @vitest-environment jsdom */
import { mount } from "@vue/test-utils";
//// Neoffice — afterEach and shortcutLabel (utils/shortcutKeys.js, ours whole) serve the tests of the
//// shortcuts that need no function key, at the end of this file.
import { afterEach, describe, expect, it, vi } from "vitest";
import { shortcutLabel } from "@/utils/shortcutKeys";
import { defineComponent, ref } from "vue";
import { useGlobalShortcuts, usePickerEnter } from "@/composables/useKeyboardShortcuts";

const press = (target, key) =>
	target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

function mountWith(setupFn) {
	return mount(defineComponent({ setup: setupFn, template: "<div />" }), { attachTo: document.body });
}

describe("useGlobalShortcuts", () => {
	it("fires F-keys while an input has focus", () => {
		const onPayment = vi.fn();
		const wrapper = mountWith(() => useGlobalShortcuts(() => false, { F9: onPayment }));
		const input = document.createElement("input");
		document.body.appendChild(input);
		input.focus();
		press(input, "F9");
		expect(onPayment).toHaveBeenCalledTimes(1);
		wrapper.unmount();
		press(input, "F9");
		expect(onPayment).toHaveBeenCalledTimes(1);
	});

	it("keeps non F-keys guarded in inputs and honours the block guard", () => {
		const onKey = vi.fn();
		const blocked = ref(false);
		const wrapper = mountWith(() => useGlobalShortcuts(() => blocked.value, { "/": onKey, F4: onKey }));
		const input = document.createElement("input");
		document.body.appendChild(input);
		input.focus();
		press(input, "/");
		expect(onKey).not.toHaveBeenCalled();
		blocked.value = true;
		press(input, "F4");
		expect(onKey).not.toHaveBeenCalled();
		wrapper.unmount();
	});
});

describe("usePickerEnter", () => {
	it("runs the handler on Enter only while open and not from an input", async () => {
		const onEnter = vi.fn();
		const open = ref(false);
		const wrapper = mountWith(() => usePickerEnter(open, onEnter));
		const button = document.createElement("button");
		const input = document.createElement("input");
		document.body.append(button, input);
		press(button, "Enter");
		expect(onEnter).not.toHaveBeenCalled();
		open.value = true;
		await Promise.resolve();
		const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
		button.dispatchEvent(event);
		expect(onEnter).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(true);
		press(input, "Enter");
		expect(onEnter).toHaveBeenCalledTimes(1);
		wrapper.unmount();
	});
});

//// Neoffice — the shortcuts that need no function key: "/", Mod+k and Mod+Enter, Mod being Cmd on
//// a Mac and Ctrl elsewhere (see useKeyboardShortcuts). F4, F8 and F9 are upstream's own and stay.
describe("useGlobalShortcuts without function keys", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
		document.body.innerHTML = "";
	});

	const onPlatform = (platform) => vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
	const mountShortcuts = (isBlocked = () => false) => {
		document.body.innerHTML = ""; // the earlier tests leave a focused input behind
		const handlers = { F4: vi.fn(), "/": vi.fn(), "Mod+k": vi.fn(), "Mod+Enter": vi.fn() };
		return { handlers, wrapper: mountWith(() => useGlobalShortcuts(isBlocked, handlers)) };
	};
	const focused = (tag) => {
		const el = document.createElement(tag);
		el.tabIndex = 0;
		document.body.appendChild(el);
		el.focus();
		return el;
	};
	const key = (target, name, init = {}) => {
		const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init });
		target.dispatchEvent(event);
		return event;
	};

	it("answers to / from the page, and F4 still works", () => {
		const { handlers, wrapper } = mountShortcuts();
		expect(key(document.body, "/").defaultPrevented).toBe(true);
		expect(handlers["/"]).toHaveBeenCalledTimes(1);
		key(document.body, "F4");
		expect(handlers.F4).toHaveBeenCalledTimes(1);
		wrapper.unmount();
	});

	it("leaves / to a field that owns its text", () => {
		const { handlers, wrapper } = mountShortcuts();
		const editable = focused("div");
		Object.defineProperty(editable, "isContentEditable", { value: true }); // jsdom has none
		for (const field of [focused("input"), focused("textarea"), focused("select"), editable]) {
			field.focus();
			expect(key(field, "/").defaultPrevented).toBe(false);
		}
		expect(handlers["/"]).not.toHaveBeenCalled();
		wrapper.unmount();
	});

	it("takes / on its own, with Shift or AltGr, not as a chord", () => {
		vi.useFakeTimers();
		const { handlers, wrapper } = mountShortcuts();
		key(document.body, "/", { ctrlKey: true });
		key(document.body, "/", { metaKey: true });
		key(document.body, "/", { altKey: true });
		expect(handlers["/"]).not.toHaveBeenCalled();
		key(document.body, "/", { shiftKey: true }); // AZERTY and Swiss keyboards type it with Shift
		vi.advanceTimersByTime(500);
		key(document.body, "/", { ctrlKey: true, altKey: true, modifierAltGraph: true }); // AltGr on Windows
		expect(handlers["/"]).toHaveBeenCalledTimes(2);
		wrapper.unmount();
	});

	it("does not take a / that arrives in the middle of a barcode scan", () => {
		vi.useFakeTimers();
		const { handlers, wrapper } = mountShortcuts();
		key(document.body, "A");
		vi.advanceTimersByTime(8);
		key(document.body, "/");
		expect(handlers["/"]).not.toHaveBeenCalled();
		vi.advanceTimersByTime(500);
		key(document.body, "/");
		expect(handlers["/"]).toHaveBeenCalledTimes(1);
		wrapper.unmount();
	});

	it("reads Mod as Cmd on a Mac", () => {
		onPlatform("MacIntel");
		const { handlers, wrapper } = mountShortcuts();
		key(document.body, "k", { ctrlKey: true });
		key(document.body, "k", { metaKey: true, shiftKey: true });
		expect(handlers["Mod+k"]).not.toHaveBeenCalled();
		expect(key(document.body, "k", { metaKey: true }).defaultPrevented).toBe(true);
		expect(key(document.body, "K", { metaKey: true }).defaultPrevented).toBe(true); // Caps Lock
		expect(handlers["Mod+k"]).toHaveBeenCalledTimes(2);
		wrapper.unmount();
	});

	it("reads Mod as Ctrl everywhere else", () => {
		onPlatform("Win32");
		const { handlers, wrapper } = mountShortcuts();
		key(document.body, "k", { metaKey: true });
		key(document.body, "k", { ctrlKey: true, altKey: true });
		expect(handlers["Mod+k"]).not.toHaveBeenCalled();
		key(document.body, "k", { ctrlKey: true });
		expect(handlers["Mod+k"]).toHaveBeenCalledTimes(1);
		wrapper.unmount();
	});

	it("fires a chord from a field, once, and keeps it from the field's own Enter", () => {
		onPlatform("Win32");
		const { handlers, wrapper } = mountShortcuts();
		const input = focused("input");
		const ownEnter = vi.fn();
		input.addEventListener("keydown", ownEnter);
		const event = key(input, "Enter", { ctrlKey: true });
		key(input, "Enter", { ctrlKey: true, repeat: true });
		expect(event.defaultPrevented).toBe(true);
		expect(handlers["Mod+Enter"]).toHaveBeenCalledTimes(1);
		expect(ownEnter).not.toHaveBeenCalled();
		key(input, "Enter"); // a plain Enter is still the field's
		expect(ownEnter).toHaveBeenCalledTimes(1);
		wrapper.unmount();
	});

	it("stands down while a dialog is open", () => {
		const { handlers, wrapper } = mountShortcuts(() => true);
		key(document.body, "/");
		key(document.body, "k", { ctrlKey: true });
		expect(handlers["/"]).not.toHaveBeenCalled();
		expect(handlers["Mod+k"]).not.toHaveBeenCalled();
		wrapper.unmount();
	});

	it("ignores a keydown that carries no key", () => {
		const { wrapper } = mountShortcuts();
		expect(() => document.body.dispatchEvent(new Event("keydown", { bubbles: true }))).not.toThrow();
		wrapper.unmount();
	});

	it("writes a shortcut for the keyboard in use", () => {
		expect(shortcutLabel("/")).toBe("/");
		expect(shortcutLabel("F8")).toBe("F8");
		expect(shortcutLabel("Mod+k", true)).toBe("⌘K");
		expect(shortcutLabel("Mod+Enter", true)).toBe("⌘↵");
		expect(shortcutLabel("Mod+k", false)).toBe("Ctrl K");
		expect(shortcutLabel("Mod+Enter", false)).toBe("Ctrl ↵");
		onPlatform("MacIntel");
		expect(shortcutLabel("Mod+k")).toBe("⌘K");
	});
});
