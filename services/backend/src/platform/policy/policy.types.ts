export type RoleCode = 'DON' | 'PAT' | 'SUP' | 'MOD' | 'ADM';

export const SCOPE_ORDER = ['Own', 'Assigned', 'Area', 'All'] as const;
export type PermissionScope = (typeof SCOPE_ORDER)[number];

export const STEP_UP_WINDOW_MS = 5 * 60_000;

export interface Grant {
  key: string;
  scope: PermissionScope;
  expiresAt?: Date | null;
  requiresStepUp?: boolean;
}

export interface Principal {
  userId: string;
  role: RoleCode;
  sessionId?: string;
  stepUpAt?: Date | null;
  grants: Grant[];
}

export interface Resource {
  ownerUserId?: string;
  assignedUserIds?: string[];
  areaIds?: string[];
}

export interface Decision {
  allowed: boolean;
  permissionKey: string;
  reason: 'GRANTED' | 'NO_GRANT' | 'SCOPE_TOO_NARROW' | 'RESOURCE_OUT_OF_SCOPE' | 'STEP_UP_REQUIRED';
}

export const stepUpIsFresh = (principal: Pick<Principal, 'stepUpAt'>, now = new Date()): boolean =>
  !!principal.stepUpAt && now.getTime() - principal.stepUpAt.getTime() <= STEP_UP_WINDOW_MS;
