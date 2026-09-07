import { runEarlyAccessSignupRepositoryContract } from './early-access-signup-repository.contract';
import { InMemoryEarlyAccessSignupRepository } from './in-memory-early-access-signup.repository';

runEarlyAccessSignupRepositoryContract(
  'InMemoryEarlyAccessSignupRepository',
  () => new InMemoryEarlyAccessSignupRepository(),
);
