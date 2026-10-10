import { WEAPONS, type WeaponId } from './weapons.ts'

type Vec = { x: number; y: number }

type Bullet = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  dmg: number
  r: number
  color: string
  pierce: number
  homing: number
  explode: number
  pull: number
  bounce: boolean
  from: WeaponId
  hit: Set<Enemy>
}

type Enemy = {
  x: number
  y: number
  vx: number
  vy: number
  hp: number
  max: number
  r: number
  kind: 'grunt' | 'runner' | 'tank' | 'mage'
  slow: number
  flash: number
}

type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; s: number }
type Floater = { x: number; y: number; life: number; text: string; color: string }
type Mine = { x: number; y: number; life: number; r: number }

const TAU = Math.PI * 2

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}
function len(x: number, y: number) {
  return Math.hypot(x, y) || 1
}
function norm(x: number, y: number): Vec {
  const d = len(x, y)
  return { x: x / d, y: y / d }
}

export class ArenaGame {
  player = { x: 0, y: 0, hp: 100, max: 100, dash: 0, inv: 0, xp: 0, need: 40, level: 1, score: 0, kills: 0 }
  weapon = 0
  wave = 1
  over = false
  paused = false
  pick: null | { title: string; apply: () => void }[] = null
  shake = 0
  hitstop = 0
  combo = 0
  comboT = 0
  fireCd = 0
  orbitA = 0
  keys = new Set<string>()
  mouse = { x: 120, y: 0, down: false }
  bullets: Bullet[] = []
  enemies: Enemy[] = []
  sparks: Spark[] = []
  floats: Floater[] = []
  mines: Mine[] = []
  beamT = 0
  stats = { rate: 1, dmg: 1, spread: 0, magnet: 80 }
  w = 1080
  h = 720
  dpr = 1
  spawnT = 0
  left = 0

  get fieldW() {
    return Math.max(280, this.w)
  }

  get fieldH() {
    return Math.max(280, this.h)
  }

  get weaponId() {
    return WEAPONS[this.weapon]!.id
  }

  start() {
    this.player = { x: 0, y: 0, hp: 100, max: 100, dash: 0, inv: 0, xp: 0, need: 40, level: 1, score: 0, kills: 0 }
    this.weapon = 0
    this.wave = 1
    this.over = false
    this.pick = null
    this.bullets = []
    this.enemies = []
    this.sparks = []
    this.floats = []
    this.mines = []
    this.combo = 0
    this.stats = { rate: 1, dmg: 1, spread: 0, magnet: 80 }
    this.beginWave()
  }

  beginWave() {
    const n = 6 + this.wave * 3
    this.left = n
    this.spawnT = 0.2
    for (let i = 0; i < Math.min(4, n); i++) this.spawnEnemy()
  }

  spawnEnemy() {
    if (this.left <= 0) return
    this.left -= 1
    const a = rand(0, TAU)
    const hw = this.fieldW * 0.46
    const hh = this.fieldH * 0.46
    const roll = Math.random()
    const kind: Enemy['kind'] = this.wave > 4 && roll > 0.82 ? 'mage' : this.wave > 2 && roll > 0.62 ? 'tank' : roll > 0.45 ? 'runner' : 'grunt'
    const hp = kind === 'tank' ? 70 + this.wave * 12 : kind === 'mage' ? 28 + this.wave * 4 : kind === 'runner' ? 16 + this.wave * 3 : 22 + this.wave * 5
    const r = kind === 'tank' ? 18 : kind === 'runner' ? 10 : 13
    this.enemies.push({
      x: Math.cos(a) * hw,
      y: Math.sin(a) * hh,
      vx: 0,
      vy: 0,
      hp,
      max: hp,
      r,
      kind,
      slow: 0,
      flash: 0,
    })
  }

  aim(): Vec {
    return norm(this.mouse.x - this.player.x, this.mouse.y - this.player.y)
  }

  burst(x: number, y: number, n: number, color: string, speed = 220) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU)
      const s = rand(speed * 0.3, speed)
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.18, 0.45), max: 0.45, color, s: rand(1.5, 4) })
    }
  }

  boom(x: number, y: number, r: number, dmg: number, color: string) {
    this.shake = Math.max(this.shake, 10)
    this.hitstop = Math.max(this.hitstop, 0.045)
    this.burst(x, y, 22, color, 320)
    for (const e of this.enemies) {
      if (len(e.x - x, e.y - y) < r + e.r) this.hurt(e, dmg, x, y)
    }
  }

  hurt(e: Enemy, raw: number, fromX: number, fromY: number) {
    const dmg = Math.round(raw * this.stats.dmg)
    e.hp -= dmg
    e.flash = 0.08
    const k = norm(e.x - fromX, e.y - fromY)
    e.vx += k.x * 180
    e.vy += k.y * 180
    this.floats.push({ x: e.x, y: e.y - 10, life: 0.55, text: String(dmg), color: '#fff7ed' })
    this.combo += 1
    this.comboT = 1.4
    if (e.hp <= 0) this.kill(e)
  }

  kill(e: Enemy) {
    e.hp = 0
    this.player.kills += 1
    this.player.score += 10 + this.combo
    this.player.xp += e.kind === 'tank' ? 14 : 8
    this.burst(e.x, e.y, 16, '#fb7185', 280)
    this.shake = Math.max(this.shake, 6)
    if (this.player.xp >= this.player.need) {
      this.player.xp = 0
      this.player.need = Math.round(this.player.need * 1.25)
      this.player.level += 1
      this.offer()
    }
  }

  offer() {
    const pool = [
      { title: '射速 +18%', apply: () => { this.stats.rate *= 1.18 } },
      { title: '伤害 +16%', apply: () => { this.stats.dmg *= 1.16 } },
      { title: '弹道更散更密', apply: () => { this.stats.spread += 1 } },
      { title: '吸血场 +', apply: () => { this.stats.magnet += 24; this.player.max += 12; this.player.hp = Math.min(this.player.max, this.player.hp + 24) } },
      { title: '满血冲刺', apply: () => { this.player.hp = this.player.max; this.player.dash = 0 } },
    ]
    const out = [...pool].sort(() => Math.random() - 0.5).slice(0, 3)
    this.pick = out
    this.paused = true
  }

  fire(dt: number) {
    const id = this.weaponId
    const dir = this.aim()
    const p = this.player
    this.orbitA += dt * 4.2
    if (id === 'orbit') {
      const n = 3 + this.stats.spread
      for (let i = 0; i < n; i++) {
        const a = this.orbitA + (i * TAU) / n
        const x = p.x + Math.cos(a) * 52
        const y = p.y + Math.sin(a) * 52
        for (const e of this.enemies) {
          if (len(e.x - x, e.y - y) < e.r + 10) this.hurt(e, 18 * dt * 8, x, y)
        }
      }
    }
    this.fireCd -= dt
    const holding = this.mouse.down || this.keys.has(' ')
    if (id === 'beam') {
      this.beamT = holding ? Math.min(1, this.beamT + dt * 3) : Math.max(0, this.beamT - dt * 4)
      if (holding) {
        const reach = 520
        const hx = p.x + dir.x * reach
        const hy = p.y + dir.y * reach
        for (const e of this.enemies) {
          const t = clamp(((e.x - p.x) * dir.x + (e.y - p.y) * dir.y) / reach, 0, 1)
          const cx = p.x + dir.x * t * reach
          const cy = p.y + dir.y * t * reach
          if (len(e.x - cx, e.y - cy) < e.r + 8) this.hurt(e, 55 * dt, p.x, p.y)
        }
        this.sparks.push({ x: hx, y: hy, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.08, max: 0.08, color: '#fb7185', s: 2 })
      }
      return
    }
    if (id === 'breath' && holding && this.fireCd <= 0) {
      this.fireCd = 0.05 / this.stats.rate
      const a0 = Math.atan2(dir.y, dir.x)
      for (let i = 0; i < 3; i++) {
        const a = a0 + rand(-0.42, 0.42)
        const s = rand(240, 380)
        this.bullets.push(this.shot(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, { dmg: 7, r: 7, life: 0.28, color: '#f43f5e', from: 'breath' }))
      }
      return
    }
    if (!holding || this.fireCd > 0) return
    if (id === 'pulse') {
      this.fireCd = 0.07 / this.stats.rate
      const s = 620
      this.bullets.push(this.shot(p.x, p.y, dir.x * s, dir.y * s, { dmg: 9, r: 4, life: 0.7, color: '#7dd3fc', from: 'pulse' }))
    } else if (id === 'scatter') {
      this.fireCd = 0.38 / this.stats.rate
      const n = 7 + this.stats.spread
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(dir.y, dir.x) + rand(-0.38, 0.38)
        const s = rand(480, 640)
        this.bullets.push(this.shot(p.x, p.y, Math.cos(a) * s, Math.sin(a) * s, { dmg: 8, r: 3.5, life: 0.32, color: '#fbbf24', from: 'scatter' }))
      }
      this.shake = Math.max(this.shake, 4)
    } else if (id === 'seek') {
      this.fireCd = 0.28 / this.stats.rate
      this.bullets.push(this.shot(p.x, p.y, dir.x * 220, dir.y * 220, { dmg: 16, r: 5, life: 1.6, color: '#86efac', from: 'seek', homing: 9 }))
    } else if (id === 'mine') {
      this.fireCd = 0.55 / this.stats.rate
      this.mines.push({ x: p.x, y: p.y, life: 6, r: 16 })
    } else if (id === 'chain') {
      this.fireCd = 0.42 / this.stats.rate
      this.zap(p.x, p.y, 4, 22)
    } else if (id === 'disc') {
      this.fireCd = 0.5 / this.stats.rate
      this.bullets.push(this.shot(p.x, p.y, dir.x * 420, dir.y * 420, { dmg: 14, r: 8, life: 1.35, color: '#a3e635', from: 'disc', bounce: true, pierce: 8 }))
    } else if (id === 'well') {
      this.fireCd = 0.9 / this.stats.rate
      this.bullets.push(this.shot(p.x, p.y, dir.x * 180, dir.y * 180, { dmg: 8, r: 12, life: 0.9, color: '#818cf8', from: 'well', pull: 420, explode: 90 }))
    } else if (id === 'rocket') {
      this.fireCd = 0.55 / this.stats.rate
      this.bullets.push(this.shot(p.x, p.y, dir.x * 500, dir.y * 500, { dmg: 12, r: 6, life: 0.9, color: '#fb923c', from: 'rocket', explode: 78 }))
    } else if (id === 'frost') {
      this.fireCd = 0.16 / this.stats.rate
      this.bullets.push(this.shot(p.x, p.y, dir.x * 560, dir.y * 560, { dmg: 11, r: 5, life: 0.8, color: '#bae6fd', from: 'frost', pierce: 2 }))
    }
  }

  shot(x: number, y: number, vx: number, vy: number, extra: Partial<Bullet> & { dmg: number; r: number; life: number; color: string; from: WeaponId }): Bullet {
    return {
      x,
      y,
      vx,
      vy,
      pierce: 0,
      homing: 0,
      explode: 0,
      pull: 0,
      bounce: false,
      hit: new Set(),
      ...extra,
    }
  }

  zap(x: number, y: number, jumps: number, dmg: number) {
    let cx = x
    let cy = y
    const seen = new Set<Enemy>()
    for (let i = 0; i < jumps; i++) {
      let best: Enemy | null = null
      let bestD = 210
      for (const e of this.enemies) {
        if (seen.has(e) || e.hp <= 0) continue
        const d = len(e.x - cx, e.y - cy)
        if (d < bestD) {
          bestD = d
          best = e
        }
      }
      if (!best) break
      seen.add(best)
      this.hurt(best, dmg, cx, cy)
      this.sparks.push({ x: best.x, y: best.y, vx: 0, vy: 0, life: 0.12, max: 0.12, color: '#67e8f9', s: 5 })
      cx = best.x
      cy = best.y
      dmg *= 0.82
    }
  }

  step(dt: number) {
    if (this.over || this.pick) return
    const p = this.player
    if (this.hitstop > 0) {
      this.hitstop -= dt
      dt *= 0.15
    }
    let mx = 0
    let my = 0
    if (this.keys.has('w') || this.keys.has('arrowup')) my -= 1
    if (this.keys.has('s') || this.keys.has('arrowdown')) my += 1
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1
    const moving = len(mx, my)
    const dash = this.keys.has('shift') && p.dash <= 0
    if (dash) {
      p.dash = 0.85
      p.inv = 0.18
      const d = moving ? norm(mx, my) : this.aim()
      p.x += d.x * 118
      p.y += d.y * 118
      this.burst(p.x, p.y, 10, '#e0f2fe', 200)
    }
    p.dash = Math.max(0, p.dash - dt)
    p.inv = Math.max(0, p.inv - dt)
    const speed = 235
    if (moving) {
      const d = norm(mx, my)
      p.x += d.x * speed * dt
      p.y += d.y * speed * dt
    }
    p.x = clamp(p.x, -this.fieldW / 2 + 24, this.fieldW / 2 - 24)
    p.y = clamp(p.y, -this.fieldH / 2 + 24, this.fieldH / 2 - 24)

    this.spawnT -= dt
    if (this.spawnT <= 0 && this.left > 0) {
      this.spawnT = Math.max(0.12, 0.55 - this.wave * 0.03)
      this.spawnEnemy()
    }

    this.fire(dt)
    this.comboT -= dt
    if (this.comboT <= 0) this.combo = 0
    this.shake *= 0.88

    for (const m of this.mines) {
      m.life -= dt
      for (const e of this.enemies) {
        if (len(e.x - m.x, e.y - m.y) < e.r + m.r) {
          m.life = 0
          this.boom(m.x, m.y, 70, 34, '#f97316')
        }
      }
    }
    this.mines = this.mines.filter((m) => m.life > 0)

    for (const b of this.bullets) {
      if (b.homing) {
        let best: Enemy | null = null
        let bestD = 9999
        for (const e of this.enemies) {
          const d = len(e.x - b.x, e.y - b.y)
          if (d < bestD) {
            bestD = d
            best = e
          }
        }
        if (best) {
          const d = norm(best.x - b.x, best.y - b.y)
          b.vx += d.x * b.homing * 80 * dt
          b.vy += d.y * b.homing * 80 * dt
          const sp = len(b.vx, b.vy)
          const cap = 420
          if (sp > cap) {
            b.vx = (b.vx / sp) * cap
            b.vy = (b.vy / sp) * cap
          }
        }
      }
      if (b.bounce) {
        const to = norm(p.x - b.x, p.y - b.y)
        b.vx += to.x * 520 * dt
        b.vy += to.y * 520 * dt
      }
      if (b.pull) {
        for (const e of this.enemies) {
          const d = len(e.x - b.x, e.y - b.y)
          if (d < 130) {
            e.vx += ((b.x - e.x) / d) * b.pull * dt
            e.vy += ((b.y - e.y) / d) * b.pull * dt
          }
        }
      }
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.life -= dt
      for (const e of this.enemies) {
        if (e.hp <= 0 || b.hit.has(e)) continue
        if (len(e.x - b.x, e.y - b.y) < e.r + b.r) {
          b.hit.add(e)
          this.hurt(e, b.dmg, b.x, b.y)
          if (b.from === 'frost') e.slow = Math.max(e.slow, 0.7)
          if (b.explode) {
            b.life = 0
            this.boom(b.x, b.y, b.explode, b.dmg * 1.4, b.color)
          }
          if (b.pierce <= 0 && !b.bounce) b.life = 0
          else b.pierce -= 1
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0)

    for (const e of this.enemies) {
      if (e.hp <= 0) continue
      e.slow = Math.max(0, e.slow - dt)
      e.flash = Math.max(0, e.flash - dt)
      const d = norm(p.x - e.x, p.y - e.y)
      const spd = (e.kind === 'runner' ? 175 : e.kind === 'tank' ? 78 : e.kind === 'mage' ? 90 : 115) * (e.slow ? 0.45 : 1)
      e.vx += d.x * spd * dt * 3.2
      e.vy += d.y * spd * dt * 3.2
      e.vx *= 0.86
      e.vy *= 0.86
      e.x += e.vx * dt
      e.y += e.vy * dt
      if (e.kind === 'mage' && Math.random() < dt * 0.7) {
        const shot = norm(p.x - e.x, p.y - e.y)
        this.bullets.push(this.shot(e.x, e.y, shot.x * 160, shot.y * 160, { dmg: 8, r: 5, life: 2, color: '#e879f9', from: 'pulse', pierce: 0 }))
      }
      if (p.inv <= 0 && len(e.x - p.x, e.y - p.y) < e.r + 12) {
        p.hp -= e.kind === 'tank' ? 14 : 8
        p.inv = 0.35
        this.shake = 12
        const k = norm(p.x - e.x, p.y - e.y)
        p.x += k.x * 28
        p.y += k.y * 28
        if (p.hp <= 0) {
          p.hp = 0
          this.over = true
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0)
    if (this.enemies.length === 0 && this.left <= 0 && !this.over) {
      this.wave += 1
      this.player.hp = Math.min(this.player.max, this.player.hp + 18)
      this.beginWave()
    }

    for (const s of this.sparks) {
      s.life -= dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.vx *= 0.92
      s.vy *= 0.92
    }
    this.sparks = this.sparks.filter((s) => s.life > 0)
    for (const f of this.floats) {
      f.life -= dt
      f.y -= 28 * dt
    }
    this.floats = this.floats.filter((f) => f.life > 0)
  }

  space(ctx: CanvasRenderingContext2D) {
    const canvas = ctx.canvas
    const cssW = canvas?.clientWidth || this.w
    const bitmapW = canvas?.width || 0
    if (cssW > 0 && bitmapW > 0) this.dpr = bitmapW / cssW
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  draw(ctx: CanvasRenderingContext2D) {
    const w = this.fieldW
    const h = this.fieldH
    this.space(ctx)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#07080c'
    ctx.fillRect(0, 0, w, h)
    const camX = w / 2 + (Math.random() - 0.5) * this.shake
    const camY = h / 2 + (Math.random() - 0.5) * this.shake
    ctx.translate(camX, camY)

    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    const left = -w / 2
    const top = -h / 2
    for (let x = left; x <= w / 2; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, h / 2)
      ctx.stroke()
    }
    for (let y = top; y <= h / 2; y += 40) {
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(w / 2, y)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(239,238,236,0.18)'
    ctx.lineWidth = 3
    ctx.strokeRect(left, top, w, h)

    for (const m of this.mines) {
      ctx.fillStyle = 'rgba(249,115,22,0.25)'
      ctx.beginPath()
      ctx.arc(m.x, m.y, m.r + 8, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#fb923c'
      ctx.beginPath()
      ctx.arc(m.x, m.y, 6, 0, TAU)
      ctx.fill()
    }
    for (const b of this.bullets) {
      ctx.fillStyle = b.color
      ctx.shadowColor = b.color
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, TAU)
      ctx.fill()
      ctx.shadowBlur = 0
    }
    if (this.weaponId === 'beam' && this.beamT > 0) {
      const dir = this.aim()
      ctx.strokeStyle = `rgba(251,113,133,${0.35 + this.beamT * 0.5})`
      ctx.lineWidth = 3 + this.beamT * 5
      ctx.beginPath()
      ctx.moveTo(this.player.x, this.player.y)
      ctx.lineTo(this.player.x + dir.x * 520, this.player.y + dir.y * 520)
      ctx.stroke()
    }
    if (this.weaponId === 'orbit') {
      const n = 3 + this.stats.spread
      ctx.fillStyle = '#c4b5fd'
      for (let i = 0; i < n; i++) {
        const a = this.orbitA + (i * TAU) / n
        ctx.beginPath()
        ctx.arc(this.player.x + Math.cos(a) * 52, this.player.y + Math.sin(a) * 52, 7, 0, TAU)
        ctx.fill()
      }
    }
    for (const e of this.enemies) {
      const col = e.flash > 0 ? '#fff' : e.kind === 'tank' ? '#fb7185' : e.kind === 'runner' ? '#fbbf24' : e.kind === 'mage' ? '#e879f9' : '#94a3b8'
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(e.x, e.y, e.r, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(e.x - e.r, e.y - e.r - 7, e.r * 2, 3)
      ctx.fillStyle = '#4ade80'
      ctx.fillRect(e.x - e.r, e.y - e.r - 7, e.r * 2 * (e.hp / e.max), 3)
    }
    for (const s of this.sparks) {
      ctx.globalAlpha = s.life / s.max
      ctx.fillStyle = s.color
      ctx.fillRect(s.x, s.y, s.s, s.s)
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = this.player.inv > 0 ? 'rgba(224,242,254,0.85)' : '#efeeec'
    ctx.beginPath()
    ctx.arc(this.player.x, this.player.y, 12, 0, TAU)
    ctx.fill()
    const aim = this.aim()
    ctx.strokeStyle = WEAPONS[this.weapon]!.color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(this.player.x + aim.x * 16, this.player.y + aim.y * 16)
    ctx.lineTo(this.player.x + aim.x * 28, this.player.y + aim.y * 28)
    ctx.stroke()
    for (const f of this.floats) {
      ctx.globalAlpha = f.life / 0.55
      ctx.fillStyle = f.color
      ctx.font = '700 12px ui-sans-serif, system-ui'
      ctx.fillText(f.text, f.x, f.y)
      ctx.globalAlpha = 1
    }

    this.space(ctx)
    this.hud(ctx)
  }

  hud(ctx: CanvasRenderingContext2D) {
    const p = this.player
    ctx.fillStyle = 'rgba(7,8,12,0.55)'
    ctx.fillRect(12, 12, 260, 72)
    ctx.fillStyle = '#efeeec'
    ctx.font = '700 13px ui-sans-serif, system-ui'
    ctx.fillText(`W${this.wave}  Lv${p.level}  ${p.kills} 杀`, 22, 32)
    ctx.fillStyle = '#334155'
    ctx.fillRect(22, 42, 232, 8)
    ctx.fillStyle = '#fb7185'
    ctx.fillRect(22, 42, 232 * (p.hp / p.max), 8)
    ctx.fillStyle = '#334155'
    ctx.fillRect(22, 56, 232, 6)
    ctx.fillStyle = '#38bdf8'
    ctx.fillRect(22, 56, 232 * (p.xp / p.need), 6)
    if (this.combo > 2) {
      ctx.fillStyle = '#fbbf24'
      ctx.font = '800 18px ui-sans-serif'
      ctx.fillText(`${this.combo} COMBO`, 22, 100)
    }
    const wpn = WEAPONS[this.weapon]!
    ctx.fillStyle = wpn.color
    ctx.font = '800 16px ui-sans-serif'
    ctx.fillText(`${this.weapon + 1}  ${wpn.name}`, 12, this.h - 28)
    ctx.fillStyle = 'rgba(239,238,236,0.55)'
    ctx.font = '600 11px ui-sans-serif'
    ctx.fillText(`${wpn.hint}   WASD 移动 · 鼠标开火 · Shift 冲刺 · 1-0 换枪`, 12, this.h - 12)

    if (this.pick) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(0, 0, this.w, this.h)
      ctx.fillStyle = '#efeeec'
      ctx.font = '800 22px ui-sans-serif'
      ctx.fillText('升级 — 点一项', this.w / 2 - 70, this.h / 2 - 70)
      this.pick.forEach((item, i) => {
        ctx.fillStyle = '#1e293b'
        ctx.fillRect(this.w / 2 - 140, this.h / 2 - 48 + i * 52, 280, 44)
        ctx.fillStyle = '#efeeec'
        ctx.font = '700 15px ui-sans-serif'
        ctx.fillText(`${i + 1}.  ${item.title}`, this.w / 2 - 124, this.h / 2 - 20 + i * 52)
      })
    }
    if (this.over) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, 0, this.w, this.h)
      ctx.fillStyle = '#fb7185'
      ctx.font = '800 36px ui-sans-serif'
      ctx.fillText('你死了', this.w / 2 - 54, this.h / 2)
      ctx.fillStyle = '#efeeec'
      ctx.font = '600 14px ui-sans-serif'
      ctx.fillText(`波次 ${this.wave} · ${p.kills} 杀 · R 重开`, this.w / 2 - 90, this.h / 2 + 28)
    }
  }

  clickPick(nx: number, ny: number) {
    if (!this.pick) return
    const { w, h } = this
    for (let i = 0; i < this.pick.length; i++) {
      const x = w / 2 - 140
      const y = h / 2 - 48 + i * 52
      if (nx >= x && nx <= x + 280 && ny >= y && ny <= y + 44) {
        this.pick[i]!.apply()
        this.pick = null
        this.paused = false
      }
    }
  }
}
