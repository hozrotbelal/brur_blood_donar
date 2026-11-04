"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CaseModule = void 0;
const common_1 = require("@nestjs/common");
const status_history_service_1 = require("../../platform/status/status-history.service");
const appointment_service_1 = require("./appointment.service");
const case_controller_1 = require("./case.controller");
const case_service_1 = require("./case.service");
const case_support_1 = require("./case.support");
const outcome_service_1 = require("./outcome.service");
let CaseModule = class CaseModule {
};
exports.CaseModule = CaseModule;
exports.CaseModule = CaseModule = __decorate([
    (0, common_1.Module)({
        controllers: [case_controller_1.CaseController, case_controller_1.DonorAppointmentController],
        providers: [case_service_1.CaseService, appointment_service_1.AppointmentService, outcome_service_1.OutcomeService, case_support_1.CaseSupport, status_history_service_1.StatusHistoryService],
        exports: [case_service_1.CaseService],
    })
], CaseModule);
//# sourceMappingURL=case-workflow.module.js.map