/** Re-export sonner's toast with typed convenience wrappers. */
import { toast } from 'sonner';

export { toast };

export const showSuccess = (message: string) => toast.success(message);
export const showError = (message: string) => toast.error(message);
export const showInfo = (message: string) => toast.info(message);
export const showWarning = (message: string) => toast.warning(message);
