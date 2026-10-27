// Runs the static autosave script against a minimal stand-in for the DOM and localStorage.
import { describe, expect, it } from "vitest";
import { AUTOSAVE_JS } from "../../src/views/autosave.ts";

type Field = { name: string; value: string };

function page(opts: { form?: { key: string; fields: Field[] }; clearKey?: string; storage: Map<string, string>; throwing?: boolean }) {
  const listeners: Record<string, () => void> = {};
  const form = opts.form && {
    elements: opts.form.fields,
    getAttribute: () => opts.form!.key,
    addEventListener: (ev: string, fn: () => void) => (listeners[ev] = fn),
  };
  const clear = opts.clearKey === undefined ? null : { getAttribute: () => opts.clearKey };
  const document = { querySelector: (sel: string) => (sel.includes("clear") ? clear : (form ?? null)) };
  const localStorage = {
    getItem: (k: string) => (opts.throwing ? (() => { throw new Error("blocked"); })() : (opts.storage.get(k) ?? null)),
    setItem: (k: string, v: string) => opts.storage.set(k, v),
    removeItem: (k: string) => opts.storage.delete(k),
  };
  new Function("window", "document", AUTOSAVE_JS)({ localStorage }, document);
  return listeners;
}

describe("composer autosave script", () => {
  it("restores saved values into empty fields only, then saves on input", () => {
    const storage = new Map([["k", JSON.stringify({ f0_who: "Marta Exemplo", f0_num: "0493" })]]);
    const fields = [
      { name: "f0_who", value: "" },
      { name: "f0_num", value: "typed by server" },
      { name: "", value: "" },
    ];
    const listeners = page({ form: { key: "k", fields }, storage });
    expect(fields.map((f) => f.value)).toEqual(["Marta Exemplo", "typed by server", ""]);
    fields[0].value = "Rui Exemplo";
    listeners.input();
    expect(JSON.parse(storage.get("k")!)).toEqual({ f0_who: "Rui Exemplo", f0_num: "typed by server" });
  });

  it("drops the draft named by the clear marker", () => {
    const storage = new Map([["k", "{}"], ["other", "{}"]]);
    page({ clearKey: "k", storage });
    expect([...storage.keys()]).toEqual(["other"]);
  });

  it("does nothing when storage is blocked", () => {
    const fields = [{ name: "f0_who", value: "" }];
    expect(() => page({ form: { key: "k", fields }, storage: new Map(), throwing: true })).not.toThrow();
    expect(fields[0].value).toBe("");
  });
});
