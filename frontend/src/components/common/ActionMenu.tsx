import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';

export default function ActionMenu({ children }: Readonly<{ children: ReactNode }>) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menu.open) return;
      event.preventDefault();
      menu.open = false;
      menu.querySelector('summary')?.focus();
    };

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menu.open) return;
      if (!menu.contains(event.target as Node)) {
        menu.open = false;
      }
    };

    menu.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => {
      menu.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsideClick);
    };
  }, []);

  const handleClick = (event: MouseEvent<HTMLDetailsElement>) => {
    const target = event.target as Element | null;
    const menuItem = target?.closest('.app-action-menu-content button:not(:disabled), .app-action-menu-content a');
    if (menuItem && ref.current) {
      ref.current.open = false;
    }
  };

  return (
    <details ref={ref} className="app-action-menu" onClick={handleClick}>
      {children}
    </details>
  );
}
