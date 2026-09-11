import techPlatform from '../assets/images/tech-platform.webp';
import techDrive from '../assets/images/tech-drive.webp';
import techCabin from '../assets/images/tech-cabin.webp';
import gallerySu7 from '../assets/images/gallery-su7.webp';

export interface ShellElements {
  canvas: HTMLCanvasElement;
  modeButtons: HTMLButtonElement[];
  colorButtons: HTMLButtonElement[];
  doorButton: HTMLButtonElement;
  enterCabinButton: HTMLButtonElement;
  hotspotLabel: HTMLElement;
  seatButtons: HTMLButtonElement[];
  storySections: HTMLElement[];
}

const story = [
  {
    view: 'aero',
    label: '空气动力学',
    title: '低趴轿跑姿态，像风压过车身',
    body: '流畅车顶弧线与低重心姿态共同塑造动势，让每一道曲面都回应速度。',
    points: ['长车头与流线车顶延展视觉比例', '车身型面在光影中保持清晰层次'],
  },
  {
    view: 'performance',
    label: '纯电性能',
    title: '电驱、轮组与底盘共同制造力量感',
    body: '即时动力响应配合稳定底盘，让敏捷加速与从容操控在同一台车上成立。',
    points: ['低重心布局强化弯道支撑', '高性能轮组传递直接路感'],
  },
  {
    view: 'cabin',
    label: '智能座舱',
    title: '切入座舱，看见屏幕与乘坐空间',
    body: '屏幕、方向盘与座椅围绕驾乘者展开，信息和空间保持自然、连贯的秩序。',
    points: ['前排交互触手可及', '多座席视角一键切换'],
  },
  {
    view: 'sensing',
    label: '智能感知',
    title: '传感器视角，展示智能驾驶想象力',
    body: '感知硬件持续理解车辆周围环境，让复杂道路信息转化为清晰驾驶辅助。',
    points: ['多源感知协同工作', '环境信息实时形成判断'],
  },
] as const;

const paintColors = [
  ['lava-orange', '熔岩橙', '#f05232'],
  ['gulf-blue', '海湾蓝', '#36a9d6'],
  ['aqua', '雅灰绿', '#547a79'],
  ['red', '霞光红', '#b72531'],
  ['pearl', '珍珠白', '#e7e5dd'],
  ['titanium', '流星灰', '#8c9398'],
] as const;

const interiorColors = [
  ['obsidian-black', '曜石黑', '#24282b'],
  ['cloud-brown', '暮光棕', '#a9917d'],
  ['crimson', '赤霞红', '#743b3d'],
  ['mist', '迷雾紫', '#6b6277'],
] as const;

function colorButton(value: string, name: string, color: string, type: 'paint' | 'interior') {
  return `<button class="color-swatch" type="button" data-${type}="${value}" aria-label="${name}" title="${name}" style="--swatch:${color}"></button>`;
}

function renderStory() {
  return story.map(({ view, label, title, body, points }) => `
    <section class="story-section" data-story-view="${view}" aria-labelledby="story-${view}">
      <div class="story-copy">
        <p class="section-label">${label}</p>
        <h2 id="story-${view}">${title}</h2>
        <p>${body}</p>
        <ul>${points.map((point) => `<li>${point}</li>`).join('')}</ul>
      </div>
    </section>`).join('');
}

export function renderShell(root: HTMLElement): ShellElements {
  root.innerHTML = `
    <header class="site-header">
      <a class="brand" href="#vehicle-stage" aria-label="小米汽车首页"><span aria-hidden="true">mi</span><b>小米汽车</b></a>
      <nav aria-label="主导航"><a href="#vehicle-stage">SU7</a><a href="#story">细节</a><a href="#technology">科技</a><a href="#film">影像</a></nav>
      <a class="header-cta" href="#vehicle-stage">预约试驾</a>
    </header>
    <section id="vehicle-stage" class="driving-experience" role="region" aria-label="小米 SU7 交互车辆舞台">
      <div class="vehicle-visual">
        <canvas class="vehicle-canvas" aria-label="小米 SU7 三维车辆"></canvas>
        <div class="stage-atmosphere" aria-hidden="true"></div>
        <div class="story-hotspot" data-hotspot-view="aero" data-hotspot-position="front" aria-live="polite">
          <button class="hotspot-marker" type="button" aria-expanded="false" aria-controls="story-hotspot-detail" aria-label="查看空气动力学部件说明">
            <span class="hotspot-pulse" aria-hidden="true"></span><strong>空气动力学</strong>
          </button>
          <div id="story-hotspot-detail" class="hotspot-detail" hidden><b>空气动力学</b><p>前翼与流线车身协同梳理气流，稳定高速姿态。</p></div>
        </div>
      </div>
      <div class="vehicle-stage">
        <div class="hero-copy">
          <p class="hero-label">C级高性能生态科技轿车</p>
          <h1>Xiaomi<br>SU7</h1>
          <p>以设计为先，科技为核，性能为驱动。重新定义纯电轿车体验。</p>
          <div class="hero-actions"><a class="primary-cta" href="#story">探索核心科技</a><button class="secondary-cta" type="button" data-enter-cabin>进入座舱</button></div>
          <dl class="hero-specs"><div><dt>800V</dt><dd>高压平台</dd></div><div><dt>HyperOS</dt><dd>智能座舱</dd></div><div><dt>EV</dt><dd>高性能电驱</dd></div></dl>
        </div>
        <aside class="vehicle-controls" aria-label="车辆个性化控制" data-mobile-control-rail>
          <div class="mode-tabs" role="tablist" aria-label="车辆视图">
            <button id="tab-exterior" type="button" role="tab" data-mode="exterior" aria-controls="exterior-controls">外观</button>
            <button id="tab-cabin" type="button" role="tab" data-mode="cabin" aria-controls="cabin-controls">座舱</button>
          </div>
          <div id="exterior-controls" class="control-panel paint-group" role="tabpanel" aria-labelledby="tab-exterior">
            <div class="control-group"><span>车漆</span><div>${paintColors.map(([value, name, color]) => colorButton(value, name, color, 'paint')).join('')}</div></div>
          </div>
          <div id="cabin-controls" class="control-panel cabin-controls" role="tabpanel" aria-labelledby="tab-cabin">
            <div class="control-group interior-group"><span>内饰</span><div>${interiorColors.map(([value, name, color]) => colorButton(value, name, color, 'interior')).join('')}</div></div>
            <div class="seat-views" aria-label="座舱座席"><button type="button" data-seat="driver">主驾</button><button type="button" data-seat="passenger">副驾</button><button type="button" data-seat="rear">后排</button></div>
          </div>
          <button class="door-button" type="button" aria-pressed="false">开门</button>
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
    <section id="film" class="brand-film" aria-label="新一代小米 SU7 品牌影像"><img src="${gallerySu7}" alt="新一代小米 SU7 驰骋在开阔天地" loading="lazy" width="3840" height="1920"></section>
    <section class="closing-cta"><div><p>沉浸体验</p><h2>回到车身舞台，继续探索配色、开门与智能座舱。</h2></div><a href="#vehicle-stage">返回车辆舞台</a></section>
    <footer><span>Xiaomi SU7 交互体验</span><span>为热爱驾驶的人而造</span></footer>`;

  const canvas = root.querySelector<HTMLCanvasElement>('canvas');
  const doorButton = root.querySelector<HTMLButtonElement>('.door-button');
  const enterCabinButton = root.querySelector<HTMLButtonElement>('[data-enter-cabin]');
  const hotspotLabel = root.querySelector<HTMLElement>('.story-hotspot');
  if (!canvas || !doorButton || !enterCabinButton || !hotspotLabel) throw new Error('Vehicle shell failed to render');
  return {
    canvas,
    doorButton,
    enterCabinButton,
    hotspotLabel,
    modeButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-mode]')),
    colorButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('.color-swatch')),
    seatButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-seat]')),
    storySections: Array.from(root.querySelectorAll<HTMLElement>('[data-story-view]')),
  };
}
