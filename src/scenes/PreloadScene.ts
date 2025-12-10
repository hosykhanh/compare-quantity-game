// src/scenes/PreloadScene.ts

import Phaser from 'phaser';
import AudioManager from '../audio/AudioManager';

export default class PreloadScene extends Phaser.Scene {
    constructor() {
        super('PreloadScene');
    }

    preload() {
        // Hình ảnh
        this.load.image('boy', 'assets/images/characters/boy.png');

        this.load.image('turtle', 'assets/images/animals/turtle.png');
        this.load.image('cat', 'assets/images/animals/cat.png');
        this.load.image('dolphin', 'assets/images/animals/dolphin.png');
        this.load.image('dog', 'assets/images/animals/dog.png');
        this.load.image('chicken', 'assets/images/animals/chicken.png');
        this.load.image('cow', 'assets/images/animals/cow.png');
        this.load.image('monkey', 'assets/images/animals/monkey.png');

        // UI
        this.load.image('question_more', 'assets/images/ui/question_more.png');
        this.load.image('question_less', 'assets/images/ui/question_less.png');
        this.load.image('panel_bg', 'assets/images/ui/panel_bg.png');
        this.load.image('panel_bg_correct', 'assets/images/ui/panel_bg_ok.png'); // panel đúng
        this.load.image(
            'panel_bg_wrong',
            'assets/images/ui/panel_bg_wrong.png'
        ); // panel sai

        // ---- LEVEL DATA (JSON) ----
        this.load.json('compareLevels', 'assets/data/compareLevels.json');
    }

    create() {
        // 2. Chờ tải Audio (BẤT ĐỒNG BỘ)
        AudioManager.loadAll()
            .then(() => {
                // console.log('Tất cả tài nguyên (Phaser & Audio) đã tải xong.');

                // 3. Chuyển sang Scene Game chính
                this.scene.start('CompareScene'); // Đổi tên scene chính của bạn
            })
            .catch((error) => {
                console.error('Lỗi khi tải Audio:', error);
                // Xử lý lỗi: Vẫn chuyển Scene nếu lỗi không quá nghiêm trọng.
                this.scene.start('CompareScene');
            });
    }
}
