import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createCameraController } from '../src/scene/camera-controller';
import { createMainRenderOrchestration } from '../src/main-render-orchestration';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('main render orchestration', () => {
  function createHarness(reducedMotion = false) {
    const camera = createCameraController(new PerspectiveCamera(32, 1, 0.1, 100));
    const requestRender = vi.fn();
    const runtime = {
      requestRender,
      beginRenderActivity: vi.fn(() => requestRender()),
      endRenderActivity: vi.fn(),
    };
    const rotateVehicle = vi.fn();
    const suspendAutoCamera = vi.fn();
    const orchestration = createMainRenderOrchestration({
      camera,
      runtime,
      reducedMotion,
      rotateVehicle,
      suspendAutoCamera,
      initialTime: 0,
    });
    return { camera, orchestration, requestRender, rotateVehicle, runtime, suspendAutoCamera };
  }

  it('requests a frame through the actual drag callback', () => {
    const { orchestration, requestRender, rotateVehicle, suspendAutoCamera } = createHarness();

    orchestration.dragCallbacks.rotateBy(0.25);
    orchestration.dragCallbacks.suspendAutoCamera(10_000);

    expect(rotateVehicle).toHaveBeenCalledWith(0.25);
    expect(suspendAutoCamera).toHaveBeenCalledWith(10_000);
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('retains a reduced-motion target until its requested terminal frame', () => {
    const { camera, orchestration, requestRender, runtime } = createHarness(true);

    orchestration.setTarget('driver');

    expect(runtime.beginRenderActivity).toHaveBeenCalledWith('camera');
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(camera.isSettled()).toBe(false);

    orchestration.beforeRender(16);
    expect(camera.isSettled()).toBe(true);
    expect(runtime.endRenderActivity).toHaveBeenCalledWith('camera');
  });

  it('connects stage visibility to the final story, technology, render activity and cleanup', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    document.body.innerHTML = '<main id="app"></main>';
    const requestRender = vi.fn();
    const beginRenderActivity = vi.fn();
    const endRenderActivity = vi.fn();
    const stageVisibilityDispose = vi.fn();
    const stageVisibilityUpdate = vi.fn();
    let visibilityOptions: {
      stage: HTMLElement;
      finalStory: HTMLElement;
      technology: HTMLElement;
      reducedMotion: boolean;
      onChange(state: { phase: 'visible' | 'fading' | 'hidden'; progress: number }): void;
    } | undefined;
    let disposeAttempt = () => undefined;

    vi.doMock('../src/interaction/stage-visibility', () => ({
      createStageVisibilityController: vi.fn((options) => {
        visibilityOptions = options;
        return { update: stageVisibilityUpdate, dispose: stageVisibilityDispose };
      }),
    }));
    vi.doMock('../src/scene/create-scene', () => ({
      createScene: vi.fn(() => ({
        camera: {}, requestRender, beginRenderActivity, endRenderActivity,
        isRenderActive: () => false, getActiveRenderReasons: () => [],
        setBeforeRender: () => () => undefined, start: vi.fn(), render: vi.fn(),
        setCabinMode: vi.fn(), getCabinLightingDiagnostics: () => ({ enabled: false, exposure: 0, activeLights: 0 }),
        scene: { add: vi.fn() }, dispose: vi.fn(),
      })),
    }));
    vi.doMock('../src/scene/camera-controller', () => ({ createCameraController: vi.fn(() => ({})) }));
    vi.doMock('../src/main-render-orchestration', () => ({
      applyMainStateTransition: vi.fn(() => ({})),
      createMainRenderOrchestration: vi.fn(() => ({
        beforeRender: vi.fn(), setTarget: vi.fn(), setStoryProgress: vi.fn(() => ({ vehicleYaw: 0 })),
        forceImmediateUpdate: vi.fn(), dragCallbacks: {}, bindVisibility: () => () => undefined,
      })),
    }));
    vi.doMock('../src/interaction/scroll-story', () => ({ createScrollStory: vi.fn(() => ({ dispose: vi.fn() })) }));
    vi.doMock('../src/interaction/drag-controller', () => ({ createDragController: vi.fn(() => ({ dispose: vi.fn() })) }));
    vi.doMock('../src/performance/capabilities', async () => {
      const actual = await vi.importActual<typeof import('../src/performance/capabilities')>('../src/performance/capabilities');
      return {
        ...actual,
        detectCapabilities: () => ({ webgl: true, reducedMotion: false, quality: 'high' }),
        createStageFeedback: () => ({ loading: vi.fn(), failed: vi.fn(), ready: vi.fn() }),
        createExperienceOrchestrator: vi.fn(({ createAttempt }) => {
          const attempt = createAttempt();
          disposeAttempt = attempt.dispose;
          return { retry: vi.fn(), dispose: () => disposeAttempt() };
        }),
      };
    });

    await import('../src/main');

    const stories = Array.from(document.querySelectorAll<HTMLElement>('.story-section'));
    expect(visibilityOptions?.stage).toBe(document.querySelector('.vehicle-visual'));
    expect(visibilityOptions?.finalStory).toBe(stories.at(-1));
    expect(visibilityOptions?.technology).toBe(document.querySelector('#technology'));
    expect(stageVisibilityUpdate).toHaveBeenCalledTimes(1);

    visibilityOptions?.onChange({ phase: 'fading', progress: .5 });
    expect(requestRender).toHaveBeenCalledTimes(1);
    expect(beginRenderActivity).toHaveBeenCalledWith('story');
    vi.advanceTimersByTime(249);
    expect(endRenderActivity).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(endRenderActivity).toHaveBeenCalledWith('story');
    visibilityOptions?.onChange({ phase: 'hidden', progress: 1 });
    expect(requestRender).toHaveBeenCalledTimes(2);
    expect(endRenderActivity).toHaveBeenCalledWith('story');

    window.dispatchEvent(new Event('pagehide'));
    expect(stageVisibilityDispose).toHaveBeenCalledTimes(1);
  });

  it('requests the reduced-motion terminal visibility frame', async () => {
    vi.resetModules();
    document.body.innerHTML = '<main id="app"></main>';
    const requestRender = vi.fn();
    let onChange: ((state: { phase: 'hidden'; progress: number }) => void) | undefined;

    vi.doMock('../src/interaction/stage-visibility', () => ({
      createStageVisibilityController: vi.fn((options) => {
        onChange = options.onChange;
        return { update: vi.fn(), dispose: vi.fn() };
      }),
    }));
    vi.doMock('../src/scene/create-scene', () => ({
      createScene: () => ({
        camera: {}, requestRender, beginRenderActivity: vi.fn(), endRenderActivity: vi.fn(),
        isRenderActive: () => false, getActiveRenderReasons: () => [], setBeforeRender: () => () => undefined,
        start: vi.fn(), render: vi.fn(), setCabinMode: vi.fn(), scene: { add: vi.fn() }, dispose: vi.fn(),
        getCabinLightingDiagnostics: () => ({ enabled: false, exposure: 0, activeLights: 0 }),
      }),
    }));
    vi.doMock('../src/scene/camera-controller', () => ({ createCameraController: () => ({}) }));
    vi.doMock('../src/main-render-orchestration', () => ({
      applyMainStateTransition: () => ({}),
      createMainRenderOrchestration: () => ({
        beforeRender: vi.fn(), setTarget: vi.fn(), setStoryProgress: () => ({ vehicleYaw: 0 }),
        forceImmediateUpdate: vi.fn(), dragCallbacks: {}, bindVisibility: () => () => undefined,
      }),
    }));
    vi.doMock('../src/interaction/scroll-story', () => ({ createScrollStory: () => ({ dispose: vi.fn() }) }));
    vi.doMock('../src/interaction/drag-controller', () => ({ createDragController: () => ({ dispose: vi.fn() }) }));
    vi.doMock('../src/performance/capabilities', async () => {
      const actual = await vi.importActual<typeof import('../src/performance/capabilities')>('../src/performance/capabilities');
      return {
        ...actual,
        detectCapabilities: () => ({ webgl: true, reducedMotion: true, quality: 'balanced' }),
        createStageFeedback: () => ({ loading: vi.fn(), failed: vi.fn(), ready: vi.fn() }),
        createExperienceOrchestrator: ({ createAttempt }: { createAttempt(): { dispose(): void } }) => {
          const attempt = createAttempt();
          return { retry: vi.fn(), dispose: attempt.dispose };
        },
      };
    });

    await import('../src/main');
    onChange?.({ phase: 'hidden', progress: 1 });
    expect(requestRender).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('pagehide'));
  });

  it('requests one frame on actual visibility restoration and removes the listener', () => {
    const { orchestration, requestRender } = createHarness();
    const hidden = vi.spyOn(document, 'hidden', 'get');
    const unbind = orchestration.bindVisibility(document);

    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestRender).not.toHaveBeenCalled();

    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestRender).toHaveBeenCalledTimes(1);

    unbind();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestRender).toHaveBeenCalledTimes(1);
  });
});
