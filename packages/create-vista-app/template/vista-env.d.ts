/// <reference types="vista" />
/// <reference types="vista/image/image-types/global" />

// NOTE: This file should not be edited
// see https://vista.xyz/docs/env for more information.

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css';
