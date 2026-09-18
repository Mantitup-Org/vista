import { ragAgent } from '../../../lib/rag-agent';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('[rag-chat] POST /api/rag-chat');
  console.log('[rag-chat] session:', sessionId ?? '(none)');
  console.log('[rag-chat] prompt:', prompt);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const agentStream = ragAgent.stream({ prompt, sessionId });
  const encoder = new TextEncoder();

  const logged = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of agentStream) {
          if (chunk.type === 'tool-call' && chunk.toolCall) {
            console.log(
              `[rag-chat] → tool-call  ${chunk.toolCall.name}(${JSON.stringify(chunk.toolCall.arguments)})`
            );
          } else if (chunk.type === 'tool-result' && chunk.toolResult) {
            const preview =
              typeof chunk.toolResult.result === 'string'
                ? chunk.toolResult.result
                : JSON.stringify(chunk.toolResult.result, null, 2);
            console.log(`[rag-chat] ← tool-result ${chunk.toolResult.name}`);
            console.log(preview);
          } else if (chunk.type === 'text-delta' && chunk.textDelta) {
            process.stdout.write(chunk.textDelta);
          } else if (chunk.type === 'step-finish') {
            console.log('\n[rag-chat] step-finish');
          } else if (chunk.type === 'error') {
            console.error('[rag-chat] error:', chunk.error);
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        console.log('[rag-chat] done\n');
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error: any) {
        console.error('[rag-chat] stream error:', error?.message || error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', error: error?.message || 'Stream error' })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(logged, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
