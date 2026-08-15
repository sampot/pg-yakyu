export const OPPONENTS = [
  { id: 'gangdu', name: '港都高中', short: '港都', region: '南', power: 42, cheer: '港風灌滿紅土！' },
  { id: 'yingqiao', name: '螢橋商工', short: '螢橋', region: '北', power: 47, cheer: '螢火接力、守住這局！' },
  { id: 'binhai', name: '濱海高中', short: '濱海', region: '北', power: 51, cheer: '海風助攻、氣勢不退！' },
  { id: 'daoxiang', name: '稻香農工', short: '稻香', region: '中', power: 57, cheer: '稻浪推過外野牆！' },
  { id: 'shancheng', name: '山城高中', short: '山城', region: '東', power: 63, cheer: '山城不退、一棒定音！' },
  { id: 'tiedao', name: '鐵道高中', short: '鐵道', region: '中', power: 69, cheer: '沿著鐵道、打到全國！' },
  { id: 'fenghuang', name: '鳳凰高中', short: '鳳凰', region: '南', power: 76, cheer: '浴火再攻、滿壘不怕！' },
  { id: 'chitu', name: '赤土高中', short: '赤土', region: '南', power: 84, cheer: '赤土之子、再見安打！' },
];

export function getOpponent(id) {
  return OPPONENTS.find((opponent) => opponent.id === id) ?? OPPONENTS[0];
}
