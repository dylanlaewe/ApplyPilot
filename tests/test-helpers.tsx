import { cleanup } from "@testing-library/react";
import { JSDOM } from "jsdom";

let dom: JSDOM | null = null;

export function setupDom() {
  dom?.window.close();
  dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/"
  });

  const { window } = dom;

  (globalThis as any).window = window;
  (globalThis as any).self = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: window.navigator
  });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLInputElement = window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
  globalThis.HTMLButtonElement = window.HTMLButtonElement;
  globalThis.HTMLSelectElement = window.HTMLSelectElement;
  globalThis.Node = window.Node;
  globalThis.Event = window.Event;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.FocusEvent = window.FocusEvent;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.getComputedStyle = window.getComputedStyle;
  globalThis.MutationObserver = window.MutationObserver;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => setTimeout(callback, 0)) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
  (window.HTMLElement.prototype as HTMLElement & { attachEvent?: () => void; detachEvent?: () => void }).attachEvent = () => undefined;
  (window.HTMLElement.prototype as HTMLElement & { attachEvent?: () => void; detachEvent?: () => void }).detachEvent = () => undefined;

  return () => {
    cleanup();
    dom?.window.close();
    dom = null;
  };
}

export function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
