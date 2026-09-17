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
export declare function cosineSimilarity(a: number[], b: number[]): number;
export declare class InMemoryVectorStore<TMetadata = any> {
    private documents;
    addDocument(doc: DocumentEntry<TMetadata>): void;
    addDocuments(docs: DocumentEntry<TMetadata>[]): void;
    search(queryVector: number[], topK?: number): DocumentMatch<TMetadata>[];
    searchByKeyword(query: string, topK?: number): DocumentMatch<TMetadata>[];
    clear(): void;
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
export declare function createRetrieverTool<TMetadata = any>(options: RetrieverOptions<TMetadata>): ToolDefinition<{
    query: string;
}>;
