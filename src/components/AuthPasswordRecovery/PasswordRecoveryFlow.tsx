
import type { PasswordRecoveryCode, PasswordRecoveryCodeIndex, PasswordRecoveryStep } from '@/types/auth';

import { PasswordRecoverySuccess } from './PasswordRecoverySuccess';
import { RecoveryCodeStep } from './RecoveryCodeStep';
import { ResetPasswordStep } from './ResetPasswordStep';

type PasswordRecoveryFlowProps = {
  code: PasswordRecoveryCode;
  confirmPassword: string;
  email: string;
  expiresIn: string | null;
  isPasswordValid: boolean;
  isResending: boolean;
  isUpdatingPassword: boolean;
  isVerifying: boolean;
  newPassword: string;
  step: PasswordRecoveryStep;
  onChangeCode: (index: PasswordRecoveryCodeIndex, value: string) => void;
  onClose: () => void;
  onConfirmPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onPasteCode: (index: PasswordRecoveryCodeIndex, value: string) => void;
  onResend: () => void;
  onSubmitPassword: () => void;
  onVerifyCode: () => void;
};

export const PasswordRecoveryFlow = ({
  code,
  confirmPassword,
  email,
  expiresIn,
  isPasswordValid,
  isResending,
  isUpdatingPassword,
  isVerifying,
  newPassword,
  step,
  onChangeCode,
  onClose,
  onConfirmPasswordChange,
  onNewPasswordChange,
  onPasteCode,
  onResend,
  onSubmitPassword,
  onVerifyCode,
}: PasswordRecoveryFlowProps) => {
  if (step === 'code') {
    return (
      <RecoveryCodeStep
        code={code}
        email={email}
        expiresIn={expiresIn}
        isResending={isResending}
        isVerifying={isVerifying}
        onChangeCode={onChangeCode}
        onClose={onClose}
        onPasteCode={onPasteCode}
        onResend={onResend}
        onVerify={onVerifyCode}
      />
    );
  }

  if (step === 'reset') {
    return (
      <ResetPasswordStep
        confirmPassword={confirmPassword}
        isPasswordValid={isPasswordValid}
        isUpdating={isUpdatingPassword}
        newPassword={newPassword}
        onClose={onClose}
        onConfirmPasswordChange={onConfirmPasswordChange}
        onNewPasswordChange={onNewPasswordChange}
        onSubmit={onSubmitPassword}
      />
    );
  }

  return <PasswordRecoverySuccess onBack={onClose} />;
};
