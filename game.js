'use strict';
// ================================================================
// game.js  ─  スプライト読込・ゲームループ・UIイベント
// ================================================================

const gameCanvas = document.getElementById('battleCanvas');
const ctx        = gameCanvas.getContext('2d');
const engine     = new EngineManager();

// ── スプライトシート読み込み ────────────────────────────────────

/**
 * クロマキー除去：マゼンタ背景 → 透明化して offscreen canvas を返す
 * （結果を spriteCanvas 変数に代入して drawImage の参照先にする）
 */
function buildSpriteCanvas(img) {
  const oc   = document.createElement('canvas');
  oc.width   = img.naturalWidth  || 1024;
  oc.height  = img.naturalHeight || 768;
  const octx = oc.getContext('2d', { willReadFrequently: true });
  octx.drawImage(img, 0, 0);

  const id  = octx.getImageData(0, 0, oc.width, oc.height);
  const d   = id.data;
  const cr  = CHROMA.r, cg = CHROMA.g, cb = CHROMA.b, ct = CHROMA.tolerance * 3;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - cr) + Math.abs(d[i+1] - cg) + Math.abs(d[i+2] - cb) < ct) {
      d[i+3] = 0;
    }
  }
  octx.putImageData(id, 0, 0);
  return oc;
}

/** 画像を読み込んでからゲーム開始 */
function loadSprites() {
  const loadMsg = document.getElementById('loadingMsg');
  if (loadMsg) loadMsg.style.display = 'block';

  const img  = new Image();
  img.onload = () => {
    spriteCanvas = buildSpriteCanvas(img);   // グローバル変数（config.js で宣言）
    if (loadMsg) loadMsg.style.display = 'none';
    resetBattle();
    loop();
  };
  img.onerror = () => {
    console.warn('[SO] スプライト画像の読み込みに失敗。プレースホルダーで起動します:', SPRITE_SHEET_PATH);
    spriteCanvas = null;
    if (loadMsg) loadMsg.style.display = 'none';
    resetBattle();
    loop();
  };
  img.src = SPRITE_SHEET_PATH;
}

// ── バトル初期化 ───────────────────────────────────────────────

function resetBattle() {
  const ratix = new BattleCharacter(150, 200, true,  false, 'ラティ',          1200, 45,  75,  1);
  engine.player        = ratix;
  engine.victoryShown  = false;
  engine.isTimeStopped = false;
  engine.magicCircleRadius = 0;
  engine.stopFramesLeft    = 0;
  engine._onStopDone       = null;
  engine.spellLabel        = '';

  engine.entities = [
    ratix,
    new BattleCharacter(100, 260, false, true,  'ミリー',          850, 120, 40,  1),
    new BattleCharacter(600, 160, false, true,  'フェルウォーム',   480, 0,   28, -1),
    new BattleCharacter(650, 230, false, true,  'ブッシュワーカー', 460, 0,   26, -1),
    new BattleCharacter(580, 300, false, true,  'ロバーアクス',     520, 0,   30, -1),
  ];
  engine.effects = [];

  const log = document.getElementById('log');
  if (log) log.innerText = 'BATTLE START / 敵をクリック or タップでターゲット指定';
  updateUI();
}

// ── ターゲット選択（クリック & タッチ）────────────────────────────

function handleTargetSelect(clientX, clientY) {
  const rect   = gameCanvas.getBoundingClientRect();
  const scaleX = gameCanvas.width  / rect.width;
  const scaleY = gameCanvas.height / rect.height;
  const cx     = (clientX - rect.left) * scaleX;
  const cy     = (clientY - rect.top)  * scaleY;

  for (const ent of engine.entities) {
    if (!ent.isPlayer && ent.name !== 'ミリー' && ent.hp > 0) {
      if (Math.abs(ent.x - cx) < 45 && Math.abs(ent.y - cy) < 45) {
        engine.player.target = ent;
        const log = document.getElementById('log');
        if (log) log.innerText = `TARGET LOCKED: ${ent.name}`;
        return;
      }
    }
  }
}

gameCanvas.addEventListener('click',      e => handleTargetSelect(e.clientX, e.clientY));
gameCanvas.addEventListener('touchstart', e => {
  if (e.touches.length > 0) handleTargetSelect(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });

// ── SFCボタンアクション ────────────────────────────────────────

/** A/B ボタン：通常攻撃 & コンボ入力 */
function triggerPlayerAttack() {
  const pl = engine.player;
  if (!pl || pl.state === 'DEAD' || pl.state === 'VICTORY') return;

  if (!pl.target || pl.target.hp <= 0) pl.logicAI(engine);

  if (['IDLE', 'MOVE', 'MANUAL_MOVE'].includes(pl.state)) {
    pl.state = 'MOVE';
  } else if (pl.state === 'ATTACK' && engine.comboBufferTimer > 0 && pl.comboStep < 3) {
    pl.stateTimer = 1;  // 硬直を即終了してコンボ継続
    const log = document.getElementById('log');
    if (log) log.innerText = `COMBO LINK ${pl.comboStep + 1}!`;
  }
  engine.comboBufferTimer = 30;
}

/** L ボタン：近距離奥義（ショートレンジ特技） */
function triggerHissatsuShort() {
  const pl = engine.player;
  if (!pl || pl.state === 'DEAD' || pl.state === 'VICTORY') return;
  const art = RATIX_ARTS.short;
  if (pl.mp < art.mp) {
    const log = document.getElementById('log');
    if (log) log.innerText = 'MP不足！';
    return;
  }
  if (!pl.target || pl.target.hp <= 0) pl.logicAI(engine);
  if (!pl.target) return;

  pl.mp -= art.mp;
  pl.queuedArt = 'short';

  if (Math.hypot(pl.target.x - pl.x, pl.target.y - pl.y) < 42) {
    pl.executeAttack(engine);
  } else {
    pl.state = 'MOVE';
  }
  const log = document.getElementById('log');
  if (log) log.innerText = `必殺技準備: ${art.name}`;
}

/** R ボタン：遠距離奥義（ロングレンジ特技・即時発射） */
function triggerHissatsuLong() {
  const pl = engine.player;
  if (!pl || pl.state === 'DEAD' || pl.state === 'VICTORY') return;
  const art = RATIX_ARTS.long;
  if (pl.mp < art.mp) {
    const log = document.getElementById('log');
    if (log) log.innerText = 'MP不足！';
    return;
  }
  if (!pl.target || pl.target.hp <= 0) pl.logicAI(engine);
  if (!pl.target) return;

  pl.mp  -= art.mp;
  pl.side = pl.target.x > pl.x ? 1 : -1;
  pl.state      = 'ATTACK';
  pl.stateTimer = 28;
  pl.comboStep  = 0;

  const dmg = Math.floor(Math.random() * (art.dmg[1] - art.dmg[0])) + art.dmg[0];
  engine.effects.push(new BeamEffect(pl.x, pl.y - pl.z - 20,
                                      pl.target.x, pl.target.y - pl.target.z - 20));
  pl.target.takeDamage(dmg, engine, pl.side);

  const log = document.getElementById('log');
  if (log) log.innerText = `必殺技: ${art.name}！`;
}

/** X ボタン：ミリー キュアオール */
function castMillieCureAll() {
  engine.castMillieSpell(engine.entities[1], MILLIE_SPELLS.cureAll);
}

/** Y ボタン：ミリー アシッドレイン */
function castMillieAcidRain() {
  engine.castMillieSpell(engine.entities[1], MILLIE_SPELLS.acidRain);
}

/** 十字キー：手動横移動（原作SFCには存在しない、タッチ操作用拡張） */
function startManualMove(speed) {
  const pl = engine.player;
  if (pl && pl.state !== 'DEAD' && pl.state !== 'ATTACK'
         && pl.state !== 'CAST_CHANT' && pl.state !== 'VICTORY') {
    pl.state    = 'MANUAL_MOVE';
    pl.manualVx = speed;
  }
}
function stopManualMove() {
  const pl = engine.player;
  if (pl && pl.state === 'MANUAL_MOVE') {
    pl.state    = 'IDLE';
    pl.manualVx = 0;
  }
}

// ── UI 更新 ──────────────────────────────────────────────────────

function updateUI() {
  const pl  = engine.player;
  const mil = engine.entities && engine.entities[1];
  const el  = document.getElementById('partyStatus');
  if (!pl || !mil || !el) return;
  el.innerHTML =
    `ラティ: HP ${pl.hp}/${pl.maxHp} &nbsp; MP ${pl.mp}/${pl.maxMp} &nbsp; (GUTS:${pl.guts})<br>` +
    `ミリー(AI): HP ${mil.hp}/${mil.maxHp} &nbsp; MP ${mil.mp}/${mil.maxMp}`;
}

// ── メインループ ──────────────────────────────────────────────────

function loop() {
  engine.update();
  engine.draw(gameCanvas, ctx);
  updateUI();
  requestAnimationFrame(loop);
}

// ── エントリーポイント ────────────────────────────────────────────
// 画像読み込み完了後に resetBattle() → loop() が呼ばれる
loadSprites();
