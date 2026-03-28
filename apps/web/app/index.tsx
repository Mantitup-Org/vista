
import Features from '@/components/Features';
import CopyCommand from '@/components/CopyCommand';


export default function Index() {
    return (
        <main className="relative flex min-h-screen flex-col items-center overflow-hidden bg-background pt-16 text-foreground selection:bg-primary/20 selection:text-primary">
            <div
                className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary rounded-full blur-[120px] opacity-15 pointer-events-none translate-x-1/3 -translate-y-1/3"
            />

            <div className="z-10 text-center max-w-5xl px-4 py-24 md:py-48">
                <h1 className="mb-6 bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text pb-2 text-5xl font-normal tracking-tighter text-transparent md:text-8xl">
                    The React Framework for <span className="text-foreground">Visionaries</span>.
                </h1>
                <p className="mx-auto max-w-2xl text-lg text-foreground/72 md:text-xl">
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
