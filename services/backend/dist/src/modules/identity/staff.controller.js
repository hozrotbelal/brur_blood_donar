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
exports.StaffController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const policy_guard_1 = require("../../platform/policy/policy.guard");
const public_decorator_1 = require("../../platform/policy/public.decorator");
const staff_dto_1 = require("./staff.dto");
const staff_service_1 = require("./staff.service");
let StaffController = class StaffController {
    staff;
    constructor(staff) {
        this.staff = staff;
    }
    invite(dto, req) {
        return this.staff.invite(req.principal, dto);
    }
    list(req) {
        return this.staff.list(req.principal);
    }
    revoke(id, req) {
        return this.staff.revoke(req.principal, id);
    }
    assign(userId, dto, req) {
        return this.staff.changeAssignment(req.principal, userId, dto);
    }
    accept(dto) {
        return this.staff.accept(dto);
    }
};
exports.StaffController = StaffController;
__decorate([
    (0, common_1.Post)('admin/staff-invitations'),
    (0, common_1.HttpCode)(201),
    (0, policy_guard_1.RequirePermission)('staff.invite', 'All'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [staff_dto_1.InviteStaffDto, typeof (_a = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _a : Object]),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "invite", null);
__decorate([
    (0, common_1.Get)('admin/staff-invitations'),
    (0, policy_guard_1.RequirePermission)('staff.invite', 'All'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('admin/staff-invitations/:id/revoke'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('staff.invite', 'All'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_c = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "revoke", null);
__decorate([
    (0, common_1.Post)('admin/staff/:userId/assignment'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('permission.manage', 'All'),
    __param(0, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, staff_dto_1.ChangeAssignmentDto, typeof (_d = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "assign", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('auth/staff/accept-invitation'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [staff_dto_1.AcceptStaffInvitationDto]),
    __metadata("design:returntype", void 0)
], StaffController.prototype, "accept", null);
exports.StaffController = StaffController = __decorate([
    (0, swagger_1.ApiTags)('staff-admin'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [staff_service_1.StaffService])
], StaffController);
//# sourceMappingURL=staff.controller.js.map