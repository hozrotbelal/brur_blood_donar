"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../app.module");
const case_workflow_public_1 = require("../modules/case-workflow/case-workflow.public");
const invitation_service_1 = require("../modules/matching/invitation.service");
const notification_public_1 = require("../modules/notification/notification.public");
const matching_service_1 = require("../modules/matching/matching.service");
const partition_service_1 = require("../platform/db/partition.service");
const outbox_relay_1 = require("../platform/outbox/outbox.relay");
async function bootstrap() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const relay = app.get(outbox_relay_1.OutboxRelay);
    const matching = app.get(matching_service_1.MatchingService);
    const invitations = app.get(invitation_service_1.InvitationService);
    const cases = app.get(case_workflow_public_1.CaseService);
    const notifications = app.get(notification_public_1.NotificationDispatcher);
    const planner = app.get(notification_public_1.NotificationPlanner);
    const partitions = app.get(partition_service_1.PartitionService);
    let nextPartitionCheck = 0;
    let stopping = false;
    let nextScheduling = 0;
    const stop = () => {
        stopping = true;
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    const scheduleDue = async () => {
        if (Date.now() < nextScheduling)
            return 0;
        nextScheduling = Date.now() + 60_000;
        return (await planner.scheduleReminders()) + (await planner.scheduleDonationDateReminders());
    };
    const maintainPartitions = async () => {
        if (Date.now() < nextPartitionCheck)
            return 0;
        nextPartitionCheck = Date.now() + 24 * 3600_000;
        return partitions.ensureAhead(6);
    };
    while (!stopping) {
        const published = await relay.publishPending();
        const worked = (await matching.startPendingSearches()) + (await matching.proposeNextWaves()) +
            (await matching.proposeReplacementWaves()) + (await invitations.dispatchDue()) + (await invitations.expireDue()) + (await invitations.reaskDue()) +
            (await invitations.cancelForEndedRequests()) + (await cases.advanceAttendance()) + (await cases.flagUnconfirmedDonors()) + (await cases.reconcileClosedRequests()) +
            (await notifications.dispatchDue()) + (await notifications.fallbackDue()) + (await scheduleDue()) + (await maintainPartitions());
        if (published === 0 && worked === 0)
            await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await app.close();
}
void bootstrap();
//# sourceMappingURL=worker.js.map