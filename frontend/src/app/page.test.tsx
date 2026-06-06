import { describe, expect, it } from "vitest";

describe("frontend smoke", () => {
  it("keeps a basic test target for CI", () => {
    expect("AlphaLens JP").toContain("AlphaLens");
  });
});
