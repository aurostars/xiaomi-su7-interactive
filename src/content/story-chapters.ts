export type StoryId = 'aero' | 'performance' | 'cabin' | 'intelligence';

export interface StoryChapter {
  id: StoryId;
  eyebrow: string;
  title: string;
  description: string;
  bullets: readonly string[];
}

export const STORY_CHAPTERS: readonly StoryChapter[] = [
  {
    id: 'aero',
    eyebrow: '空气动力学',
    title: '低趴轿跑姿态，像风压过车身',
    description: '流畅车顶弧线与低重心姿态共同塑造动势，让每一道曲面都回应速度。',
    bullets: ['长车头与流线车顶延展视觉比例', '车身型面在光影中保持清晰层次'],
  },
  {
    id: 'performance',
    eyebrow: '纯电性能',
    title: '电驱、轮组与底盘共同制造力量感',
    description: '即时动力响应配合稳定底盘，让敏捷加速与从容操控在同一台车上成立。',
    bullets: ['低重心布局强化弯道支撑', '高性能轮组传递直接路感'],
  },
  {
    id: 'cabin',
    eyebrow: '智能座舱',
    title: '切入座舱，看见屏幕与乘坐空间',
    description: '屏幕、方向盘与座椅围绕驾乘者展开，信息和空间保持自然、连贯的秩序。',
    bullets: ['前排交互触手可及', '多座席视角一键切换'],
  },
  {
    id: 'intelligence',
    eyebrow: '智能感知',
    title: '传感器视角，展示智能驾驶想象力',
    description: '感知硬件持续理解车辆周围环境，让复杂道路信息转化为清晰驾驶辅助。',
    bullets: ['多源感知协同工作', '环境信息实时形成判断'],
  },
];
