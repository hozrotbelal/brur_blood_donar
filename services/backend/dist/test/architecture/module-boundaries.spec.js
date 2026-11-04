"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const MODULES = (0, node_path_1.join)(__dirname, '..', '..', 'src', 'modules');
function files(dir) {
    return (0, node_fs_1.readdirSync)(dir).flatMap((name) => {
        const full = (0, node_path_1.join)(dir, name);
        return (0, node_fs_1.statSync)(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : [];
    });
}
describe('module boundaries', () => {
    const moduleNames = (0, node_fs_1.readdirSync)(MODULES);
    it('has the twelve module folders', () => {
        expect(moduleNames.sort()).toEqual([
            'appointments', 'audit', 'case-workflow', 'community', 'configuration', 'identity',
            'matching', 'moderation', 'notification', 'reporting', 'request', 'support',
        ].sort());
    });
    it.each(moduleNames)('%s imports other modules only through their public file', (name) => {
        const violations = [];
        for (const file of files((0, node_path_1.join)(MODULES, name))) {
            const imports = [...(0, node_fs_1.readFileSync)(file, 'utf8').matchAll(/from '(\.[^']+)'/g)].map((m) => m[1]);
            for (const spec of imports) {
                const resolved = (0, node_path_1.join)(file, '..', spec);
                const target = resolved.slice(MODULES.length + 1).split(/[\\/]/);
                if (target[0] && moduleNames.includes(target[0]) && target[0] !== name) {
                    if (!/^[a-z-]+\.public$/.test(target[1] ?? ''))
                        violations.push(`${file}: ${spec}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });
    it('keeps modules from importing the app root or entrypoints', () => {
        for (const file of files(MODULES)) {
            expect((0, node_fs_1.readFileSync)(file, 'utf8')).not.toMatch(/from '(\.\.\/)+(app\.module|entrypoints)/);
        }
    });
});
//# sourceMappingURL=module-boundaries.spec.js.map