import { z } from 'zod';

export const signupSchema = z
  .object({
    email: z.string().trim().email(),
    captchaToken: z.string().min(1),
  })
  .strict()
  .transform(({ email, captchaToken }) => ({
    emailOriginal: email,
    emailNormalized: email.toLowerCase(),
    captchaToken,
  }));
