/** '+919876543210' → '+91 98765 43210' */
export function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}
export const whatsappUrl = (e164: string) => `https://wa.me/${e164.replace(/\D/g, '')}`;
