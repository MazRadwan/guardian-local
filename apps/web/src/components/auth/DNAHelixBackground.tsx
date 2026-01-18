'use client';

import { useEffect, useRef } from 'react';

export function DNAHelixBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      time += 0.015;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const amplitude = 100;

      for (let y = 0; y < canvas.height; y += 15) {
        const phase = y * 0.02 + time;
        const x1 = centerX + Math.sin(phase) * amplitude;
        const x2 = centerX + Math.sin(phase + Math.PI) * amplitude;
        const z1 = Math.cos(phase);
        const z2 = Math.cos(phase + Math.PI);

        // Connection line between strands
        if (y % 30 === 0) {
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
          ctx.strokeStyle = 'rgba(14, 165, 233, 0.1)'; // sky-500
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Strand 1
        ctx.beginPath();
        ctx.arc(x1, y, 4 * (z1 * 0.3 + 0.7), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(14, 165, 233, ${0.3 * (z1 * 0.5 + 0.5) + 0.1})`; // sky-500
        ctx.fill();

        // Strand 2
        ctx.beginPath();
        ctx.arc(x2, y, 4 * (z2 * 0.3 + 0.7), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(56, 189, 248, ${0.3 * (z2 * 0.5 + 0.5) + 0.1})`; // sky-400
        ctx.fill();
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}
