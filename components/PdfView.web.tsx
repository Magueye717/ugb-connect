import { colors, radii } from '@/constants/theme';

/** Web: the browser shows the PDF itself. */
export function PdfView({ url }: { url: string; onError?: () => void }) {
  return <iframe src={url} title="Document" style={{ width: '100%', height: 560, border: 0, borderRadius: radii.md, background: colors.bg }} />;
}
