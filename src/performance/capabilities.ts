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

export interface StageFeedback {
  loading(progress?: number): void;
  failed(message?: string): void;
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
    failed(message = '车辆模型暂时无法加载') {
      showFallback();
      clearFeedback();
      const feedback = document.createElement('div');
      feedback.className = 'vehicle-stage-feedback vehicle-stage-error';
      feedback.setAttribute('role', 'alert');
      const text = document.createElement('p');
      text.textContent = message;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '重试加载';
      button.addEventListener('click', onRetry, { once: true });
      feedback.append(text, button);
      stage.append(feedback);
    },
    ready() {
      clearFeedback();
      clearFallback();
      canvas.hidden = false;
    },
  };
}
