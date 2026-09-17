import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseModelIdentifier,
  resolveModel,
  createMockModel,
  createOpenAIModel,
  createAnthropicModel,
  createGeminiModel,
} from '../../src/ai';

test('parseModelIdentifier correctly separates provider and modelName', () => {
  assert.deepEqual(parseModelIdentifier('openai:gpt-4o'), {
    provider: 'openai',
    modelName: 'gpt-4o',
  });

  assert.deepEqual(parseModelIdentifier('anthropic:claude-3-5-sonnet-20241022'), {
    provider: 'anthropic',
    modelName: 'claude-3-5-sonnet-20241022',
  });

  assert.deepEqual(parseModelIdentifier('gemini:gemini-1.5-flash'), {
    provider: 'gemini',
    modelName: 'gemini-1.5-flash',
  });

  assert.deepEqual(parseModelIdentifier('ollama:llama3'), {
    provider: 'ollama',
    modelName: 'llama3',
  });

  assert.deepEqual(parseModelIdentifier('mock:echo'), {
    provider: 'mock',
    modelName: 'echo',
  });

  // Bare names
  assert.equal(parseModelIdentifier('gpt-4o-mini').provider, 'openai');
  assert.equal(parseModelIdentifier('claude-3-haiku').provider, 'anthropic');
  assert.equal(parseModelIdentifier('gemini-1.5-pro').provider, 'gemini');
});

test('resolveModel instantiates the correct provider driver', () => {
  const mockModel = resolveModel('mock:test');
  assert.equal(mockModel.provider, 'mock');
  assert.equal(mockModel.modelName, 'test');

  const openaiModel = resolveModel('openai:gpt-4o');
  assert.equal(openaiModel.provider, 'openai');
  assert.equal(openaiModel.modelName, 'gpt-4o');

  const anthropicModel = resolveModel('anthropic:claude-3-5-sonnet');
  assert.equal(anthropicModel.provider, 'anthropic');
  assert.equal(anthropicModel.modelName, 'claude-3-5-sonnet');

  const geminiModel = resolveModel('gemini:gemini-1.5-flash');
  assert.equal(geminiModel.provider, 'gemini');
  assert.equal(geminiModel.modelName, 'gemini-1.5-flash');

  const ollamaModel = resolveModel('ollama:mistral');
  assert.equal(ollamaModel.provider, 'openai');
  assert.equal(ollamaModel.modelName, 'mistral');
});

test('mock model generates and streams text', async () => {
  const model = createMockModel({
    defaultResponse: 'Hello from Vista AI mock model!',
  });

  const res = await model.generateText({
    messages: [{ role: 'user', content: 'Say hello' }],
  });

  assert.equal(res.text, 'Hello from Vista AI mock model!');
  assert.ok(res.usage);
  assert.equal(res.finishReason, 'stop');

  // Stream
  const chunks: string[] = [];
  for await (const chunk of model.streamText({
    messages: [{ role: 'user', content: 'Say hello' }],
  })) {
    if (chunk.type === 'text-delta' && chunk.textDelta) {
      chunks.push(chunk.textDelta);
    }
  }

  assert.equal(chunks.join(''), 'Hello from Vista AI mock model!');
});
