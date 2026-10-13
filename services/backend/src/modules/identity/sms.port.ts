import { Injectable, Logger } from '@nestjs/common';

export abstract class SmsSender {
  abstract send(phoneE164: string, text: string): Promise<void>;
}

@Injectable()
export class LogSmsSender extends SmsSender {
  private readonly logger = new Logger('Sms');

  send(phoneE164: string, text: string): Promise<void> {
    this.logger.log(`[not sent, development sender] to ${phoneE164.slice(0, 7)}XXXX: ${text}`);
    return Promise.resolve();
  }
}
