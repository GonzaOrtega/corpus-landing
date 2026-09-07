/**
 * Derives a stable, opaque launch-management bearer token for one signup.
 * The backing secret is server-only and must be unique per environment.
 */
export interface ManagementTokenDeriver {
  deriveLaunchToken(signupId: string): string;
}
