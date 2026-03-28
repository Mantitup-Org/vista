
import Features from '@/components/Features';
import CopyCommand from '@/components/CopyCommand';


export default function Index() {
    return (
        <main className="flex min-h-screen flex-col items-center relative overflow-hidden bg-black selection:bg-primary/20 selection:text-primary pt-16">
            <div
                className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary rounded-full blur-[120px] opacity-15 pointer-events-none translate-x-1/3 -translate-y-1/3"
            />

            <div className="z-10 text-center max-w-5xl px-4 py-24 md:py-48">
                <h1 className="text-5xl md:text-8xl font-normal tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/70 mb-6 pb-2">
                    The React Framework for <span className="text-white">Visionaries</span>.
                </h1>
                <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto">
                    Built for the <span className="text-primary">creators of tomorrow</span>, Vista provides a modern, optimized foundation for your ideas. Perfect for learning, experimenting, and shipping.
                </p>

                {/* CLI Command Copy - Trigger HMR */}
                <CopyCommand />

            </div>

            {/* Features Section */}
            <Features />
        </main>
    );
}
