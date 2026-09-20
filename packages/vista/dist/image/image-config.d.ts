export declare const imageConfigDefault: {
    deviceSizes: number[];
    imageSizes: number[];
    path: string;
    loader: "default";
    loaderFile: string;
    domains: string[];
    disableStaticImages: boolean;
    minimumCacheTTL: number;
    formats: readonly ["image/webp"];
    dangerouslyAllowSVG: boolean;
    contentSecurityPolicy: string;
    contentDispositionType: "inline";
    remotePatterns: any[];
    unoptimized: boolean;
};
/** Merge defaults with build-time env (`VISTA_IMAGES_UNOPTIMIZED`, static deploy). */
export declare function resolveRuntimeImageConfig(overrides?: ImageConfig): ImageConfigComplete;
export type ImageConfigComplete = typeof imageConfigDefault;
export type ImageConfig = Partial<ImageConfigComplete>;
export declare const VALID_LOADERS: readonly ["default", "imgix", "cloudinary", "akamai", "custom"];
export type LoaderValue = (typeof VALID_LOADERS)[number];
