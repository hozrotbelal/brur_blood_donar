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
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvitationController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const policy_guard_1 = require("../../platform/policy/policy.guard");
const invitation_dto_1 = require("./invitation.dto");
const invitation_service_1 = require("./invitation.service");
const invitation_view_dto_1 = require("./invitation-view.dto");
let InvitationController = class InvitationController {
    invitations;
    constructor(invitations) {
        this.invitations = invitations;
    }
    list(req) {
        return this.invitations.list(req.principal);
    }
    open(id, req) {
        return this.invitations.open(req.principal, id);
    }
    respond(id, dto, req) {
        return this.invitations.respond(req.principal, id, dto);
    }
    withdraw(id, dto, req) {
        return this.invitations.withdraw(req.principal, id, dto);
    }
};
exports.InvitationController = InvitationController;
__decorate([
    (0, common_1.Get)(),
    (0, policy_guard_1.RequirePermission)('invitation.view', 'Own'),
    (0, swagger_1.ApiResponse)({ status: 200, type: [invitation_view_dto_1.InvitationViewDto] }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _a : Object]),
    __metadata("design:returntype", void 0)
], InvitationController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, policy_guard_1.RequirePermission)('invitation.view', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_b = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], InvitationController.prototype, "open", null);
__decorate([
    (0, common_1.Post)(':id/respond'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('invitation.respond', 'Own'),
    (0, swagger_1.ApiResponse)({ status: 200, type: invitation_view_dto_1.InvitationViewDto }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, invitation_dto_1.RespondDto, typeof (_c = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], InvitationController.prototype, "respond", null);
__decorate([
    (0, common_1.Post)(':id/withdraw'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('invitation.respond', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, invitation_dto_1.WithdrawInvitationDto, typeof (_d = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], InvitationController.prototype, "withdraw", null);
exports.InvitationController = InvitationController = __decorate([
    (0, swagger_1.ApiTags)('invitations'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('invitations'),
    __metadata("design:paramtypes", [invitation_service_1.InvitationService])
], InvitationController);
//# sourceMappingURL=invitation.controller.js.map