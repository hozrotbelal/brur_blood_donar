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
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const policy_guard_1 = require("../../platform/policy/policy.guard");
const invitation_dto_1 = require("./invitation.dto");
const matching_service_1 = require("./matching.service");
let MatchingController = class MatchingController {
    matching;
    constructor(matching) {
        this.matching = matching;
    }
    waves(id, req) {
        return this.matching.listWaves(req.principal, id);
    }
    expand(id, req) {
        return this.matching.expandSearch(req.principal, id);
    }
    approve(id, dto, req) {
        return this.matching.approveWave(req.principal, id, dto);
    }
};
exports.MatchingController = MatchingController;
__decorate([
    (0, common_1.Get)('requests/:id/waves'),
    (0, policy_guard_1.RequirePermission)('blood_request.view', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_a = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _a : Object]),
    __metadata("design:returntype", void 0)
], MatchingController.prototype, "waves", null);
__decorate([
    (0, common_1.Post)('requests/:id/waves'),
    (0, common_1.HttpCode)(201),
    (0, policy_guard_1.RequirePermission)('invitation.create', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_b = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], MatchingController.prototype, "expand", null);
__decorate([
    (0, common_1.Post)('waves/:id/approve'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('invitation.create', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, invitation_dto_1.ApproveWaveDto, typeof (_c = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], MatchingController.prototype, "approve", null);
exports.MatchingController = MatchingController = __decorate([
    (0, swagger_1.ApiTags)('matching'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('staff'),
    __metadata("design:paramtypes", [matching_service_1.MatchingService])
], MatchingController);
//# sourceMappingURL=matching.controller.js.map