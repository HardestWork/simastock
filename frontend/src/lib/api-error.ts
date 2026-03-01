/** Extract a user-friendly error message from an Axios/API error. */
import type { AxiosError } from 'axios';

interface ApiErrorData {
  detail?: string;
  non_field_errors?: string[];
  [key: string]: unknown;
}

/**
 * Extract the most relevant error message from an API error response.
 *
 * Checks `detail`, `non_field_errors`, then falls back to the JS Error message
 * or a generic French string.
 */
export function extractApiError(error: unknown, fallback = 'Une erreur est survenue.'): string {
  const axErr = error as AxiosError<ApiErrorData>;
  return (
    axErr?.response?.data?.detail ??
    axErr?.response?.data?.non_field_errors?.[0] ??
    (error as Error)?.message ??
    fallback
  );
}
