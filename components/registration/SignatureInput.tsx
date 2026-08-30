"use client";

import { useEffect, useRef } from "react";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
};

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 240;

export default function SignatureInput({ id, value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) return;

    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value;
  }, [value]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = point(event);
    context.beginPath();
    context.moveTo(next.x, next.y);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 4;
    context.strokeStyle = "#111827";
    drawingRef.current = true;
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
  };

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange(event.currentTarget.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    onChange("");
  };

  return (
    <div className="grid gap-2">
      <canvas
        ref={canvasRef}
        id={id}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={finish}
        onPointerCancel={finish}
        className="h-36 w-full touch-none rounded-md border border-black/20 bg-white"
        aria-label="Signature drawing area"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="font-body text-xs text-black/50">
          Use a mouse, trackpad, or touch screen to sign.
        </span>
        <button
          type="button"
          onClick={clear}
          className="rounded border border-black/15 px-2.5 py-1 font-body text-xs font-semibold text-black/70 hover:bg-black/[0.04]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
