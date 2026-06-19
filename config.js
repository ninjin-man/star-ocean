'use strict';
// ================================================================
// config.js  ─  調整が必要な値はすべてここに集約されています
// ================================================================
// 【スプライト座標チューニング手順】
//   1. DEBUG_SPRITES = true にして画面でキャラを動かす
//   2. 赤い枠 = 想定スプライト位置  /  枠とドット絵がズレていたら
//   3. 各 sectionX・anims.y を±数px単位で調整
//   4. 合ったら DEBUG_SPRITES = false に戻す
// ================================================================

// ▼ デバッグ：trueで各スプライトに赤い枠線を描画
const DEBUG_SPRITES = false;

// ▼ スプライトシート画像ファイルパス（images/フォルダに置く）
const SPRITE_SHEET_PATH = 'images/sprites.png';

// ▼ クロマキー除去設定（マゼンタ背景を透明化）
const CHROMA = { r: 255, g: 0, b: 255, tolerance: 60 };

// ランタイムで game.js が設定するグローバル変数（変更不要）
var spriteCanvas = null;

// ================================================================
// SPRITE_DEFS  ─  スプライト座標定義
// ================================================================
// ◆ sectionX    : このキャラのスプライト列が始まるX座標（PNG内ピクセル）
// ◆ frameW/H    : 1コマのサイズ（PNG内のピクセル数）
// ◆ displayScale: 拡大倍率（2 → 48x48 を 96x96 で描画）
// ◆ offsetX/Y   : キャラクター中央-底部からの描画オフセット
//                  offsetX = -(frameW×scale)/2  ←左右センタリング
//                  offsetY = -(frameH×scale)    ←底面を基準に上へ
// ◆ anims[]:
//     y        : アニメ行のY座標（★最もよく調整する値）
//     frames   : コマ数
//     speed    : コマ送り間隔（フレーム数。大きいほど遅い）
//     colStart : 行内の開始列オフセット（省略=0）
//     loop     : false=最後のコマで停止（攻撃アニメ用）
// ================================================================

const SPRITE_DEFS = {

  // ── ラティクス（48×48 / 左列）──────────────────────────────
  ratix: {
    sectionX: 0,       // ★ ラティクス列の開始X座標
    frameW: 48,
    frameH: 48,
    displayScale: 2,
    offsetX: -48,      // -(48×2)/2
    offsetY: -96,      // -(48×2)
    anims: {
      IDLE:    { y:  20, frames: 4, speed: 12, colStart: 0 },
      MOVE:    { y:  75, frames: 6, speed:  6, colStart: 0 },
      ATTACK:  { y: 135, frames: 5, speed:  5, colStart: 0, loop: false },
      HIT:     { y: 200, frames: 1, speed: 10, colStart: 0 },
      VICTORY: { y: 200, frames: 2, speed: 12, colStart: 1 }, // HITの隣
      DEAD:    { y: 200, frames: 1, speed: 10, colStart: 0 },
    }
  },

  // ── ミリー（48×48 / ラティスの右列）──────────────────────────
  millie: {
    sectionX: 300,     // ★ ミリー列の開始X座標
    frameW: 48,
    frameH: 48,
    displayScale: 2,
    offsetX: -48,
    offsetY: -96,
    anims: {
      IDLE:       { y:  20, frames: 4, speed: 12, colStart: 0 },
      MOVE:       { y:  75, frames: 6, speed:  8, colStart: 0 },
      CAST_CHANT: { y: 135, frames: 4, speed:  8, colStart: 0 },
      HIT:        { y: 200, frames: 1, speed: 10, colStart: 0 },
      VICTORY:    { y: 200, frames: 2, speed: 12, colStart: 1 },
      DEAD:       { y: 200, frames: 1, speed: 10, colStart: 0 },
    }
  },

  // ── 敵（64×64 / 縦積みレイアウト・同一X列）──────────────────
  // 縦積みとは: Felworm(y=0〜255)→Bushwalker(y=256〜511)→RobberAxe(y=512〜767)
  // もしシート上で横並びの場合は各敵の sectionX を個別に設定し、
  // y をすべて 0/64/128/192 に戻してください。

  felworm: {
    sectionX: 680,     // ★ 敵列の開始X座標（3体共通）
    frameW: 64,
    frameH: 64,
    displayScale: 2,
    offsetX: -64,      // -(64×2)/2
    offsetY: -128,     // -(64×2)
    anims: {
      IDLE:   { y:   0, frames: 4, speed: 12, colStart: 0 },
      MOVE:   { y:  64, frames: 6, speed:  6, colStart: 0 },
      ATTACK: { y: 128, frames: 4, speed:  6, colStart: 0, loop: false },
      HIT:    { y: 192, frames: 1, speed: 10, colStart: 0 },
      DEAD:   { y: 192, frames: 1, speed: 10, colStart: 0 },
    }
  },

  bushwalker: {
    sectionX: 680,     // felworm と同じX列、Y=256から開始
    frameW: 64,
    frameH: 64,
    displayScale: 2,
    offsetX: -64,
    offsetY: -128,
    anims: {
      IDLE:   { y: 256, frames: 4, speed: 12, colStart: 0 },
      MOVE:   { y: 320, frames: 6, speed:  6, colStart: 0 },
      ATTACK: { y: 384, frames: 4, speed:  6, colStart: 0, loop: false },
      HIT:    { y: 448, frames: 1, speed: 10, colStart: 0 },
      DEAD:   { y: 448, frames: 1, speed: 10, colStart: 0 },
    }
  },

  robberaxe: {
    sectionX: 680,     // felworm と同じX列、Y=512から開始
    frameW: 64,
    frameH: 64,
    displayScale: 2,
    offsetX: -64,
    offsetY: -128,
    anims: {
      IDLE:   { y: 512, frames: 4, speed: 12, colStart: 0 },
      MOVE:   { y: 576, frames: 6, speed:  6, colStart: 0 },
      ATTACK: { y: 640, frames: 4, speed:  6, colStart: 0, loop: false },
      HIT:    { y: 704, frames: 1, speed: 10, colStart: 0 },
      DEAD:   { y: 704, frames: 1, speed: 10, colStart: 0 },
    }
  }
};

// キャラクター名 → スプライトキー マッピング
const CHAR_SPRITE_KEY = {
  'ラティ':          'ratix',
  'ミリー':          'millie',
  'フェルウォーム':   'felworm',
  'ブッシュワーカー': 'bushwalker',
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
//   cast = 詠唱秒数（その間も戦闘はリアルタイムで進む）
//   stop = 発動後の画面停止秒数（0＝停止なし）
// ================================================================
const MILLIE_SPELLS = {
  heal:     { name: 'ヒール',           mp:  4, cast: 0.2, stop: 0.0, type: 'healSingle', amount:  280 },
  cureAll:  { name: 'キュアオール',     mp: 24, cast: 2.5, stop: 5.5, type: 'healAll',    amount:  450 },
  acidRain: { name: 'アシッドレイン',   mp:  8, cast: 1.0, stop: 6.5, type: 'debuffDef',  mult:    1.3, duration: 8 },
  fixCloud: { name: 'フィクスクラウド', mp:  6, cast: 1.5, stop: 5.5, type: 'stunAll',   duration: 3 }
};
