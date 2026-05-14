import { ReactNode } from "react";

interface Props {
  sectionKey: string;
  children: ReactNode;
}

export function SectionTransition({ children }: Props) {
  return <div className="h-full">{children}</div>;
}
