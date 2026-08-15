const OUT_LINES = [
  '三上三下，攻勢熄火',
  '滾地球，一壘出局',
  '高飛接殺，加油聲卡住',
  '揮空，主審拉弓',
  '軟弱飛球，外野輕鬆入袋',
];

const SINGLE_LINES = [
  '穿越安打，推進一壘',
  '平飛安打穿出內野',
  '內野安打，跑得快就是本錢',
];

const DOUBLE_LINES = [
  '打進外野深處，二壘安打',
  '追平分機會浮上來了',
  '牆前落地，二壘打',
];

const TRIPLE_LINES = [
  '球滾到牆角，三壘安打',
  '大腳程衝上三壘',
];

const HR_LINES = [
  '陽春砲！球飛出牆外',
  '這球飛出去啦——全壘打',
  '清壘打！紅土沸騰',
];

const BY_RESULT = {
  out: OUT_LINES,
  single: SINGLE_LINES,
  double: DOUBLE_LINES,
  triple: TRIPLE_LINES,
  homeRun: HR_LINES,
};

export function flavorLine(result, random = Math.random) {
  const pool = BY_RESULT[result] || OUT_LINES;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
}
