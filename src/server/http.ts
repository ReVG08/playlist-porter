export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: unknown) {
    super(message);
  }
}

const retryable = new Set([408, 429, 500, 502, 503, 504]);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function requestJson<T>(url: string, init: RequestInit = {}, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response.status === 204 ? (undefined as T) : (await response.json()) as T;
      const text = await response.text();
      let details: unknown = text;
      try { details = JSON.parse(text); } catch { /* keep text */ }
      if (!retryable.has(response.status) || attempt === attempts - 1) {
        throw new ApiError(readableError(response.status, details), response.status, details);
      }
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 500 * 2 ** attempt + Math.random() * 250);
      await pause(waitMs);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      lastError = error;
      if (attempt === attempts - 1) break;
      await pause(500 * 2 ** attempt);
    }
  }
  throw new ApiError(`Network request failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`, 502);
}

function readableError(status: number, details: unknown): string {
  const data = details as { error?: { message?: string; reason?: string } | string; errors?: Array<{ detail?: string; title?: string }> };
  const message = typeof data?.error === 'string' ? data.error : data?.error?.message ?? data?.errors?.[0]?.detail ?? data?.errors?.[0]?.title;
  if (status === 401) return `Authentication expired or was rejected${message ? `: ${message}` : '.'}`;
  if (status === 403) return `The service refused this operation. Check app access, account eligibility, and OAuth scopes${message ? `: ${message}` : '.'}`;
  if (status === 429) return `The service rate limit was reached after retries${message ? `: ${message}` : '.'}`;
  return message ? `${status}: ${message}` : `The music service returned HTTP ${status}.`;
}

export async function allPages<T>(firstUrl: string, init: RequestInit, read: (data: any) => { items: T[]; next?: string | null }): Promise<T[]> {
  const output: T[] = [];
  let url: string | null | undefined = firstUrl;
  while (url) {
    const data = await requestJson<unknown>(url, init);
    const page = read(data);
    output.push(...page.items);
    url = page.next;
  }
  return output;
}
