// Retries a failing async function a fixed number of times before rethrowing the
// last error. Used to satisfy Requirement 1, Criteria 5-6: 2 automatic silent
// retries (3 total attempts) before treating a query as failed.

export async function fetchWithRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
