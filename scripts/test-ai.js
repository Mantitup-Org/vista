const { agent } = require('../packages/vista/dist/ai/index.js');

async function test() {
  console.log('Testing Vista AI agent creation...');
  const supportAgent = agent({
    name: 'support',
    model: 'openai:gpt-4o',
    system: 'You are a helpful assistant.',
    memory: true
  });

  console.log('Agent created successfully. Attempting to run (expecting provider error due to missing API keys or package)...');
  
  try {
    await supportAgent('Hello');
  } catch (err) {
    if (err.message.includes('Failed to load provider') || err.message.includes('API key')) {
      console.log('Test passed! Expected provider error was thrown:', err.message);
    } else {
      console.error('Test failed! Unexpected error:', err);
    }
  }
}

test().catch(console.error);
