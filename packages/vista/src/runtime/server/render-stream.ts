/**
 * Fixes PPR shell leaks by ensuring Flight data is strictly separated
 */
export function createRenderStream(res: Response, isPPR: boolean) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // If PPR is enabled, we must ensure the static shell doesn't include 
  // the inline flight data meant for the 'ppr-page-content' marker.
  let shellInjected = false;

  return {
    stream: readable,
    injectShell: (html: string) => {
      if (!shellInjected) {
        writer.write(encoder.encode(html));
        shellInjected = true;
      }
    },
    injectFlight: (chunk: string) => {
      // Wrap flight chunks to prevent them from being parsed as HTML content
      // during the initial hydration of the PPR shell.
      const wrapped = `<script>window.__VISTA_FLIGHT_DATA__ += ${JSON.stringify(chunk)}</script>`;
      writer.write(encoder.encode(wrapped));
    },
    close: () => writer.close()
  };
}
