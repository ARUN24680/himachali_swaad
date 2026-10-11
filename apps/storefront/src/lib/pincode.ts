import { PINCODE_REGEX } from '@pk/shared/patterns';

/** Client-side pincode check (zod-free); the server still validates with PincodeSchema. */
export const isValidPincode = (value: string): boolean => PINCODE_REGEX.test(value);
