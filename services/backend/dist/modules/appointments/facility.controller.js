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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FacilityController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const facility_dto_1 = require("./facility.dto");
const facility_service_1 = require("./facility.service");
let FacilityController = class FacilityController {
    facilities;
    constructor(facilities) {
        this.facilities = facilities;
    }
    list(query) {
        return this.facilities.list(query);
    }
};
exports.FacilityController = FacilityController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOkResponse)({ type: facility_dto_1.FacilityPageDto, description: 'Active facilities; any signed-in user' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [facility_dto_1.FacilityQueryDto]),
    __metadata("design:returntype", void 0)
], FacilityController.prototype, "list", null);
exports.FacilityController = FacilityController = __decorate([
    (0, swagger_1.ApiTags)('reference-data'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('facilities'),
    __metadata("design:paramtypes", [facility_service_1.FacilityService])
], FacilityController);
//# sourceMappingURL=facility.controller.js.map