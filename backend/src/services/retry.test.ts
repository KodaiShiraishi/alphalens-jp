import { describe, expect, it } from "vitest";
import { withRetry } from "./retry.js";

describe("withRetry", () => {
  it("retries transient failures and returns the successful result", async () => {
    let calls = 0;
    const retryAttempts: number[] = [];

    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("temporary");
        return "ok";
      },
      {
        maxRetries: 2,
        delayMs: 0,
        onRetry: ({ attempt }) => {
          retryAttempts.push(attempt);
        }
      }
    );

    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(retryAttempts).toEqual([1, 2]);
  });

  it("does not retry when shouldRetry rejects the error", async () => {
    let calls = 0;

    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error("permanent");
        },
        {
          maxRetries: 2,
          delayMs: 0,
          shouldRetry: () => false
        }
      )
    ).rejects.toThrow("permanent");

    expect(calls).toBe(1);
  });
});
