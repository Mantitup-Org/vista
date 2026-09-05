"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryVectorStore = void 0;
exports.cosineSimilarity = cosineSimilarity;
exports.createRetrieverTool = createRetrieverTool;
const tool_1 = require("./tool");
function cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0)
        return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0)
        return 0;
    return dotProduct / denominator;
}
class InMemoryVectorStore {
    documents = [];
    addDocument(doc) {
        this.documents.push(doc);
    }
    addDocuments(docs) {
        this.documents.push(...docs);
    }
    search(queryVector, topK = 3) {
        const scored = [];
        for (const doc of this.documents) {
            if (!doc.vector)
                continue;
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
    searchByKeyword(query, topK = 3) {
        const lowerQuery = query.toLowerCase();
        const scored = [];
        for (const doc of this.documents) {
            const lowerText = doc.text.toLowerCase();
            let matchCount = 0;
            const terms = lowerQuery.split(/\s+/).filter(Boolean);
            for (const term of terms) {
                if (lowerText.includes(term))
                    matchCount++;
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
    clear() {
        this.documents = [];
    }
}
exports.InMemoryVectorStore = InMemoryVectorStore;
/**
 * Creates a knowledge retriever tool that can be provided directly to an AI agent.
 */
function createRetrieverTool(options) {
    const { name = 'search_knowledge_base', description = 'Search the knowledge base for relevant context, documentation, or domain facts.', store, embed, topK = 3, } = options;
    return (0, tool_1.tool)({
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
        execute: async ({ query }) => {
            let matches = [];
            if (embed) {
                const queryVector = await embed(query);
                matches = store.search(queryVector, topK);
            }
            else {
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
