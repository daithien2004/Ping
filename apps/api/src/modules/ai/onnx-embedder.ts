import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import type { Embedder, EmbeddingBatch, EmbeddingRole } from './embedder.port.js';

export class OnnxEmbedder implements Embedder {
  private loaded: Promise<FeatureExtractionPipeline> | undefined;

  constructor(readonly model: string) {}

  async embed(texts: readonly string[], role: EmbeddingRole): Promise<EmbeddingBatch> {
    if (texts.length === 0) {
      return { model: this.model, dimensions: 0, vectors: [] };
    }

    const extractor = await this.load();
    // E5 cần tiền tố "query: "/"passage: "; model khác thêm vào sẽ giảm chất lượng.
    const inputs = usesE5Prefix(this.model) ? texts.map((text) => `${role}: ${text}`) : [...texts];
    const output = await extractor(inputs, { pooling: 'mean', normalize: true });
    const vectors = output.tolist() as number[][];

    return {
      model: this.model,
      dimensions: vectors[0]?.length ?? 0,
      vectors,
    };
  }

  private load(): Promise<FeatureExtractionPipeline> {
    this.loaded ??= import('@huggingface/transformers')
      .then(({ pipeline }) => pipeline('feature-extraction', this.model, { dtype: 'q8' }))
      .catch((error: unknown) => {
        this.loaded = undefined;
        throw error;
      });
    return this.loaded;
  }
}

export function usesE5Prefix(model: string): boolean {
  return /(^|[/-])e5([-/]|$)/i.test(model);
}
