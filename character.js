'use strict';
// ================================================================
// character.js  ─  BattleCharacter クラス
// ================================================================
// ゲームメカニクス変更時に編集する。スプライト座標は config.js を参照。
// ================================================================

class BattleCharacter {
  constructor(x, y, isPlayer, isAI, name, hp, mp, guts, side) {
    // 座標・物理
    this.x = x; this.y = y; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;

    // 識別
    this.isPlayer = isPlayer; this.isAI = isAI;
    this.name = name; this.side = side;

    // ステータス
    this.maxHp = hp; this.hp = hp;
    this.maxMp = mp; this.mp = mp;
    this.guts  = guts;

    // FSM
    this.state     = 'IDLE';
    this._prevState = null;   // ステート変化検出（アニメリセット用）
    this.stateTimer = 0;
    this.target     = null;

    // アニメーション
    this.animFrame = 0;
    this.animTimer = 0;

    // 戦闘
    this.comboStep      = 0;
    this.invincibleTimer= 0;
    this.isSuperArmor   = false;
    this.queuedArt      = null;   // 予約済み必殺技キー

    // 紋章術（ミリー用）
    this.pendingSpell  = null;
    this.pendingTarget = null;

    // 状態異常
    this.takenDamageMultiplier = 1;
    this.debuffTimer  = 0;
    this.isStunned    = false;
    this.stunTimer    = 0;

    // 手動移動（タッチ拡張）
    this.manualVx = 0;

    // スプライト定義を名前から自動ルックアップ
    const key = CHAR_SPRITE_KEY[name];
    this.spriteDef = key ? SPRITE_DEFS[key] : null;
  }

  // ── アニメーション ─────────────────────────────────────────

  /** FSMステート → アニメーションキー変換 */
  getAnimKey() {
    switch (this.state) {
      case 'IDLE':        return 'IDLE';
      case 'MANUAL_MOVE': return 'MOVE';
      case 'MOVE':        return 'MOVE';
      case 'ATTACK':      return 'ATTACK';
      case 'HIT':         return 'HIT';
      case 'DEAD':        return 'DEAD';
      case 'CAST_CHANT':
        return (this.spriteDef && this.spriteDef.anims['CAST_CHANT'])
          ? 'CAST_CHANT' : 'IDLE';
      case 'VICTORY':     return 'VICTORY';
      default:            return 'IDLE';
    }
  }

  /** アニメフレームを1ティック進める */
  _advanceAnim() {
    if (!this.spriteDef) return;
    const anim = this.spriteDef.anims[this.getAnimKey()];
    if (!anim) return;
    this.animTimer++;
    if (this.animTimer >= anim.speed) {
      this.animTimer = 0;
      if (anim.loop === false) {
        // 最終フレームで停止（攻撃アニメ等）
        this.animFrame = Math.min(this.animFrame + 1, anim.frames - 1);
      } else {
        this.animFrame = (this.animFrame + 1) % anim.frames;
      }
    }
  }

  // ── メインアップデート（FSM）─────────────────────────────────

  update(engine) {
    // ステート変化時はアニメをリセット
    if (this.state !== this._prevState) {
      this.animFrame  = 0;
      this.animTimer  = 0;
      this._prevState = this.state;
    }

    if (this.hp <= 0) { this.state = 'DEAD'; return; }

    // 状態異常タイマー
    if (this.debuffTimer > 0 && --this.debuffTimer <= 0) {
      this.takenDamageMultiplier = 1;
    }

    // スタン中は行動不能（アニメのみ進行）
    if (this.isStunned) {
      if (--this.stunTimer <= 0) this.isStunned = false;
      if (this.invincibleTimer > 0) this.invincibleTimer--;
      this._advanceAnim();
      return;
    }

    if (this.invincibleTimer > 0) this.invincibleTimer--;

    // Z軸重力
    if (this.z > 0 || this.vz !== 0) {
      this.vz -= 0.6;
      this.z  += this.vz;
      if (this.z <= 0) { this.z = 0; this.vz = 0; }
    }

    // ──────── FSM ────────
    switch (this.state) {

      case 'IDLE':
        this.vx = 0; this.vy = 0;
        if (this.isAI) {
          this.name === 'ミリー' ? engine.millieAI(this) : this.logicAI(engine);
        }
        break;

      case 'MANUAL_MOVE':
        this.x += this.manualVx;
        this.x  = Math.max(20, Math.min(780, this.x));
        this.side = this.manualVx > 0 ? 1 : -1;
        if (this.isPlayer && Math.random() < 0.18) {
          engine.effects.push(new GhostEffect(
            this.x, this.y, this.z, this.spriteDef, this.animFrame, this.side));
        }
        break;

      case 'MOVE': {
        if (!this.target || this.target.hp <= 0) { this.state = 'IDLE'; break; }
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);
        this.side = dx > 0 ? 1 : -1;
        if (dist < 42) {
          this.vx = 0; this.vy = 0;
          this.executeAttack(engine);
        } else {
          this.vx = (dx / dist) * 4;
          this.vy = (dy / dist) * 4 * 0.55; // クォータービュー比率
          this.x += this.vx;
          this.y += this.vy;
          if (this.isPlayer && Math.random() < 0.18) {
            engine.effects.push(new GhostEffect(
              this.x, this.y, this.z, this.spriteDef, this.animFrame, this.side));
          }
        }
        break;
      }

      case 'ATTACK':
        if (--this.stateTimer <= 0) {
          this.state     = 'IDLE';
          this.comboStep = 0;
        }
        break;

      case 'CAST_CHANT':
        this.vx = 0; this.vy = 0;
        if (--this.stateTimer <= 0) engine.resolveSpell(this);
        break;

      case 'HIT':
        this.x -= this.side * 1.5;
        if (--this.stateTimer <= 0) this.state = 'IDLE';
        break;

      case 'VICTORY':
        this.vx = 0; this.vy = 0;
        // ループ再生のみ、他の処理なし
        break;
    }

    this._advanceAnim();
  }

  // ── AI ────────────────────────────────────────────────────────

  logicAI(engine) {
    let closest = null, minDist = 9999;
    for (const e of engine.entities) {
      if (this.isPlayer !== e.isPlayer && e.name !== 'ミリー' && e.hp > 0) {
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < minDist) { minDist = d; closest = e; }
      }
    }
    if (closest) { this.target = closest; this.state = 'MOVE'; }
  }

  // ── 戦闘 ──────────────────────────────────────────────────────

  executeAttack(engine) {
    this.state     = 'ATTACK';
    this.stateTimer = 25;
    this.comboStep++;

    // 3段目はジャンプ攻撃（Z軸使用）
    if (this.comboStep === 3) { this.vz = 6; this.z = 1; }

    // 必殺技が予約されていれば通常コンボより優先
    if (this.queuedArt === 'short') {
      const art = RATIX_ARTS.short;
      this.stateTimer = 32;
      if (this.target) {
        const dmg = Math.floor(Math.random() * (art.dmg[1] - art.dmg[0])) + art.dmg[0];
        this.target.takeDamage(dmg, engine, this.side);
        engine.effects.push(new SlashEffect(this.target.x, this.target.y - this.target.z - 20, 4));
        engine.effects.push(new TextEffect(this.x, this.y - this.z - 55, art.name, '#ff66ff'));
      }
      this.queuedArt = null;
      this.comboStep = 0;
      return;
    }

    if (this.target && Math.abs(this.target.y - this.y) < 32) {
      let dmg = Math.floor(Math.random() * 40) + 60 * this.comboStep;

      // GUTS：クリティカル率
      const isCrit = Math.random() * 100 < this.guts / 2;
      if (isCrit) {
        dmg = Math.floor(dmg * 1.5);
        engine.effects.push(new TextEffect(this.x, this.y - this.z - 55, 'CRITICAL!', '#ffdd00'));
      }

      this.target.takeDamage(dmg, engine, this.side);
      engine.effects.push(new SlashEffect(
        this.target.x, this.target.y - this.target.z - 20, this.comboStep));
    }
  }

  takeDamage(dmg, engine, attackerSide) {
    if (this.invincibleTimer > 0) return;

    dmg = Math.floor(dmg * (this.takenDamageMultiplier || 1));

    // GUTS：スーパーアーマー判定
    this.isSuperArmor = Math.random() * 100 < this.guts / 2;

    // GUTS：くいしばり（即死回避）
    if (this.hp <= dmg && this.hp > 1 && Math.random() * 100 < this.guts) {
      dmg = this.hp - 1;
      engine.effects.push(new TextEffect(this.x, this.y - this.z - 45, 'GUTS!', '#ffcc00'));
    }

    this.hp -= dmg;

    if (this.hp <= 0) {
      this.hp    = 0;
      this.state = 'DEAD';
    } else if (!this.isSuperArmor) {
      this.state      = 'HIT';
      this.stateTimer = 15;
      this.side       = -attackerSide;
    }

    engine.effects.push(new TextEffect(
      this.x, this.y - this.z - 28, dmg, this.isSuperArmor ? '#ffffaa' : '#ffffff'));
  }

  // ── 描画 ──────────────────────────────────────────────────────

  drawShadow(ctx) {
    if (this.state === 'DEAD') return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  draw(ctx) {
    if (this.state === 'DEAD') return;

    const def = this.spriteDef;

    // ── スプライトが未読込の場合のフォールバック描画 ──
    if (!def || !spriteCanvas) {
      ctx.fillStyle = this.isPlayer ? '#4488ff'
                    : this.name === 'ミリー' ? '#ff88cc' : '#ff4444';
      ctx.fillRect(this.x - 18, this.y - this.z - 36, 36, 36);
      this._drawHPBar(ctx);
      return;
    }

    const animKey = this.getAnimKey();
    const anim    = def.anims[animKey] || def.anims['IDLE'];
    if (!anim) return;

    const fw  = def.frameW, fh = def.frameH, sc = def.displayScale;
    const dw  = fw * sc,    dh = fh * sc;
    const frame = Math.min(this.animFrame, anim.frames - 1);
    const sx    = def.sectionX + ((anim.colStart || 0) + frame) * fw;
    const sy    = anim.y;

    ctx.save();
    ctx.translate(this.x, this.y - this.z);

    // 無敵時の半透明点滅
    if (this.invincibleTimer > 0 && this.invincibleTimer % 4 > 2) {
      ctx.globalAlpha = 0.25;
    }

    // 左向き反転
    if (this.side === -1) ctx.scale(-1, 1);

    ctx.drawImage(spriteCanvas, sx, sy, fw, fh, def.offsetX, def.offsetY, dw, dh);

    // デバッグ枠（config.js で DEBUG_SPRITES = true 時）
    if (DEBUG_SPRITES) {
      ctx.strokeStyle = 'rgba(255,0,0,0.85)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(def.offsetX, def.offsetY, dw, dh);
      // テキストは反転しないよう scale を一時戻す
      if (this.side === -1) ctx.scale(-1, 1);
      ctx.fillStyle = '#ff0';
      ctx.font      = '8px monospace';
      ctx.fillText(`${this.name}:${animKey}:${frame}`, def.offsetX * (this.side), def.offsetY - 3);
    }

    ctx.restore();
    ctx.globalAlpha = 1.0;

    // スタン表示
    if (this.isStunned) {
      ctx.fillStyle = '#ffff44';
      ctx.font      = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', this.x, this.y - this.z + def.offsetY - 4);
      ctx.textAlign = 'left';
    }

    // 詠唱中の波紋エフェクト
    if (this.state === 'CAST_CHANT') {
      const r = 10 + Math.abs(Math.sin(this.animTimer * 0.15)) * 5;
      ctx.save();
      ctx.strokeStyle = 'rgba(170,50,255,0.75)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y - this.z + def.offsetY / 2, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    this._drawHPBar(ctx);
  }

  _drawHPBar(ctx) {
    const W   = 50, H = 5;
    const bx  = this.x - W / 2;
    const def = this.spriteDef;
    const by  = this.y - this.z + (def ? def.offsetY - 6 : -42);
    const rat = this.hp / this.maxHp;

    ctx.fillStyle = '#222';
    ctx.fillRect(bx, by, W, H);
    ctx.fillStyle = rat > 0.5 ? '#22cc22' : rat > 0.25 ? '#cccc22' : '#cc2222';
    ctx.fillRect(bx, by, W * rat, H);
  }
}
