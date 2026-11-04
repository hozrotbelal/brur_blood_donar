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

export type CaseDetail = components['schemas']['CaseDetailDto'];
export type CaseOutcome = components['schemas']['CaseOutcomeDto'];
export type CaseAppointment = components['schemas']['CaseAppointmentDto'];
export type ContactBody = components['schemas']['ContactAttemptDto'];
export type OutcomeBody = components['schemas']['RecordOutcomeDto'];
export type ResolveDisputeBody = components['schemas']['ResolveDisputeDto'];
export type FacilityPage = components['schemas']['FacilityPageDto'];

const cases = '/api/v1/staff/cases';

export const fetchCaseDetail = (id: string) => apiCall<CaseDetail>('GET', `${cases}/${id}`);
export const startScheduling = (id: string) => apiCall<unknown>('POST', `${cases}/${id}/start-scheduling`);
export const addCaseNote = (id: string, body: string) => apiCall<unknown>('POST', `${cases}/${id}/notes`, { body });
export const logContact = (id: string, body: ContactBody) => apiCall<unknown>('POST', `${cases}/${id}/contact-attempts`, body);
export const proposeAppointment = (id: string, body: { caseDonorId: string; facilityId: string; scheduledStart: string }) =>
  apiCall<unknown>('POST', `${cases}/${id}/appointments`, body);
export const rescheduleAppointment = (appointmentId: string, scheduledStart: string) =>
  apiCall<unknown>('POST', `/api/v1/staff/appointments/${appointmentId}/reschedule`, { scheduledStart });
export const markNoShow = (appointmentId: string) => apiCall<unknown>('POST', `/api/v1/staff/appointments/${appointmentId}/no-show`);
export const recordOutcome = (id: string, body: OutcomeBody) => apiCall<unknown>('POST', `${cases}/${id}/outcomes`, body);
export const disputeOutcome = (id: string, outcomeId: string, reason: string) =>
  apiCall<unknown>('POST', `${cases}/${id}/outcomes/${outcomeId}/dispute`, { reason });
export const resolveDispute = (id: string, outcomeId: string, body: ResolveDisputeBody) =>
  apiCall<unknown>('POST', `${cases}/${id}/outcomes/${outcomeId}/resolve-dispute`, body);
export const setFulfilment = (id: string) => apiCall<unknown>('POST', `${cases}/${id}/fulfilment`);
export const answerMoreDonors = (id: string, needed: boolean) => apiCall<unknown>('POST', `${cases}/${id}/more-donors`, { needed });
export const closeCase = (id: string, note: string) => apiCall<unknown>('POST', `${cases}/${id}/close`, { note });
export const declareUnable = (requestId: string, reason: string) =>
  apiCall<unknown>('POST', `/api/v1/staff/requests/${requestId}/declare-unable`, { reason });
export const fetchAppointmentFacilities = async () => {
  const pages = await Promise.all(
    (['COLLECTION_SERVICE', 'HOSPITAL'] as const).map((type) => apiCall<FacilityPage>('GET', `/api/v1/facilities?type=${type}&limit=200`)),
  );
  return pages.flatMap((page) => page.items);
};

export type StaffMember = components['schemas']['StaffMemberDto'];
export type StaffDeactivated = components['schemas']['StaffDeactivatedDto'];
export type PermissionSetView = components['schemas']['PermissionSetViewDto'];
export type AccessReview = components['schemas']['AccessReviewDto'];
export type GrantDecision = components['schemas']['GrantDecisionDto']['decision'];
type OtpChallenge = components['schemas']['OtpChallengeDto'];

const staffAdmin = '/api/v1/admin/staff';

export const fetchStaff = () => apiCall<StaffMember[]>('GET', staffAdmin);
export const changeStaffAssignment = (userId: string, body: { tierCode: string; areaIds: string[]; reason: string }) =>
  apiCall<unknown>('POST', `${staffAdmin}/${userId}/assignment`, body);
export const deactivateStaff = (userId: string, reason: string) => apiCall<StaffDeactivated>('POST', `${staffAdmin}/${userId}/deactivate`, { reason });
export const resetStaffDevice = (userId: string, reason: string) => apiCall<unknown>('POST', `${staffAdmin}/${userId}/reset-device`, { reason });
export const fetchPermissionSets = () => apiCall<PermissionSetView[]>('GET', '/api/v1/admin/permission-sets');
export const fetchAccessReview = (month: string) => apiCall<AccessReview>('GET', `/api/v1/admin/access-review?month=${encodeURIComponent(month)}`);
export const decideGrant = (grantId: string, decision: GrantDecision, reason: string) =>
  apiCall<unknown>('POST', `/api/v1/admin/access-review/grants/${grantId}/decision`, { decision, reason });
export const requestStepUpCode = () => apiCall<OtpChallenge>('POST', '/api/v1/auth/step-up/challenge');
export const confirmStepUp = (challengeId: string, code: string) => apiCall<unknown>('POST', '/api/v1/auth/step-up', { challengeId, code });
