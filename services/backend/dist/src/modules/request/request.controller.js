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
var _a, _b, _c, _d, _e, _f, _g, _h, _j;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const policy_guard_1 = require("../../platform/policy/policy.guard");
const request_dto_1 = require("./request.dto");
const request_service_1 = require("./request.service");
let RequestController = class RequestController {
    requests;
    constructor(requests) {
        this.requests = requests;
    }
    createPatient(dto, req) {
        return this.requests.createPatient(req.principal, dto);
    }
    listPatients(req) {
        return this.requests.listPatients(req.principal);
    }
    create(dto, req) {
        return this.requests.createRequest(req.principal, dto);
    }
    list(req) {
        return this.requests.listRequests(req.principal);
    }
    get(id, req) {
        return this.requests.getRequest(req.principal, id);
    }
    submit(id, req) {
        return this.requests.submit(req.principal, id);
    }
    cancel(id, dto, req) {
        return this.requests.cancel(req.principal, id, dto);
    }
    supply(id, dto, req) {
        return this.requests.supplyInformation(req.principal, id, dto);
    }
    timeline(id, req) {
        return this.requests.timeline(req.principal, id);
    }
};
exports.RequestController = RequestController;
__decorate([
    (0, common_1.Post)('patients'),
    (0, common_1.HttpCode)(201),
    (0, policy_guard_1.RequirePermission)('patient.create', 'Own'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [request_dto_1.CreatePatientDto, typeof (_a = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _a : Object]),
    __metadata("design:returntype", void 0)
], RequestController.prototype, "createPatient", null);
__decorate([
    (0, common_1.Get)('patients'),
    (0, policy_guard_1.RequirePermission)('patient.view', 'Own'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_b = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], RequestController.prototype, "listPatients", null);
__decorate([
    (0, common_1.Post)('requests'),
    (0, common_1.HttpCode)(201),
    (0, policy_guard_1.RequirePermission)('blood_request.create', 'Own'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [request_dto_1.CreateRequestDto, typeof (_c = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], RequestController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('requests'),
    (0, policy_guard_1.RequirePermission)('blood_request.view', 'Own'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], RequestController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('requests/:id'),
    (0, policy_guard_1.RequirePermission)('blood_request.view', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_e = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], RequestController.prototype, "get", null);
__decorate([
    (0, common_1.Post)('requests/:id/submit'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('blood_request.edit', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_f = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], RequestController.prototype, "submit", null);
__decorate([
    (0, common_1.Post)('requests/:id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('blood_request.cancel', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, request_dto_1.CancelRequestDto, typeof (_g = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _g : Object]),
    __metadata("design:returntype", void 0)
], RequestController.prototype, "cancel", null);
__decorate([
    (0, common_1.Post)('requests/:id/supply-information'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('blood_request.edit', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, request_dto_1.SupplyInformationDto, typeof (_h = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _h : Object]),
    __metadata("design:returntype", void 0)
], RequestController.prototype, "supply", null);
__decorate([
    (0, common_1.Get)('requests/:id/timeline'),
    (0, policy_guard_1.RequirePermission)('blood_request.view', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_j = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _j : Object]),
    __metadata("design:returntype", void 0)
], RequestController.prototype, "timeline", null);
exports.RequestController = RequestController = __decorate([
    (0, swagger_1.ApiTags)('requests'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [request_service_1.RequestService])
], RequestController);
//# sourceMappingURL=request.controller.js.map