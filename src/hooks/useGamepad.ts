import { useEffect } from 'react';

interface GamepadHandlers {
  onSpeed: (delta: 1 | -1) => void;
  onPause: () => void;
  onBack: () => void;
}

/**
 * 手柄支持：标准 Gamepad API 轮询。
 * 十字键/左摇杆 = 移动焦点（按 DOM 中 [data-pad] 顺序）
 * A=确认(点击) B=返回 Start=暂停 LB/RB=调速
 * 键鼠/触屏不受影响，拔插手柄即插即用。
 */
export function useGamepad(handlers: GamepadHandlers) {
  useEffect(() => {
    let raf = 0;
    const pressed = new Set<number>();
    let focusIdx = -1;
    let lastStickMove = 0;

    const focusables = (): HTMLElement[] =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-pad]'));

    const moveFocus = (dir: 1 | -1) => {
      const els = focusables();
      if (els.length === 0) return;
      focusIdx = (focusIdx + dir + els.length) % els.length;
      els[focusIdx].focus();
    };

    const poll = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const gp = [...pads].find(p => p && p.connected);
      if (gp) {
        const down = (i: number) => gp.buttons[i]?.pressed ?? false;
        const justPressed = (i: number) => {
          if (down(i) && !pressed.has(i)) { pressed.add(i); return true; }
          if (!down(i)) pressed.delete(i);
          return false;
        };
        // 十字键 12上13下14左15右；A=0 B=1 LB=4 RB=5 Start=9
        if (justPressed(14) || justPressed(12)) moveFocus(-1);
        if (justPressed(15) || justPressed(13)) moveFocus(1);
        if (justPressed(0)) {
          const el = document.activeElement as HTMLElement | null;
          el?.click();
        }
        if (justPressed(1)) handlers.onBack();
        if (justPressed(9)) handlers.onPause();
        if (justPressed(4)) handlers.onSpeed(-1);
        if (justPressed(5)) handlers.onSpeed(1);
        // 左摇杆粗导航（时间节流）
        const ax = gp.axes[0] ?? 0;
        const now = performance.now();
        if (Math.abs(ax) > 0.8 && now - lastStickMove > 260) {
          lastStickMove = now;
          moveFocus(ax > 0 ? 1 : -1);
        }
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [handlers]);
}
