import type { EarlyAccessSignup, NewEarlyAccessSignup } from '../entities/early-access-signup';

export interface EarlyAccessSignupRepository {
  findCurrentByNormalizedEmail(emailNormalized: string): Promise<EarlyAccessSignup | null>;
  findByManageTokenHash(hash: string): Promise<EarlyAccessSignup | null>;
  findById(id: string): Promise<EarlyAccessSignup | null>;
  create(input: NewEarlyAccessSignup): Promise<EarlyAccessSignup>;
  save(signup: EarlyAccessSignup): Promise<EarlyAccessSignup>;
  findConfirmationsDue(at: Date, limit: number): Promise<EarlyAccessSignup[]>;
  findLaunchEligible(limit: number, afterId?: string): Promise<EarlyAccessSignup[]>;
  findPiiPurgeDue(at: Date, limit: number): Promise<EarlyAccessSignup[]>;
  countLaunchEligible(): Promise<number>;
}
