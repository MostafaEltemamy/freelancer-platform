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

interface ValidationIssue {
  field: string;
  message: string;
}

function getValidationIssues(
  data: Record<string, unknown>,
): ValidationIssue[] {
  if (!Array.isArray(data.issues)) {
    return [];
  }

  return data.issues.flatMap((issue): ValidationIssue[] => {
    if (
      typeof issue !== 'object' ||
      issue === null ||
      !('field' in issue) ||
      !('message' in issue) ||
      typeof issue.field !== 'string' ||
      typeof issue.message !== 'string'
    ) {
      return [];
    }

    return [{
      field: issue.field,
      message: issue.message,
    }];
  });
}

/**
 * Translate server validation details into a message
 * suitable for users.
 *
 * Internal schema paths and technical field names
 * should not appear in the application interface.
 */
function getErrorMessage(data: unknown): string {
  if (
    typeof data !== 'object' ||
    data === null
  ) {
    return 'Something went wrong. Please try again.';
  }

  const response = data as Record<string, unknown>;

  const fallback =
    typeof response.error === 'string'
      ? response.error
      : 'Something went wrong. Please try again.';

  const issues = getValidationIssues(response);

  if (issues.length === 0) {
    return fallback;
  }

  // Unknown properties indicate a mismatch between
  // the frontend payload and the backend schema.
  // This is not something the user should have to fix.
  if (
    issues.some((issue) =>
      issue.message.startsWith('Unrecognized key')
    )
  ) {
    return (
      "We couldn't save your changes due to an " +
      'unexpected problem. Your edits are still here. ' +
      'Please try again.'
    );
  }

  if (
    issues.some((issue) =>
      issue.field.startsWith('content.')
    )
  ) {
    return (
      'Some custom project details need attention. ' +
      'Please check your section names, field names, ' +
      'and values before saving.'
    );
  }

  if (
    issues.some((issue) =>
      issue.field === 'slug'
    )
  ) {
    return (
      'Please check your project link name. ' +
      'Use lowercase letters, numbers, and hyphens.'
    );
  }

  if (
    issues.some((issue) =>
      issue.field === 'title'
    )
  ) {
    return (
      'Please enter a project title between ' +
      '3 and 160 characters.'
    );
  }

  if (
    issues.some((issue) =>
      issue.field === 'startedOn' ||
      issue.field === 'endedOn'
    )
  ) {
    return 'Please check the project dates and try again.';
  }

  return (
    'Some information needs attention. ' +
    'Please review your entries and try again.'
  );
}

function getErrorCode(
  data: unknown,
): string | undefined {
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
  if (
    !path.startsWith('/') ||
    path.startsWith('//')
  ) {
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

        credentials: 'include',
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
    // Technical diagnostics are available only
    // in local development.
    if (
      import.meta.env.DEV &&
      response.status === 400 &&
      typeof data === 'object' &&
      data !== null &&
      'issues' in data &&
      Array.isArray(data.issues)
    ) {
      console.debug(
        'API validation details:',
        data.issues,
      );
    }

    throw new ApiError(
      getErrorMessage(data),
      response.status,
      getErrorCode(data),
    );
  }

  return data as T;
}
