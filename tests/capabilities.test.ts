import { describe, expect, it } from 'vitest';
import {
  createExperienceOrchestrator,
  createStageFeedback,
  detectCapabilities,
} from '../src/performance/capabilities';

describe('detectCapabilities', () => {
  it('uses the static fallback when WebGL is unavailable', () => {
    expect(detectCapabilities({ webgl: false })).toEqual({
      webgl: false,
      reducedMotion: false,
      quality: 'fallback',
    });
  });

  it('preserves the user reduced-motion preference', () => {
    expect(detectCapabilities({ webgl: true, reducedMotion: true })).toMatchObject({
      webgl: true,
      reducedMotion: true,
    });
  });

  it('uses balanced quality on constrained devices', () => {
    expect(detectCapabilities({
      webgl: true,
      deviceMemory: 2,
      hardwareConcurrency: 2,
      devicePixelRatio: 3,
    }).quality).toBe('balanced');
  });

  it('uses high quality on capable devices', () => {
    expect(detectCapabilities({
      webgl: true,
      deviceMemory: 8,
      hardwareConcurrency: 8,
      devicePixelRatio: 2,
    }).quality).toBe('high');
  });
});


describe('vehicle stage feedback', () => {
  const setup = () => {
    const stage = document.createElement('div');
    const canvas = document.createElement('canvas');
    stage.append(canvas);
    const retries: number[] = [];
    const feedback = createStageFeedback(stage, canvas, '/vehicle-fallback.webp', () => {
      retries.push(1);
    });
    return { stage, canvas, retries, feedback };
  };

  it('announces loading progress inside the vehicle stage', () => {
    const { stage, feedback } = setup();

    feedback.loading(0.42);

    expect(stage.querySelector('[role="status"]')?.textContent).toContain('42%');
    expect(stage.querySelector('progress')?.getAttribute('value')).toBe('42');
  });

  it('shows a static vehicle and retry action after model failure', () => {
    const { stage, canvas, retries, feedback } = setup();

    feedback.failed('车辆模型加载失败');
    stage.querySelector<HTMLButtonElement>('button')?.click();

    expect(canvas.hidden).toBe(true);
    expect(stage.querySelector<HTMLImageElement>('img')?.src).toContain('vehicle-fallback.webp');
    expect(stage.querySelector('[role="alert"]')?.textContent).toContain('车辆模型加载失败');
    expect(retries).toHaveLength(1);
  });

  it('restores the canvas and removes status UI when a retry succeeds', () => {
    const { stage, canvas, feedback } = setup();
    feedback.failed('加载失败');

    feedback.ready();

    expect(canvas.hidden).toBe(false);
    expect(stage.querySelector('.vehicle-stage-feedback')).toBeNull();
    expect(stage.querySelector('.vehicle-fallback')).toBeNull();
  });
});

describe('experience orchestration', () => {
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    return { promise, resolve, reject };
  };

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const setup = (webgl = true) => {
    const stage = document.createElement('div');
    const canvas = document.createElement('canvas');
    stage.append(canvas);
    const attempts: Array<{
      request: ReturnType<typeof deferred<{ id: number }>>;
      disposed: boolean;
      activated: number[];
      discarded: number[];
      progress?: (value: number) => void;
    }> = [];
    let orchestrator!: ReturnType<typeof createExperienceOrchestrator>;
    const feedback = createStageFeedback(stage, canvas, '/vehicle-fallback.webp', () => {
      orchestrator.retry();
    });
    orchestrator = createExperienceOrchestrator({
      canvas,
      webgl,
      feedback,
      createAttempt() {
        const state = {
          request: deferred<{ id: number }>(),
          disposed: false,
          activated: [] as number[],
          discarded: [] as number[],
          progress: undefined as ((value: number) => void) | undefined,
        };
        attempts.push(state);
        return {
          load(progress: (value: number) => void) {
            state.progress = progress;
            return state.request.promise;
          },
          activate(value: { id: number }) { state.activated.push(value.id); },
          discard(value: { id: number }) { state.discarded.push(value.id); },
          dispose() { state.disposed = true; },
        };
      },
    });
    return { stage, canvas, attempts, orchestrator };
  };

  it('does not offer retry when WebGL is unavailable', () => {
    const { stage, attempts } = setup(false);

    expect(attempts).toHaveLength(0);
    expect(stage.querySelector('[role="alert"]')).not.toBeNull();
    expect(stage.querySelector('button')).toBeNull();
  });

  it('reinitializes the whole experience after initialization failure', () => {
    const stage = document.createElement('div');
    const canvas = document.createElement('canvas');
    stage.append(canvas);
    let initializations = 0;
    let orchestrator!: ReturnType<typeof createExperienceOrchestrator>;
    const feedback = createStageFeedback(stage, canvas, '/fallback.webp', () => orchestrator.retry());
    orchestrator = createExperienceOrchestrator({
      canvas,
      webgl: true,
      feedback,
      createAttempt() {
        initializations += 1;
        throw new Error('context init failed');
      },
    });

    stage.querySelector<HTMLButtonElement>('button')?.click();

    expect(initializations).toBe(2);
  });

  it('stops and disposes the hidden scene after model failure, then rebuilds it', async () => {
    const { stage, attempts } = setup();
    attempts[0].request.reject(new Error('model failed'));
    await flush();

    expect(attempts[0].disposed).toBe(true);
    stage.querySelector<HTMLButtonElement>('button')?.click();
    expect(attempts).toHaveLength(2);

    attempts[1].request.resolve({ id: 2 });
    await flush();
    expect(attempts[1].activated).toEqual([2]);
    expect(stage.querySelector('.vehicle-fallback')).toBeNull();
  });

  it('ignores late progress and completion after pagehide disposal', async () => {
    const resolved = setup();
    const rejected = setup();
    const resolvedHtml = resolved.stage.innerHTML;
    const rejectedHtml = rejected.stage.innerHTML;

    resolved.orchestrator.dispose();
    rejected.orchestrator.dispose();
    resolved.attempts[0].progress?.(.8);
    resolved.attempts[0].request.resolve({ id: 1 });
    rejected.attempts[0].progress?.(.6);
    rejected.attempts[0].request.reject(new Error('late failure'));
    await flush();

    expect(resolved.stage.innerHTML).toBe(resolvedHtml);
    expect(rejected.stage.innerHTML).toBe(rejectedHtml);
    expect(resolved.attempts[0].activated).toEqual([]);
    expect(resolved.attempts[0].discarded).toEqual([1]);
  });

  it('falls back on context loss and reinitializes after context restoration', () => {
    const { stage, canvas, attempts } = setup();
    const loss = new Event('webglcontextlost', { cancelable: true });

    canvas.dispatchEvent(loss);

    expect(loss.defaultPrevented).toBe(true);
    expect(attempts[0].disposed).toBe(true);
    expect(stage.querySelector('.vehicle-fallback')).not.toBeNull();

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(attempts).toHaveLength(2);
  });
});
