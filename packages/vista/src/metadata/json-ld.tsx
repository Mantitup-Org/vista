/**
 * SSR-safe JSON-LD helpers for structured data.
 */

import * as React from 'react';

function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Serialize structured data for embedding in a script tag. */
export function jsonLd(data: unknown): string {
  return serializeJsonLd(data);
}

export interface JsonLdProps {
  data: unknown;
  id?: string;
}

/**
 * Renders `<script type="application/ld+json">` with XSS-safe serialization.
 * Prefer this over hand-rolling dangerouslySetInnerHTML.
 */
export function JsonLd({ data, id }: JsonLdProps): React.ReactElement {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
