import type { components, paths } from '@bbda/api-client';
import { ApiError, currentAccessToken } from './api';

type RequestQueueResponse = paths['/api/v1/staff/requests']['get']['responses'][200]['content']['application/json'];
type CaseListResponse = paths['/api/v1/staff/cases']['get']['responses'][200]['content']['application/json'];

export type ReviewQueueItem = components['schemas']['ReviewQueueItemDto'];
export type CaseListItem = components['schemas']['CaseListItemDto'];

async function authorizedGet<T>(path: string): Promise<T> {
  const token = currentAccessToken();
  if (!token) throw new ApiError(401, 'NOT_SIGNED_IN');
  const response = await fetch(path, {
    credentials: 'include',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { code?: string };
    throw new ApiError(response.status, payload.code ?? 'UNKNOWN');
  }
  return (await response.json()) as T;
}

export function fetchRequestQueue(): Promise<RequestQueueResponse> {
  return authorizedGet<RequestQueueResponse>('/api/v1/staff/requests');
}

export function fetchCases(): Promise<CaseListResponse> {
  return authorizedGet<CaseListResponse>('/api/v1/staff/cases');
}
