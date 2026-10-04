#!/usr/bin/env node

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { setImmediate: nextTurn } = require('node:timers/promises');

const { AgentStream } = require('../../dist/ai/stream.js');

test('AgentStream.toDataStreamResponse respects backpressure and propagates cancellation', async () => {
  let produced = 0;
  let cleanedUp = false;

  async function* source() {
    try {
      for (let i = 0; i < 20; i++) {
        produced++;
        yield { type: 'text-delta', textDelta: String(i) };
      }
    } finally {
      cleanedUp = true;
    }
  }

  const stream = new AgentStream(source());
  const response = stream.toDataStreamResponse();
  await nextTurn();

  // Backpressure: should not prefetch more than initial buffer (1 chunk)
  assert.equal(produced, 1, 'Should only pull on demand');

  // Cancel response body
  await response.body.cancel('client disconnected');

  // Cancellation must propagate to underlying generator
  assert.equal(cleanedUp, true, 'Cancellation should close source generator');
});

test('AgentStream.toTextStreamResponse respects backpressure and propagates cancellation', async () => {
  let produced = 0;
  let cleanedUp = false;

  async function* source() {
    try {
      for (let i = 0; i < 20; i++) {
        produced++;
        yield { type: 'text-delta', textDelta: String(i) };
      }
    } finally {
      cleanedUp = true;
    }
  }

  const stream = new AgentStream(source());
  const response = stream.toTextStreamResponse();
  await nextTurn();

  // Backpressure: should not prefetch all 20 events
  assert.equal(produced, 1, 'Should only pull on demand');

  // Cancel response body
  await response.body.cancel('client aborted');

  // Cancellation must propagate to underlying generator
  assert.equal(cleanedUp, true, 'Cancellation should close source generator');
});

test('AgentStream handles natural stream exhaustion without errors', async () => {
  async function* source() {
    yield { type: 'text-delta', textDelta: 'Hello ' };
    yield { type: 'text-delta', textDelta: 'World' };
  }

  const stream = new AgentStream(source());
  const response = stream.toTextStreamResponse();
  const text = await response.text();
  assert.equal(text, 'Hello World');
});

test('AgentStream.toDataStreamResponse emits SSE lines and DONE marker', async () => {
  async function* source() {
    yield { type: 'text-delta', textDelta: 'Alpha' };
  }

  const stream = new AgentStream(source());
  const response = stream.toDataStreamResponse();
  const text = await response.text();

  assert.ok(text.includes('data: {"type":"text-delta","textDelta":"Alpha"}'));
  assert.ok(text.includes('data: [DONE]'));
});
