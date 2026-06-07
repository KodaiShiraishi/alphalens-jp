export type RetryOptions = {
  maxRetries: number;
  delayMs: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (input: { attempt: number; nextAttempt: number; error: unknown }) => Promise<void> | void;
};

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  let attempt = 1;
  for (;;) {
    try {
      return await operation();
    } catch (error) {
      const hasRetryLeft = attempt <= options.maxRetries;
      const retryable = options.shouldRetry ? options.shouldRetry(error) : true;
      if (!hasRetryLeft || !retryable) throw error;
      await options.onRetry?.({ attempt, nextAttempt: attempt + 1, error });
      if (options.delayMs > 0) {
        await sleep(options.delayMs * attempt);
      }
      attempt += 1;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
