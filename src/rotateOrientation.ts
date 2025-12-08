// src/rotateOrientation.ts
import Phaser from 'phaser';

// ================== STATE CHUNG ==================
let gameRef: Phaser.Game | null = null;
let mainSceneKey = 'GameScene';
let overlaySceneKey: string | null = 'OverlayScene';

let rotateOverlay: HTMLDivElement | null = null;
let isRotateOverlayActive = false;

let currentVoice: Phaser.Sound.BaseSound | null = null;
let currentVoiceKey: string | null = null;

let pausedLoopKeys: string[] = [];
let pendingQuestionKey: string | null = null;

// ================== ƯU TIÊN VOICE ==================
function getVoicePriority(key: string): number {
    if (key.startsWith('drag_') || key.startsWith('q_')) return 1;
    if (key === 'voice_need_finish') return 2;
    if (key === 'sfx_correct' || key === 'sfx_wrong') return 3;
    if (
        key === 'voice_complete' ||
        key === 'voice_intro' ||
        key === 'voice_end' ||
        key === 'voice_rotate'
    ) {
        return 4;
    }
    return 1;
}

export function playVoiceLocked(
    sound: Phaser.Sound.BaseSoundManager,
    key: string
): void {
    if (isRotateOverlayActive && key !== 'voice_rotate') {
        console.warn(
            `[Rotate] Đang overlay xoay ngang, chỉ phát voice_rotate!`
        );
        return;
    }

    const newPri = getVoicePriority(key);
    const curPri = currentVoiceKey ? getVoicePriority(currentVoiceKey) : 0;

    if (currentVoice && currentVoice.isPlaying) {
        if (currentVoiceKey === key) return;
        if (curPri >= newPri) return;

        currentVoice.stop();
        currentVoice = null;
        currentVoiceKey = null;
    }

    let instance = sound.get(key) as Phaser.Sound.BaseSound | null;
    if (!instance) {
        try {
            instance = sound.add(key);
            if (!instance) {
                console.warn(
                    `[Rotate] Không phát được audio key="${key}": Asset chưa preload hoặc chưa có trong cache.`
                );
                return;
            }
        } catch (e) {
            console.warn(`[Rotate] Không phát được audio key="${key}":`, e);
            return;
        }
    }

    currentVoice = instance;
    currentVoiceKey = key;
    instance.once('complete', () => {
        if (currentVoice === instance) {
            currentVoice = null;
            currentVoiceKey = null;
        }
    });
    instance.play();
}

// ================== HỖ TRỢ AUDIO ==================
function resumeSoundContext(scene: Phaser.Scene) {
    const sm = scene.sound as any;
    const ctx: AudioContext | undefined = sm.context || sm.audioContext;
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        ctx.resume();
    }
}

function getAudioScenes(): Phaser.Scene[] {
    if (!gameRef) return [];

    const sceneManager = gameRef.scene;
    const mainScene = sceneManager.getScene(mainSceneKey) as
        | Phaser.Scene
        | undefined;

    const overlayScene =
        overlaySceneKey != null
            ? (sceneManager.getScene(overlaySceneKey) as
                  | Phaser.Scene
                  | undefined)
            : undefined;

    const audioScenes: Phaser.Scene[] = [];
    if (mainScene && mainScene.sound) audioScenes.push(mainScene);
    if (overlayScene && overlayScene.sound) audioScenes.push(overlayScene);

    return audioScenes;
}

// ================== UI OVERLAY XOAY NGANG ==================
function ensureRotateOverlay() {
    if (rotateOverlay) return;

    rotateOverlay = document.createElement('div');
    rotateOverlay.id = 'rotate-overlay';
    rotateOverlay.style.position = 'fixed';
    rotateOverlay.style.inset = '0';
    rotateOverlay.style.zIndex = '9999';
    rotateOverlay.style.display = 'none';
    rotateOverlay.style.alignItems = 'center';
    rotateOverlay.style.justifyContent = 'center';
    rotateOverlay.style.textAlign = 'center';
    rotateOverlay.style.background = 'rgba(0, 0, 0, 0.6)';
    rotateOverlay.style.padding = '16px';
    rotateOverlay.style.boxSizing = 'border-box';

    const box = document.createElement('div');
    box.style.background = 'white';
    box.style.borderRadius = '16px';
    box.style.padding = '16px 20px';
    box.style.maxWidth = '320px';
    box.style.margin = '0 auto';
    box.style.fontFamily =
        '"Fredoka", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    box.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25)';

    const title = document.createElement('div');
    title.textContent = 'Bé Hãy Xoay Ngang Màn Hình Để Chơi Nhé 🌈';
    title.style.fontSize = '18px';
    title.style.fontWeight = '700';
    title.style.marginBottom = '8px';
    title.style.color = '#222';

    box.appendChild(title);
    rotateOverlay.appendChild(box);
    document.body.appendChild(rotateOverlay);
}

// ================== CORE LOGIC XOAY + ÂM THANH ==================
function updateRotateHint() {
    ensureRotateOverlay();
    if (!rotateOverlay) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const shouldShow = h > w && w < 768; // portrait & nhỏ

    const overlayWasActive = isRotateOverlayActive;
    isRotateOverlayActive = shouldShow;

    const overlayTurnedOn = !overlayWasActive && shouldShow;
    const overlayTurnedOff = overlayWasActive && !shouldShow;

    rotateOverlay.style.display = shouldShow ? 'flex' : 'none';

    const audioScenes = getAudioScenes();
    if (audioScenes.length === 0) return;

    if (overlayTurnedOn) {
        pausedLoopKeys = [];
        pendingQuestionKey = null;

        audioScenes.forEach((scene) => {
            resumeSoundContext(scene);

            const soundManager = scene.sound as any;
            const sounds = soundManager.sounds as
                | Phaser.Sound.BaseSound[]
                | undefined;
            if (!Array.isArray(sounds)) return;

            sounds.forEach((snd: Phaser.Sound.BaseSound) => {
                if (
                    snd &&
                    typeof snd.key === 'string' &&
                    snd.key !== 'voice_rotate' &&
                    snd.isPlaying &&
                    typeof snd.stop === 'function'
                ) {
                    if (
                        (snd as any).loop &&
                        !pausedLoopKeys.includes(snd.key)
                    ) {
                        pausedLoopKeys.push(snd.key);
                    }
                    if (!pendingQuestionKey && snd.key.startsWith('q_')) {
                        pendingQuestionKey = snd.key;
                    }
                    snd.stop();
                }
            });
        });

        const tryPlayVoiceRotate = () => {
            if (!gameRef) return;

            const sm2 = gameRef.scene;
            const mainScene = sm2.getScene(mainSceneKey) as
                | Phaser.Scene
                | undefined;
            const ovScene =
                overlaySceneKey != null
                    ? (sm2.getScene(overlaySceneKey) as
                          | Phaser.Scene
                          | undefined)
                    : undefined;

            const scene = mainScene ?? ovScene;
            if (!scene || !scene.sound) return;

            const isActive = scene.scene.isActive();
            const hasVoiceRotate =
                !!(scene.cache as any)?.audio?.exists?.('voice_rotate') ||
                !!scene.sound.get('voice_rotate');

            if (isActive && hasVoiceRotate) {
                playVoiceLocked(scene.sound, 'voice_rotate');
            } else {
                setTimeout(tryPlayVoiceRotate, 300);
            }
        };
        tryPlayVoiceRotate();
    }

    if (overlayTurnedOff) {
        if (!gameRef) return;

        const sm2 = gameRef.scene;
        const mainScene = sm2.getScene(mainSceneKey) as
            | Phaser.Scene
            | undefined;
        const ovScene =
            overlaySceneKey != null
                ? (sm2.getScene(overlaySceneKey) as Phaser.Scene | undefined)
                : undefined;

        const sceneForAudio = mainScene ?? ovScene;
        if (!sceneForAudio || !sceneForAudio.sound) return;

        resumeSoundContext(sceneForAudio);

        const rotateSound = sceneForAudio.sound.get(
            'voice_rotate'
        ) as Phaser.Sound.BaseSound | null;
        if (rotateSound && rotateSound.isPlaying) {
            rotateSound.stop();
        }
        if (currentVoice === rotateSound) {
            currentVoice = null;
            currentVoiceKey = null;
        }

        pausedLoopKeys.forEach((key) => {
            const bg = sceneForAudio.sound.get(
                key
            ) as Phaser.Sound.BaseSound | null;
            if (bg) {
                (bg as any).loop = true;
                bg.play();
            }
        });
        pausedLoopKeys = [];

        if (pendingQuestionKey) {
            playVoiceLocked(sceneForAudio.sound, pendingQuestionKey);
            pendingQuestionKey = null;
        }
    }
}

// ================== KHỞI TẠO HỆ THỐNG XOAY ==================
export function initRotateOrientation(
    game: Phaser.Game,
    options?: {
        mainSceneKey?: string;
        overlaySceneKey?: string | null;
    }
) {
    gameRef = game;
    if (options?.mainSceneKey) mainSceneKey = options.mainSceneKey;
    if (options && 'overlaySceneKey' in options) {
        overlaySceneKey = options.overlaySceneKey ?? null;
    }

    ensureRotateOverlay();
    updateRotateHint();

    window.addEventListener('resize', updateRotateHint);
    window.addEventListener('orientationchange', updateRotateHint as any);

    window.addEventListener('pointerdown', () => {
        if (!isRotateOverlayActive || !gameRef) return;

        const sm = gameRef.scene;
        const mainScene = sm.getScene(mainSceneKey) as Phaser.Scene | undefined;
        const ovScene =
            overlaySceneKey != null
                ? (sm.getScene(overlaySceneKey) as Phaser.Scene | undefined)
                : undefined;

        const scene = mainScene ?? ovScene;
        if (!scene || !scene.sound) return;

        resumeSoundContext(scene);
        try {
            playVoiceLocked(scene.sound, 'voice_rotate');
        } catch {}
    });
}
