import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CaseService } from '../modules/case-workflow/case-workflow.public';
import { InvitationService } from '../modules/matching/invitation.service';
import { NotificationDispatcher, NotificationPlanner } from '../modules/notification/notification.public';
import { MatchingService } from '../modules/matching/matching.service';
import { PartitionService } from '../platform/db/partition.service';
import { OutboxRelay } from '../platform/outbox/outbox.relay';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const relay = app.get(OutboxRelay);
  const matching = app.get(MatchingService);
  const invitations = app.get(InvitationService);
  const cases = app.get(CaseService);
  const notifications = app.get(NotificationDispatcher);
  const planner = app.get(NotificationPlanner);
  const partitions = app.get(PartitionService);
  let nextPartitionCheck = 0;
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

  const maintainPartitions = async () => {
    if (Date.now() < nextPartitionCheck) return 0;
    nextPartitionCheck = Date.now() + 24 * 3600_000;
    return partitions.ensureAhead(6);
  };

  while (!stopping) {
    const published = await relay.publishPending();
    const worked =
      (await matching.startPendingSearches()) + (await matching.proposeNextWaves()) +
      (await matching.proposeReplacementWaves()) + (await invitations.dispatchDue()) + (await invitations.expireDue()) + (await invitations.reaskDue()) +
      (await invitations.cancelForEndedRequests()) + (await cases.advanceAttendance()) + (await cases.flagUnconfirmedDonors()) + (await cases.reconcileClosedRequests()) +
      (await notifications.dispatchDue()) + (await notifications.fallbackDue()) + (await scheduleDue()) + (await maintainPartitions());
    if (published === 0 && worked === 0) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await app.close();
}

void bootstrap();
