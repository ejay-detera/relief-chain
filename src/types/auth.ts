export const PASSWORD_RECOVERY_OTP_LENGTH = 8;

export type PasswordRecoveryStep = 'code' | 'reset' | 'success';

export type PasswordRecoveryCode = string[];

export type PasswordRecoveryCodeIndex = number;
