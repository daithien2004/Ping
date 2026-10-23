/** Token inject cho port AI. Tách khỏi `ai.module.ts` để tránh vòng import ESM. */
export const EMBEDDER = Symbol('EMBEDDER');
export const LLM_CLIENT = Symbol('LLM_CLIENT');
export const VECTOR_STORE = Symbol('VECTOR_STORE');
