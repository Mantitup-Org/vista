export interface HeroLine {
  text: string;
  /** Dimmed line, used for the first headline row. */
  muted?: boolean;
}

export interface HeroAsideLine {
  text: string;
  /** Tailwind margin class that stair-steps the line. */
  indentClass: string;
}

export interface HeroContent {
  lines: HeroLine[];
  aside: HeroAsideLine[];
}

export interface RuntimeSectionContent {
  kicker: string;
  title: string;
  titleMuted: string;
  /** Words revealed above the copy command once it docks. */
  dockCaption: string[];
}

export interface ClosingNoteContent {
  title: string;
  paragraphs: string[];
}
