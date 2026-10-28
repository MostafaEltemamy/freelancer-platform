export async function checkApiHealth(signal: AbortSignal): Promise<void> {
  const response = await fetch('/api/health', {
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`API returned HTTP ${response.status}.`);
  }

  const data: unknown = await response.json();

  if (
    typeof data !== 'object' ||
    data === null ||
    !('status' in data) ||
    data.status !== 'ok' ||
    !('service' in data) ||
    data.service !== 'freelancer-platform-api'
  ) {
    throw new Error('The API returned an unexpected response.');
  }
}