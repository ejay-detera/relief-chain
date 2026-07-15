import { File } from 'expo-file-system';

import type { SelectedDocumentAsset } from '@/types/registration';

const mimeTypesByExtension: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
};

export const getDocumentContentType = ({ mimeType, name }: SelectedDocumentAsset): string => {
  if (mimeType?.trim()) return mimeType;

  const extension = name.split('.').pop()?.toLowerCase();
  return (extension && mimeTypesByExtension[extension]) || 'application/octet-stream';
};

export const readDocumentForUpload = async (document: SelectedDocumentAsset) => ({
  body: await new File(document.uri).arrayBuffer(),
  contentType: getDocumentContentType(document),
});
