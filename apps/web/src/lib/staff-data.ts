import type { components, paths } from '@bbda/api-client';
import { ApiError, currentAccessToken } from './api';

type Body<P extends keyof paths, M extends 'post' | 'put' | 'patch' = 'post'> = paths[P][M] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;
type Json<P extends keyof paths, M extends 'get' | 'post' = 'get'> = paths[P][M] extends {
  responses: { 200: { content: { 'application/json': infer R } } };
}
  ? R
  : paths[P][M] extends { responses: { 201: { content: { 'application/json': infer R } } } }
    ? R
    : never;

export type ReviewDetail = Json<'/api/v1/staff/requests/{id}'>;
export type ReviewItem = components['schemas']['ReviewQueueItemDto'];
export type ReviewFlag = components['schemas']['ReviewFlagDto'];
export type VerifyBody = Body<'/api/v1/staff/requests/{id}/verify'>;
export type InformationBody = Body<'/api/v1/staff/requests/{id}/request-information'>;
export type RejectBody = Body<'/api/v1/staff/requests/{id}/reject'>;
export type ResolveFlagBody = Body<'/api/v1/staff/requests/{id}/flags/{flagId}/resolve'>;
export type ReviewChange = components['schemas']['RequestChangeDto'];
export type RejectChangeBody = components['schemas']['RejectChangeDto'];
export type InvitationRow = components['schemas']['StaffInvitationDto'];
export type InviteBody = components['schemas']['InviteStaffDto'];
export type InviteCreated = components['schemas']['StaffInvitationCreatedDto'];
export type AreaPage = components['schemas']['AreaPageDto'];

export async function apiCall<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const token = currentAccessToken();
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED');
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['idempotency-key'] = crypto.randomUUID();
  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { code?: string };
    throw new ApiError(response.status, payload.code ?? 'UNKNOWN');
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const requests = '/api/v1/staff/requests';

export const fetchRequestDetail = (id: string) => apiCall<ReviewDetail>('GET', `${requests}/${id}`);
export const pickUpRequest = (id: string) => apiCall<ReviewItem>('POST', `${requests}/${id}/pick-up`);
export const verifyRequest = (id: string, body: VerifyBody) => apiCall<ReviewItem>('POST', `${requests}/${id}/verify`, body);
export const requestMoreInformation = (id: string, body: InformationBody) =>
  apiCall<ReviewItem>('POST', `${requests}/${id}/request-information`, body);
export const rejectRequest = (id: string, body: RejectBody) => apiCall<ReviewItem>('POST', `${requests}/${id}/reject`, body);
export const resolveFlag = (id: string, flagId: string, body: ResolveFlagBody) =>
  apiCall<unknown>('POST', `${requests}/${id}/flags/${flagId}/resolve`, body);

const invitations = '/api/v1/admin/staff-invitations';

export const approveChange = (id: string, changeId: string) => apiCall<ReviewDetail>('POST', `${requests}/${id}/changes/${changeId}/approve`, {});
export const rejectChange = (id: string, changeId: string, body: RejectChangeBody) =>
  apiCall<ReviewDetail>('POST', `${requests}/${id}/changes/${changeId}/reject`, body);
export const fetchInvitations = () => apiCall<InvitationRow[]>('GET', invitations);
export const createInvitation = (body: InviteBody) => apiCall<InviteCreated>('POST', invitations, body);
export const revokeInvitation = (id: string) => apiCall<unknown>('POST', `${invitations}/${id}/revoke`);
export const fetchAreas = () => apiCall<AreaPage>('GET', '/api/v1/areas?limit=200');
