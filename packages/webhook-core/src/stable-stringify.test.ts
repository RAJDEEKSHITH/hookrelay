import { describe, expect, it } from "vitest";
import { stableStringify } from "./stable-stringify";

describe("stableStringify", () => {
  it("ignores key order at every level", () => {
    const a = { b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } };
    const b = { a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(stableStringify(a)).toBe('{"a":{"c":null,"d":[1,{"x":1,"y":2}]},"b":1}');
  });

  it("keeps array order", () => {
    expect(stableStringify([2, 1])).not.toBe(stableStringify([1, 2]));
  });

  it("distinguishes different values", () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: "1" }));
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 1, b: 2 }));
  });

  it("matches JSON.stringify for primitives and undefined members", () => {
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(stableStringify([undefined])).toBe("[null]");
  });
});
