import React, { useEffect, useRef } from 'react';
import { NeatGradient } from '@firecms/neat';

export function GradientBackground({ disabled, theme }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (disabled) return undefined;
    if (!canvasRef.current) return undefined;

    const colors = theme === 'dark'
      ? ['#121212', '#1E1E2E', '#2258EE', '#2E0EC7', '#8B6AE6', '#4CB4BB']
      : ['#FF5772', '#4CB4BB', '#FFC600', '#8B6AE6', '#2E0EC7', '#FF9A9E'];

    const gradient = new NeatGradient({
      ref: canvasRef.current,
      colors: colors.map((color) => ({ color, enabled: true })),
      speed: 2.5,
      horizontalPressure: 3,
      verticalPressure: 4,
      waveFrequencyX: 2,
      waveFrequencyY: 3,
      waveAmplitude: 5,
      shadows: 1,
      highlights: 5,
      colorBrightness: 1,
      colorSaturation: 7,
      wireframe: false,
      colorBlending: 8,
      backgroundColor: theme === 'dark' ? '#121212' : '#EFEFF0',
      backgroundAlpha: 1,
      grainScale: 0,
      grainSparsity: 0,
      grainIntensity: 0,
      grainSpeed: 1,
      resolution: 1,
      yOffset: -0.16668701171875,
      yOffsetWaveMultiplier: 4,
      yOffsetColorMultiplier: 4,
      yOffsetFlowMultiplier: 4,
      flowDistortionA: 0,
      flowDistortionB: 0,
      flowScale: 1,
      flowEase: 0,
      flowEnabled: true,
      enableProceduralTexture: false,
      textureVoidLikelihood: 0.45,
      textureVoidWidthMin: 200,
      textureVoidWidthMax: 486,
      textureBandDensity: 2.15,
      textureColorBlending: 0.01,
      textureSeed: 333,
      textureEase: 0.5,
      proceduralBackgroundColor: '#000000',
      textureShapeTriangles: 20,
      textureShapeCircles: 15,
      textureShapeBars: 15,
      textureShapeSquiggles: 10
    });

    const onScroll = () => {
      gradient.yOffset = window.scrollY;
    };
    window.addEventListener('scroll', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
      gradient.destroy?.();
    };
  }, [disabled, theme]);

  return (
    <div className={`bg ${disabled ? 'solid' : ''}`}>
      {!disabled && <canvas ref={canvasRef} className="neat-canvas" />}
    </div>
  );
}
