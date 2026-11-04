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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewQueueItemDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ReviewQueueItemDto {
    id;
    referenceNo;
    patientName;
    requestedBloodGroup;
    component;
    quantityUnits;
    requiredBy;
    urgency;
    priority;
    status;
    areaId;
    contactPhone;
    hasModerationHold;
    assignedSupportUserId;
    submittedAt;
    firstActionAt;
    version;
}
exports.ReviewQueueItemDto = ReviewQueueItemDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ReviewQueueItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ReviewQueueItemDto.prototype, "referenceNo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ReviewQueueItemDto.prototype, "patientName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ReviewQueueItemDto.prototype, "requestedBloodGroup", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ReviewQueueItemDto.prototype, "component", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ReviewQueueItemDto.prototype, "quantityUnits", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date' }),
    __metadata("design:type", String)
], ReviewQueueItemDto.prototype, "requiredBy", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ReviewQueueItemDto.prototype, "urgency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ReviewQueueItemDto.prototype, "priority", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ReviewQueueItemDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], ReviewQueueItemDto.prototype, "areaId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String, description: 'Masked phone number' }),
    __metadata("design:type", Object)
], ReviewQueueItemDto.prototype, "contactPhone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], ReviewQueueItemDto.prototype, "hasModerationHold", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], ReviewQueueItemDto.prototype, "assignedSupportUserId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", String)
], ReviewQueueItemDto.prototype, "submittedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], ReviewQueueItemDto.prototype, "firstActionAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ReviewQueueItemDto.prototype, "version", void 0);
//# sourceMappingURL=review-queue.dto.js.map