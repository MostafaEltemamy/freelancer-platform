
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? ''
).replace(/\/+$/, '');

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string | undefined;

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function getErrorMessage(data: unknown): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof data.error === 'string'
  ) {
    return data.error;
  }

  return 'Request failed. Please try again.';
}

function getErrorCode(data: unknown): string | undefined {
  if (
    typeof data === 'object' &&
    data !== null &&
    'code' in data &&
    typeof data.code === 'string'
  ) {
    return data.code;
  }

  return undefined;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Invalid API path.');
  }

  const headers = new Headers(options.headers);

  headers.set('Accept', 'application/json');

  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,

        // Include browser-managed session cookies.
        credentials: 'include',

        // Avoid storing authentication responses.
        cache: 'no-store',

        headers,
      },
    );
  } catch {
    throw new ApiError(
      'Unable to connect to the server. Please try again.',
      0,
    );
  }

  // Successful responses without a body.
  if (response.status === 204) {
    return undefined as T;
  }

  const responseText = await response.text();

  let data: unknown = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText) as unknown;
    } catch {
      throw new ApiError(
        'Unexpected response from the server.',
        response.status,
      );
    }
  }

if (!response.ok) {
  throw new ApiError(
    getErrorMessage(data),
    response.status,
    getErrorCode(data),
  );
}

  return data as T;
}
