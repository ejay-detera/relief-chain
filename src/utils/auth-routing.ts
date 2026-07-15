import type { Href } from 'expo-router';

import type { UserRole } from '@/types/auth';

export type RoleGroup = '(lgu)' | '(beneficiary)' | '(merchant)';

const roleGroups: Record<UserRole, RoleGroup> = {
  lgu: '(lgu)',
  beneficiary: '(beneficiary)',
  merchant: '(merchant)',
};

const roleHomes: Record<UserRole, Href> = {
  lgu: '/(lgu)',
  beneficiary: '/(beneficiary)',
  merchant: '/(merchant)' as Href,
};

const authContinuationRoutes = new Set(['verify-email', 'registration-success', 'forgot-password']);

export const getRoleGroup = (role: UserRole): RoleGroup => roleGroups[role];
export const getRoleHome = (role: UserRole): Href => roleHomes[role];
export const isRoleGroup = (segment: string | undefined): segment is RoleGroup =>
  segment === '(lgu)' || segment === '(beneficiary)' || segment === '(merchant)';
export const isRoleGroupForRole = (
  segment: string | undefined,
  role: UserRole,
): boolean => segment === getRoleGroup(role);
export const isAuthContinuationRoute = (route: string | undefined): boolean =>
  route !== undefined && authContinuationRoutes.has(route);
