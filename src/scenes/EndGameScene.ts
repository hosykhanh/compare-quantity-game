import Phaser from 'phaser';
import { hideGameButtons } from '../main';

export class EndGameScene extends Phaser.Scene {
    private containerEl: HTMLElement | null = null;
    private confettiEvent?: Phaser.Time.TimerEvent;

    constructor() {
        super('EndGameScene');
    }

    private clearDimBackground() {
        if (this.containerEl) {
            this.containerEl.classList.remove('dim-overlay');
            this.containerEl.classList.remove('dim-filter');
        }
    }

    preload() {
        this.load.image(
            'banner_congrat',
            'assets/images/ui/banner_congrat.png'
        );
        this.load.image('btn_reset', 'assets/images/ui/btn_reset.png');
        this.load.image('btn_exit', 'assets/images/ui/btn_exit.png');

        this.load.audio('complete', 'assets/audio/sfx/complete.mp3');
        this.load.audio('fireworks', 'assets/audio/sfx/fireworks.mp3');
        this.load.audio('applause', 'assets/audio/sfx/applause.mp3');
        this.load.audio('sfx_click', 'assets/audio/sfx/click.wav');
    }

    create() {
        const w = this.scale.width;
        const h = this.scale.height;

        // Phát âm thanh chúc mừng khi vào màn hình
        this.sound.play('complete');

        this.containerEl = document.getElementById('game-container');

        // 👉 bật lớp mờ nền
        if (this.containerEl) {
            this.containerEl.classList.add('dim-overlay'); // hoặc 'dim-filter'
        }

        // Phát âm thanh chiến thắng sau 2s
        this.time.delayedCall(2000, () => {
            this.sound.play('fireworks');
            this.sound.play('applause');
        });

        // ==== Banner kết quả (ảnh nền) ====
        this.add
            .image(w / 2, h / 2 - h * 0.12, 'banner_congrat')
            .setOrigin(0.5)
            .setDepth(100)
            .setDisplaySize(w * 0.9, h * 0.9); // full màn

        // ==== Các nút ngang dưới banner ====
        const btnScale = Math.min(w, h) / 1280;
        const spacing = 250 * btnScale;

        // Nút Chơi lại (quay về CompareScene)
        const replayBtn = this.add
            .image(w / 2 - spacing, h / 2 + h * 0.2, 'btn_reset')
            .setOrigin(0.5)
            .setScale(btnScale)
            .setDepth(101)
            .setInteractive({ useHandCursor: true });

        replayBtn.on('pointerdown', () => {
            this.sound.play('sfx_click');
            this.clearDimBackground();
            this.stopConfetti();
            this.scene.start('CompareScene'); // CompareScene sẽ tự random level lại
        });

        // Nút Thoát (tùy bạn xử lý gì)
        const exitBtn = this.add
            .image(w / 2 + spacing, h / 2 + h * 0.2, 'btn_exit')
            .setOrigin(0.5)
            .setScale(btnScale)
            .setDepth(101)
            .setInteractive({ useHandCursor: true });

        exitBtn.on('pointerdown', () => {
            this.sound.play('sfx_click');
            this.clearDimBackground();
            this.stopConfetti();
        });

        // Hover effect (nếu cần trên desktop)
        [replayBtn, exitBtn].forEach((btn) => {
            btn.on('pointerover', () => btn.setScale(btnScale * 1.1));
            btn.on('pointerout', () => btn.setScale(btnScale));
        });

        hideGameButtons();
        this.createConfettiEffect();
    }

    private createConfettiEffect(): void {
        const width = this.cameras.main.width;
        const colors = [
            0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da,
        ];
        const shapes: Array<'circle' | 'rect'> = ['circle', 'rect'];

        // Tạo confetti liên tục
        this.confettiEvent = this.time.addEvent({
            delay: 100,
            callback: () => {
                // chỉ tạo khi scene còn active
                if (!this.scene.isActive()) return;

                for (let i = 0; i < 3; i++) {
                    this.createConfettiPiece(
                        Phaser.Math.Between(0, width),
                        -20,
                        Phaser.Utils.Array.GetRandom(colors),
                        Phaser.Utils.Array.GetRandom(shapes)
                    );
                }
            },
            loop: true,
        });
    }

    private createConfettiPiece(
        x: number,
        y: number,
        color: number,
        shape: 'circle' | 'rect'
    ): void {
        let confetti: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;

        if (shape === 'circle') {
            confetti = this.add.circle(
                x,
                y,
                Phaser.Math.Between(4, 8),
                color,
                1
            );
        } else {
            confetti = this.add.rectangle(
                x,
                y,
                Phaser.Math.Between(6, 12),
                Phaser.Math.Between(10, 20),
                color,
                1
            );
        }

        confetti.setDepth(999);
        confetti.setRotation((Phaser.Math.Between(0, 360) * Math.PI) / 180);

        const duration = Phaser.Math.Between(3000, 5000);
        const targetY = this.cameras.main.height + 50;
        const drift = Phaser.Math.Between(-100, 100);

        this.tweens.add({
            targets: confetti,
            y: targetY,
            x: x + drift,
            rotation: confetti.rotation + Phaser.Math.Between(2, 4) * Math.PI,
            duration,
            ease: 'Linear',
            onComplete: () => confetti.destroy(),
        });

        this.tweens.add({
            targets: confetti,
            alpha: { from: 1, to: 0.3 },
            duration,
            ease: 'Cubic.easeIn',
        });
    }

    private stopConfetti(): void {
        if (this.confettiEvent) {
            this.confettiEvent.remove(false); // không gọi callback nữa
            this.confettiEvent = undefined;
        }
    }
}
