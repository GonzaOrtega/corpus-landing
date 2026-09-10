import { z } from 'zod';

export const signupSchema = z
  .object({
    // 254 is the longest address an SMTP path can carry. Bounded before
    // .email() because this parse runs ahead of the release-stage and
    // CAPTCHA gates, so the regex is reachable by an anonymous caller.
    email: z.string().trim().max(254).email(),
    captchaToken: z.string().min(1),
  })
  .strict()
  .transform(({ email, captchaToken }) => ({
    emailOriginal: email,
    emailNormalized: email.toLowerCase(),
    captchaToken,
  }));
