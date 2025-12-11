import Phaser from 'phaser';
import { showGameButtons } from '../main';
import AudioManager from '../audio/AudioManager';

// ====== Định nghĩa type level ======

type QuestionType = 'more' | 'less';

interface BaseSideConfig {
    icon: string; // "turtle" | "fish" | "dolphin" ...
    count: number; // số lượng con vật
}

interface SideLevel {
    id: number;
    mode: 'side';
    left: BaseSideConfig;
    right: BaseSideConfig;
    questionType: QuestionType; // "more" | "less"
    correctSide: 'left' | 'right';
}

interface OperatorLevel {
    id: number;
    mode: 'operator';
    left: BaseSideConfig;
    right: BaseSideConfig;
    relation: '<' | '>' | '=';
}

type CompareLevel = SideLevel | OperatorLevel;

// ====== CompareScene ======

export class CompareScene extends Phaser.Scene {
    // dữ liệu level
    private currentLevelIndex = 0;
    private allLevels: CompareLevel[] = [];
    private levels: CompareLevel[] = []; // 5 level được chọn cho lượt chơi
    private readonly LEVELS_PER_GAME = 5;

    rabbit!: Phaser.GameObjects.Image;
    boy!: Phaser.GameObjects.Image;

    // điểm số
    private score = 0;

    // state
    // private state: GameState = 'idle';
    private state:
        | 'idle'
        | 'checking'
        | 'animating'
        | 'transition'
        | 'waitingNext'
        | 'result' = 'idle';

    // UI elements tái sử dụng
    private questionBar!: Phaser.GameObjects.Image;
    private leftPanel!: Phaser.GameObjects.Image;
    private rightPanel!: Phaser.GameObjects.Image;
    // private nextButton!: Phaser.GameObjects.Image;

    // danh sách sprite của level hiện tại để dễ clear
    private levelObjects: Phaser.GameObjects.GameObject[] = [];

    private leftPanelAnimals: Phaser.GameObjects.Image[] = [];
    private rightPanelAnimals: Phaser.GameObjects.Image[] = [];

    private bgLayerA: HTMLElement | null = null;
    private bgLayerB: HTMLElement | null = null;
    private isBgAActive = true;

    private bgByIcon: Record<string, string> = {
        turtle: 'assets/images/bg/bg_sea.jpg',
        dolphin: 'assets/images/bg/bg_sea.jpg',

        cow: 'assets/images/bg/bg_way.jpg',
        chicken: 'assets/images/bg/bg_farm.jpg',
        cat: 'assets/images/bg/bg_home.jpg',
        dog: 'assets/images/bg/bg_home.jpg',
        monkey: 'assets/images/bg/bg_forest.jpg',
    };

    private hasAudioUnlocked = false;
    private pendingPrompt: { icon: string; questionType: QuestionType } | null =
        null;

    // Hàm này sẽ được gọi từ DOM listener
    public unlockFirstPrompt() {
        this.hasAudioUnlocked = true;

        if (this.pendingPrompt) {
            const { icon, questionType } = this.pendingPrompt;
            this.pendingPrompt = null;
            this.playPrompt(icon, questionType);
        }
    }

    constructor() {
        super('CompareScene');
    }

    private getW() {
        return this.scale.width;
    }
    private getH() {
        return this.scale.height;
    }

    private pctX(p: number) {
        return this.getW() * p;
    } // p = 0..1
    private pctY(p: number) {
        return this.getH() * p;
    } // p = 0..1

    create() {
        // Cho phép html-button gọi vào compareScene qua global
        (window as any).compareScene = this;

        this.bgLayerA = document.getElementById('bg-layer-a');
        this.bgLayerB = document.getElementById('bg-layer-b');

        // set 1 bg khởi tạo cho vui
        if (this.bgLayerA) {
            this.bgLayerA.style.backgroundImage =
                "url('assets/images/bg/bg_forest.jpg')";
            this.bgLayerA.classList.add('visible');
            this.isBgAActive = true;
        }
        if (this.bgLayerB) {
            this.bgLayerB.style.backgroundImage =
                "url('assets/images/bg/bg_forest.jpg')";
            this.bgLayerB.classList.remove('visible');
        }

        this.boy = this.add
            .image(this.pctX(0.01), this.pctY(0.9), 'boy')
            .setOrigin(0, 1); // gốc ở bottom-left
        this.boy.setScale(0.5); // tuỳ kích thước sprite thực tế
        // Có thể thêm idle tween nhẹ cho sống động:
        this.tweens.add({
            targets: this.boy,
            y: this.boy.y - 10,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.inOut',
        });

        // ===== Thanh câu hỏi =====
        this.questionBar = this.add
            .image(this.pctX(0.58), this.pctY(0.1), 'question_more')
            .setOrigin(0.5, 0.5)
            .setDepth(5);

        // nếu muốn fit theo chiều rộng màn:
        const barWidth = this.getW() * 0.4;
        const ratio = this.questionBar.height / this.questionBar.width;
        this.questionBar.setDisplaySize(barWidth, barWidth * ratio);

        this.createPanels();

        // ===== Lấy dữ liệu level từ JSON =====
        const loadedLevels = this.cache.json.get('compareLevels') as
            | CompareLevel[]
            | undefined;

        if (loadedLevels && Array.isArray(loadedLevels)) {
            this.allLevels = loadedLevels;
        } else {
            console.warn(
                '[CompareScene] Không load được compareLevels.json, dùng dữ liệu fallback'
            );
            this.allLevels = [
                {
                    id: 1,
                    mode: 'side',
                    left: { icon: 'turtle', count: 2 },
                    right: { icon: 'turtle', count: 5 },
                    questionType: 'more',
                    correctSide: 'right',
                },
            ];
        }

        // chọn ngẫu nhiên 5 level cho lượt chơi
        this.levels = this.pickRandomLevels(
            this.allLevels,
            this.LEVELS_PER_GAME
        );

        this.currentLevelIndex = 0;
        this.score = 0;
        this.state = 'idle';

        showGameButtons();
        this.showCurrentLevel();
    }

    private setBackgroundForLevel(level: CompareLevel) {
        const icon = level.left.icon;
        const url = this.bgByIcon[icon] ?? 'assets/images/bg/bg_forest.jpg';

        if (!this.bgLayerA || !this.bgLayerB) return;

        const active = this.isBgAActive ? this.bgLayerA : this.bgLayerB;
        const hidden = this.isBgAActive ? this.bgLayerB : this.bgLayerA;

        // nếu đang cùng 1 ảnh thì khỏi làm gì cho đỡ tốn
        const currentBg = active.style.backgroundImage;
        const targetBg = `url("${url}")`;
        if (currentBg === targetBg) return;

        // set ảnh mới lên layer đang ẩn
        hidden.style.backgroundImage = `url('${url}')`;

        // cho layer ẩn fade in, layer đang active fade out
        hidden.classList.add('visible');
        active.classList.remove('visible');

        // đảo trạng thái
        this.isBgAActive = !this.isBgAActive;
    }

    private createPanels() {
        const panelWidth = this.getW() * 0.35;
        const panelHeight = this.getH() * 0.75;

        // toạ độ theo tỉ lệ màn
        const panelY = this.pctY(0.55);
        const leftX = this.pctX(0.4);
        const rightX = this.pctX(0.76);

        this.leftPanel = this.add
            .image(leftX, panelY, 'panel_bg')
            .setOrigin(0.5)
            .setDisplaySize(panelWidth, panelHeight)
            .setDepth(1);

        this.rightPanel = this.add
            .image(rightX, panelY, 'panel_bg')
            .setOrigin(0.5)
            .setDisplaySize(panelWidth, panelHeight)
            .setDepth(1);

        // lưu scale gốc để tween intro/outro
        (this.leftPanel as any).baseScaleX = this.leftPanel.scaleX;
        (this.leftPanel as any).baseScaleY = this.leftPanel.scaleY;
        (this.rightPanel as any).baseScaleX = this.rightPanel.scaleX;
        (this.rightPanel as any).baseScaleY = this.rightPanel.scaleY;
    }

    private playPrompt(icon: string, questionType: 'more' | 'less') {
        // dừng mọi voice đang nói
        AudioManager.stopAll();

        AudioManager.playPrompt(questionType, icon);
    }

    private pickRandomLevels(
        source: CompareLevel[],
        count: number
    ): CompareLevel[] {
        if (source.length <= count) {
            // ít hơn hoặc bằng N thì chơi hết
            return Phaser.Utils.Array.Shuffle(source.slice());
        }

        const shuffled = Phaser.Utils.Array.Shuffle(source.slice());
        return shuffled.slice(0, count);
    }

    // ========== HÀM HIỂN THỊ LEVEL ==========

    private showCurrentLevel() {
        if (!this.levels.length) return;

        const level = this.levels[this.currentLevelIndex];

        this.clearLevelObjects();

        // reset attempt
        this.state = 'idle';
        // this.nextButton.visible = false;

        // 👉 set background theo con vật của level hiện tại
        this.setBackgroundForLevel(level);

        // 🔁 RESET PANEL VỀ TRẠNG THÁI BÌNH THƯỜNG
        if (this.leftPanel) {
            this.leftPanel.setTexture('panel_bg');
            this.leftPanel.clearTint(); // nếu sau này có tint màu thì cũng xoá luôn
        }
        if (this.rightPanel) {
            this.rightPanel.setTexture('panel_bg');
            this.rightPanel.clearTint();
        }

        // 1. Cập nhật câu hỏi + phát voice theo con vật
        if (level.mode === 'side') {
            const icon = level.left.icon; // cat / dog / ...
            const questionType = level.questionType; // 'more' | 'less'

            // đổi ảnh thanh câu hỏi
            if (questionType === 'more') {
                this.questionBar.setTexture('question_more');
            } else {
                this.questionBar.setTexture('question_less');
            }

            // phát đúng file theo con vật
            // 🔊 LẦN ĐẦU: chỉ lưu lại, đợi tap; CÁC LẦN SAU: phát luôn
            if (this.hasAudioUnlocked) {
                this.playPrompt(icon, questionType);
            } else {
                this.pendingPrompt = { icon, questionType };
            }
        }

        // Vẽ con vật
        this.drawAnimals(level.left, this.leftPanel);
        this.drawAnimals(level.right, this.rightPanel);

        // Gắn interactive panel
        this.leftPanel.setInteractive({ useHandCursor: true });
        this.rightPanel.setInteractive({ useHandCursor: true });

        this.leftPanel.on('pointerdown', () => this.onSideSelected('left'));
        this.rightPanel.on('pointerdown', () => this.onSideSelected('right'));

        this.animateLevelIntro();
    }

    private clearLevelObjects() {
        // Xóa sprite con vật
        this.levelObjects.forEach((obj) => obj.destroy());
        this.levelObjects = [];

        // reset list động vật trong panel
        this.leftPanelAnimals = [];
        this.rightPanelAnimals = [];

        // Nếu panel chưa được tạo thì bỏ qua
        if (this.leftPanel) {
            this.leftPanel.removeAllListeners('pointerdown');
            this.leftPanel.disableInteractive();
        }

        if (this.rightPanel) {
            this.rightPanel.removeAllListeners('pointerdown');
            this.rightPanel.disableInteractive();
        }
    }

    // Tính scale cho con vật để vừa ô trong panel
    private getAnimalScale(
        textureKey: string,
        cellWidth: number,
        cellHeight: number
    ): number {
        const tex = this.textures.get(textureKey);
        const source = tex.getSourceImage() as
            | HTMLImageElement
            | HTMLCanvasElement;

        const texW = source.width;
        const texH = source.height;

        if (!texW || !texH) return 1; // fallback, trường hợp texture lỗi

        // chừa padding 80% cell
        const maxW = cellWidth * 0.85;
        const maxH = cellHeight * 0.85;

        const scaleX = maxW / texW;
        const scaleY = maxH / texH;

        // chọn scale nhỏ hơn để không tràn
        const baseScale = Math.min(scaleX, scaleY);

        // nếu muốn toàn bộ nhỏ hơn nữa thì nhân 0.9 / 0.8 tuỳ mắt
        return baseScale;
    }

    // ===== Vẽ con vật trong 1 panel, auto scale theo kích thước ô =====
    private drawAnimals(side: BaseSideConfig, panel: Phaser.GameObjects.Image) {
        const panelWidth = panel.displayWidth;
        const panelHeight = panel.displayHeight;

        const paddingX = panelWidth * 0.05;
        const paddingY = panelHeight * 0.06;

        const usableWidth = panelWidth - paddingX * 2;
        const usableHeight = panelHeight - paddingY * 2;

        const cols = 3;
        const rows = Math.max(1, Math.ceil(side.count / cols));

        const cellWidth = usableWidth / cols;
        const cellHeight = usableHeight / rows;

        const spacingX = (usableWidth / (cols + 1)) * 1.3;
        const spacingY = (usableHeight / (rows + 1)) * 1.3;

        const left = panel.x - usableWidth / 2;
        const top = panel.y - usableHeight / 2;

        const animalsArray =
            panel === this.leftPanel
                ? this.leftPanelAnimals
                : this.rightPanelAnimals;

        for (let i = 0; i < side.count; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);

            const x = left + spacingX * (col + 0.5);
            const y = top + spacingY * (row + 0.5);

            const sprite = this.add
                .image(x, y, side.icon)
                .setOrigin(0.5, 0.5)
                .setDepth(panel.depth + 1);

            // 🔥 scale theo kích thước cell & texture
            const scale = this.getAnimalScale(side.icon, cellWidth, cellHeight);
            sprite.setScale(scale);

            // lưu scale gốc
            (sprite as any).baseScaleX = sprite.scaleX;
            (sprite as any).baseScaleY = sprite.scaleY;

            this.levelObjects.push(sprite);
            animalsArray.push(sprite);
        }
    }

    private animateLevelIntro() {
        const allTargets: Phaser.GameObjects.Image[] = [
            this.leftPanel,
            this.rightPanel,
            ...this.leftPanelAnimals,
            ...this.rightPanelAnimals,
        ];

        allTargets.forEach((obj) => {
            const anyObj = obj as any;
            if (anyObj.baseScaleX == null) {
                anyObj.baseScaleX = obj.scaleX;
                anyObj.baseScaleY = obj.scaleY;
            }
            obj.setScale(anyObj.baseScaleX * 0.75, anyObj.baseScaleY * 0.75);
        });

        this.state = 'animating';

        this.tweens.add({
            targets: allTargets,
            scaleX: (target: any) => target.baseScaleX,
            scaleY: (target: any) => target.baseScaleY,
            duration: 600,
            ease: 'Back.Out',
            onComplete: () => {
                this.state = 'idle';
            },
        });
    }

    private animateLevelOutro(onDone: () => void) {
        const allAnimals = [
            ...this.leftPanelAnimals,
            ...this.rightPanelAnimals,
        ];

        // nếu vì lý do gì đó không có thú thì khỏi tween, chạy thẳng
        if (allAnimals.length === 0) {
            onDone();
            return;
        }

        this.state = 'transition';

        if (this.leftPanel) this.leftPanel.disableInteractive();
        if (this.rightPanel) this.rightPanel.disableInteractive();

        this.tweens.add({
            targets: allAnimals,
            scaleX: 0,
            scaleY: 0,
            duration: 500,
            ease: 'Back.In',
            onComplete: () => {
                // xoá thú cũ
                allAnimals.forEach((sp) => sp.destroy());

                // loại chúng khỏi levelObjects
                this.levelObjects = this.levelObjects.filter(
                    (obj) =>
                        !allAnimals.includes(obj as Phaser.GameObjects.Image)
                );

                // reset list thú
                this.leftPanelAnimals = [];
                this.rightPanelAnimals = [];

                onDone();
            },
        });
    }

    // ========== XỬ LÝ TƯƠNG TÁC ==========

    private onSideSelected(side: 'left' | 'right') {
        if (this.state !== 'idle') return;

        const level = this.levels[this.currentLevelIndex];
        if (level.mode !== 'side') return;

        this.state = 'checking';
        AudioManager.play('sfx-click');

        const isCorrect = side === level.correctSide;
        const target = side === 'left' ? this.leftPanel : this.rightPanel;

        this.handleAnswer(isCorrect, target);
    }

    private playCorrectVoice() {
        // dừng prompt câu hỏi đang nói
        AudioManager.stopAllVoicePrompts();

        AudioManager.playCorrectAnswer();
    }

    private handleAnswer(
        isCorrect: boolean,
        target: Phaser.GameObjects.GameObject
    ) {
        const panel = target as Phaser.GameObjects.Image;

        if (isCorrect) {
            this.score += 1;
            this.playCorrectFeedback(panel);
            this.playCorrectVoice();

            // khoá panel, chờ bé bấm Next
            this.leftPanel.disableInteractive();
            this.rightPanel.disableInteractive();
        } else {
            this.playWrongFeedback(panel);

            // Cho bé làm lại cùng câu
            this.time.delayedCall(500, () => {
                this.state = 'idle';
            });
        }
    }

    // ========== FEEDBACK ==========

    private playCorrectFeedback(panel: Phaser.GameObjects.Image) {
        AudioManager.play('sfx-correct');

        // lấy danh sách con vật thuộc panel này
        const animals =
            panel === this.leftPanel
                ? this.leftPanelAnimals
                : this.rightPanelAnimals;

        // targets = panel + tất cả con vật trong panel
        const targets: Phaser.GameObjects.GameObject[] = [panel, ...animals];

        // đổi texture sang panel đúng, giữ nguyên cho đến hết câu
        panel.setTexture('panel_bg_correct');

        //tự chuyển sang câu tiếp sau 1 lúc
        this.time.delayedCall(2000, () => {
            this.goToNextLevel();
        });

        // hiệu ứng zoom nhẹ cho vui mắt
        this.tweens.add({
            targets,
            scaleX: panel.scaleX * 1.03,
            scaleY: panel.scaleY * 1.03,
            yoyo: true,
            duration: 150,
            repeat: 1,
        });
    }

    private playWrongFeedback(panel: Phaser.GameObjects.Image) {
        AudioManager.play('sfx-wrong');

        // lấy danh sách con vật thuộc panel này
        const animals =
            panel === this.leftPanel
                ? this.leftPanelAnimals
                : this.rightPanelAnimals;

        // targets = panel + tất cả con vật trong panel
        const targets: Phaser.GameObjects.GameObject[] = [panel, ...animals];

        // đổi sang panel sai
        panel.setTexture('panel_bg_wrong');

        // tween rung: dịch tương đối, không bị lệch vị trí cuối
        this.tweens.add({
            targets,
            x: '+=10',
            yoyo: true,
            duration: 70,
            repeat: 3,
        });

        // sau 500ms đổi về panel bình thường
        this.time.delayedCall(500, () => {
            panel.setTexture('panel_bg');
        });
    }

    // ========== CHUYỂN LEVEL & KẾT QUẢ ==========

    goToNextLevel() {
        AudioManager.stopAll();

        const afterShrink = () => {
            this.currentLevelIndex += 1;

            if (this.currentLevelIndex >= this.levels.length) {
                this.showResultScreen();
            } else {
                this.showCurrentLevel();
            }
        };

        this.animateLevelOutro(afterShrink);
    }

    private showResultScreen() {
        this.state = 'result';

        // dọn sprite, tắt tương tác
        this.clearLevelObjects();

        if (this.leftPanel) this.leftPanel.disableInteractive();
        if (this.rightPanel) this.rightPanel.disableInteractive();

        // chuyển sang EndGameScene, truyền điểm + tổng số câu
        this.scene.start('EndGameScene', {
            score: this.score,
            total: this.levels.length,
        });
    }

    restartGame() {
        AudioManager.stopAll();
        AudioManager.play('sfx-click');
        // random lại 5 level từ pool
        this.levels = this.pickRandomLevels(
            this.allLevels,
            this.LEVELS_PER_GAME
        );

        this.currentLevelIndex = 0;
        this.score = 0;
        this.state = 'idle';

        this.clearLevelObjects();
        this.showCurrentLevel();
    }
}
