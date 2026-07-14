import type { MerchantRegistrationData, MerchantRegistrationStep as MerchantRegistrationStepType } from '@/types/merchant-registration';

import { AccountStep } from './AccountStep';
import { BusinessInformationStep } from './BusinessInformationStep';
import { OwnerInformationStep } from './OwnerInformationStep';
import { WalletVerificationStep } from './WalletVerificationStep';

type MerchantRegistrationStepProps = {
  data: MerchantRegistrationData;
  isSubmitting: boolean;
  onChange: (values: Partial<MerchantRegistrationData>) => void;
  onNext: () => void;
  onSubmit: () => void;
  step: MerchantRegistrationStepType;
};

export function MerchantRegistrationStep({
  data,
  isSubmitting,
  onChange,
  onNext,
  onSubmit,
  step,
}: MerchantRegistrationStepProps) {
  switch (step) {
    case 1:
      return <BusinessInformationStep data={data} onChange={onChange} onNext={onNext} />;
    case 2:
      return <OwnerInformationStep data={data} onChange={onChange} onNext={onNext} />;
    case 3:
      return (
        <WalletVerificationStep
          data={data}
          onChange={onChange}
          onNext={onNext}
        />
      );
    case 4:
      return <AccountStep data={data} isSubmitting={isSubmitting} onChange={onChange} onSubmit={onSubmit} />;
  }
}
