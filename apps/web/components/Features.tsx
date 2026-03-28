import { features } from '../data/features';

export default function Features() {
    return (
        <section className="w-full px-4 py-20 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                        Framework surface
                    </p>
                    <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                    What ships in Vista now
                    </h2>
                    <p className="mt-4 text-base leading-8 text-muted-foreground md:text-lg">
                        The current framework surface is already shaped for real projects, with room to go deeper as the engine matures.
                    </p>
                </div>

                <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {features.map((feature, i) => (
                        <div
                            key={i}
                            className="rounded-[1.7rem] border border-border bg-panel-elevated/82 p-6 shadow-[0_18px_35px_rgba(15,23,42,0.05)] transition-transform duration-200 hover:-translate-y-1"
                        >
                            <h3 className="mb-3 text-lg font-medium text-foreground">{feature.title}</h3>
                            <p className="text-sm leading-7 text-muted-foreground">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
