import { Injectable, Logger } from '@nestjs/common';

export interface GatewayResult {
  messageId: string;
}

export abstract class PushGateway {
  abstract send(tokens: string[], title: string, body: string, data: Record<string, string>): Promise<GatewayResult>;
}

export abstract class SmsGateway {
  abstract send(phoneE164: string, text: string): Promise<GatewayResult>;
}

let counter = 0;
const simulatedId = () => `simulated:${Date.now()}-${++counter}`;

@Injectable()
export class SimulatedPushGateway extends PushGateway {
  private readonly logger = new Logger('Push');

  send(tokens: string[], title: string, body: string): Promise<GatewayResult> {
    this.logger.log(`[simulated push] to ${tokens.length} device(s): ${title}: ${body}`);
    return Promise.resolve({ messageId: simulatedId() });
  }
}

@Injectable()
export class SimulatedSmsGateway extends SmsGateway {
  private readonly logger = new Logger('NotificationSms');

  send(phoneE164: string, text: string): Promise<GatewayResult> {
    this.logger.log(`[simulated sms] to ${phoneE164.slice(0, 7)}XXXX: ${text}`);
    return Promise.resolve({ messageId: simulatedId() });
  }
}
