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
 * Checks `detail`, `non_field_errors`, field-level errors, then falls back
 * to the JS Error message or a generic French string.
 */
export function extractApiError(error: unknown, fallback = 'Une erreur est survenue.'): string {
  const axErr = error as AxiosError<ApiErrorData>;
  const data = axErr?.response?.data;

  if (data?.detail) return data.detail;
  if (data?.non_field_errors?.[0]) return data.non_field_errors[0];

  // DRF field-level validation errors: { field_name: ["error msg", ...], ... }
  if (data && typeof data === 'object') {
    const fieldErrors: string[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') {
        fieldErrors.push(`${key}: ${val.join(', ')}`);
      } else if (typeof val === 'string') {
        fieldErrors.push(`${key}: ${val}`);
      }
    }
    if (fieldErrors.length > 0) return fieldErrors.join(' | ');
  }

  return (error as Error)?.message ?? fallback;
}
