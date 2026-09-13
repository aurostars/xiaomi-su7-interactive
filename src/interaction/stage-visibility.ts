export interface StageVisibilityInput {
  finalStoryTop: number;
  finalStoryHeight: number;
  technologyTop: number;
  viewportHeight: number;
  reducedMotion: boolean;
}

export interface StageVisibilityState {
  phase: 'visible' | 'fading' | 'hidden';
  progress: number;
}

export interface StageVisibilityController {
  update(): StageVisibilityState;
  dispose(): void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateStageVisibility(input: StageVisibilityInput): StageVisibilityState {
  const viewportCenter = input.viewportHeight / 2;
  const storyProgress = clamp(
    (viewportCenter - input.finalStoryTop) / input.finalStoryHeight,
    0,
    1,
  );
  const fadeProgress = storyProgress >= 1
    ? 1
    : clamp((storyProgress - 0.8) / 0.2, 0, 1);

  const technologyEntered = input.technologyTop <= input.viewportHeight;
  const continuousProgress = technologyEntered ? 1 : fadeProgress;
  const progress = input.reducedMotion && continuousProgress > 0 ? 1 : continuousProgress;

  if (progress >= 1) return { phase: 'hidden', progress: 1 };
  if (storyProgress < 0.8) return { phase: 'visible', progress: 0 };
  return { phase: 'fading', progress };
}

export function createStageVisibilityController(options: {
  stage: HTMLElement;
  finalStory: HTMLElement;
  technology: HTMLElement;
  reducedMotion: boolean;
  onChange(state: StageVisibilityState): void;
}): StageVisibilityController {
  let previousState: StageVisibilityState | undefined;

  const update = (): StageVisibilityState => {
    const finalStoryRect = options.finalStory.getBoundingClientRect();
    const technologyRect = options.technology.getBoundingClientRect();
    const state = calculateStageVisibility({
      finalStoryTop: finalStoryRect.top,
      finalStoryHeight: finalStoryRect.height,
      technologyTop: technologyRect.top,
      viewportHeight: window.innerHeight,
      reducedMotion: options.reducedMotion,
    });

    options.stage.style.setProperty('--stage-exit-progress', String(state.progress));
    options.stage.dataset.stageVisibility = state.phase;
    options.stage.setAttribute('aria-hidden', String(state.phase === 'hidden'));

    if (!previousState || previousState.phase !== state.phase || previousState.progress !== state.progress) {
      previousState = state;
      options.onChange(state);
    }

    return state;
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);

  return {
    update,
    dispose() {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    },
  };
}
