import { Principal } from '../policy/policy.types';

export abstract class BearerAuthenticator {
  abstract authenticate(token: string): Promise<Principal | null>;
}
