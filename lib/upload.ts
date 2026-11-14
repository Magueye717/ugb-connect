import { File } from 'expo-file-system';

import { API_URL, ApiError, session } from '@/lib/api';

export type UploadedImage = { id: string; url: string; width: number; height: number };
export type UploadedDocument = { id: string; url: string; name: string; bytes: number; pages?: number | null };
type Purpose = 'banner' | 'event' | 'lost' | 'business' | 'place' | 'avatar' | 'alert';

/**
 * Sends a picture picked on the phone (expo-image-picker `uri`) to the server, which checks and re-encodes it.
 * Returns its id, to attach it to a banner or an event.
 *
 * The global fetch is expo/fetch (SDK 58): FormData takes a real Blob, so the picked file is wrapped in
 * expo-file-system's File (React Native's old `{ uri, name, type }` object isn't understood and fails the request).
 * The server reads the real format from the bytes, so the file name and type sent don't matter.
 */
export async function uploadImage(asset: { uri: string; file?: Blob; width?: number; height?: number }, purpose: Purpose): Promise<UploadedImage> {
  // `file`: a picture picked as a file (the file picker): sent as it is, like a PDF.
  if (asset.file) return send<UploadedImage>('images', asset.file, purpose, undefined, 'Envoi de l’image impossible.');
  return send<UploadedImage>('images', await adapt(asset), purpose, undefined, 'Envoi de l’image impossible.');
}

/** Longest side sent: the server keeps 1600 px; a little more leaves it room to sharpen. */
const SEND_SIDE = 2000;

/**
 * Any photo the phone has (a 48 MP shot, a HEIC, a PNG screenshot, a WhatsApp image) made easy to send: turned into a
 * JPEG of at most 2000 px, a few hundred KB. Big or odd files were the ones refused (too heavy, unknown format) or
 * slow on mobile data. If the phone can't (an old app build without the module), the original goes as it is.
 */
async function adapt(asset: { uri: string; width?: number; height?: number }): Promise<string> {
  try {
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const ctx = ImageManipulator.manipulate(asset.uri);
    const w = asset.width ?? 0;
    const h = asset.height ?? 0;
    if (Math.max(w, h) > SEND_SIDE) ctx.resize(w >= h ? { width: SEND_SIDE } : { height: SEND_SIDE });
    const image = await ctx.renderAsync();
    // Size unknown beforehand (some pickers don't say): checked on the rendered image.
    const big = !w && Math.max(image.width, image.height) > SEND_SIDE;
    const final = big ? await ImageManipulator.manipulate(asset.uri).resize(image.width >= image.height ? { width: SEND_SIDE } : { height: SEND_SIDE }).renderAsync() : image;
    const saved = await final.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
    return saved.uri;
  } catch {
    return asset.uri;
  }
}

/**
 * A PDF (an announcement's notice): kept as sent, under its own name. `file`: the picked file itself (on phones,
 * expo-file-system's picker; on the web, the browser's File), sent as it is.
 */
export function uploadDocument(doc: { uri: string; name: string; file?: Blob }, purpose: Purpose): Promise<UploadedDocument> {
  return send<UploadedDocument>('files', doc.file ?? doc.uri, purpose, doc.name, 'Envoi du document impossible.');
}

async function send<T>(kind: 'images' | 'files', file: string | Blob, purpose: Purpose, name: string | undefined, failure: string): Promise<T> {
  const token = await session.accessToken();
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Connecte-toi pour continuer.');
  const form = new FormData();
  const part = typeof file === 'string' ? new File(file) : file;
  if (name) form.append('file', part, name);
  else form.append('file', part);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/media/${kind}?purpose=${purpose}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: form });
  } catch (err) {
    throw new ApiError(0, 'NETWORK', `Connexion impossible. Vérifie ta connexion internet et réessaie.${__DEV__ ? `\n\n${err instanceof Error ? err.message : String(err)}` : ''}`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.code ?? 'HTTP_ERROR', data?.message ?? failure);
  return data as T;
}
