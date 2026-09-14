import techPlatform from '../assets/images/tech-platform.webp';
import techDrive from '../assets/images/tech-drive.webp';
import techCabin from '../assets/images/tech-cabin.webp';
import { STORY_CHAPTERS } from '../content/story-chapters';
import { INTERIOR_OPTIONS, PAINT_OPTIONS } from '../content/vehicle-palettes';

export interface ShellElements {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  modeButtons: HTMLButtonElement[];
  colorButtons: HTMLButtonElement[];
  doorButton: HTMLButtonElement;
  enterCabinButton: HTMLButtonElement;
  cabinDetail: HTMLElement;
  viewHint: HTMLElement;
  controlGroups: HTMLElement[];
  seatButtons: HTMLButtonElement[];
  storySections: HTMLElement[];
}

function controlIcon(type: 'exterior' | 'cabin' | 'door') {
  const path = type === 'exterior'
    ? '<path d="M3 12h18M5 12l2-5h10l2 5M6 16h.01M18 16h.01M5 12v5h14v-5"/>'
    : type === 'cabin'
      ? '<path d="M5 18v-5a7 7 0 0 1 14 0v5M8 18v-4h8v4M12 6V3"/>'
      : '<path d="M5 4h12v16H5zM17 8h2v8h-2M13 12h.01"/>';
  return `<svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
}

function colorButton(value: string, name: string, color: string, type: 'paint' | 'interior') {
  return `<button class="color-swatch" type="button" data-${type}="${value}" aria-label="${name}" data-tooltip="${name}" aria-pressed="false" style="--swatch:${color}"></button>`;
}

function renderStory() {
  return STORY_CHAPTERS.map(({ id, eyebrow, title, description, bullets }) => `
    <section class="story-section" data-story-id="${id}" data-story-view="${id}" data-story-section="${id}" aria-labelledby="story-${id}">
      <div class="story-copy">
        <p class="section-label">${eyebrow}</p>
        <h2 id="story-${id}">${title}</h2>
        <p>${description}</p>
        <ul>${bullets.map((bullet) => `<li>${bullet}</li>`).join('')}</ul>
      </div>
    </section>`).join('');
}

export function renderShell(root: HTMLElement): ShellElements {
  root.innerHTML = `
    <header class="site-header">
      <nav class="site-nav" aria-label="主导航"><a href="#vehicle-stage">SU7</a><a href="#story">细节</a><a href="#technology">科技</a></nav>
    </header>
    <section id="vehicle-stage" class="driving-experience" role="region" aria-label="小米 SU7 交互车辆舞台">
      <div class="vehicle-visual">
        <canvas class="vehicle-canvas" aria-label="小米 SU7 三维车辆"></canvas>
        <div class="vehicle-focus-zone" data-vehicle-focus-zone aria-hidden="true"></div>
        <div class="stage-atmosphere" aria-hidden="true"></div>
      </div>
      <div class="vehicle-stage">
        <div class="hero-copy">
          <p class="hero-label">C级高性能生态科技轿车</p>
          <h1>Xiaomi<br>SU7</h1>
          <p>以设计为先，科技为核，性能为驱动。重新定义纯电轿车体验。</p>
          <div class="hero-actions"><a class="primary-cta" href="#story">探索核心科技</a><button class="secondary-cta" type="button" data-enter-cabin>进入座舱</button></div>
          <dl class="hero-specs"><div><dt>800V</dt><dd>高压平台</dd></div><div><dt>HyperOS</dt><dd>智能座舱</dd></div><div><dt>EV</dt><dd>高性能电驱</dd></div></dl>
        </div>
        <aside class="vehicle-controls mobile-control-rail" aria-label="车辆个性化控制" data-mobile-control-rail>
          <div class="mode-tabs" role="group" aria-label="车辆视图" data-control-group="mode">
            <button type="button" data-mode="exterior" data-primary-control>${controlIcon('exterior')}<span>外观</span></button>
            <button type="button" data-mode="cabin" data-primary-control>${controlIcon('cabin')}<span>座舱</span></button>
          </div>
          <fieldset id="exterior-controls" class="control-palette secondary-palette paint-group" data-palette="paint" data-control-group="paint" aria-label="车漆" aria-hidden="false">
            <legend>车漆</legend><div>${PAINT_OPTIONS.map(({ id, label, swatch }) => colorButton(id, label, swatch, 'paint')).join('')}</div>
          </fieldset>
          <fieldset id="cabin-controls" class="control-palette secondary-palette interior-group" data-palette="interior" data-control-group="interior" aria-label="内饰" aria-hidden="true" hidden>
            <legend>内饰</legend><div>${INTERIOR_OPTIONS.map(({ id, label, swatch }) => colorButton(id, label, swatch, 'interior')).join('')}</div>
          </fieldset>
          <div class="seat-views" role="group" aria-label="座舱座席" data-control-group="seat" aria-hidden="true" hidden><button type="button" data-seat="driver" data-primary-control>主驾</button><button type="button" data-seat="passenger" data-primary-control>副驾</button><button type="button" data-seat="rear" data-primary-control>后排</button></div>
          <div class="door-control" role="group" aria-label="车门" data-control-group="doors"><button class="door-button" type="button" aria-pressed="false" data-primary-control>${controlIcon('door')}<span>开门</span></button></div>
        </aside>
        <aside class="view-hint" data-view-hint aria-live="polite">
          <strong data-view-hint-primary>拖拽车辆查看外观细节</strong>
          <span>滚动页面切换细节，右侧会跟随叙事自动调整视角</span>
        </aside>
        <aside class="cabin-detail" aria-live="polite" hidden>
          <p>当前座舱</p>
          <h2></h2>
          <p data-cabin-description></p>
          <ul aria-label="当前座舱细节"></ul>
        </aside>
      </div>
      <div id="story" class="story-sequence">${renderStory()}</div>
    </section>
    <section id="technology" class="technology-section" aria-labelledby="technology-title">
      <p class="section-label">前沿科技</p><h2 id="technology-title">技术驱动，每一次出发</h2>
      <p class="section-intro">从高压平台到智能座舱，核心技术被组织成可感知、可探索的驾驶体验。</p>
      <div class="technology-grid">
        <article class="technology-card"><img src="${techPlatform}" alt="小米 SU7 800V 高压平台" loading="lazy" width="1296" height="1050"><div><h3>800V 高压平台</h3><p>高效补能与稳定输出，为纯电旅程提供充沛底气。</p></div></article>
        <article class="technology-card"><img src="${techDrive}" alt="小米 SU7 智能驾驶感知系统" loading="lazy" width="1296" height="1050"><div><h3>智能驾驶感知</h3><p>融合摄像头与多源传感器，让道路信息成为清晰、及时的驾驶辅助。</p></div></article>
        <article class="technology-card"><img src="${techCabin}" alt="小米 SU7 HyperOS 智能座舱" loading="lazy" width="1296" height="1050"><div><h3>HyperOS 智能座舱</h3><p>车机与移动设备自然协同，信息始终跟随你的节奏。</p></div></article>
      </div>
    </section>
    <section class="closing-cta"><div><p>沉浸体验</p><h2>回到车身舞台，继续探索配色、开门与智能座舱。</h2></div><a href="#vehicle-stage">返回车辆舞台</a></section>
    <footer><span>Xiaomi SU7 交互体验</span><span>为热爱驾驶的人而造</span></footer>`;

  const stage = root.querySelector<HTMLElement>('.vehicle-stage');
  const canvas = root.querySelector<HTMLCanvasElement>('canvas');
  const doorButton = root.querySelector<HTMLButtonElement>('.door-button');
  const enterCabinButton = root.querySelector<HTMLButtonElement>('[data-enter-cabin]');
  const cabinDetail = root.querySelector<HTMLElement>('.cabin-detail');
  const viewHint = root.querySelector<HTMLElement>('[data-view-hint]');
  const controlGroups = Array.from(root.querySelectorAll<HTMLElement>('[data-control-group]'));
  if (!stage || !canvas || !doorButton || !enterCabinButton || !cabinDetail || !viewHint || controlGroups.length !== 5) {
    throw new Error('Vehicle shell failed to render');
  }
  return {
    stage,
    canvas,
    doorButton,
    enterCabinButton,
    cabinDetail,
    viewHint,
    controlGroups,
    modeButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-mode]')),
    colorButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('.color-swatch')),
    seatButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-seat]')),
    storySections: Array.from(root.querySelectorAll<HTMLElement>('[data-story-view]')),
  };
}
