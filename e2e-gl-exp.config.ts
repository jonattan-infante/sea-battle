// TEMPORAL (experimento del PR #45, se quita antes de fusionar): la config del e2e con el WebGL de GL_EXP
import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import { glArgs } from './scripts/ci/gl-exp';

export default defineConfig({
  ...base,
  projects: base.projects!.map((p) => ({ ...p, use: { ...p.use, launchOptions: { args: glArgs() } } }))
});
