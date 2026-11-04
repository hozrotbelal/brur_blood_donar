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
exports.AreaController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const area_dto_1 = require("./area.dto");
const area_service_1 = require("./area.service");
let AreaController = class AreaController {
    areas;
    constructor(areas) {
        this.areas = areas;
    }
    list(query) {
        return this.areas.list(query);
    }
};
exports.AreaController = AreaController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOkResponse)({ type: area_dto_1.AreaPageDto, description: 'Active areas; any signed-in user' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [area_dto_1.AreaQueryDto]),
    __metadata("design:returntype", void 0)
], AreaController.prototype, "list", null);
exports.AreaController = AreaController = __decorate([
    (0, swagger_1.ApiTags)('reference-data'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('areas'),
    __metadata("design:paramtypes", [area_service_1.AreaService])
], AreaController);
//# sourceMappingURL=area.controller.js.map