import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CaseService } from '../modules/case-workflow/case-workflow.public';
import { InvitationService } from '../modules/matching/invitation.service';
import { NotificationDispatcher, NotificationPlanner } from '../modules/notification/notification.public';
import { MatchingService } from '../modules/matching/matching.service';
import { OutboxRelay } from '../platform/outbox/outbox.relay';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const relay = app.get(OutboxRelay);
  const matching = app.get(MatchingService);
  const invitations = app.get(InvitationService);
  const cases = app.get(CaseService);
  const notifications = app.get(NotificationDispatcher);
  const planner = app.get(NotificationPlanner);
  let stopping = false;
  let nextScheduling = 0;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  const scheduleDue = async () => {
    if (Date.now() < nextScheduling) return 0;
    nextScheduling = Date.now() + 60_000;
    return (await planner.scheduleReminders()) + (await planner.scheduleDonationDateReminders());
  };

  while (!stopping) {
    const published = await relay.publishPending();
    const worked =
      (await matching.startPendingSearches()) + (await matching.proposeNextWaves()) +
      (await matching.proposeReplacementWaves()) + (await invitations.dispatchDue()) + (await invitations.expireDue()) + (await invitations.reaskDue()) +
      (await invitations.cancelForEndedRequests()) + (await cases.advanceAttendance()) + (await cases.flagUnconfirmedDonors()) + (await cases.reconcileClosedRequests()) +
      (await notifications.dispatchDue()) + (await notifications.fallbackDue()) + (await scheduleDue());
    if (published === 0 && worked === 0) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await app.close();
}

void bootstrap();
