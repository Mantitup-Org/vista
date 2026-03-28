import Image from 'vista/image';

export default function Index() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-black transition-colors duration-200">
      <div className="-mt-20 mb-10 relative border border-dashed border-gray-300 dark:border-neutral-700 p-10">
        <div className="absolute -top-0 -left-0 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border border-dashed border-gray-300 dark:border-neutral-700 rounded-full" />
        <div className="absolute -bottom-0 -right-0 translate-x-1/2 translate-y-1/2 w-24 h-24 border border-dashed border-gray-300 dark:border-neutral-700 rounded-full" />
        <Image
          src="/vista.svg"
          alt="Vista Logo"
          width={600}
          height={600}
          unoptimized
          className="dark:invert"
        />
      </div>

      <h1 className="max-w-xs sm:max-w-none text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50 text-center">
        To get started, edit the index.tsx file.
      </h1>
    </main>
  );
}
