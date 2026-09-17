import { tool } from './tool';
import type { ToolDefinition } from './types';

export interface DocumentEntry<TMetadata = any> {
  id: string;
  text: string;
  vector?: number[];
  metadata?: TMetadata;
}

export interface DocumentMatch<TMetadata = any> {
  id: string;
  text: string;
  score: number;
  metadata?: TMetadata;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

export class InMemoryVectorStore<TMetadata = any> {
  private documents: DocumentEntry<TMetadata>[] = [];

  addDocument(doc: DocumentEntry<TMetadata>): void {
    this.documents.push(doc);
  }

  addDocuments(docs: DocumentEntry<TMetadata>[]): void {
    this.documents.push(...docs);
  }

  search(queryVector: number[], topK: number = 3): DocumentMatch<TMetadata>[] {
    const scored: DocumentMatch<TMetadata>[] = [];

    for (const doc of this.documents) {
      if (!doc.vector) continue;
      const score = cosineSimilarity(queryVector, doc.vector);
      scored.push({
        id: doc.id,
        text: doc.text,
        score,
        metadata: doc.metadata,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  searchByKeyword(query: string, topK: number = 3): DocumentMatch<TMetadata>[] {
    const lowerQuery = query.toLowerCase();
    const scored: DocumentMatch<TMetadata>[] = [];

    for (const doc of this.documents) {
      const lowerText = doc.text.toLowerCase();
      let matchCount = 0;
      const terms = lowerQuery.split(/\s+/).filter(Boolean);
      for (const term of terms) {
        if (lowerText.includes(term)) matchCount++;
      }

      if (matchCount > 0) {
        scored.push({
          id: doc.id,
          text: doc.text,
          score: matchCount / terms.length,
          metadata: doc.metadata,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  clear(): void {
    this.documents = [];
  }
}

export interface RetrieverOptions<TMetadata = any> {
  name?: string;
  description?: string;
  store: InMemoryVectorStore<TMetadata>;
  embed?: (text: string) => Promise<number[]> | number[];
  topK?: number;
}

/**
 * Creates a knowledge retriever tool that can be provided directly to an AI agent.
 */
export function createRetrieverTool<TMetadata = any>(
  options: RetrieverOptions<TMetadata>
): ToolDefinition<{ query: string }> {
  const {
    name = 'search_knowledge_base',
    description = 'Search the knowledge base for relevant context, documentation, or domain facts.',
    store,
    embed,
    topK = 3,
  } = options;

  return tool({
    name,
    description,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query or keyword phrase to find context for',
        },
      },
      required: ['query'],
    },
    execute: async ({ query }: { query: string }) => {
      let matches: DocumentMatch<TMetadata>[] = [];
      if (embed) {
        const queryVector = await embed(query);
        matches = store.search(queryVector, topK);
      } else {
        matches = store.searchByKeyword(query, topK);
      }

      return matches.map((m) => ({
        id: m.id,
        content: m.text,
        score: Math.round(m.score * 100) / 100,
        metadata: m.metadata,
      }));
    },
  });
}
