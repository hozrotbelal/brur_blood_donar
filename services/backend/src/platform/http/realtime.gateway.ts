import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';

interface Socket {
  handshake: { auth?: { token?: string } };
  disconnect(close?: boolean): void;
}

@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection {
  handleConnection(client: Socket) {
    client.disconnect(true);
  }
}
