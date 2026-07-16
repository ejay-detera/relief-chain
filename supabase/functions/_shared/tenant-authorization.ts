// Canonical tenant-isolation authorization model.
//
// This module encodes the composed Row Level Security predicates that scope
// private operational data by organization, exactly as enforced by the applied
// migrations:
//   - 20260716040000_scope_private_data_by_organization.sql
//   - 20260716050000_add_audit_events_and_mfa_policies.sql
//   - 20260716051000_harden_financial_mutation_paths.sql
//
// The database (Postgres RLS) remains the authoritative enforcement point. This
// model is the single shared specification of tenant isolation that trusted
// Edge Functions reuse for server-side authorization and that Property 5
// (Tenant Isolation) exercises across randomly generated worlds. Keeping the
// predicate logic here — rather than duplicated inline — ensures the property
// test validates one leak-free encoding rather than a tautology.
//
// Validates: Requirements 2.4, 2.5, 23.7

export type OrganizationRole =
  | 'organization_administrator'
  | 'program_manager'
  | 'beneficiary_verifier'
  | 'finance_approver'
  | 'auditor';

export const ORGANIZATION_ROLES: readonly OrganizationRole[] = [
  'organization_administrator',
  'program_manager',
  'beneficiary_verifier',
  'finance_approver',
  'auditor',
];

export type AuthenticatorAssuranceLevel = 'aal1' | 'aal2';

export interface Membership {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: OrganizationRole;
  readonly isActive: boolean;
}

export interface Organization {
  readonly id: string;
}

export interface Program {
  readonly id: string;
  readonly organizationId: string;
  readonly status: 'draft' | 'active';
  readonly createdBy: string;
}

export interface BeneficiaryIdentity {
  readonly id: string;
  readonly userId: string | null;
}

export interface Enrollment {
  readonly id: string;
  readonly programId: string;
  readonly beneficiaryUserId: string | null;
  readonly beneficiaryIdentityId: string | null;
}

export interface Redemption {
  readonly id: string;
  readonly enrollmentId: string;
  readonly beneficiaryUserId: string | null;
}

export interface Disbursement {
  readonly id: string;
  readonly programId: string;
}

export type WalletOwnerType = 'user' | 'beneficiary_identity' | 'organization';

export interface Wallet {
  readonly id: string;
  readonly ownerType: WalletOwnerType;
  readonly ownerId: string;
}

export interface Profile {
  readonly id: string;
}

export interface World {
  readonly organizations: readonly Organization[];
  readonly memberships: readonly Membership[];
  readonly programs: readonly Program[];
  readonly enrollments: readonly Enrollment[];
  readonly redemptions: readonly Redemption[];
  readonly disbursements: readonly Disbursement[];
  readonly wallets: readonly Wallet[];
  readonly beneficiaryIdentities: readonly BeneficiaryIdentity[];
  readonly profiles: readonly Profile[];
}

// An authenticated session. `recentStepUp` is true only when the session has a
// fresh AAL2 MFA method timestamp within the step-up window (private.has_recent_step_up).
export interface Session {
  readonly userId: string;
  readonly aal: AuthenticatorAssuranceLevel;
  readonly recentStepUp: boolean;
}

export type ResourceKind =
  | 'organization'
  | 'program'
  | 'enrollment'
  | 'redemption'
  | 'disbursement'
  | 'wallet'
  | 'beneficiary_identity'
  | 'profile';

export type MutationAction = 'insert' | 'update' | 'delete';

// ---------------------------------------------------------------------------
// Private predicate helpers (mirror the private.* SQL functions).
// ---------------------------------------------------------------------------

const activeMemberships = (world: World, userId: string): Membership[] =>
  world.memberships.filter((m) => m.userId === userId && m.isActive);

export function isOrganizationMember(
  world: World,
  session: Session,
  organizationId: string,
): boolean {
  return activeMemberships(world, session.userId).some(
    (m) => m.organizationId === organizationId,
  );
}

export function hasOrganizationRole(
  world: World,
  session: Session,
  organizationId: string,
  roles: readonly OrganizationRole[],
): boolean {
  return activeMemberships(world, session.userId).some(
    (m) => m.organizationId === organizationId && roles.includes(m.role),
  );
}

const programOrg = (world: World, programId: string): string | null =>
  world.programs.find((p) => p.id === programId)?.organizationId ?? null;

export function isProgramOrganizationMember(
  world: World,
  session: Session,
  programId: string,
): boolean {
  const org = programOrg(world, programId);
  return org !== null && isOrganizationMember(world, session, org);
}

export function hasProgramOrganizationRole(
  world: World,
  session: Session,
  programId: string,
  roles: readonly OrganizationRole[],
): boolean {
  const org = programOrg(world, programId);
  return org !== null && hasOrganizationRole(world, session, org, roles);
}

const enrollmentProgram = (world: World, enrollmentId: string): Program | null => {
  const enrollment = world.enrollments.find((e) => e.id === enrollmentId);
  if (!enrollment) return null;
  return world.programs.find((p) => p.id === enrollment.programId) ?? null;
};

export function isEnrollmentOrganizationMember(
  world: World,
  session: Session,
  enrollmentId: string,
): boolean {
  const program = enrollmentProgram(world, enrollmentId);
  return program !== null && isOrganizationMember(world, session, program.organizationId);
}

export function hasEnrollmentOrganizationRole(
  world: World,
  session: Session,
  enrollmentId: string,
  roles: readonly OrganizationRole[],
): boolean {
  const program = enrollmentProgram(world, enrollmentId);
  return (
    program !== null &&
    hasOrganizationRole(world, session, program.organizationId, roles)
  );
}

export function isBeneficiaryIdentityOrganizationMember(
  world: World,
  session: Session,
  identityId: string,
): boolean {
  return world.enrollments
    .filter((e) => e.beneficiaryIdentityId === identityId)
    .some((e) => isProgramOrganizationMember(world, session, e.programId));
}

export function isProgramParticipant(
  world: World,
  session: Session,
  programId: string,
): boolean {
  return world.enrollments.some((enrollment) => {
    if (enrollment.programId !== programId) return false;
    if (enrollment.beneficiaryUserId === session.userId) return true;
    const identity = world.beneficiaryIdentities.find(
      (i) => i.id === enrollment.beneficiaryIdentityId,
    );
    return identity?.userId === session.userId;
  });
}

export function isProfileOrganizationMember(
  world: World,
  session: Session,
  profileId: string,
): boolean {
  // Shares an active membership organization with the target profile.
  const targetOrgs = new Set(
    world.memberships
      .filter((m) => m.userId === profileId && m.isActive)
      .map((m) => m.organizationId),
  );
  const sharesMembershipOrg = activeMemberships(world, session.userId).some((m) =>
    targetOrgs.has(m.organizationId),
  );
  if (sharesMembershipOrg) return true;

  // Or the target profile is a beneficiary enrolled in one of the session's
  // organization programs.
  const targetIdentityIds = new Set(
    world.beneficiaryIdentities
      .filter((i) => i.userId === profileId)
      .map((i) => i.id),
  );
  return world.enrollments
    .filter((e) => e.beneficiaryIdentityId !== null && targetIdentityIds.has(e.beneficiaryIdentityId))
    .some((e) => isProgramOrganizationMember(world, session, e.programId));
}

export function hasRecentStepUp(session: Session): boolean {
  return session.aal === 'aal2' && session.recentStepUp;
}

// ---------------------------------------------------------------------------
// Read authorization (SELECT visibility under RLS).
// ---------------------------------------------------------------------------

export function canRead(
  world: World,
  session: Session,
  kind: ResourceKind,
  resourceId: string,
): boolean {
  switch (kind) {
    case 'organization':
      return isOrganizationMember(world, session, resourceId);
    case 'program': {
      const program = world.programs.find((p) => p.id === resourceId);
      if (!program) return false;
      return (
        isOrganizationMember(world, session, program.organizationId) ||
        isProgramParticipant(world, session, program.id)
      );
    }
    case 'enrollment': {
      const enrollment = world.enrollments.find((e) => e.id === resourceId);
      if (!enrollment) return false;
      const ownsAsBeneficiary =
        enrollment.beneficiaryUserId === session.userId ||
        world.beneficiaryIdentities.some(
          (i) => i.id === enrollment.beneficiaryIdentityId && i.userId === session.userId,
        );
      return (
        ownsAsBeneficiary ||
        isProgramOrganizationMember(world, session, enrollment.programId)
      );
    }
    case 'redemption': {
      const redemption = world.redemptions.find((r) => r.id === resourceId);
      if (!redemption) return false;
      return (
        redemption.beneficiaryUserId === session.userId ||
        isEnrollmentOrganizationMember(world, session, redemption.enrollmentId)
      );
    }
    case 'disbursement': {
      const disbursement = world.disbursements.find((d) => d.id === resourceId);
      if (!disbursement) return false;
      return isProgramOrganizationMember(world, session, disbursement.programId);
    }
    case 'wallet': {
      const wallet = world.wallets.find((w) => w.id === resourceId);
      if (!wallet) return false;
      if (wallet.ownerType === 'user') {
        return wallet.ownerId === session.userId;
      }
      if (wallet.ownerType === 'beneficiary_identity') {
        const owned = world.beneficiaryIdentities.some(
          (i) => i.id === wallet.ownerId && i.userId === session.userId,
        );
        return (
          owned ||
          isBeneficiaryIdentityOrganizationMember(world, session, wallet.ownerId)
        );
      }
      return isOrganizationMember(world, session, wallet.ownerId);
    }
    case 'beneficiary_identity':
      return isBeneficiaryIdentityOrganizationMember(world, session, resourceId);
    case 'profile':
      return (
        resourceId === session.userId ||
        isProfileOrganizationMember(world, session, resourceId)
      );
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Mutation authorization (INSERT/UPDATE/DELETE under RLS after hardening).
//
// After 20260716051000_harden_financial_mutation_paths.sql, authenticated
// clients hold NO write privilege on redemptions, disbursements, or wallets:
// those are service-only. Program and enrollment writes remain organization
// role-scoped; profile self-update remains owner-scoped.
// ---------------------------------------------------------------------------

const PROGRAM_MANAGER_ROLES: readonly OrganizationRole[] = [
  'organization_administrator',
  'program_manager',
];

const ENROLLMENT_TEAM_ROLES: readonly OrganizationRole[] = [
  'organization_administrator',
  'program_manager',
  'beneficiary_verifier',
];

export function canMutate(
  world: World,
  session: Session,
  kind: ResourceKind,
  resourceId: string,
  action: MutationAction,
): boolean {
  switch (kind) {
    case 'program': {
      const program = world.programs.find((p) => p.id === resourceId);
      if (!program) return false;
      if (action === 'insert') {
        return (
          program.createdBy === session.userId &&
          hasOrganizationRole(world, session, program.organizationId, PROGRAM_MANAGER_ROLES)
        );
      }
      const roleOk = hasOrganizationRole(
        world,
        session,
        program.organizationId,
        PROGRAM_MANAGER_ROLES,
      );
      if (!roleOk) return false;
      if (action === 'update' && program.status === 'active') {
        // Restrictive policy: active-program changes require recent AAL2.
        return hasRecentStepUp(session);
      }
      return true;
    }
    case 'enrollment': {
      const enrollment = world.enrollments.find((e) => e.id === resourceId);
      if (!enrollment) return false;
      const program = world.programs.find((p) => p.id === enrollment.programId);
      if (!program) return false;
      if (action === 'insert') {
        const beneficiarySelfEnroll =
          enrollment.beneficiaryUserId === session.userId && program.status === 'active';
        const teamEnroll = hasProgramOrganizationRole(
          world,
          session,
          enrollment.programId,
          ENROLLMENT_TEAM_ROLES,
        );
        return beneficiarySelfEnroll || teamEnroll;
      }
      return hasProgramOrganizationRole(
        world,
        session,
        enrollment.programId,
        ENROLLMENT_TEAM_ROLES,
      );
    }
    case 'profile':
      return action === 'update' && resourceId === session.userId;
    // Service-only tables: authenticated clients can never write.
    case 'redemption':
    case 'disbursement':
    case 'wallet':
    case 'organization':
    case 'beneficiary_identity':
      return false;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Affiliation — the independent tenant-boundary definition used by Property 5.
//
// A session is affiliated with a resource only when it directly owns/participates
// in it, or holds an ACTIVE membership in the organization that the resource is
// anchored to. Tenant isolation requires that access implies affiliation.
// ---------------------------------------------------------------------------

const identityEnrollmentOrgs = (world: World, identityId: string): string[] =>
  world.enrollments
    .filter((e) => e.beneficiaryIdentityId === identityId)
    .map((e) => programOrg(world, e.programId))
    .filter((o): o is string => o !== null);

// The set of organizations a resource is anchored to in the tenant sense. A
// resource may be anchored to several organizations (for example a beneficiary
// enrolled in programs run by different organizations). Owner-anchored resources
// such as user-owned wallets and profiles return the empty set here; their
// direct ownership is captured separately by `ownsOrParticipates`.
export function resourceOrganizationIds(
  world: World,
  kind: ResourceKind,
  resourceId: string,
): string[] {
  switch (kind) {
    case 'organization':
      return [resourceId];
    case 'program': {
      const org = world.programs.find((p) => p.id === resourceId)?.organizationId;
      return org ? [org] : [];
    }
    case 'enrollment': {
      const org = enrollmentProgram(world, resourceId)?.organizationId;
      return org ? [org] : [];
    }
    case 'redemption': {
      const redemption = world.redemptions.find((r) => r.id === resourceId);
      const org = redemption
        ? enrollmentProgram(world, redemption.enrollmentId)?.organizationId
        : undefined;
      return org ? [org] : [];
    }
    case 'disbursement': {
      const disbursement = world.disbursements.find((d) => d.id === resourceId);
      const org = disbursement ? programOrg(world, disbursement.programId) : null;
      return org ? [org] : [];
    }
    case 'wallet': {
      const wallet = world.wallets.find((w) => w.id === resourceId);
      if (!wallet) return [];
      if (wallet.ownerType === 'organization') return [wallet.ownerId];
      if (wallet.ownerType === 'beneficiary_identity') {
        return identityEnrollmentOrgs(world, wallet.ownerId);
      }
      return []; // user-owned wallets are owner-anchored, not org-anchored
    }
    case 'beneficiary_identity':
      return identityEnrollmentOrgs(world, resourceId);
    case 'profile': {
      // A profile is tenant-connected to every organization the profile owner
      // is an active member of, plus every organization whose program the owner
      // is enrolled in as a beneficiary. This mirrors is_profile_organization_member.
      const membershipOrgs = world.memberships
        .filter((m) => m.userId === resourceId && m.isActive)
        .map((m) => m.organizationId);
      const beneficiaryOrgs = world.beneficiaryIdentities
        .filter((i) => i.userId === resourceId)
        .flatMap((i) => identityEnrollmentOrgs(world, i.id));
      return [...new Set([...membershipOrgs, ...beneficiaryOrgs])];
    }
    default:
      return [];
  }
}

// True when the session directly owns or participates in the resource,
// independent of any organization membership.
export function ownsOrParticipates(
  world: World,
  session: Session,
  kind: ResourceKind,
  resourceId: string,
): boolean {
  switch (kind) {
    case 'profile':
      return resourceId === session.userId;
    case 'program':
      return isProgramParticipant(world, session, resourceId);
    case 'enrollment': {
      const enrollment = world.enrollments.find((e) => e.id === resourceId);
      if (!enrollment) return false;
      return (
        enrollment.beneficiaryUserId === session.userId ||
        world.beneficiaryIdentities.some(
          (i) => i.id === enrollment.beneficiaryIdentityId && i.userId === session.userId,
        )
      );
    }
    case 'redemption': {
      const redemption = world.redemptions.find((r) => r.id === resourceId);
      return redemption?.beneficiaryUserId === session.userId;
    }
    case 'wallet': {
      const wallet = world.wallets.find((w) => w.id === resourceId);
      if (!wallet) return false;
      if (wallet.ownerType === 'user') return wallet.ownerId === session.userId;
      if (wallet.ownerType === 'beneficiary_identity') {
        return world.beneficiaryIdentities.some(
          (i) => i.id === wallet.ownerId && i.userId === session.userId,
        );
      }
      return false;
    }
    case 'beneficiary_identity':
      return world.beneficiaryIdentities.some(
        (i) => i.id === resourceId && i.userId === session.userId,
      );
    default:
      return false;
  }
}

// Affiliation combines direct ownership/participation with active membership
// in the resource's anchoring organization.
export function isAffiliated(
  world: World,
  session: Session,
  kind: ResourceKind,
  resourceId: string,
): boolean {
  if (ownsOrParticipates(world, session, kind, resourceId)) return true;
  return resourceOrganizationIds(world, kind, resourceId).some((org) =>
    isOrganizationMember(world, session, org),
  );
}
