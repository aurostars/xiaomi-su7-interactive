import type { SeatView, VehicleMode } from '../state/vehicle-state';

export type ExperienceQuality = 'high' | 'balanced' | 'fallback';

export interface Capabilities {
  webgl: boolean;
  reducedMotion: boolean;
  quality: ExperienceQuality;
}

export interface CapabilityEnvironment {
  webgl?: boolean;
  reducedMotion?: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  devicePixelRatio?: number;
}

function supportsWebGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext
      && (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    );
  } catch {
    return false;
  }
}

export function detectCapabilities(environment: CapabilityEnvironment = {}): Capabilities {
  const webgl = environment.webgl ?? supportsWebGl();
  const reducedMotion = environment.reducedMotion
    ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ?? false;

  if (!webgl) return { webgl, reducedMotion, quality: 'fallback' };

  const memory = environment.deviceMemory
    ?? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
    ?? 4;
  const cores = environment.hardwareConcurrency ?? navigator.hardwareConcurrency ?? 4;
  const pixelRatio = environment.devicePixelRatio ?? window.devicePixelRatio ?? 1;
  const constrained = reducedMotion || memory < 4 || cores < 4 || pixelRatio > 2;

  return {
    webgl,
    reducedMotion,
    quality: constrained ? 'balanced' : 'high',
  };
}

export interface CabinExperienceState {
  mode: VehicleMode;
  seatView: SeatView;
}

export interface CabinExperienceIntent {
  cabinMode?: boolean;
  cameraView?: SeatView;
}

export function getCabinExperienceIntent(
  previous: CabinExperienceState,
  next: CabinExperienceState,
): CabinExperienceIntent {
  const modeChanged = previous.mode !== next.mode;
  const seatChangedInCabin = next.mode === 'cabin' && previous.seatView !== next.seatView;
  return {
    ...(modeChanged ? { cabinMode: next.mode === 'cabin' } : {}),
    ...(next.mode === 'cabin' && (modeChanged || seatChangedInCabin)
      ? { cameraView: next.seatView }
      : {}),
  };
}

export interface StageFeedback {
  loading(progress?: number): void;
  failed(message?: string, retryable?: boolean): void;
  ready(): void;
}

export function createStageFeedback(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  fallbackUrl: string,
  onRetry: () => void,
): StageFeedback {
  const clearFeedback = () => stage.querySelector('.vehicle-stage-feedback')?.remove();
  const clearFallback = () => stage.querySelector('.vehicle-fallback')?.remove();

  const showFallback = () => {
    clearFallback();
    const image = document.createElement('img');
    image.className = 'vehicle-fallback';
    image.src = fallbackUrl;
    image.alt = '小米 SU7 车辆静态展示';
    stage.prepend(image);
    canvas.hidden = true;
  };

  return {
    loading(progress = 0) {
      clearFeedback();
      const percentage = Math.round(Math.max(0, Math.min(1, progress)) * 100);
      const feedback = document.createElement('div');
      feedback.className = 'vehicle-stage-feedback';
      feedback.setAttribute('role', 'status');
      feedback.setAttribute('aria-live', 'polite');
      feedback.innerHTML = `<span>正在加载车辆 ${percentage}%</span><progress max="100" value="${percentage}">${percentage}%</progress>`;
      stage.append(feedback);
    },
    failed(message = '车辆模型暂时无法加载', retryable = true) {
      showFallback();
      clearFeedback();
      const feedback = document.createElement('div');
      feedback.className = 'vehicle-stage-feedback vehicle-stage-error';
      feedback.setAttribute('role', 'alert');
      const text = document.createElement('p');
      text.textContent = message;
      feedback.append(text);
      if (retryable) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '重试加载';
        button.addEventListener('click', onRetry, { once: true });
        feedback.append(button);
      }
      stage.append(feedback);
    },
    ready() {
      clearFeedback();
      clearFallback();
      canvas.hidden = false;
    },
  };
}

export interface ExperienceAttempt<T> {
  load(onProgress: (progress: number) => void): Promise<T>;
  activate(value: T): void;
  discard(value: T): void;
  dispose(): void;
}

export interface ExperienceOrchestratorOptions<T> {
  canvas: HTMLCanvasElement;
  webgl: boolean;
  feedback: StageFeedback;
  createAttempt(): ExperienceAttempt<T>;
}

export interface ExperienceOrchestrator {
  retry(): void;
  dispose(): void;
}

export function createExperienceOrchestrator<T>({
  canvas,
  webgl,
  feedback,
  createAttempt,
}: ExperienceOrchestratorOptions<T>): ExperienceOrchestrator {
  let attempt: ExperienceAttempt<T> | undefined;
  let activeValue: T | undefined;
  let generation = 0;
  let destroyed = false;
  let contextLost = false;

  const stopAttempt = () => {
    generation += 1;
    if (activeValue !== undefined && attempt) attempt.discard(activeValue);
    activeValue = undefined;
    attempt?.dispose();
    attempt = undefined;
  };

  const start = () => {
    if (destroyed || !webgl) return;
    stopAttempt();
    const ownGeneration = generation;
    feedback.loading(0);

    try {
      attempt = createAttempt();
    } catch {
      if (ownGeneration === generation && !destroyed) {
        feedback.failed('三维场景初始化失败，请重试。');
      }
      return;
    }

    const ownAttempt = attempt;
    void ownAttempt.load((progress) => {
      if (!destroyed && ownGeneration === generation) feedback.loading(progress);
    }).then((value) => {
      if (destroyed || ownGeneration !== generation || attempt !== ownAttempt) {
        ownAttempt.discard(value);
        return;
      }
      try {
        ownAttempt.activate(value);
        activeValue = value;
        feedback.ready();
      } catch {
        ownAttempt.discard(value);
        stopAttempt();
        if (!destroyed) feedback.failed('车辆模型启用失败，请重试。');
      }
    }).catch(() => {
      if (destroyed || ownGeneration !== generation || attempt !== ownAttempt) return;
      stopAttempt();
      if (!destroyed) feedback.failed('车辆模型加载失败，请检查网络后重试。');
    });
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    if (destroyed) return;
    contextLost = true;
    stopAttempt();
    feedback.failed('三维画面连接已中断，正在等待恢复。');
  };
  const onContextRestored = () => {
    if (destroyed || !contextLost) return;
    contextLost = false;
    start();
  };

  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  if (webgl) start();
  else feedback.failed('当前设备不支持 WebGL，已切换为静态车辆展示。', false);

  return {
    retry: start,
    dispose() {
      if (destroyed) return;
      destroyed = true;
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      stopAttempt();
    },
  };
}
