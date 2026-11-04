"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulatedSmsGateway = exports.SimulatedPushGateway = exports.SmsGateway = exports.PushGateway = void 0;
const common_1 = require("@nestjs/common");
class PushGateway {
}
exports.PushGateway = PushGateway;
class SmsGateway {
}
exports.SmsGateway = SmsGateway;
let counter = 0;
const simulatedId = () => `simulated:${Date.now()}-${++counter}`;
let SimulatedPushGateway = class SimulatedPushGateway extends PushGateway {
    logger = new common_1.Logger('Push');
    send(tokens, title, body) {
        this.logger.log(`[simulated push] to ${tokens.length} device(s): ${title}: ${body}`);
        return Promise.resolve({ messageId: simulatedId() });
    }
};
exports.SimulatedPushGateway = SimulatedPushGateway;
exports.SimulatedPushGateway = SimulatedPushGateway = __decorate([
    (0, common_1.Injectable)()
], SimulatedPushGateway);
let SimulatedSmsGateway = class SimulatedSmsGateway extends SmsGateway {
    logger = new common_1.Logger('NotificationSms');
    send(phoneE164, text) {
        this.logger.log(`[simulated sms] to ${phoneE164.slice(0, 7)}XXXX: ${text}`);
        return Promise.resolve({ messageId: simulatedId() });
    }
};
exports.SimulatedSmsGateway = SimulatedSmsGateway;
exports.SimulatedSmsGateway = SimulatedSmsGateway = __decorate([
    (0, common_1.Injectable)()
], SimulatedSmsGateway);
//# sourceMappingURL=gateway.ports.js.map