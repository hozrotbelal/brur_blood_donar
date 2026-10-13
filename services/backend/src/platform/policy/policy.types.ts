export type RoleCode = 'DON' | 'PAT' | 'SUP' | 'MOD' | 'ADM';

export const SCOPE_ORDER = ['Own', 'Assigned', 'Area', 'All'] as const;
export type PermissionScope = (typeof SCOPE_ORDER)[number];

export interface Grant {
  key: string;
  scope: PermissionScope;
  expiresAt?: Date | null;
}

export interface Principal {
  userId: string;
  role: RoleCode;
  sessionId?: string;
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
  reason: 'GRANTED' | 'NO_GRANT' | 'SCOPE_TOO_NARROW' | 'RESOURCE_OUT_OF_SCOPE';
}
