// Mandatory pilot financial disclosures. The RCPHP asset is a Stellar testnet
// asset with no monetary value; every balance surface must state this plainly
// so a user can never mistake pilot data for real money (Requirements 1.2, 21.5).

export const PILOT_ASSET_CODE = 'RCPHP' as const;
export const PILOT_NETWORK_LABEL = 'Testnet' as const;
export const PILOT_NO_VALUE_LABEL = 'No real monetary value' as const;
