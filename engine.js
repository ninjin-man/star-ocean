'use strict';
// ================================================================
// engine.js  ─  EngineManager（ゲームメカニクス統括）
// ================================================================

class EngineManager {
  constructor() {
    this.entities = [];
    this.player   = null;   // 操作対象プレイヤーを固定参照
    this.effects  = [];

    this.comboBufferTimer   = 0;
    this.isTimeStopped      = false;
    this.magicCircleRadius  = 0;
    this.spellLabel         = '';
    this.stopFramesLeft     = 0;
    this._onStopDone        = null;

    this.victoryShown = false;
  }

  // ── メインアップデート ────────────────────────────────────────

  update() {
    if (this.comboBufferTimer > 0) this.comboBufferTimer--;

    // エフェクトはタイムストップの影響を受けない
    this.effects.forEach(fx => fx.update());
    this.effects = this.effects.filter(fx => !fx.isFinished);

    if (!this.isTimeStopped) {
      this.entities.forEach(ent => ent.update(this));
      this._checkVictory();
    } else {
      // タイムストップ中：魔法陣の拡張のみ
      this.magicCircleRadius += 14;
      if (--this.stopFramesLeft <= 0) {
        this.isTimeStopped = false;
        const cb = this._onStopDone;
        this._onStopDone = null;
        if (cb) cb();
      }
    }
  }

  _checkVictory() {
    if (this.victoryShown) return;
    const allDead = this.entities.every(
      e => e.isPlayer || e.name === 'ミリー' || e.hp <= 0
    );
    if (allDead) {
      this.victoryShown = true;
      this.entities.forEach(e => {
        if (e.hp > 0 && e.spriteDef && e.spriteDef.anims['VICTORY']) {
          e.state = 'VICTORY';
        }
      });
      const log = document.getElementById('log');
      if (log) log.innerText = '⚔ BATTLE WON ⚔';
    }
  }

  // ── 描画 ──────────────────────────────────────────────────────

  draw(canvas, ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Yソート（奥行き表現）、非破壊でソート
    const sorted = [...this.entities].sort((a, b) => a.y - b.y);
    sorted.forEach(e => e.drawShadow(ctx));
    sorted.forEach(e => e.draw(ctx));
    this.effects.forEach(fx => fx.draw(ctx));

    // 紋章術タイムストップ演出
    if (this.isTimeStopped) {
      ctx.save();

      // 薄い紫オーバーレイ
      ctx.fillStyle = 'rgba(100,0,200,0.14)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 魔法陣拡大円
      ctx.strokeStyle = 'rgba(170,50,255,0.65)';
      ctx.lineWidth   = 4;
      ctx.beginPath();
      ctx.arc(150, 200, this.magicCircleRadius, 0, Math.PI * 2);
      ctx.stroke();

      // 呪文名テキスト
      ctx.font      = "italic bold 24px 'Georgia'";
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#aa33ff';
      ctx.shadowBlur  = 12;
      ctx.fillText(`紋章術: ${this.spellLabel}`, canvas.width / 2 - 120, 185);
      ctx.restore();
    }
  }

  // ── 紋章術システム ────────────────────────────────────────────

  /** 詠唱を開始する（プレイヤーのボタン操作 or ミリーAI両方から呼ばれる） */
  castMillieSpell(caster, spell, forcedTarget) {
    if (!caster || caster.hp <= 0) return;
    if (caster.state === 'CAST_CHANT') return;
    if (caster.mp < spell.mp) {
      const log = document.getElementById('log');
      if (log) log.innerText = 'MP不足！';
      return;
    }
    caster.mp -= spell.mp;
    caster.pendingSpell  = spell;
    caster.pendingTarget = forcedTarget || null;
    caster.state         = 'CAST_CHANT';
    caster.stateTimer    = Math.max(1, Math.round(spell.cast * 60));

    const log = document.getElementById('log');
    if (log) log.innerText = `ミリーの詠唱: ${spell.name}...`;
  }

  /** 詠唱完了 → 発動（stop秒数 > 0 なら画面停止） */
  resolveSpell(caster) {
    const spell   = caster.pendingSpell;
    const engine  = this;
    const doEffect = () => {
      engine.applySpellEffect(caster, spell);
      caster.pendingSpell = null;
      caster.state = 'IDLE';
    };
    if (spell.stop > 0) {
      this.isTimeStopped     = true;
      this.magicCircleRadius = 0;
      this.spellLabel        = spell.name;
      this.stopFramesLeft    = Math.round(spell.stop * 60);
      this._onStopDone       = doEffect;
      const log = document.getElementById('log');
      if (log) log.innerText = `${spell.name} 発動！`;
    } else {
      doEffect();
      const log = document.getElementById('log');
      if (log) log.innerText = `${spell.name}！`;
    }
  }

  /** 紋章術の効果適用 */
  applySpellEffect(caster, spell) {
    switch (spell.type) {
      case 'healSingle': {
        const t = caster.pendingTarget || this.player;
        if (t && t.hp > 0) {
          t.hp = Math.min(t.maxHp, t.hp + spell.amount);
          this.effects.push(new TextEffect(t.x, t.y - t.z - 30, `+${spell.amount}`, '#66ff99'));
        }
        break;
      }
      case 'healAll':
        this.entities.forEach(e => {
          if ((e.isPlayer || e.name === 'ミリー') && e.hp > 0) {
            e.hp = Math.min(e.maxHp, e.hp + spell.amount);
            this.effects.push(new TextEffect(e.x, e.y - e.z - 30, `+${spell.amount}`, '#66ff99'));
          }
        });
        break;
      case 'debuffDef':
        this.entities.forEach(e => {
          if (!e.isPlayer && e.name !== 'ミリー' && e.hp > 0) {
            e.takenDamageMultiplier = spell.mult;
            e.debuffTimer           = spell.duration * 60;
            this.effects.push(new TextEffect(e.x, e.y - e.z - 30, 'DEF DOWN', '#cc66ff'));
          }
        });
        break;
      case 'stunAll':
        this.entities.forEach(e => {
          if (!e.isPlayer && e.name !== 'ミリー' && e.hp > 0) {
            e.isStunned  = true;
            e.stunTimer  = spell.duration * 60;
            this.effects.push(new TextEffect(e.x, e.y - e.z - 30, 'STUN', '#ffff66'));
          }
        });
        break;
    }
  }

  // ── ミリーAI ──────────────────────────────────────────────────
  // 原作の「戦略設定」を簡易再現
  // HP50%以下のプレイヤーを自動ヒール、それ以外は後方追従

  millieAI(millie) {
    if (millie.pendingSpell || millie.state === 'CAST_CHANT') return;
    const pl = this.player;
    if (!pl || pl.hp <= 0) return;

    if (pl.hp < pl.maxHp * 0.5 && millie.mp >= MILLIE_SPELLS.heal.mp) {
      this.castMillieSpell(millie, MILLIE_SPELLS.heal, pl);
      return;
    }

    // プレイヤーの斜め後ろへ追従
    const tx   = pl.x - 45 * pl.side;
    const ty   = pl.y + 15;
    const dx   = tx - millie.x;
    const dy   = ty - millie.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 20) {
      const spd = 2.5;
      millie.x += (dx / dist) * spd;
      millie.y += (dy / dist) * spd * 0.55;
      millie.side = dx > 0 ? 1 : -1;
    }
  }
}
