import { useEffect, useRef, type ReactNode } from 'react';

export default function ActionMenu({ children }: Readonly<{ children: ReactNode }>) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      menu.open = false;
      menu.querySelector('summary')?.focus();
    };
    menu.addEventListener('keydown', closeOnEscape);
    return () => menu.removeEventListener('keydown', closeOnEscape);
  }, []);
  return <details ref={ref} className="app-action-menu">{children}</details>;
}
