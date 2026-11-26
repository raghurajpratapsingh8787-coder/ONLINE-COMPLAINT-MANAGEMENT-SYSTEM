// In-memory JWT access token store (never written to localStorage or sessionStorage)
let memoryAccessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  memoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return memoryAccessToken;
}

export class ApiError extends Error {
  public status: number;
  public details?: Array<{ field: string; message: string }>;

  constructor(message: string, status: number, details?: Array<{ field: string; message: string }>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function silentRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'ResolveDesk',
        },
      });
      if (!res.ok) {
        memoryAccessToken = null;
        return null;
      }
      const data = await res.json();
      memoryAccessToken = data.accessToken || null;
      return memoryAccessToken;
    } catch {
      memoryAccessToken = null;
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { skipAuthRetry?: boolean } = {}
): Promise<T> {
  const { skipAuthRetry, headers: extraHeaders, ...rest } = options;
  const headers: Record<string, string> = {
    'X-Requested-With': 'ResolveDesk',
    ...(extraHeaders as Record<string, string>),
  };

  if (!(rest.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (memoryAccessToken) {
    headers.Authorization = `Bearer ${memoryAccessToken}`;
  }

  let res = await fetch(path, {
    ...rest,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !skipAuthRetry && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/refresh')) {
    const newToken = await silentRefresh();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(path, {
        ...rest,
        headers,
        credentials: 'include',
      });
    }
  }

  if (!res.ok) {
    let payload: { error?: string; details?: Array<{ field: string; message: string }> } = {};
    try {
      payload = await res.json();
    } catch {
      // ignore non-json error body
    }
    throw new ApiError(payload.error || `Request failed (${res.status})`, res.status, payload.details);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiFetchBlob(path: string): Promise<{ blob: Blob; contentType: string }> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'ResolveDesk',
  };
  if (memoryAccessToken) {
    headers.Authorization = `Bearer ${memoryAccessToken}`;
  }

  let res = await fetch(path, { headers, credentials: 'include' });
  if (res.status === 401) {
    const newToken = await silentRefresh();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(path, { headers, credentials: 'include' });
    }
  }
  if (!res.ok) {
    throw new ApiError('Unable to download authorized file.', res.status);
  }
  const blob = await res.blob();
  return { blob, contentType: res.headers.get('content-type') || 'application/octet-stream' };
}
