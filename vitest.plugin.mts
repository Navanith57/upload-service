import ts from 'typescript';
import type { Plugin } from 'vitest/config';

// Nest DI and @nestjs/mongoose need `emitDecoratorMetadata`. Vite's default
// (oxc) transform emits the enum object for `design:type` where tsc emits
// `String`, which breaks @Prop enums. Transpile with tsc instead, using the
// project's own tsconfig.json (no extra dependency).
const { config } = ts.readConfigFile('./tsconfig.json', ts.sys.readFile);
const compilerOptions: ts.CompilerOptions = {
  ...ts.convertCompilerOptionsFromJson(config.compilerOptions, '.').options,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  sourceMap: true,
  inlineSources: true,
};

export const tscDecoratorMetadata: Plugin = {
  name: 'tsc-decorator-metadata',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('.ts') || id.includes('node_modules')) return;
    const out = ts.transpileModule(code, { compilerOptions, fileName: id });
    return { code: out.outputText, map: out.sourceMapText };
  },
};
