import { features } from '../data/features';

export default function Features() {
    const borderColor = 'color-mix(in srgb, #ffffff 18%, transparent)';
    const panelBackground = 'color-mix(in srgb, #000000 92%, #ffffff 8%)';
    const bodyColor = 'color-mix(in srgb, #ffffff 72%, transparent)';

    return (
        <section className="min-h-screen flex flex-col justify-center py-24 px-4 w-full bg-black text-zinc-100">
            <div className="max-w-7xl mx-auto w-full">
                <h2 className="text-3xl md:text-5xl font-normal mb-16 text-center tracking-tight">
                    What ships in Vista now
                </h2>

                <div
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border-t border-l border-dashed"
                    style={{ borderColor, backgroundColor: panelBackground }}
                >
                    {features.map((feature, i) => (
                        <div
                            key={i}
                            className="p-8 border-r border-b border-dashed transition-colors hover:bg-zinc-900/70"
                            style={{ borderColor }}
                        >
                            <h3 className="text-lg font-medium mb-3">{feature.title}</h3>
                            <p className="text-sm leading-relaxed" style={{ color: bodyColor }}>
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
