import { supabase } from '@/lib/supabase';
import { getDocumentContentType, readDocumentForUpload } from '@/utils/document-upload';
import type { SelectedDocumentAsset } from '@/types/registration';
import type { PickedFile } from '@/components/beneficiary/Appeals/document-uploader';

const BUCKET = 'beneficiary_documents';

/**
 * Uploads a document picked via `expo-document-picker` to the
 * `beneficiary_documents` Storage bucket under the current user's own
 * `{uid}/{folder}/` prefix (required by the bucket's insert RLS policy —
 * see `20261002130000_add_beneficiary_submission_storage.sql`), and returns
 * the Storage object path (not a signed URL — those expire and should be
 * generated on demand by whoever is viewing the document).
 *
 * `PickedFile.uri` from `expo-document-picker` is a local device cache path;
 * this is what actually moves the bytes into Storage so a reviewer on a
 * different device/session can later read the file back via
 * `createSignedUrl`.
 */
export const uploadBeneficiaryDocument = async (
  file: PickedFile,
  folder: 'appeals' | 'requirements'
): Promise<string> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('You must be signed in to upload a document.');

  const asset: SelectedDocumentAsset = {
    name: file.name,
    uri: file.uri,
    mimeType: file.mimeType ?? null,
    size: file.size,
  };

  const { body, contentType } = await readDocumentForUpload(asset);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: contentType || getDocumentContentType(asset) });

  if (error) throw error;
  return path;
};

/** Uploads multiple files sequentially and returns their Storage object paths. */
export const uploadBeneficiaryDocuments = async (
  files: PickedFile[],
  folder: 'appeals' | 'requirements'
): Promise<string[]> => {
  const paths: string[] = [];
  for (const file of files) {
    paths.push(await uploadBeneficiaryDocument(file, folder));
  }
  return paths;
};

/** Generates a short-lived signed URL for a previously uploaded document path. */
export const getSignedDocumentUrl = async (path: string, expiresInSeconds = 300): Promise<string> => {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
};
