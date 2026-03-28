import Image from 'vista/image';
import { siteConfig } from '../data/site';

export default function Footer() {
  return (
    <footer className="w-full bg-background">
      <div className="flex h-[200px] w-full items-center justify-center overflow-hidden md:h-[300px]">
        <div className="opacity-100">
          <Image
            src="/vista.svg"
            alt="Vista Logo"
            width={500}
            height={500}
            className="h-auto max-w-[80vw] object-contain dark:invert md:max-w-none"
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 pb-8">
        <div className="mb-8 w-full border-t border-dashed border-foreground/12" />
        <div className="flex flex-col items-center justify-center gap-4 md:flex-row">
          <div className="text-sm font-medium tracking-tight text-foreground/55">
            &copy; {new Date().getFullYear()} {siteConfig.footer.copyright}
          </div>
        </div>
      </div>
    </footer>
  );
}
