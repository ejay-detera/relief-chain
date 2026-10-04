export interface RegisteredOrganizationRecipient {
  organizationId: string;
  name: string;
  slug: string;
  walletAddress: string;
}

export interface DestinationWalletValidation {
  isValidFormat: boolean;
  isAccountActive?: boolean;
  hasRcphpTrustline?: boolean;
  isRcphpAuthorized?: boolean;
  matchedOrganizationName?: string | null;
  matchedOrganizationId?: string | null;
  errorMessage?: string | null;
}

export interface OrganizationTransferPayload {
  destinationWallet: string;
  amountRcphp: string;
  memo?: string;
}

export interface OrganizationTransferResult {
  success: boolean;
  transactionHash?: string;
  ledgerSequence?: number;
  transferId?: string;
  amountRcphp: string;
  senderWallet: string;
  destinationWallet: string;
  timestamp: string;
  errorMessage?: string;
}

export interface OrganizationTransferRecord {
  id: string;
  sender_organization_id: string;
  sender_wallet_address: string;
  destination_wallet_address: string;
  destination_organization_id?: string | null;
  destination_organization_name?: string | null;
  amount_stroops: string;
  amount_rcphp: string;
  transaction_hash: string | null;
  ledger_sequence: number | null;
  memo: string | null;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  error_message: string | null;
  created_at: string;
  confirmed_at: string | null;
}
