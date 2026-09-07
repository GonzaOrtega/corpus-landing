import { z } from 'zod';

const nonEmptyLine = z.string().trim().min(1).max(500);

export const launchInputSchema = z.object({
  releaseVersion: z.string().trim().min(1).max(100),
  releaseSummary: nonEmptyLine,
  includedFeatures: z.array(nonEmptyLine).min(1).max(20),
  knownLimitations: z.array(nonEmptyLine).min(1).max(20),
  downloadUrl: z
    .url()
    .transform((value) => new URL(value))
    .refine((value) => value.protocol === 'https:', 'Download URL must use HTTPS'),
});

export type LaunchEmailInput = z.output<typeof launchInputSchema>;
