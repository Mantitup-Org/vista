import { features } from '../data/features';

export default function Features() {
    return (
        <section className="flex min-h-screen w-full flex-col justify-center bg-background px-4 py-24 text-foreground">
            <div className="max-w-7xl mx-auto w-full">
                <h2 className="text-3xl md:text-5xl font-normal mb-16 text-center tracking-tight">
                    What ships in Vista now
                </h2>

                <div className="grid grid-cols-1 border-l border-t border-dashed border-foreground/12 bg-foreground/[0.02] md:grid-cols-2 lg:grid-cols-4 dark:bg-white/[0.03]">
                    {features.map((feature, i) => (
                        <div
                            key={i}
                            className="border-b border-r border-dashed border-foreground/12 p-8 transition-colors hover:bg-foreground/[0.04] dark:hover:bg-white/[0.05]"
                        >
                            <h3 className="text-lg font-medium mb-3">{feature.title}</h3>
                            <p className="text-sm leading-relaxed text-foreground/72">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
