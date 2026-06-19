'use strict';
// ================================================================
// character.js  ─  BattleCharacter クラス
// draw() は config.js の frames:[{sx,sy,sw,sh},...] 形式を参照
// ================================================================

class BattleCharacter {
  constructor(x, y, isPlayer, isAI, name, hp, mp, guts, side) {
    this.x = x; this.y = y; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.isPlayer = isPlayer; this.isAI = isAI;
    this.name = name; this.side = side;
    this.maxHp = hp; this.hp = hp;
    this.maxMp = mp; this.mp = mp;
    this.guts  = guts;
    this.state     = 'IDLE';
    this._prevState = null;
    this.stateTimer = 0;
    this.target     = null;
    this.animFrame  = 0;
    this.animTimer  = 0;
    this.comboStep       = 0;
    this.invincibleTimer = 0;
    this.isSuperArmor    = false;
    this.queuedArt       = null;
    this.pendingSpell    = null;
    this.pendingTarget   = null;
    this.takenDamageMultiplier = 1;
    this.debuffTimer = 0;
    this.isStunned   = false;
    this.stunTimer   = 0;
    this.manualVx    = 0;
    this.manualVy    = 0;

    const key = CHAR_SPRITE_KEY[name];
    this.spriteDef = key ? SPRITE_DEFS[key] : null;
  }

  // ── アニメーション ────────────────────────────────────────────

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

  _advanceAnim() {
    const def = this.spriteDef;
    if (!def) return;
    const anim = def.anims[this.getAnimKey()];
    if (!anim) return;
    if (++this.animTimer >= anim.speed) {
      this.animTimer = 0;
      if (anim.loop === false) {
        this.animFrame = Math.min(this.animFrame + 1, anim.frames.length - 1);
      } else {
        this.animFrame = (this.animFrame + 1) % anim.frames.length;
      }
    }
  }

  // ── メインアップデート（FSM）─────────────────────────────────

  update(engine) {
    if (this.state !== this._prevState) {
      this.animFrame  = 0;
      this.animTimer  = 0;
      this._prevState = this.state;
    }
    if (this.hp <= 0) { this.state = 'DEAD'; return; }

    if (this.debuffTimer > 0 && --this.debuffTimer <= 0) {
      this.takenDamageMultiplier = 1;
    }
    if (this.isStunned) {
      if (--this.stunTimer <= 0) this.isStunned = false;
      if (this.invincibleTimer > 0) this.invincibleTimer--;
      this._advanceAnim();
      return;
    }
    if (this.invincibleTimer > 0) this.invincibleTimer--;

    if (this.z > 0 || this.vz !== 0) {
      this.vz -= 0.6;
      this.z  += this.vz;
      if (this.z <= 0) { this.z = 0; this.vz = 0; }
    }

    switch (this.state) {
      case 'IDLE':
        this.vx = 0; this.vy = 0;
        if (this.isAI) {
          this.name === 'ミリー' ? engine.millieAI(this) : this.logicAI(engine);
        }
        break;

      case 'MANUAL_MOVE': {
        const dirX = this.manualVx, dirY = this.manualVy;
        if (dirX !== 0 || dirY !== 0) {
          // 斜め移動でも速度が一定になるよう正規化
          const mag   = Math.hypot(dirX, dirY) || 1;
          const speed = 4;
          this.x += (dirX / mag) * speed;
          this.y += (dirY / mag) * speed * 0.55; // クォータービュー比率（MOVEと同じ）
          this.x  = Math.max(20, Math.min(780, this.x));
          this.y  = Math.max(100, Math.min(380, this.y));
          if (dirX !== 0) this.side = dirX > 0 ? 1 : -1;
        }
        if (this.isPlayer && Math.random() < 0.18) {
          engine.effects.push(new GhostEffect(
            this.x, this.y, this.z, this.spriteDef, this.animFrame, this.side));
        }
        break;
      }

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
          this.vy = (dy / dist) * 4 * 0.55;
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
        if (--this.stateTimer <= 0) { this.state = 'IDLE'; this.comboStep = 0; }
        break;

      case 'CAST_CHANT':
        this.vx = 0; this.vy = 0;
        if (--this.stateTimer <= 0) engine.resolveSpell(this);
        break;

      case 'HIT':
        this.x -= this.side * 1.5;
        if (--this.stateTimer <= 0) this.state = 'IDLE';
        break;

      case 'DEAD':
        // 静止（アニメは _advanceAnim で最終コマ固定）
        break;

      case 'VICTORY':
        this.vx = 0; this.vy = 0;
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
    if (this.comboStep === 3) { this.vz = 6; this.z = 1; }

    if (this.queuedArt === 'short') {
      const art = RATIX_ARTS.short;
      this.stateTimer = 32;
      if (this.target) {
        const dmg = Math.floor(Math.random() * (art.dmg[1] - art.dmg[0])) + art.dmg[0];
        this.target.takeDamage(dmg, engine, this.side);
        engine.effects.push(new SlashEffect(this.target.x, this.target.y - this.target.z - 20, 4));
        engine.effects.push(new TextEffect(this.x, this.y - this.z - 55, art.name, '#ff66ff'));
      }
      this.queuedArt = null; this.comboStep = 0;
      return;
    }

    if (this.target && Math.abs(this.target.y - this.y) < 32) {
      let dmg = Math.floor(Math.random() * 40) + 60 * this.comboStep;
      const isCrit = Math.random() * 100 < this.guts / 2;
      if (isCrit) {
        dmg = Math.floor(dmg * 1.5);
        engine.effects.push(new TextEffect(this.x, this.y - this.z - 55, 'CRITICAL!', '#ffdd00'));
      }
      this.target.takeDamage(dmg, engine, this.side);
      engine.effects.push(new SlashEffect(this.target.x, this.target.y - this.target.z - 20, this.comboStep));
    }
  }

  takeDamage(dmg, engine, attackerSide) {
    if (this.invincibleTimer > 0) return;
    dmg = Math.floor(dmg * (this.takenDamageMultiplier || 1));
    this.isSuperArmor = Math.random() * 100 < this.guts / 2;
    if (this.hp <= dmg && this.hp > 1 && Math.random() * 100 < this.guts) {
      dmg = this.hp - 1;
      engine.effects.push(new TextEffect(this.x, this.y - this.z - 45, 'GUTS!', '#ffcc00'));
    }
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.hp = 0; this.state = 'DEAD';
    } else if (!this.isSuperArmor) {
      this.state = 'HIT'; this.stateTimer = 15; this.side = -attackerSide;
    }
    this.invincibleTimer = 20;
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
    const def = this.spriteDef;

    // スプライト未ロード時のフォールバック
    if (!def || !spriteCanvas) {
      if (this.state === 'DEAD') return;
      ctx.fillStyle = this.isPlayer ? '#4488ff'
                    : this.name === 'ミリー' ? '#ff88cc' : '#ff4444';
      ctx.fillRect(this.x - 18, this.y - this.z - 36, 36, 36);
      this._drawHPBar(ctx, 36, 36);
      return;
    }

    // DEAD：最終コマを半透明で表示
    if (this.state === 'DEAD') {
      const anim = def.anims['DEAD'] || def.anims['HIT'];
      if (!anim) return;
      const fd = anim.frames[0];
      const sc = def.displayScale;
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.translate(this.x, this.y - this.z);
      if (this.side === -1) ctx.scale(-1, 1);
      ctx.drawImage(spriteCanvas, fd.sx, fd.sy, fd.sw, fd.sh,
        -fd.sw * sc / 2, -fd.sh * sc, fd.sw * sc, fd.sh * sc);
      ctx.restore();
      ctx.globalAlpha = 1.0;
      return;
    }

    const animKey  = this.getAnimKey();
    const anim     = def.anims[animKey] || def.anims['IDLE'];
    if (!anim) return;

    const frameIdx = Math.min(this.animFrame, anim.frames.length - 1);
    const fd       = anim.frames[frameIdx];
    const sc       = def.displayScale;
    const dw       = fd.sw * sc;
    const dh       = fd.sh * sc;

    ctx.save();
    ctx.translate(this.x, this.y - this.z);

    // 無敵点滅
    if (this.invincibleTimer > 0 && this.invincibleTimer % 4 > 2) {
      ctx.globalAlpha = 0.25;
    }
    // 左向き反転
    if (this.side === -1) ctx.scale(-1, 1);

    // ★ 描画：水平中央 / 底面がキャラY座標
    ctx.drawImage(spriteCanvas, fd.sx, fd.sy, fd.sw, fd.sh,
      -dw / 2, -dh, dw, dh);

    // デバッグ枠（DEBUG_SPRITES = true 時）
    if (DEBUG_SPRITES) {
      ctx.strokeStyle = 'rgba(255,0,0,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-dw / 2, -dh, dw, dh);
      if (this.side === -1) ctx.scale(-1, 1); // テキストは反転解除
      ctx.fillStyle = '#ff0';
      ctx.font = '9px monospace';
      ctx.fillText(`${this.name}:${animKey}:${frameIdx} [${fd.sx},${fd.sy},${fd.sw}x${fd.sh}]`,
        -dw / 2 * (this.side), -dh - 4);
    }

    ctx.restore();
    ctx.globalAlpha = 1.0;

    // スタン表示
    if (this.isStunned) {
      ctx.fillStyle = '#ffff44';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', this.x, this.y - this.z - dh - 4);
      ctx.textAlign = 'left';
    }

    // 詠唱エフェクト
    if (this.state === 'CAST_CHANT') {
      const r = 12 + Math.abs(Math.sin(this.animTimer * 0.12)) * 8;
      ctx.save();
      ctx.strokeStyle = 'rgba(170,50,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y - this.z - dh * 0.5, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    this._drawHPBar(ctx, dw, dh);
  }

  _drawHPBar(ctx, dw, dh) {
    const W  = 52, H = 5;
    const bx = this.x - W / 2;
    const by = this.y - this.z - (dh || 140) - 8;
    const rat = this.hp / this.maxHp;
    ctx.fillStyle = '#111';
    ctx.fillRect(bx, by, W, H);
    ctx.fillStyle = rat > 0.5 ? '#22cc22' : rat > 0.25 ? '#cccc22' : '#cc2222';
    ctx.fillRect(bx, by, W * rat, H);
  }
}
