// src/rotateOrientation.ts
import Phaser from 'phaser';
import audioManager from './audio/AudioManager';

// ================== STATE CHUNG ==================
let rotateOverlay: HTMLDivElement | null = null;
let isRotateOverlayActive = false;
let currentVoiceKey: string | null = null;

// chỉ attach 1 lần
let globalBlockListenersAttached = false;

// ================== CẤU HÌNH CỐ ĐỊNH (DÙNG CHUNG) ==================
type RotateConfig = {
    breakpoint: number; // max width để coi là màn nhỏ (mobile)
    message: string; // text hiển thị trên popup
    lockPointer: boolean; // true = chặn click xuyên xuống game
};

const rotateConfig: RotateConfig = {
    breakpoint: 768,
    message: 'Bé hãy xoay ngang màn hình để chơi nhé 🌈',
    lockPointer: true,
};

// ================== ƯU TIÊN VOICE ==================
function getVoicePriority(key: string): number {
    if (key.startsWith('drag_') || key.startsWith('q_')) return 1;
    if (key === 'voice_need_finish') return 2;
    if (key === 'sfx_correct' || key === 'sfx_wrong') return 3;
    if (
        key === 'voice_complete' ||
        key === 'voice_intro' ||
        key === 'voice_end' ||
        key === 'voice-rotate'
    ) {
        return 4;
    }
    return 1;
}

/**
 * API giữ nguyên cho các scene:
 *   playVoiceLocked(this.sound, 'q_...')
 * Nội bộ: dùng AudioManager (Howler), bỏ hẳn Phaser.Sound.
 */
export function playVoiceLocked(
    _sound: Phaser.Sound.BaseSoundManager | null,
    key: string
): void {
    // Khi đang overlay xoay ngang → chỉ cho phát voice-rotate
    if (isRotateOverlayActive && key !== 'voice-rotate') {
        console.warn(
            `[Rotate] Đang overlay xoay màn hình, chỉ phát voice-rotate (bỏ qua "${key}")`
        );
        return;
    }

    // === TRƯỜNG HỢP ĐẶC BIỆT: voice-rotate ===
    // YÊU CẦU: mỗi lần chạm màn hình phải:
    //  - Tắt hết âm thanh khác của game
    //  - Phát lại voice-rotate từ đầu
    if (key === 'voice-rotate') {
        try {
            const am = audioManager as any;

            // Tắt mọi thứ nếu AudioManager có các hàm này
            if (typeof am.stopAll === 'function') {
                am.stopAll(); // dừng toàn bộ BGM/SFX/voice (nếu có)
            }
            if (typeof am.stopAllVoicePrompts === 'function') {
                am.stopAllVoicePrompts(); // dừng toàn bộ voice hướng dẫn
            }
        } catch (e) {
            console.warn('[Rotate] stop all audio error:', e);
        }

        currentVoiceKey = null;

        const id = audioManager.play('voice-rotate');
        if (id === undefined) {
            console.warn(
                `[Rotate] Không phát được audio key="voice-rotate" (Howler).`
            );
            return;
        }

        currentVoiceKey = 'voice-rotate';
        return;
    }

    // === CÁC VOICE BÌNH THƯỜNG (q_, drag_, correct, ...) ===
    const newPri = getVoicePriority(key);
    const curPri = currentVoiceKey ? getVoicePriority(currentVoiceKey) : 0;

    if (currentVoiceKey === key) return; // tránh spam cùng key
    if (currentVoiceKey && curPri >= newPri) return; // không cho voice ưu tiên thấp đè

    if (currentVoiceKey) {
        audioManager.stop(currentVoiceKey);
        currentVoiceKey = null;
    }

    const id = audioManager.play(key);
    if (id === undefined) {
        console.warn(`[Rotate] Không phát được audio key="${key}" (Howler).`);
        return;
    }

    currentVoiceKey = key;
}

// ================== BLOCK & REPLAY KHI OVERLAY BẬT ==================
function attachGlobalBlockInputListeners() {
    if (globalBlockListenersAttached) return;
    globalBlockListenersAttached = true;

    const handler = (ev: Event) => {
        if (!isRotateOverlayActive) return;

        // Khi overlay đang hiển thị:
        // 1) Chặn event không cho rơi xuống Phaser
        ev.stopPropagation();
        // @ts-ignore
        if (typeof (ev as any).stopImmediatePropagation === 'function') {
            (ev as any).stopImmediatePropagation();
        }
        ev.preventDefault();

        // 2) MỖI LẦN CHẠM → tắt hết audio + phát lại voice-rotate
        try {
            playVoiceLocked(null as any, 'voice-rotate');
        } catch (err) {
            console.warn(
                '[Rotate] global pointer play voice-rotate error:',
                err
            );
        }
    };

    const events = [
        'pointerdown',
        'pointerup',
        'click',
        'touchstart',
        'touchend',
        'mousedown',
        'mouseup',
    ];

    events.forEach((type) => {
        window.addEventListener(type, handler, {
            capture: true, // chặn ngay từ giai đoạn capture
            passive: false, // để preventDefault hoạt động
        });
    });
}

// ================== UI OVERLAY XOAY NGANG ==================
function ensureRotateOverlay() {
    if (rotateOverlay) return;

    rotateOverlay = document.createElement('div');
    rotateOverlay.id = 'rotate-overlay';
    rotateOverlay.style.position = 'fixed';
    rotateOverlay.style.inset = '0';
    rotateOverlay.style.zIndex = '2147483647'; // trên mọi thứ
    rotateOverlay.style.display = 'none';
    rotateOverlay.style.alignItems = 'center';
    rotateOverlay.style.justifyContent = 'center';
    rotateOverlay.style.textAlign = 'center';
    rotateOverlay.style.background = 'rgba(0, 0, 0, 0.6)';
    rotateOverlay.style.padding = '16px';
    rotateOverlay.style.boxSizing = 'border-box';

    // Block click phía sau
    rotateOverlay.style.pointerEvents = rotateConfig.lockPointer
        ? 'auto'
        : 'none';

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
    title.textContent = rotateConfig.message;
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
    const shouldShow = h > w && w < rotateConfig.breakpoint; // portrait & nhỏ (mobile)

    const overlayWasActive = isRotateOverlayActive;
    isRotateOverlayActive = shouldShow;

    const overlayTurnedOn = !overlayWasActive && shouldShow;
    const overlayTurnedOff = overlayWasActive && !shouldShow;

    rotateOverlay.style.display = shouldShow ? 'flex' : 'none';

    // === Khi overlay BẬT ===
    if (overlayTurnedOn) {
        try {
            // dọn hết voice cũ trước khi phát rotate
            const am = audioManager as any;
            if (typeof am.stopAll === 'function') {
                am.stopAll();
            }
            if (typeof am.stopAllVoicePrompts === 'function') {
                am.stopAllVoicePrompts();
            }
        } catch (e) {
            console.warn('[Rotate] stopAll on overlay open error:', e);
        }

        try {
            playVoiceLocked(null as any, 'voice-rotate');
        } catch (e) {
            console.warn('[Rotate] play voice-rotate error:', e);
        }
    }

    // === Khi overlay TẮT ===
    if (overlayTurnedOff) {
        if (currentVoiceKey === 'voice-rotate') {
            audioManager.stop('voice-rotate');
            currentVoiceKey = null;
        }
    }
}

// ================== KHỞI TẠO HỆ THỐNG XOAY ==================
/**
 * Dùng chung cho tất cả game:
 *
 *   initRotateOrientation(game);
 *
 * Không cần truyền gì thêm. Đổi text / breakpoint → sửa rotateConfig ở trên.
 */
export function initRotateOrientation(_game: Phaser.Game) {
    ensureRotateOverlay();
    attachGlobalBlockInputListeners(); // chặn + replay khi overlay bật
    updateRotateHint();

    window.addEventListener('resize', updateRotateHint);
    window.addEventListener(
        'orientationchange',
        updateRotateHint as unknown as EventListener
    );
}
