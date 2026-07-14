export type PasswordCriteria = {
  hasLowercase: boolean;
  hasNumber: boolean;
  hasNoSpaces: boolean;
  hasSpecialCharacter: boolean;
  hasUppercase: boolean;
  meetsMinimumLength: boolean;
};

export function getPasswordCriteria(password: string): PasswordCriteria {
  return {
    meetsMinimumLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialCharacter: /[^A-Za-z0-9]/.test(password),
    hasNoSpaces: !/\s/.test(password),
  };
}

export function isStrongPassword(password: string): boolean {
  const criteria = getPasswordCriteria(password);

  return (
    criteria.meetsMinimumLength &&
    criteria.hasUppercase &&
    criteria.hasLowercase &&
    criteria.hasNumber &&
    criteria.hasSpecialCharacter &&
    criteria.hasNoSpaces
  );
}
