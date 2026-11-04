"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d, _e, _f, _g;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const policy_guard_1 = require("../../platform/policy/policy.guard");
const policy_types_1 = require("../../platform/policy/policy.types");
const notification_service_1 = require("./notification.service");
class PushTokenDto {
    installId;
    token;
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], PushTokenDto.prototype, "installId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MaxLength)(4096),
    __metadata("design:type", String)
], PushTokenDto.prototype, "token", void 0);
let NotificationController = class NotificationController {
    notifications;
    constructor(notifications) {
        this.notifications = notifications;
    }
    inbox(req, unread, limit) {
        return this.notifications.inbox(req.principal, { unreadOnly: unread === 'true', limit: limit ? Number(limit) : undefined });
    }
    unread(req) {
        return this.notifications.unreadCount(req.principal);
    }
    readAll(req) {
        return this.notifications.markAllRead(req.principal);
    }
    read(id, req) {
        return this.notifications.markRead(req.principal, id);
    }
    receipt(id, req) {
        return this.notifications.receipt(req.principal, id);
    }
    pushToken(dto, req) {
        return this.notifications.registerPushToken(req.principal, dto.installId, dto.token);
    }
    report(req, days) {
        const scope = req.principal.grants.some((g) => g.key === 'delivery_report.view' && policy_types_1.SCOPE_ORDER.indexOf(g.scope) >= policy_types_1.SCOPE_ORDER.indexOf('All')) ? 'All' : 'Area';
        return this.notifications.deliveryReport(req.principal, scope, days ? Number(days) : 7);
    }
};
exports.NotificationController = NotificationController;
__decorate([
    (0, common_1.Get)('notifications'),
    (0, policy_guard_1.RequirePermission)('account.view', 'Own'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('unread')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _a : Object, String, String]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "inbox", null);
__decorate([
    (0, common_1.Get)('notifications/unread-count'),
    (0, policy_guard_1.RequirePermission)('account.view', 'Own'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "unread", null);
__decorate([
    (0, common_1.Post)('notifications/read-all'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('account.view', 'Own'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "readAll", null);
__decorate([
    (0, common_1.Post)('notifications/:id/read'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('account.view', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_d = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "read", null);
__decorate([
    (0, common_1.Post)('notifications/:id/receipt'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('account.view', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_e = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "receipt", null);
__decorate([
    (0, common_1.Put)('devices/push-token'),
    (0, policy_guard_1.RequirePermission)('account.edit', 'Own'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PushTokenDto, typeof (_f = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "pushToken", null);
__decorate([
    (0, common_1.Get)('admin/delivery-reports'),
    (0, policy_guard_1.RequirePermission)('delivery_report.view', 'Area'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_g = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _g : Object, String]),
    __metadata("design:returntype", void 0)
], NotificationController.prototype, "report", null);
exports.NotificationController = NotificationController = __decorate([
    (0, swagger_1.ApiTags)('notifications'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [notification_service_1.NotificationService])
], NotificationController);
//# sourceMappingURL=notification.controller.js.map