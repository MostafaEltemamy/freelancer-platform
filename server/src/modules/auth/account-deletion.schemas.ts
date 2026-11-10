import { z } from 'zod';

export const deleteAccountSchema = z.strictObject({
  password: z.string()
    .min(1, 'Enter your current password.')
    .max(1024),

  confirmation: z.literal('DELETE MY ACCOUNT'),
});

export type DeleteAccountInput =
  z.infer<typeof deleteAccountSchema>;
