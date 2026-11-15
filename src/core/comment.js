// ============================================================
// 一言解説：飛行の記録（実際の計算結果）から、なぜそう飛んだかを1〜2文で説明する。
// 失速の回数・機首の角度・回転の数・流された距離などの数字は、すべて記録から数えたもの。
// ============================================================
import { analyzeDesign } from './aero.js';
import { meanWindVector } from './wind.js';
import { computeStats } from './analysis.js';

const D2R = Math.PI / 180;
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const f0 = (x) => String(Math.round(x));

/**
 * @returns { kind, headline, text, stats, info }
 *   kind: 'glide' | 'dive' | 'stall' | 'tumble' | 'loop' | 'spin' | 'wobble' | 'spiral' | 'drift' | 'wave' | 'float' | 'fast' | 'away'
 */
export function makeComment(rec) {
  const stats = computeStats(rec);
  const info = analyzeDesign(rec.aircraft);
  const s = rec.setup, r = rec.result;
  const sm = info.staticMargin; // 重心が中立点よりどれだけ前か（翼弦に対する割合）
  const out = (kind, headline, text) => ({ kind, headline, text, stats, info });
  const gr = r.glideRatio;
  const side = (x) => (x >= 0 ? '右' : '左');
  const trimV = info.trimSpeed;

  // 風の、投げた向きに沿う成分（＋が追い風）
  const [wxm, , wzm] = meanWindVector(s);
  const ps = s.throwHeading * D2R;
  const windAlong = wxm * Math.cos(ps) + wzm * Math.sin(ps);
  const windy = s.windSpeed >= 1 && stats.windDrift >= 1.5;
  const windNote = windy ? `風下へ約${f1(stats.windDrift)}m流されました。` : '';

  if (r.endReason === 'timeout') {
    return out('away', '飛び続けた', `${f0(r.airtime)}秒たっても着地せず、高さ${f1(r.landing[1])}mを飛び続けました。上昇気流や風が機体を支え続けています。`);
  }
  if (r.endReason === 'range') {
    return out('away', '草原の外へ', `草原の端（${f0(r.distance)}m先）まで飛んでいきました。風や上昇気流に乗って、とても遠くまで運ばれました。`);
  }

  // --- きりもみ（失速したまま、くるくる回って落ちる）---
  if (stats.spinTurns >= 1) {
    const turns = f0(stats.spinTurns);
    if (info.yawStability < 0.03) {
      return out('spin', 'くるくる回って落下', `垂直尾翼が小さく、左右の向きを保てずに首を振り、最後は約${turns}回転しながら落ちました。垂直尾翼を大きくしてみましょう。`);
    }
    if (sm < 0.06) {
      return out('spin', '失速して回転', `重心が後ろすぎて機首が上がり、失速したまま約${turns}回転して落ちました。重りを前へずらしてみましょう。`);
    }
    return out('spin', '失速して回転', `失速して片方の翼から落ち、約${turns}回転しながら降下しました。投げる角度をゆるくするか、水平尾翼の角度を小さくしてみましょう。`);
  }

  // --- 後ろ向きにひっくり返る ---
  if (stats.tumbles >= 1) {
    if (sm < 0.06) {
      return out('tumble', 'ひっくり返った', `重心が後ろすぎて機首が上がり続け、失速したまま${stats.tumbles}回ひっくり返りました。重りを前へずらしてみましょう。`);
    }
    return out('tumble', 'ひっくり返った', `機首が上がり続けて速さを失い、失速したまま${stats.tumbles}回ひっくり返りました。投げる速さか水平尾翼の角度を小さくしてみましょう。`);
  }

  // --- 宙返り ---
  if (stats.loops >= 1) {
    const tail = stats.stallCount >= 1 ? `そのあと速さを失って${stats.stallCount}回失速しました。` : 'そのあとは滑空に移りました。';
    const why = s.tailAngle >= 6
      ? '水平尾翼の角度が大きく、速く投げたので、機首を上げる力が勝ち続けました。'
      : `釣り合う速さ${trimV ? `（約${f1(trimV)}m/s）` : ''}よりずっと速く投げたので、余った揚力で機首が上がり続けました。`;
    return out('loop', `宙返り ${stats.loops}回`, `宙返りを${stats.loops}回しました。${why}${tail}`);
  }

  // --- 投げた瞬間の速さが足りない ---
  if (sm <= 0.27 && trimV && stats.launchAirspeed < 0.72 * trimV && (stats.stallCount >= 1 || stats.impactPitch < -15)) {
    const v = f1(stats.launchAirspeed), vt = f1(trimV);
    if (windAlong > 0.7) {
      return out('stall', '速さが足りず失速', `追い風のため、投げた瞬間の空気に対する速さが${v}m/sしかなく（釣り合う速さは約${vt}m/s）、翼が空気を受けきれずに機首から落ちました。向かい風に向けて投げるか、もっと速く投げてみましょう。`);
    }
    return out('stall', '速さが足りず失速', `投げる速さ${v}m/sが、釣り合う速さ（約${vt}m/s）に足りず、翼が空気を受けきれずに機首を${f0(-stats.minPitch)}°下げて落ちました。もっと速く投げてみましょう。`);
  }

  // --- 失速のくり返し（波打つ飛び方）---
  if (stats.stallCount >= 2 || (stats.stallCount >= 1 && stats.stallFraction > 0.25)) {
    const nStall = stats.stallCount;
    const peak = `機首が最大${f0(stats.maxPitch)}°まで上がり、`;
    const how = nStall >= 2
      ? `失速を${nStall}回くり返して${stats.waves >= 2 ? '波打つように' : ''}落ちました。`
      : '失速したまま立て直せずに落ちました。';
    const head = nStall >= 2 ? '失速をくり返した' : '失速して落下';
    if (sm < 0.06) {
      return out('stall', head, `重心が後ろすぎて${peak}${how}重りを前へずらしてみましょう。`);
    }
    if (info.trimAlphaDeg === null || info.trimAlphaDeg > 10.5) {
      return out('stall', head, `水平尾翼の角度が大きすぎて${peak}${how}水平尾翼の角度を小さくするか、重りを前へずらしてみましょう。`);
    }
    return out('stall', head, `釣り合う速さ（約${f1(trimV || 0)}m/s）より速く・上向きに投げたため、上昇して速さを失い、${peak}${how}もう少しゆっくり、水平に近く投げてみましょう。`);
  }

  // --- 左右の向きが定まらない ---
  if (info.yawStability < 0.03 && (stats.maxBank > 30 || stats.yawTurns > 0.3)) {
    return out('wobble', '首を振って不安定', `垂直尾翼が小さく、左右の向きが定まらずに首を振り、最大${f0(stats.maxBank)}°まで傾きました。垂直尾翼を大きくしてみましょう。`);
  }

  // --- 急降下 ---
  const overallDescent = r.maxHeight > 0.05 ? Math.atan2(r.maxHeight, Math.max(r.distance, 0.01)) / D2R : 0;
  const zoomed = r.maxHeight > r.launch[1] + 0.4; // 勢いで上昇した（急降下ではなく、山なりの飛び方）
  if (stats.stallCount === 0 && !zoomed && (stats.finalDescentDeg > 22 || (gr !== null && gr < 2.6)) && stats.impactPitch < -12) {
    const ang = f0(Math.max(stats.finalDescentDeg, overallDescent));
    if (sm > 0.27) {
      return out('dive', '急降下', `重心が前すぎて機首が${f0(-stats.minPitch)}°下がり、約${ang}°の角度で急降下しました（着地の速さ ${f1(stats.impactSpeed)}m/s）。重りを後ろへずらすか、水平尾翼の角度を大きくしてみましょう。`);
    }
    if (s.throwPitch <= -8) {
      return out('dive', '急降下', `下向きに投げたので、機首を起こす前に約${ang}°の角度で地面に着きました。水平に近く投げてみましょう。`);
    }
    if (info.trimAlphaDeg === null || info.trimAlphaDeg < 3.2) {
      return out('dive', '急降下', `機首を上げる力が足りず、約${ang}°の角度で急降下しました。水平尾翼の角度を大きくするか、重りを後ろへずらしてみましょう。`);
    }
    return out('dive', '機首を下げて降下', `速さをかせぐために機首を下げ、約${ang}°の角度で降下して、立て直す前に着地しました。もう少し高い所から、または速く投げてみましょう。`);
  }

  // --- 横風に流された ---
  if (windy && stats.stallFraction < 0.1 && Math.abs(stats.windCross) >= 0.7 && Math.abs(stats.lateral) >= 2 && Math.abs(stats.trackChangeDeg) < 100) {
    const dir = side(stats.lateral);
    const level = stats.lateBankAbs < 6 ? '翼は水平に戻り、' : `平均${f0(stats.lateBankAbs)}°傾いたまま、`;
    const tilt = stats.maxBank >= 8 ? `横風を受けて最大${f0(stats.maxBank)}°傾いたあと、${level}` : '横風を受け、';
    return out('drift', '横風に流された', `${tilt}風下（${dir}）へ${f1(Math.abs(stats.lateral))}m流されました。風が強いほど、また飛んでいる時間が長いほど大きく流されます。`);
  }

  // --- 1回だけ失速 ---
  if (stats.stallCount === 1) {
    return out('stall', '1回失速して立て直した', `投げたあと機首が${f0(stats.maxPitch)}°まで上がって速さを失い、1回失速しましたが、機首を下げて立て直しました。${windNote || 'もう少しゆっくり、水平に近く投げると失速しません。'}`);
  }

  // --- 傾いたまま曲がり続ける（らせん）---
  const turned = Math.abs(stats.trackChangeDeg);
  if (turned > 75 && stats.lateBankAbs > 3) {
    const dir = side(stats.trackChangeDeg);
    const tip = s.wingDihedral < 6 ? '上反角を大きくすると、傾いても水平に戻りやすくなります。' : '上反角をもう少し大きくするか、垂直尾翼を小さめにしてみましょう。';
    const cause = s.windSpeed >= 1 ? '風を受けて' : '';
    return out('spiral', `${dir}へ曲がり続けた`, `${cause}${dir}へ傾いたまま水平に戻らず、向きを約${f0(turned)}°変えながら曲がり続けました。${tip}`);
  }

  // --- 追い風・向かい風 ---
  if (s.windSpeed >= 1 && windAlong > 0.7 && stats.windDrift >= 1.5) {
    return out('drift', '追い風に乗った', `追い風に運ばれて${f1(r.distance)}m飛びました。空気に対する速さは同じでも、地面に対しては風のぶん速く進みます。`);
  }
  if (s.windSpeed >= 1 && windAlong < -0.7) {
    return out('drift', '向かい風で伸びず', `向かい風に押し戻され、飛距離は${f1(r.distance)}mでした。空気に対しては進んでいても、地面に対しては風のぶん遅くなります。`);
  }

  // --- 上昇気流 ---
  const grTxt = gr !== null ? `滑空比は${f1(gr)}（1m下がる間に${f1(gr)}m前進）でした。` : '';
  if (s.updraft && stats.liftTime >= 1) {
    if (r.maxHeight > r.launch[1] + 0.5) {
      return out('float', '上昇気流に乗った', `上昇気流に持ち上げられ、投げた高さより${f1(r.maxHeight - r.launch[1])}m高く上がりました。${grTxt}`);
    }
    return out('float', '上昇気流に支えられた', `上昇気流の柱の中を${f1(stats.liftTime)}秒飛び、その間は沈むのが遅くなって、${f1(r.airtime)}秒・${f1(r.distance)}mまで伸びました。`);
  }

  // --- 上下の波（失速はしない）---
  if (stats.waves >= 2) {
    const trim = trimV ? `釣り合う速さ（約${f1(trimV)}m/s）に近い速さで投げると、波が小さくなります。` : '';
    return out('wave', 'ゆるやかに上下した', `失速はせず、速くなると上がり遅くなると下がる、ゆるやかな上下を${stats.waves}回くり返しました。${trim}`);
  }

  // --- 安定した滑空 ---
  if (stats.avgSpeed >= 5.5) {
    if (zoomed) {
      return out('fast', '速く一気に飛んだ', `投げた勢いで高さ${f1(r.maxHeight)}mまで上がり、平均${f1(stats.avgSpeed)}m/sの速さで一気に${f1(r.distance)}m飛びました。細い翼は空気の抵抗が小さく、速さを保てます。`);
    }
    return out('fast', '速くまっすぐ飛んだ', `平均${f1(stats.avgSpeed)}m/sの速さを保ち、機首も傾きも安定してまっすぐ飛びました。${grTxt}`);
  }
  if (stats.avgSpeed <= 3.1 && r.airtime >= 6) {
    return out('float', 'ゆっくり長く浮かんだ', `広い翼が軽い機体を支え、平均${f1(stats.avgSpeed)}m/sでゆっくりと${f1(r.airtime)}秒浮かびました。${grTxt}`);
  }
  const balance = sm >= 0.06 && sm <= 0.27 ? '重心がちょうどよい位置にあり、' : '';
  return out('glide', 'まっすぐ滑空', `${balance}機首の上下も左右の傾きも安定して、まっすぐ滑空しました。${grTxt}`);
}
