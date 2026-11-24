import { formatBytesAsMegabytes } from '../../../utils/formatBytes';

export const VAD_OPTIONS = [1000, 1500, 2200, 3000] as const;

export function formatBytes(bytes: number | null | undefined): string {
  return formatBytesAsMegabytes(bytes);
}
