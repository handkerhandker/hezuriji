import { useEffect, useState } from 'react';

export type InputKind = 'mouse' | 'touch' | 'keyboard' | 'gamepad';

/** 侦测最近使用的输入设备：提示条和焦点样式随之自适应。 */
export function useLastInput(): InputKind {
  const [kind, setKind] = useState<InputKind>('mouse');

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      setKind(e.pointerType === 'touch' ? 'touch' : 'mouse');
    };
    const onKey = () => setKind('keyboard');
    const onPad = () => setKind('gamepad');
    window.addEventListener('pointerdown', onPointer, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('gamepadconnected', onPad);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('gamepadconnected', onPad);
    };
  }, []);

  return kind;
}

export const INPUT_HINTS: Record<InputKind, string> = {
  mouse: '空格 暂停/继续 · 1/2 速度 · R 日报 · M 指标',
  touch: '点按按钮控制 · 左右切标签 · 长按卡片看详情',
  keyboard: 'Tab 移动焦点 · 空格 暂停 · 1/2 速度 · R 日报 · M 指标',
  gamepad: '🎮 十字键移动焦点 · A 确认 · B 关闭 · Start 暂停 · 肩键调速',
};
