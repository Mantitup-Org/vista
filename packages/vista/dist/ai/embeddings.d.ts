export interface EmbedOptions {
    model?: string;
    apiKey?: string;
    baseURL?: string;
}
export declare function embedTexts(texts: string[], options?: EmbedOptions): Promise<number[][]>;
export declare function embedText(text: string, options?: EmbedOptions): Promise<number[]>;
export declare function createEmbeddings(options?: EmbedOptions): {
    embedText: (text: string) => Promise<number[]>;
    embedTexts: (texts: string[]) => Promise<number[][]>;
};
