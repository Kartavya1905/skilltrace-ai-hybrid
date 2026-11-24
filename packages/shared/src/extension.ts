/**
 * The SkillTrace Chrome extension's fixed ID. apps/extension/extension-key.json pins it through the
 * manifest `key`, so every unpacked install (any machine, any release zip) gets this same ID and
 * the dashboard can reach it without setup. tests/unit/extension-release.test.ts checks they agree.
 */
export const SKILLTRACE_EXTENSION_ID = 'kecllpafndpfocijmodnoilonglpkjcf';
