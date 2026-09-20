import React from 'react';
import { ImageProps } from './get-img-props';
export type EnhancedImageProps = ImageProps;
export declare const Image: React.ForwardRefExoticComponent<React.ImgHTMLAttributes<HTMLImageElement> & {
    src: string;
    alt: string;
    width?: number | string;
    height?: number | string;
    fill?: boolean;
    loader?: import("./image-loader").ImageLoader;
    quality?: number | string;
    priority?: boolean;
    unoptimized?: boolean;
    placeholder?: import("./get-img-props").PlaceholderValue;
    blurDataURL?: string;
    onLoadingComplete?: (result: {
        naturalWidth: number;
        naturalHeight: number;
    }) => void;
} & React.RefAttributes<HTMLImageElement>>;
export default Image;
