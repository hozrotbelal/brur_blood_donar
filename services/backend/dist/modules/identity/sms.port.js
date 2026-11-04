"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogSmsSender = exports.SmsSender = void 0;
const common_1 = require("@nestjs/common");
class SmsSender {
}
exports.SmsSender = SmsSender;
let LogSmsSender = class LogSmsSender extends SmsSender {
    logger = new common_1.Logger('Sms');
    send(phoneE164, text) {
        this.logger.log(`[not sent, development sender] to ${phoneE164.slice(0, 7)}XXXX: ${text}`);
        return Promise.resolve();
    }
};
exports.LogSmsSender = LogSmsSender;
exports.LogSmsSender = LogSmsSender = __decorate([
    (0, common_1.Injectable)()
], LogSmsSender);
//# sourceMappingURL=sms.port.js.map