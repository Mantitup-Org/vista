import type { LanguageModel, ModelOptions } from '../types';
export interface ParsedModel {
    provider: string;
    modelName: string;
}
export declare function parseModelIdentifier(model: string): ParsedModel;
export declare function resolveModel(model: string | LanguageModel, options?: Partial<ModelOptions>): LanguageModel;
