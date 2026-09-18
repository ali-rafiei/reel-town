'use client';
import { useRef } from 'react';
// Virtual analog stick for touch: reports normalized (dx, dz) within the unit circle.
export function Joystick({ onChange }: { onChange: (dx: number, dz: number) => void }) {
  const base = useRef<HTMLDivElement>(null),
    knob = useRef<HTMLDivElement>(null),
    pointer = useRef<number | null>(null);
  function move(e: React.PointerEvent) {
    if (!base.current || !knob.current) return;
    const rect = base.current.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = (e.clientX - (rect.left + radius)) / (radius * 0.75),
      dz = (e.clientY - (rect.top + radius)) / (radius * 0.75);
    const length = Math.hypot(dx, dz);
    if (length > 1) {
      dx /= length;
      dz /= length;
    }
    knob.current.style.transform = `translate(${dx * radius * 0.55}px, ${dz * radius * 0.55}px)`;
    // A small dead zone stops the character creeping when the thumb rests.
    const dead = 0.12;
    onChange(Math.abs(dx) < dead ? 0 : dx, Math.abs(dz) < dead ? 0 : dz);
  }
  function release() {
    pointer.current = null;
    if (knob.current) knob.current.style.transform = '';
    onChange(0, 0);
  }
  return (
    <div
      ref={base}
      className="joystick"
      role="application"
      aria-label="Movement joystick"
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) move(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div ref={knob} className="knob" />
    </div>
  );
}
