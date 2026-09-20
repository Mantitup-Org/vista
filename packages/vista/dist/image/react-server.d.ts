import * as React from 'react';
import { type ImageProps } from './get-img-props';
export type EnhancedImageProps = ImageProps;
/**
 * React-server safe Image component.
 *
 * The full client Image implementation relies on browser-only hooks, so the
 * react-server condition uses a plain SSR-friendly <img> wrapper.
 */
export declare function Image(props: EnhancedImageProps): React.ReactElement;
export default Image;
