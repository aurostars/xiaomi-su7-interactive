import { Scene, Texture, type WebGLRenderTarget } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { attachEnvironmentTarget } from '../src/scene/create-scene';
import { createExperienceOrchestrator, createStageFeedback } from '../src/performance/capabilities';

describe('PMREM environment lifecycle', () => {
  it('attaches the generated texture and disposes its render target exactly once', () => {
    const scene = new Scene();
    const texture = new Texture();
    const textureDispose = vi.spyOn(texture, 'dispose');
    const target = {
      texture,
      dispose: vi.fn(),
    } as unknown as WebGLRenderTarget;

    const dispose = attachEnvironmentTarget(scene, target);
    expect(scene.environment).toBe(texture);

    dispose();
    dispose();

    expect(scene.environment).toBeNull();
    expect(target.dispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).not.toHaveBeenCalled();
  });

  it('releases every PMREM target when scene attempts are retried', () => {
    const stage = document.createElement('div');
    const canvas = document.createElement('canvas');
    stage.append(canvas);
    const targets: WebGLRenderTarget[] = [];
    const feedback = createStageFeedback(stage, canvas, '/fallback.webp', () => undefined);
    const orchestrator = createExperienceOrchestrator({
      canvas,
      webgl: true,
      feedback,
      createAttempt() {
        const target = {
          texture: new Texture(),
          dispose: vi.fn(),
        } as unknown as WebGLRenderTarget;
        targets.push(target);
        const disposeEnvironment = attachEnvironmentTarget(new Scene(), target);
        return {
          load: () => new Promise<never>(() => undefined),
          activate: () => undefined,
          discard: () => undefined,
          dispose: disposeEnvironment,
        };
      },
    });

    orchestrator.retry();
    orchestrator.dispose();

    expect(targets).toHaveLength(2);
    expect(targets.map((target) => vi.mocked(target.dispose).mock.calls.length)).toEqual([1, 1]);
  });
});
