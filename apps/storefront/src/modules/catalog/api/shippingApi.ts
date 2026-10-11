import { PincodeCheckResponseSchema, type PincodeCheckResponse } from '@pk/shared';
import { apiRequest } from '@/lib/api-client';

export const shippingApi = {
  checkPincode: async (pincode: string, signal?: AbortSignal): Promise<PincodeCheckResponse> =>
    PincodeCheckResponseSchema.parse(
      await apiRequest('/shipping/check-pincode', { method: 'POST', body: { pincode }, signal }),
    ),
};
