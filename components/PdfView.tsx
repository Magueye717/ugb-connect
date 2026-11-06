import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { colors, radii, typo } from '@/constants/theme';

/** pdf.js draws the pages (Android's WebView can't show a PDF by itself; iOS's would, but one way for both). */
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
/** A long document stops here: the rest is one tap away ("Ouvrir le document"). */
const MAX_PAGES = 20;

type Props = {
  url: string;
  /** The pages couldn't be drawn (no connection, damaged file): the screen offers to open it instead. */
  onError?: () => void;
};

/**
 * The pages of a PDF, one under the other, at the width of the screen. As tall as its pages (no scrolling of its
 * own): it scrolls with the screen around it. The page is given the PDF's own address as its origin, so pdf.js may
 * read the file whatever the server's CORS settings.
 */
export function PdfView({ url, onError }: Props) {
  const [height, setHeight] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [cut, setCut] = useState(0);
  const origin = url.match(/^https?:\/\/[^/]+/)?.[0];
  const html = useMemo(() => page(url), [url]);

  const onMessage = (e: WebViewMessageEvent) => {
    const m = JSON.parse(e.nativeEvent.data) as { type: string; value?: number };
    if (m.type === 'height' && m.value) {
      setHeight(Math.ceil(m.value));
      setState('ready');
    } else if (m.type === 'pages' && m.value && m.value > MAX_PAGES) setCut(m.value);
    else if (m.type === 'error') {
      setState('error');
      onError?.();
    }
  };

  if (!origin || state === 'error')
    return (
      <View style={styles.failed}>
        <Ionicons name="document-text-outline" size={22} color={colors.muted2} />
        <Text style={styles.failedText}>Aperçu indisponible. Ouvre le document ci-dessous.</Text>
      </View>
    );

  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: height || 220 }}>
        <WebView
          source={{ html, baseUrl: `${origin}/` }}
          originWhitelist={['*']}
          onMessage={onMessage}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          style={styles.web}
          onError={() => {
            setState('error');
            onError?.();
          }}
        />
        {state === 'loading' && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Chargement du document…</Text>
          </View>
        )}
      </View>
      {cut > 0 && (
        <Text style={styles.cut}>
          Les {MAX_PAGES} premières pages sur {cut}. Ouvre le document pour lire la suite.
        </Text>
      )}
    </View>
  );
}

const page = (url: string) => `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
html, body { margin: 0; padding: 0; background: transparent; }
canvas { display: block; width: 100%; height: auto; margin: 0 0 10px; border-radius: 8px; background: #fff; box-shadow: 0 1px 3px rgba(10,16,40,0.15); }
</style>
<script src="${PDFJS}/pdf.min.js"></script>
</head><body><div id="pages"></div><script>
const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
const report = () => post({ type: 'height', value: document.body.scrollHeight });
(async () => {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS}/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument(${JSON.stringify(url)}).promise;
    post({ type: 'pages', value: pdf.numPages });
    const width = document.body.clientWidth;
    // Sharp enough to read, light enough for a phone's memory.
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    for (let i = 1; i <= Math.min(pdf.numPages, ${MAX_PAGES}); i++) {
      const p = await pdf.getPage(i);
      const base = p.getViewport({ scale: 1 });
      const vp = p.getViewport({ scale: (width / base.width) * ratio });
      const c = document.createElement('canvas');
      c.width = vp.width;
      c.height = vp.height;
      document.getElementById('pages').appendChild(c);
      await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      report();
    }
  } catch (e) {
    post({ type: 'error', value: String((e && e.message) || e) });
  }
})();
</script></body></html>`;

const styles = StyleSheet.create({
  web: { backgroundColor: 'transparent' },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radii.md, backgroundColor: colors.bg },
  loadingText: { ...typo.small, color: colors.muted2 },
  cut: { ...typo.caption, color: colors.muted2, textAlign: 'center' },
  failed: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radii.md, backgroundColor: colors.bg },
  failedText: { ...typo.small, color: colors.muted2, flex: 1 },
});
