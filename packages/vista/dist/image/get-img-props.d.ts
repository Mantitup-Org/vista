import { ImageConfigComplete } from './image-config';
import { ImageLoader } from './image-loader';
import React from 'react';
export type PlaceholderValue = 'blur' | 'empty';
export type ImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
    src: string;
    alt: string;
    width?: number | string;
    height?: number | string;
    fill?: boolean;
    loader?: ImageLoader;
    quality?: number | string;
    priority?: boolean;
    unoptimized?: boolean;
    placeholder?: PlaceholderValue;
    blurDataURL?: string;
    onLoadingComplete?: (result: {
        naturalWidth: number;
        naturalHeight: number;
    }) => void;
};
type ImgProps = React.ImgHTMLAttributes<HTMLImageElement> & {
    width?: number;
    height?: number;
    srcSet?: string;
};
export declare function getImgProps(props: ImageProps, config?: ImageConfigComplete, defaultLoader?: ImageLoader): ImgProps;
export declare const getImageProps: typeof getImgProps;
export {};
