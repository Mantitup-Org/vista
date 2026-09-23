
import { ImageConfigComplete, imageConfigDefault } from './image-config';
import { ImageLoader, defaultLoader as defaultImageLoader } from './image-loader';
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
  onLoadingComplete?: (result: { naturalWidth: number; naturalHeight: number }) => void;
};

type ImgProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  width?: number;
  height?: number;
  srcSet?: string;
};

// Helper: Generate srcSet
function generateSrcSet(
  src: string,
  _width: number | undefined,
  loader: ImageLoader,
  config: ImageConfigComplete,
  unoptimized: boolean,
  quality?: number
): string | undefined {
  if (unoptimized) return undefined;

  const { deviceSizes, imageSizes } = config;
  const sizes = [...deviceSizes, ...imageSizes].sort((a, b) => a - b);

  return sizes
    .map((size) => {
      const url = loader({ src, width: size, quality });
      return `${url} ${size}w`;
    })
    .join(', ');
}

export function getImgProps(
  props: ImageProps,
  config: ImageConfigComplete = imageConfigDefault,
  defaultLoader: ImageLoader = defaultImageLoader
): ImgProps {
  const {
    src,
    alt,
    width,
    height,
    fill,
    loader = defaultLoader,
    quality,
    priority,
    unoptimized,
    style,
    sizes,
    className,
    loading,
    placeholder: _placeholder,
    blurDataURL: _blurDataURL,
    onLoadingComplete: _onLoadingComplete,
    ...rest
  } = props;

  const imgStyle: React.CSSProperties = { ...style };
  
  // Handle Fill Mode
  if (fill) {
    imgStyle.position = 'absolute';
    imgStyle.height = '100%';
    imgStyle.width = '100%';
    imgStyle.inset = 0;
    imgStyle.objectFit = 'cover'; // Default to cover for bg images
  }

  // Handle Dimensions
  const widthInt = width ? Number(width) : undefined;
  const heightInt = height ? Number(height) : undefined;

  const vercelStaticBuild =
    typeof window === 'undefined' &&
    (process.env.VERCEL === '1' || typeof process.env.VERCEL_URL === 'string');

  const srcPath = String(src || '')
    .split('?')[0]
    .toLowerCase();
  const passthroughSrc =
    srcPath.startsWith('data:') ||
    srcPath.startsWith('blob:') ||
    srcPath.endsWith('.svg') ||
    srcPath.endsWith('.gif') ||
    srcPath.endsWith('.ico');

  const staticHost =
    process.env.VISTA_DEPLOY_OUTPUT === 'static' ||
    process.env.VISTA_IMAGES_UNOPTIMIZED === '1' ||
    process.env.CF_PAGES === '1' ||
    process.env.NETLIFY === 'true';

  // Skip /_vista/image when the optimizer is unavailable (static CDN hosts)
  // or the format cannot be resized (SVG/GIF/ICO).
  const disableOptimization =
    !!unoptimized || !!config.unoptimized || passthroughSrc || staticHost || vercelStaticBuild;

  // Generate SrcSet
  const srcSet = generateSrcSet(
    src,
    widthInt,
    loader,
    config,
    disableOptimization,
    quality ? Number(quality) : undefined
  );

  const defaultWidth =
    widthInt ||
    (config.deviceSizes && config.deviceSizes.length > 0
      ? config.deviceSizes[config.deviceSizes.length - 1]
      : 1920);

  const finalSrc = disableOptimization
    ? src
    : loader({
        src,
        width: defaultWidth,
        quality: quality ? Number(quality) : undefined,
      });

  return {
    ...rest,
    src: finalSrc,
    alt,
    width: widthInt,
    height: heightInt,
    loading: priority ? 'eager' : (loading || 'lazy'),
    // fetchPriority: priority ? 'high' : undefined, // React types might strict on this
    style: imgStyle,
    sizes: sizes || (fill ? '100vw' : undefined),
    srcSet,
    className,
  };
}

export const getImageProps = getImgProps;
