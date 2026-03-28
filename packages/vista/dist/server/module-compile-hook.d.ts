type ClientModuleProxyFactory = (id: string) => any;
export declare function installModuleCompileHook(options: {
    cwd: string;
    createClientModuleProxy?: ClientModuleProxyFactory;
    cacheComponentsEnabled?: boolean;
}): void;
export {};
