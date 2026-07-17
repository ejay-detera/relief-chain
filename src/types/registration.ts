export type SelectedDocumentAsset = {
  name: string;
  uri: string;
  mimeType: string | null;
  size?: number;
};

export type RegistrationStatus = 'Pending' | 'Approved' | 'Rejected';

export type RegistrationSummary = {
  id: string;
  status: RegistrationStatus;
  rejectionReason: string | null;
};
