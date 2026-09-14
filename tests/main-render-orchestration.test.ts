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
    const orchestration = createMainRenderOrchestration({
      camera,
      runtime,
      reducedMotion,
      initialTime: 0,
    });
    return { camera, orchestration, requestRender, runtime };
  }

  it('applies a manual camera offset without rotating the vehicle and renders through settling', () => {
    const { camera, orchestration, runtime } = createHarness();
    camera.setTarget('aero');
    camera.update(0, true);
    const origin = camera.getDiagnostics().position;

    orchestration.setManualOffset({ yaw: Math.PI / 2, pitch: 0 });
    expect(runtime.beginRenderActivity).toHaveBeenCalledWith('camera');
    for (let time = 16; time < 5_000 && runtime.endRenderActivity.mock.calls.length === 0; time += 16) {
      orchestration.beforeRender(time);
    }

    expect(camera.getDiagnostics().position).not.toEqual(origin);
    expect(camera.isSettled()).toBe(true);
    expect(runtime.endRenderActivity).toHaveBeenCalledWith('camera');
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
    const dragDispose = vi.fn();
    const dragReset = vi.fn();
    const dragSetEnabled = vi.fn();
    const dragSetMode = vi.fn();
    let visibilityOptions: {
      stage: HTMLElement;
      finalStory: HTMLElement;
      technology: HTMLElement;
      reducedMotion: boolean;
      onChange(state: { phase: 'visible' | 'fading' | 'hidden'; progress: number }): void;
    } | undefined;
    let disposeAttempt = () => undefined;
    let activateAttempt: ((vehicle: unknown) => void) | undefined;
    let changeStory: ((storyId: 'aero' | 'performance' | 'cabin', progress: number) => void) | undefined;

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
        setManualOffset: vi.fn(), forceImmediateUpdate: vi.fn(), bindVisibility: () => () => undefined,
      })),
    }));
    vi.doMock('../src/interaction/scroll-story', () => ({
      createScrollStory: vi.fn((_sections, onChange) => {
        changeStory = onChange;
        return { dispose: vi.fn() };
      }),
    }));
    vi.doMock('../src/scene/vehicle-controller', () => ({
      createVehicleController: () => ({
        applyState: vi.fn(), dispose: vi.fn(), getDiagnostics: vi.fn(), setRotation: vi.fn(),
      }),
    }));
    vi.doMock('../src/interaction/view-drag-controller', () => ({
      createViewDragController: vi.fn(() => ({
        dispose: dragDispose,
        reset: dragReset,
        setEnabled: dragSetEnabled,
        setMode: dragSetMode,
      })),
    }));
    vi.doMock('../src/performance/capabilities', async () => {
      const actual = await vi.importActual<typeof import('../src/performance/capabilities')>('../src/performance/capabilities');
      return {
        ...actual,
        detectCapabilities: () => ({ webgl: true, reducedMotion: false, quality: 'high' }),
        createStageFeedback: () => ({ loading: vi.fn(), failed: vi.fn(), ready: vi.fn() }),
        createExperienceOrchestrator: vi.fn(({ createAttempt }) => {
          const attempt = createAttempt();
          disposeAttempt = attempt.dispose;
          activateAttempt = attempt.activate;
          return { retry: vi.fn(), dispose: () => disposeAttempt() };
        }),
      };
    });

    await import('../src/main');

    expect(dragSetMode).toHaveBeenCalledWith('exterior');
    expect(dragSetEnabled).not.toHaveBeenCalledWith(true);
    activateAttempt?.({
      root: {},
      capabilities: {
        bodyColor: false,
        interiorColor: false,
        screenGlow: false,
        doors: { frontLeft: false, frontRight: false, rearLeft: false, rearRight: false },
      },
    });
    expect(dragSetEnabled).toHaveBeenLastCalledWith(true);

    document.querySelector<HTMLButtonElement>('[data-mode="cabin"]')?.click();
    expect(dragSetMode).toHaveBeenLastCalledWith('cabin');
    expect(dragReset).toHaveBeenCalledTimes(1);
    document.querySelector<HTMLButtonElement>('[data-seat="passenger"]')?.click();
    expect(dragReset).toHaveBeenCalledTimes(2);
    changeStory?.('performance', 0.5);
    expect(dragSetMode).toHaveBeenLastCalledWith('exterior');
    expect(dragReset).toHaveBeenCalledTimes(3);

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
    expect(dragSetEnabled).toHaveBeenLastCalledWith(false);
    visibilityOptions?.onChange({ phase: 'visible', progress: 0 });
    expect(dragSetEnabled).toHaveBeenLastCalledWith(true);

    disposeAttempt();
    expect(dragDispose).toHaveBeenCalledTimes(1);
    expect(stageVisibilityDispose).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('pagehide'));
    expect(stageVisibilityDispose).toHaveBeenCalledTimes(1);
  });

  it('requests the reduced-motion terminal visibility frame', async () => {
    vi.resetModules();
    document.body.innerHTML = '<main id="app"></main>';
    const requestRender = vi.fn();
    let reducedMotion: boolean | undefined;
    let onChange: ((state: { phase: 'hidden'; progress: number }) => void) | undefined;

    vi.doMock('../src/interaction/stage-visibility', () => ({
      createStageVisibilityController: vi.fn((options) => {
        reducedMotion = options.reducedMotion;
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
        setManualOffset: vi.fn(), forceImmediateUpdate: vi.fn(), bindVisibility: () => () => undefined,
      }),
    }));
    vi.doMock('../src/interaction/scroll-story', () => ({ createScrollStory: () => ({ dispose: vi.fn() }) }));
    vi.doMock('../src/interaction/view-drag-controller', () => ({
      createViewDragController: () => ({
        dispose: vi.fn(), reset: vi.fn(), setEnabled: vi.fn(), setMode: vi.fn(),
      }),
    }));
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
    expect(reducedMotion).toBe(true);
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
