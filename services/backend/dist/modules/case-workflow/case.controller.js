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
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DonorAppointmentController = exports.CaseController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const policy_guard_1 = require("../../platform/policy/policy.guard");
const appointment_service_1 = require("./appointment.service");
const case_dto_1 = require("./case.dto");
const case_list_dto_1 = require("./case-list.dto");
const case_service_1 = require("./case.service");
const outcome_service_1 = require("./outcome.service");
const appointment_view_dto_1 = require("./appointment-view.dto");
let CaseController = class CaseController {
    cases;
    appointments;
    outcomes;
    constructor(cases, appointments, outcomes) {
        this.cases = cases;
        this.appointments = appointments;
        this.outcomes = outcomes;
    }
    list(req) {
        return this.cases.list(req.principal);
    }
    detail(id, req) {
        return this.cases.detail(req.principal, id);
    }
    start(id, req) {
        return this.cases.startScheduling(req.principal, id);
    }
    note(id, dto, req) {
        return this.cases.addNote(req.principal, id, dto);
    }
    contact(id, dto, req) {
        return this.cases.logContact(req.principal, id, dto);
    }
    propose(id, dto, req) {
        return this.appointments.propose(req.principal, id, dto);
    }
    reschedule(id, dto, req) {
        return this.appointments.reschedule(req.principal, id, dto);
    }
    noShow(id, req) {
        return this.appointments.recordNoShow(req.principal, id);
    }
    outcome(id, dto, req) {
        return this.outcomes.record(req.principal, id, dto);
    }
    dispute(id, outcomeId, dto, req) {
        return this.outcomes.dispute(req.principal, id, outcomeId, dto);
    }
    resolveDispute(id, outcomeId, dto, req) {
        return this.outcomes.resolveDispute(req.principal, id, outcomeId, dto);
    }
    fulfilment(id, req) {
        return this.outcomes.setFulfilment(req.principal, id);
    }
    moreDonors(id, dto, req) {
        return this.outcomes.moreDonors(req.principal, id, dto.needed);
    }
    declareUnable(id, dto, req) {
        return this.outcomes.declareUnable(req.principal, id, dto.reason);
    }
    close(id, dto, req) {
        return this.cases.close(req.principal, id, dto.note);
    }
};
exports.CaseController = CaseController;
__decorate([
    (0, common_1.Get)('cases'),
    (0, policy_guard_1.RequirePermission)('case.view', 'Assigned'),
    (0, swagger_1.ApiOkResponse)({ type: [case_list_dto_1.CaseListItemDto] }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _a : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('cases/:id'),
    (0, policy_guard_1.RequirePermission)('case.view', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_b = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "detail", null);
__decorate([
    (0, common_1.Post)('cases/:id/start-scheduling'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('case.edit', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_c = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "start", null);
__decorate([
    (0, common_1.Post)('cases/:id/notes'),
    (0, common_1.HttpCode)(201),
    (0, policy_guard_1.RequirePermission)('case.edit', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, case_dto_1.NoteDto, typeof (_d = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "note", null);
__decorate([
    (0, common_1.Post)('cases/:id/contact-attempts'),
    (0, common_1.HttpCode)(201),
    (0, policy_guard_1.RequirePermission)('case.edit', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, case_dto_1.ContactAttemptDto, typeof (_e = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "contact", null);
__decorate([
    (0, common_1.Post)('cases/:id/appointments'),
    (0, common_1.HttpCode)(201),
    (0, policy_guard_1.RequirePermission)('appointment.create', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, case_dto_1.ProposeAppointmentDto, typeof (_f = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "propose", null);
__decorate([
    (0, common_1.Post)('appointments/:id/reschedule'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('appointment.edit', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, case_dto_1.RescheduleDto, typeof (_g = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _g : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "reschedule", null);
__decorate([
    (0, common_1.Post)('appointments/:id/no-show'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('appointment.edit', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_h = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _h : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "noShow", null);
__decorate([
    (0, common_1.Post)('cases/:id/outcomes'),
    (0, common_1.HttpCode)(201),
    (0, policy_guard_1.RequirePermission)('outcome.report', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, case_dto_1.RecordOutcomeDto, typeof (_j = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _j : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "outcome", null);
__decorate([
    (0, common_1.Post)('cases/:id/outcomes/:outcomeId/dispute'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('case.edit', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('outcomeId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, case_dto_1.DisputeOutcomeDto, typeof (_k = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _k : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "dispute", null);
__decorate([
    (0, common_1.Post)('cases/:id/outcomes/:outcomeId/resolve-dispute'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('case.edit', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('outcomeId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, case_dto_1.ResolveDisputeDto, typeof (_l = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _l : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "resolveDispute", null);
__decorate([
    (0, common_1.Post)('cases/:id/fulfilment'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('case.edit', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_m = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _m : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "fulfilment", null);
__decorate([
    (0, common_1.Post)('cases/:id/more-donors'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('case.edit', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, case_dto_1.MoreDonorsDto, typeof (_o = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _o : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "moreDonors", null);
__decorate([
    (0, common_1.Post)('requests/:id/declare-unable'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('case.edit', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, case_dto_1.DeclareUnableDto, typeof (_p = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _p : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "declareUnable", null);
__decorate([
    (0, common_1.Post)('cases/:id/close'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('case.edit', 'Assigned'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, case_dto_1.CloseCaseDto, typeof (_q = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _q : Object]),
    __metadata("design:returntype", void 0)
], CaseController.prototype, "close", null);
exports.CaseController = CaseController = __decorate([
    (0, swagger_1.ApiTags)('cases'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('staff'),
    __metadata("design:paramtypes", [case_service_1.CaseService,
        appointment_service_1.AppointmentService,
        outcome_service_1.OutcomeService])
], CaseController);
let DonorAppointmentController = class DonorAppointmentController {
    appointments;
    constructor(appointments) {
        this.appointments = appointments;
    }
    list(req) {
        return this.appointments.listForDonor(req.principal);
    }
    confirm(id, req) {
        return this.appointments.confirm(req.principal, id);
    }
    timing(id, dto, req) {
        return this.appointments.reportTimingProblem(req.principal, id, dto);
    }
    donated(id, req) {
        return this.appointments.reportDonation(req.principal, id);
    }
};
exports.DonorAppointmentController = DonorAppointmentController;
__decorate([
    (0, common_1.Get)(),
    (0, policy_guard_1.RequirePermission)('appointment.view', 'Own'),
    (0, swagger_1.ApiResponse)({ status: 200, type: [appointment_view_dto_1.DonorAppointmentDto] }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_r = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _r : Object]),
    __metadata("design:returntype", void 0)
], DonorAppointmentController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(':id/confirm'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('appointment.edit', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_s = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _s : Object]),
    __metadata("design:returntype", void 0)
], DonorAppointmentController.prototype, "confirm", null);
__decorate([
    (0, common_1.Post)(':id/timing-problem'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('appointment.edit', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, case_dto_1.TimingProblemDto, typeof (_t = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _t : Object]),
    __metadata("design:returntype", void 0)
], DonorAppointmentController.prototype, "timing", null);
__decorate([
    (0, common_1.Post)(':id/report-donation'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('outcome.report', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_u = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _u : Object]),
    __metadata("design:returntype", void 0)
], DonorAppointmentController.prototype, "donated", null);
exports.DonorAppointmentController = DonorAppointmentController = __decorate([
    (0, swagger_1.ApiTags)('appointments'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('appointments'),
    __metadata("design:paramtypes", [appointment_service_1.AppointmentService])
], DonorAppointmentController);
//# sourceMappingURL=case.controller.js.map