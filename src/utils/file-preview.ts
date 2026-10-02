// Shared, pure helpers for previewing a reviewed document (government ID,
// program requirement upload, or appeal attachment) from its Storage object
// path / signed URL. Consolidates logic that was previously duplicated across
// `BeneficiaryDetailModal`, `RequirementResponsesReview`, and
// `AppealsReviewSection` — none of those files move or persist anything, they
// only decide how to render an already-signed URL.

export type FileKind = 'image' | 'pdf' | 'office' | 'other';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']);
const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);

/** Extracts the lowercase extension from a file name or Storage path, ignoring any query string. */
export const extensionOf = (nameOrUrl: string): string | null => {
  const withoutQuery = nameOrUrl.split('?')[0];
  const ext = withoutQuery.split('.').pop()?.toLowerCase();
  return ext && ext !== withoutQuery.toLowerCase() ? ext : null;
};

/** Classifies a file by extension so the preview modal can pick a rendering strategy. */
export const inferFileKind = (nameOrUrl: string | null | undefined): FileKind => {
  if (!nameOrUrl) return 'other';
  const ext = extensionOf(nameOrUrl);
  if (!ext) return 'other';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (OFFICE_EXTENSIONS.has(ext)) return 'office';
  return 'other';
};

/**
 * Legacy requirement/appeal/ID uploads submitted before Storage-backed
 * upload services existed may still carry a raw device-local
 * `file://`/`content://` URI rather than a Storage object path — those can
 * never be opened remotely (the file lives only on the beneficiary's old
 * device), so callers should not offer a "View" action for them.
 */
export const isStoragePath = (pathOrUrl: string): boolean =>
  !pathOrUrl.startsWith('file://') && !pathOrUrl.startsWith('content://');

/**
 * Builds the URL to actually open for a given signed Storage URL. Images and
 * PDFs render natively in the device's in-app browser; Office formats
 * (docx/xlsx/pptx) have no native renderer on iOS/Android or in Expo, so they
 * are routed through Google's public document viewer, which fetches the
 * signed URL server-side and renders a preview — no extra app dependency
 * required.
 */
export const buildPreviewTarget = (kind: FileKind, signedUrl: string): string => {
  if (kind === 'office') {
    return `https://docs.google.com/gview?url=${encodeURIComponent(signedUrl)}&embedded=true`;
  }
  return signedUrl;
};
