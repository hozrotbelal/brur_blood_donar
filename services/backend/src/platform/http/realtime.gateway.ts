import { Inject, Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import { Principal } from '../policy/policy.types';
import { BearerAuthenticator } from '../security/bearer-authenticator';

interface Socket {
  id: string;
  handshake: { auth?: { token?: string }; headers?: Record<string, string | string[] | undefined> };
  data: Record<string, unknown>;
  join(room: string): void | Promise<void>;
  disconnect(close?: boolean): void;
}

export const userRoom = (userId: string) => `user:${userId}`;

@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(@Inject(BearerAuthenticator) private readonly authenticator: BearerAuthenticator) {}

  async handleConnection(client: Socket) {
    const principal = await this.resolve(client);
    if (!principal) {
      client.disconnect(true);
      return;
    }
    client.data.principal = principal;
    await client.join(userRoom(principal.userId));
  }

  private async resolve(client: Socket): Promise<Principal | null> {
    const fromAuth = client.handshake.auth?.token;
    const header = client.handshake.headers?.authorization;
    const bearer = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    const token = fromAuth ?? bearer;
    if (!token) return null;
    try {
      return await this.authenticator.authenticate(token);
    } catch (error) {
      this.logger.warn(`realtime handshake failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}
