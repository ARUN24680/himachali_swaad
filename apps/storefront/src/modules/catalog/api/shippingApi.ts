import type { PincodeCheckResponse } from '@pk/shared';
import { apiRequest } from '@/lib/api-client';

/** Typed by the shared contract; not re-parsed in the browser (keeps zod out of first-load JS). */
export const shippingApi = {
  checkPincode: (pincode: string, signal?: AbortSignal): Promise<PincodeCheckResponse> =>
    apiRequest<PincodeCheckResponse>('/shipping/check-pincode', { method: 'POST', body: { pincode }, signal }),
};
