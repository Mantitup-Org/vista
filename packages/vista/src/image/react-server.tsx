import * as React from 'react';
import { getImgProps, type ImageProps } from './get-img-props';
import { resolveRuntimeImageConfig } from './image-config';
import { defaultLoader } from './image-loader';

export type EnhancedImageProps = ImageProps;

/**
 * React-server safe Image component.
 *
 * The full client Image implementation relies on browser-only hooks, so the
 * react-server condition uses a plain SSR-friendly <img> wrapper.
 */
export function Image(props: EnhancedImageProps): React.ReactElement {
  const imgProps = getImgProps(props, resolveRuntimeImageConfig(), defaultLoader);

  return (
    <img
      {...imgProps}
      decoding={props.priority ? 'sync' : 'async'}
      fetchPriority={props.priority ? 'high' : undefined}
    />
  );
}

export { getImgProps, getImageProps } from './get-img-props';
export default Image;
