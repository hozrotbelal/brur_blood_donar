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
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const policy_guard_1 = require("../../platform/policy/policy.guard");
const outreach_service_1 = require("./outreach.service");
const review_dto_1 = require("./review.dto");
const review_queue_dto_1 = require("./review-queue.dto");
const review_service_1 = require("./review.service");
let ReviewController = class ReviewController {
    review;
    outreach;
    constructor(review, outreach) {
        this.review = review;
        this.outreach = outreach;
    }
    queue(req, status) {
        return this.review.queue(req.principal, status);
    }
    detail(id, req) {
        return this.review.detail(req.principal, id);
    }
    resolveFlag(id, flagId, dto, req) {
        return this.review.resolveFlag(req.principal, id, flagId, dto);
    }
    approveChange(id, changeId, dto, req) {
        return this.review.approveChange(req.principal, id, changeId, dto);
    }
    rejectChange(id, changeId, dto, req) {
        return this.review.rejectChange(req.principal, id, changeId, dto);
    }
    pauseOutreach(id, dto, req) {
        return this.outreach.pause(req.principal, id, dto.reason);
    }
    resumeOutreach(id, req) {
        return this.outreach.resume(req.principal, id);
    }
    pickUp(id, req) {
        return this.review.pickUp(req.principal, id);
    }
    requestInformation(id, dto, req) {
        return this.review.requestInformation(req.principal, id, dto);
    }
    verify(id, dto, req) {
        return this.review.verify(req.principal, id, dto);
    }
    reject(id, dto, req) {
        return this.review.reject(req.principal, id, dto);
    }
};
exports.ReviewController = ReviewController;
__decorate([
    (0, common_1.Get)(),
    (0, policy_guard_1.RequirePermission)('blood_request.view', 'Assigned'),
    (0, swagger_1.ApiOkResponse)({ type: [review_queue_dto_1.ReviewQueueItemDto] }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _a : Object, String]),
    __metadata("design:returntype", void 0)
], ReviewController.prototype, "queue", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, policy_guard_1.RequirePermission)('blood_request.view', 'Assigned'),
    (0, swagger_1.ApiOkResponse)({ type: review_queue_dto_1.ReviewRequestDetailDto }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_b = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], ReviewController.prototype, "detail", null);
__decorate([
    (0, common_1.Post)(':id/flags/:flagId/resolve'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('blood_request.approve', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('flagId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, review_dto_1.ResolveFlagDto, typeof (_c = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], ReviewController.prototype, "resolveFlag", null);
__decorate([
    (0, common_1.Post)(':id/changes/:changeId/approve'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('blood_request.approve', 'Assigned'),
    (0, swagger_1.ApiOkResponse)({ type: review_queue_dto_1.ReviewRequestDetailDto }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('changeId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, review_dto_1.DecideChangeDto, typeof (_d = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], ReviewController.prototype, "approveChange", null);
__decorate([
    (0, common_1.Post)(':id/changes/:changeId/reject'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('blood_request.approve', 'Assigned'),
    (0, swagger_1.ApiOkResponse)({ type: review_queue_dto_1.ReviewRequestDetailDto }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('changeId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, review_dto_1.RejectChangeDto, typeof (_e = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], ReviewController.prototype, "rejectChange", null);
__decorate([
    (0, common_1.Post)(':id/pause-outreach'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('outreach.pause', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, review_dto_1.PauseOutreachDto, typeof (_f = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], ReviewController.prototype, "pauseOutreach", null);
__decorate([
    (0, common_1.Post)(':id/resume-outreach'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('outreach.pause', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_g = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _g : Object]),
    __metadata("design:returntype", void 0)
], ReviewController.prototype, "resumeOutreach", null);
__decorate([
    (0, common_1.Post)(':id/pick-up'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('blood_request.approve', 'Assigned'),
    (0, swagger_1.ApiOkResponse)({ type: review_queue_dto_1.ReviewQueueItemDto }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_h = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _h : Object]),
    __metadata("design:returntype", void 0)
], ReviewController.prototype, "pickUp", null);
__decorate([
    (0, common_1.Post)(':id/request-information'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('blood_request.approve', 'Assigned'),
    (0, swagger_1.ApiOkResponse)({ type: review_queue_dto_1.ReviewQueueItemDto }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, review_dto_1.RequestInformationDto, typeof (_j = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _j : Object]),
    __metadata("design:returntype", void 0)
], ReviewController.prototype, "requestInformation", null);
__decorate([
    (0, common_1.Post)(':id/verify'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('blood_request.approve', 'Assigned'),
    (0, swagger_1.ApiOkResponse)({ type: review_queue_dto_1.ReviewQueueItemDto }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, review_dto_1.VerifyRequestDto, typeof (_k = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _k : Object]),
    __metadata("design:returntype", void 0)
], ReviewController.prototype, "verify", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOkResponse)({ type: review_queue_dto_1.ReviewQueueItemDto }),
    (0, policy_guard_1.RequireAnyPermission)({ key: 'blood_request.approve', minScope: 'Assigned' }, { key: 'blood_request.reject_moderation', minScope: 'All' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, review_dto_1.RejectRequestDto, typeof (_l = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _l : Object]),
    __metadata("design:returntype", void 0)
], ReviewController.prototype, "reject", null);
exports.ReviewController = ReviewController = __decorate([
    (0, swagger_1.ApiTags)('staff-review'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('staff/requests'),
    __metadata("design:paramtypes", [review_service_1.ReviewService,
        outreach_service_1.OutreachService])
], ReviewController);
//# sourceMappingURL=review.controller.js.map