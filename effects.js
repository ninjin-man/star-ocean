'use strict';
// ================================================================
// effects.js  ─  エフェクトクラス群
// GhostEffect は config.js の frames:[{sx,sy,sw,sh},...] 形式を参照
// ================================================================

// 残像エフェクト（ダッシュ中）
class GhostEffect {
  constructor(x, y, z, spriteDef, animFrame, side) {
    this.x = x; this.y = y; this.z = z;
    this.spriteDef = spriteDef;
    this.animFrame = animFrame;
    this.side = side;
    this.alpha = 0.45;
    this.isFinished = false;
  }
  update() {
    this.alpha -= 0.035;
    if (this.alpha <= 0) this.isFinished = true;
  }
  draw(ctx) {
    if (!spriteCanvas || !this.spriteDef) return;
    const anim = this.spriteDef.anims['MOVE'] || this.spriteDef.anims['IDLE'];
    if (!anim) return;
    const fd = anim.frames[this.animFrame % anim.frames.length];
    const sc = this.spriteDef.displayScale;
    const dw = fd.sw * sc, dh = fd.sh * sc;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.x, this.y - this.z);
    if (this.side === -1) ctx.scale(-1, 1);
    ctx.drawImage(spriteCanvas, fd.sx, fd.sy, fd.sw, fd.sh, -dw / 2, -dh, dw, dh);
    // 青トーンオーバーレイ（SFC残像再現）
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(51,170,255,0.45)';
    ctx.fillRect(-dw / 2, -dh, dw, dh);
    ctx.restore();
    ctx.globalAlpha = 1.0;
  }
}

// 斬撃エフェクト
class SlashEffect {
  constructor(x, y, step) {
    this.x = x; this.y = y; this.step = step;
    this.timer = 0; this.isFinished = false;
  }
  update() { this.timer++; if (this.timer > 12) this.isFinished = true; }
  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = this.step >= 4 ? '#ff66ff'
                    : this.step === 3  ? '#ffaa33' : '#ffffff';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 1 - this.timer / 12;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.timer * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// 遠距離ビームエフェクト
class BeamEffect {
  constructor(x1, y1, x2, y2) {
    this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
    this.timer = 0; this.isFinished = false;
  }
  update() { this.timer++; if (this.timer > 14) this.isFinished = true; }
  draw(ctx) {
    ctx.save();
    ctx.strokeStyle = `rgba(170,220,255,${1 - this.timer / 14})`;
    ctx.lineWidth = 6;
    ctx.shadowColor = '#88ccff'; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(this.x1, this.y1); ctx.lineTo(this.x2, this.y2);
    ctx.stroke();
    ctx.restore();
  }
}

// ダメージ / テキストポップアップ
class TextEffect {
  constructor(x, y, text, color) {
    this.x = x; this.y = y; this.text = String(text); this.color = color;
    this.timer = 0; this.isFinished = false;
  }
  update() { this.y -= 0.8; this.timer++; if (this.timer > 35) this.isFinished = true; }
  draw(ctx) {
    const a = Math.min(1, (35 - this.timer) / 10);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = "bold 14px 'Courier New'";
    ctx.fillStyle = '#000'; ctx.fillText(this.text, this.x + 1, this.y + 1);
    ctx.fillStyle = this.color; ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}
