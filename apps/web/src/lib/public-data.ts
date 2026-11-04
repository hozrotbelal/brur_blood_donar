import type { components } from '@bbda/api-client';
import { apiCall } from './staff-data';

export type RequestView = components['schemas']['RequestViewDto'];
export type PatientItem = components['schemas']['PatientListItemDto'];
export type InvitationView = components['schemas']['InvitationViewDto'];
export type NotificationItem = components['schemas']['NotificationItemDto'];
export type DonorAppointment = components['schemas']['DonorAppointmentDto'];
export type DonorProfile = components['schemas']['DonorProfileDto'];
export type ConsentView = components['schemas']['ConsentViewDto'];
export type CreatePatientBody = components['schemas']['CreatePatientDto'];
export type CreateRequestBody = components['schemas']['CreateRequestDto'];
export type RespondBody = components['schemas']['RespondDto'];
export type SaveDonorProfileBody = components['schemas']['SaveDonorProfileDto'];
export type SaveConsentBody = components['schemas']['SaveConsentDto'];
export type AreaPage = components['schemas']['AreaPageDto'];

export type TimelineEntry = components['schemas']['TimelineEntryDto'];
export type RequestProgress = components['schemas']['RequestProgressDto'];
export type RequestChange = components['schemas']['RequestChangeDto'];
export type RequestChangeResult = components['schemas']['RequestChangeResultDto'];
export type UpdateRequestBody = components['schemas']['UpdateRequestDto'];
export type CancelRequestBody = components['schemas']['CancelRequestDto'];
export type FacilityPage = components['schemas']['FacilityPageDto'];
export type Facility = FacilityPage['items'][number];

export const fetchPatients = () => apiCall<PatientItem[]>('GET', '/api/v1/patients');
export const createPatient = (body: CreatePatientBody) => apiCall<PatientItem>('POST', '/api/v1/patients', body);

export const fetchRequests = () => apiCall<RequestView[]>('GET', '/api/v1/requests');
export const fetchRequest = (id: string) => apiCall<RequestView>('GET', `/api/v1/requests/${id}`);
export const fetchTimeline = (id: string) => apiCall<TimelineEntry[]>('GET', `/api/v1/requests/${id}/timeline`);
export const createRequest = (body: CreateRequestBody) => apiCall<RequestView>('POST', '/api/v1/requests', body);
export const submitRequest = (id: string) => apiCall<RequestView>('POST', `/api/v1/requests/${id}/submit`);
export const cancelRequest = (id: string, body: CancelRequestBody) => apiCall<RequestView>('POST', `/api/v1/requests/${id}/cancel`, body);
export const updateRequest = (id: string, body: UpdateRequestBody) => apiCall<RequestChangeResult>('POST', `/api/v1/requests/${id}/changes`, body);
export const fetchChanges = (id: string) => apiCall<RequestChange[]>('GET', `/api/v1/requests/${id}/changes`);
export const fetchProgress = (id: string) => apiCall<RequestProgress>('GET', `/api/v1/requests/${id}/progress`);
export const reportUrgentProblem = (id: string) => apiCall<RequestView>('POST', `/api/v1/requests/${id}/urgent-problem`, {});
export const fetchFacilities = (type: 'HOSPITAL' | 'COLLECTION_SERVICE') => apiCall<FacilityPage>('GET', `/api/v1/facilities?type=${type}&limit=200`);

export const fetchInvitations = () => apiCall<InvitationView[]>('GET', '/api/v1/invitations');
export const respondToInvitation = (id: string, body: RespondBody) =>
  apiCall<InvitationView>('POST', `/api/v1/invitations/${id}/respond`, body);

export const fetchAppointments = () => apiCall<DonorAppointment[]>('GET', '/api/v1/appointments');

export const fetchNotifications = () => apiCall<NotificationItem[]>('GET', '/api/v1/notifications');
export const markNotificationRead = (id: string) => apiCall<unknown>('POST', `/api/v1/notifications/${id}/read`);
export const markAllNotificationsRead = () => apiCall<unknown>('POST', '/api/v1/notifications/read-all');

export const fetchDonorProfile = () => apiCall<DonorProfile>('GET', '/api/v1/profiles/donor');
export const saveDonorProfile = (body: SaveDonorProfileBody) => apiCall<DonorProfile>('PUT', '/api/v1/profiles/donor', body);

export const fetchConsents = () => apiCall<ConsentView[]>('GET', '/api/v1/consents');
export const saveConsent = (type: string, body: SaveConsentBody) => apiCall<ConsentView>('PUT', `/api/v1/consents/${type}`, body);

export const fetchAreas = () => apiCall<AreaPage>('GET', '/api/v1/areas?limit=200');
