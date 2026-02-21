/** Trigger a CSV download from an API endpoint. */
import apiClient from '@/api/client';
import { toast } from 'sonner';

export async function downloadCsv(endpoint: string, filename: string) {
  try {
    const response = await apiClient.get(endpoint, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    toast.success('Export CSV telecharge');
  } catch {
    toast.error("Erreur lors de l'export CSV");
  }
}
