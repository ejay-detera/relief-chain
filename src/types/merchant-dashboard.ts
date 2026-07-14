export type MerchantPayment = {
  id: string;
  payerName: string;
  occurredAt: string;
  amount: number;
};

export type MerchantProgram = {
  id: string;
  name: string;
  completion: number;
  description: string;
  merchantId: string;
  status: 'Active';
};
