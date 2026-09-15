import { agent, tool } from 'vista/ai';

/**
 * Safe arithmetic evaluator — supports +, -, *, /, parentheses, and decimal numbers.
 * Uses a recursive-descent parser; does NOT call eval or Function().
 * Throws on invalid input.
 */
function safeEval(expr: string): number {
  const tokens: string[] = expr.replace(/\s+/g, '').match(/(\d+\.?\d*|\.\d+|[+\-*/()])/g) ?? [];
  if (tokens.length === 0) throw new Error('Empty expression');

  let pos = 0;

  function peek(): string | undefined { return tokens[pos]; }
  function consume(): string { return tokens[pos++] ?? ''; }


  function parseNumber(): number {
    const tok = peek();
    if (!tok) throw new Error('Unexpected end');
    if (tok === '(') {
      consume(); // '('
      const val = parseAddSub();
      if (peek() !== ')') throw new Error('Missing closing parenthesis');
      consume(); // ')'
      return val;
    }
    if (/^-?\d+\.?\d*$/.test(tok) || /^\.\d+$/.test(tok)) {
      return parseFloat(consume());
    }
    throw new Error(`Unexpected token: ${tok}`);
  }

  function parseMulDiv(): number {
    let left = parseNumber();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const right = parseNumber();
      if (op === '/' && right === 0) throw new Error('Division by zero');
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parseAddSub(): number {
    let left = parseMulDiv();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  const result = parseAddSub();
  if (pos < tokens.length) throw new Error(`Unexpected token: ${tokens[pos]}`);
  return result;
}



const calculatorTool = tool({
  name: 'calculate',
  description: 'Evaluate a mathematical expression',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'The math expression to evaluate' },
    },
    required: ['expression'],
  },
  execute: async ({ expression }: { expression: string }) => {
    try {
      const result = safeEval(expression);
      return { expression, result };
    } catch {
      return { error: 'Invalid expression' };
    }
  },
});

const assistant = agent({
  name: 'vista-assistant',
  model: 'openai:gpt-4o',
  system: 'You are a helpful AI assistant built directly into Vista.js full-stack framework.',
  tools: [calculatorTool],
});

export async function POST(request: Request) {
  const { prompt } = await request.json();
  const streamResult = await assistant.stream(prompt || 'Hello Vista!');
  return streamResult.toTextStreamResponse();
}
