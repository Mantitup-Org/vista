export type ArchitectureSide = 'left' | 'right' | 'top' | 'bottom';

export interface ArchitectureNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  lines?: string[];
}

export interface ArchitectureEdge {
  id: string;
  from: string;
  to: string;
  fromSide: ArchitectureSide;
  toSide: ArchitectureSide;
}

/** One scroll step: which nodes light and which edges draw. */
export interface RuntimeStep {
  id: string;
  title: string;
  description: string;
  nodes: string[];
  edges: string[];
}

export interface ArchitectureCanvas {
  width: number;
  height: number;
}
