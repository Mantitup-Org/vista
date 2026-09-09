export async function resolveProvider(modelString: string): Promise<any> {
  const [providerId, ...modelIdParts] = modelString.split(':');
  const modelId = modelIdParts.join(':');

  if (!providerId || !modelId) {
    throw new Error(
      `[vista/ai] Invalid model format: "${modelString}". Expected format "provider:model" (e.g. "openai:gpt-4o").`
    );
  }

  try {
    switch (providerId.toLowerCase()) {
      case 'openai': {
        // @ts-ignore
        const { openai } = await import('@ai-sdk/openai');
        return openai(modelId);
      }
      case 'anthropic': {
        // @ts-ignore
        const { anthropic } = await import('@ai-sdk/anthropic');
        return anthropic(modelId);
      }
      case 'google':
      case 'gemini': {
        // @ts-ignore
        const { google } = await import('@ai-sdk/google');
        return google(modelId);
      }
      case 'mistral': {
        // @ts-ignore
        const { mistral } = await import('@ai-sdk/mistral');
        return mistral(modelId);
      }
      case 'cohere': {
        // @ts-ignore
        const { cohere } = await import('@ai-sdk/cohere');
        return cohere(modelId);
      }
      case 'ollama': {
        // @ts-ignore
        const { ollama } = await import('ollama-ai-provider');
        return ollama(modelId);
      }
      default:
        throw new Error(`[vista/ai] Unsupported provider: "${providerId}"`);
    }
  } catch (error: any) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message.includes('Cannot find module')) {
      const packageName = providerId === 'ollama' ? 'ollama-ai-provider' : `@ai-sdk/${providerId}`;
      throw new Error(
        `[vista/ai] Failed to load provider "${providerId}". Please ensure it is installed:\n  npm install ${packageName}\n\nOriginal error: ${error.message}`
      );
    }
    throw error;
  }
}
