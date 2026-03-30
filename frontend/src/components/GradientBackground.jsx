import { useEffect, useRef } from 'react';

export function GradientBackground({ disabled, theme }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (disabled) return undefined;
    let destroy = null;

    import('@firecms/neat')
      .then((module) => {
        const Neat = module.default || module.NeatGradient || module.Neat;
        if (!Neat || !canvasRef.current) return;
        const instance = new Neat(canvasRef.current, {
          colors: theme === 'dark'
            ? ['#121212', '#1E1E2E', '#2258EE']
            : ['#EFEFF0', '#ffffff', '#FF8A5C']
        });
        destroy = () => instance?.destroy?.();
      })
      .catch(() => {
        // fallback: css animation remains active
      });

    return () => destroy?.();
  }, [disabled, theme]);

  return (
    <div className={`bg ${disabled ? 'solid' : ''}`}>
      {!disabled && <canvas ref={canvasRef} className="neat-canvas" />}
    </div>
  );
}
