class SoundEffects {
    private ctx: AudioContext | null = null;

    private getContext(): AudioContext {
        if (!this.ctx) this.ctx = new AudioContext();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }

    playReveal(): void {
        const ctx = this.getContext();
        const now = ctx.currentTime;

        // Two-note ascending chime
        [880, 1320].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain).connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const start = now + i * 0.12;
            gain.gain.setValueAtTime(0.25, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
            osc.start(start);
            osc.stop(start + 0.5);
        });
    }

    playTick(): void {
        const ctx = this.getContext();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain).connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
    }

    playUrgentTick(): void {
        const ctx = this.getContext();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain).connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playBuzzer(): void {
        const ctx = this.getContext();
        const now = ctx.currentTime;

        // Low harsh buzz
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain).connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.value = 150;
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);

        // Higher dissonant layer
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2).connect(ctx.destination);
        osc2.type = 'square';
        osc2.frequency.value = 185;
        gain2.gain.setValueAtTime(0.15, now);
        gain2.gain.linearRampToValueAtTime(0, now + 0.6);
        osc2.start(now);
        osc2.stop(now + 0.6);
    }

    playAllIn(): void {
        const ctx = this.getContext();
        const now = ctx.currentTime;

        // Dramatic rising sweep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain).connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);

        // Sub bass punch
        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.connect(subGain).connect(ctx.destination);
        sub.type = 'sine';
        sub.frequency.value = 80;
        subGain.gain.setValueAtTime(0.3, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        sub.start(now);
        sub.stop(now + 0.3);
    }

    playWinner(): void {
        const ctx = this.getContext();
        const now = ctx.currentTime;

        // Celebratory ascending arpeggio (C major)
        const notes = [523, 659, 784, 1047, 1319];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain).connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const start = now + i * 0.12;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.25, start + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.8);
            osc.start(start);
            osc.stop(start + 0.8);
        });

        // Final sustained chord
        [1047, 1319, 1568].forEach(freq => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain).connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const start = now + 0.7;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.15, start + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 1.5);
            osc.start(start);
            osc.stop(start + 1.5);
        });
    }

    playTransition(): void {
        const ctx = this.getContext();
        const now = ctx.currentTime;

        // Quick whoosh effect
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain).connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }
}

export const sounds = new SoundEffects();
