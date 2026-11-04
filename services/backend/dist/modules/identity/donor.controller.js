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
exports.DonorController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const policy_guard_1 = require("../../platform/policy/policy.guard");
const donor_dto_1 = require("./donor.dto");
const donor_service_1 = require("./donor.service");
const profile_view_dto_1 = require("./profile-view.dto");
const profile_view_dto_2 = require("./profile-view.dto");
const toEnum = (values) => Object.fromEntries(values.map((v) => [v, v]));
const consentType = new common_1.ParseEnumPipe(toEnum(donor_dto_1.CONSENT_TYPES));
const category = new common_1.ParseEnumPipe(toEnum(donor_dto_1.NOTIFICATION_CATEGORIES));
let DonorController = class DonorController {
    donors;
    constructor(donors) {
        this.donors = donors;
    }
    profile(req) {
        return this.donors.getProfile(req.principal);
    }
    saveProfile(dto, req) {
        return this.donors.saveProfile(req.principal, dto);
    }
    availability(req) {
        return this.donors.getAvailability(req.principal);
    }
    saveAvailability(dto, req) {
        return this.donors.saveAvailability(req.principal, dto);
    }
    locations(req) {
        return this.donors.listLocations(req.principal);
    }
    proposeLocation(dto, req) {
        return this.donors.proposeLocation(req.principal, dto);
    }
    confirmLocation(id, req) {
        return this.donors.confirmLocation(req.principal, id);
    }
    consents(req) {
        return this.donors.listConsents(req.principal);
    }
    saveConsent(type, dto, req) {
        return this.donors.saveConsent(req.principal, type, dto);
    }
    preferences(req) {
        return this.donors.listNotificationPreferences(req.principal);
    }
    savePreference(cat, dto, req) {
        return this.donors.savePreference(req.principal, cat, dto);
    }
};
exports.DonorController = DonorController;
__decorate([
    (0, common_1.Get)('profiles/donor'),
    (0, policy_guard_1.RequirePermission)('donor_profile.view', 'Own'),
    (0, swagger_1.ApiResponse)({ status: 200, type: profile_view_dto_1.DonorProfileDto }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _a : Object]),
    __metadata("design:returntype", void 0)
], DonorController.prototype, "profile", null);
__decorate([
    (0, common_1.Put)('profiles/donor'),
    (0, policy_guard_1.RequirePermission)('donor_profile.edit', 'Own'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [donor_dto_1.SaveDonorProfileDto, typeof (_b = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], DonorController.prototype, "saveProfile", null);
__decorate([
    (0, common_1.Get)('profiles/donor/availability'),
    (0, policy_guard_1.RequirePermission)('donor_profile.view', 'Own'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], DonorController.prototype, "availability", null);
__decorate([
    (0, common_1.Put)('profiles/donor/availability'),
    (0, policy_guard_1.RequirePermission)('donor_profile.edit', 'Own'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [donor_dto_1.SaveAvailabilityDto, typeof (_d = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], DonorController.prototype, "saveAvailability", null);
__decorate([
    (0, common_1.Get)('profiles/donor/locations'),
    (0, policy_guard_1.RequirePermission)('donor_location.manage_own', 'Own'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_e = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], DonorController.prototype, "locations", null);
__decorate([
    (0, common_1.Post)('profiles/donor/locations'),
    (0, common_1.HttpCode)(201),
    (0, policy_guard_1.RequirePermission)('donor_location.manage_own', 'Own'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [donor_dto_1.ProposeLocationDto, typeof (_f = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], DonorController.prototype, "proposeLocation", null);
__decorate([
    (0, common_1.Post)('profiles/donor/locations/:id/confirm'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('donor_location.manage_own', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_g = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _g : Object]),
    __metadata("design:returntype", void 0)
], DonorController.prototype, "confirmLocation", null);
__decorate([
    (0, common_1.Get)('consents'),
    (0, policy_guard_1.RequirePermission)('consent.manage_own', 'Own'),
    (0, swagger_1.ApiResponse)({ status: 200, type: [profile_view_dto_2.ConsentViewDto] }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_h = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _h : Object]),
    __metadata("design:returntype", void 0)
], DonorController.prototype, "consents", null);
__decorate([
    (0, common_1.Put)('consents/:type'),
    (0, policy_guard_1.RequirePermission)('consent.manage_own', 'Own'),
    __param(0, (0, common_1.Param)('type', consentType)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, donor_dto_1.SaveConsentDto, typeof (_j = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _j : Object]),
    __metadata("design:returntype", void 0)
], DonorController.prototype, "saveConsent", null);
__decorate([
    (0, common_1.Get)('notification-preferences'),
    (0, policy_guard_1.RequirePermission)('account.edit', 'Own'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_k = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _k : Object]),
    __metadata("design:returntype", void 0)
], DonorController.prototype, "preferences", null);
__decorate([
    (0, common_1.Put)('notification-preferences/:category'),
    (0, policy_guard_1.RequirePermission)('account.edit', 'Own'),
    __param(0, (0, common_1.Param)('category', category)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, donor_dto_1.SaveNotificationPreferenceDto, typeof (_l = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _l : Object]),
    __metadata("design:returntype", void 0)
], DonorController.prototype, "savePreference", null);
exports.DonorController = DonorController = __decorate([
    (0, swagger_1.ApiTags)('donor'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [donor_service_1.DonorService])
], DonorController);
//# sourceMappingURL=donor.controller.js.map