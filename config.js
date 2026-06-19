'use strict';
// ================================================================
// config.js  ─  スプライト座標（実測値）+ ゲーム定数
// ================================================================
// 【実測データ】sprites.png = 1408 × 768 px
//
// ── アニメ行 Y範囲（全キャラ共通） ──────────────────────────────
//   IDLE 行      : y =   0 ~ 158  (sh=159)
//   MOVE 行      : y = 159 ~ 346  (sh=188)
//   ATTACK/CAST行: y = 350 ~ 547  (sh=198, y=350~384は斬撃エフェクト込み)
//   HIT/VICTORY行: y = 553 ~ 762  (sh=210)
//
// ── キャラクター X列 ────────────────────────────────────────────
//   ラティ : x =    0 ~ 345
//   ミリー : x =  346 ~ 695
//   フェルウォーム  : x =  701 ~ 891
//   ブッシュウォーカー: x = 894 ~ 1128
//   ロバーアクス  : x = 1134 ~ 1407
// ================================================================

// ▼ デバッグ：trueにすると各スプライトに赤枠を描画
const DEBUG_SPRITES = false;

// ▼ スプライトシートのパス（images/ に sprites.png を置くこと）
const SPRITE_SHEET_PATH = 'images/sprites.png';

// ▼ クロマキー除去設定（マゼンタ背景を透明化）
const CHROMA = { r: 255, g: 0, b: 255, tolerance: 60 };

// ランタイムで game.js が設定（変更不要）
var spriteCanvas = null;

// ================================================================
// フレーム定義ヘルパー
// F(sy, sh, sx0, sw0, sx1, sw1, ...) で各コマの切り出し矩形を生成
// ================================================================
function F(sy, sh) {
  const rest = Array.prototype.slice.call(arguments, 2);
  const out = [];
  for (let i = 0; i < rest.length; i += 2) {
    out.push({ sx: rest[i], sy: sy, sw: rest[i+1], sh: sh });
  }
  return out;
}

// ================================================================
// SPRITE_DEFS  ─  全キャラのスプライト座標定義
//
// anims[state].frames = [{sx, sy, sw, sh}, ...]  ← 実測値
// anims[state].speed  = コマ送り間隔（フレーム数）
// anims[state].loop   = false → 最終コマで停止
//
// displayScale : 描画倍率（1=等倍、1.5=1.5倍など）
// ================================================================

const SPRITE_DEFS = {

  // ── ラティクス ────────────────────────────────────────────────
  // 列: x=0~345  フレーム幅: col0=128px, col1~2=88px
  ratix: {
    displayScale: 1,
    anims: {
      IDLE:    { speed:12, frames: F(  0,159,   0,128, 128,88, 216,88) },
      MOVE:    { speed: 6, frames: F(159,188,   0,128, 128,88, 216,88) },
      ATTACK:  { speed: 5, frames: F(350,198,   0,195, 197,148), loop: false },
      HIT:     { speed:10, frames: F(553,210,   0,156) },
      VICTORY: { speed:12, frames: F(553,210,   0,156) },
      DEAD:    { speed:10, frames: F(553,210,   0,156) },
    }
  },

  // ── ミリー・キリート ──────────────────────────────────────────
  // 列: x=346~695  フレーム間隔 ≈100px
  millie: {
    displayScale: 1,
    anims: {
      IDLE:       { speed:12, frames: F(  0,159, 346,100, 446,100, 546,100) },
      MOVE:       { speed: 8, frames: F(159,188, 346,100, 446,100, 546,100) },
      CAST_CHANT: { speed: 8, frames: F(350,198, 346,132, 479, 99, 579,116) },
      HIT:        { speed:10, frames: F(553,210, 346, 89) },
      VICTORY:    { speed:12, frames: F(553,210, 458,238) },
      DEAD:       { speed:10, frames: F(553,210, 346, 89) },
    }
  },

  // ── フェルウォーム（x=701~891, 幅191px）─────────────────────
  felworm: {
    displayScale: 1,
    anims: {
      IDLE:   { speed:12, frames: F(  0,159, 701,191) },
      MOVE:   { speed: 6, frames: F(159,188, 701, 95, 796, 95) },
      ATTACK: { speed: 6, frames: F(350,198, 701,191), loop: false },
      HIT:    { speed:10, frames: F(553,210, 701,109, 818, 74) },
      DEAD:   { speed:10, frames: F(553,210, 701,109) },
    }
  },

  // ── ブッシュウォーカー（x=894~1128, 幅235px）────────────────
  bushwalker: {
    displayScale: 1,
    anims: {
      IDLE:   { speed:12, frames: F(  0,159,  894,235) },
      MOVE:   { speed: 6, frames: F(159,188,  894,116, 1032, 92) },
      ATTACK: { speed: 6, frames: F(350,198,  904,125, 1030, 99), loop: false },
      HIT:    { speed:10, frames: F(553,210,  903,121, 1032, 95) },
      DEAD:   { speed:10, frames: F(553,210,  903,121) },
    }
  },

  // ── ロバーアクス（x=1134~1407, 幅274px）─────────────────────
  robberaxe: {
    displayScale: 1,
    anims: {
      IDLE:   { speed:12, frames: F(  0,159, 1134,274) },
      MOVE:   { speed: 6, frames: F(159,188, 1134,134, 1268,134) },
      ATTACK: { speed: 6, frames: F(350,198, 1134,119, 1275,114), loop: false },
      HIT:    { speed:10, frames: F(553,210, 1134,125, 1264,127) },
      DEAD:   { speed:10, frames: F(553,210, 1134,125) },
    }
  }
};

// キャラクター名 → スプライトキー
const CHAR_SPRITE_KEY = {
  'ラティ':          'ratix',
  'ミリー':          'millie',
  'フェルウォーム':   'felworm',
  'ブッシュウォーカー':'bushwalker',
  'ロバーアクス':     'robberaxe',
};

// ================================================================
// 必殺技（特技）データ
// ================================================================
const RATIX_ARTS = {
  short: { name: 'ライジングスラッシュ', mp: 15, dmg: [300, 420] },
  long:  { name: 'ソニックエッジ',       mp: 20, dmg: [260, 380] }
};

// ================================================================
// ミリー 紋章術データ
// cast = 詠唱秒数  /  stop = 発動後の画面停止秒数（0=停止なし）
// ================================================================
const MILLIE_SPELLS = {
  heal:     { name: 'ヒール',           mp:  4, cast: 0.2, stop: 0.0, type: 'healSingle', amount: 280 },
  cureAll:  { name: 'キュアオール',     mp: 24, cast: 2.5, stop: 5.5, type: 'healAll',    amount: 450 },
  acidRain: { name: 'アシッドレイン',   mp:  8, cast: 1.0, stop: 6.5, type: 'debuffDef',  mult:   1.3, duration: 8 },
  fixCloud: { name: 'フィクスクラウド', mp:  6, cast: 1.5, stop: 5.5, type: 'stunAll',   duration: 3 }
};
