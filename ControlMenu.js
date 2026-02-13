export class ControlMenu {
    constructor(game) {
        this.game = game;
        this.menu = document.getElementById('control-mode-menu');
        this.advMenu = document.getElementById('advanced-menu-overlay');
        this.btnPresetClassic = document.getElementById('preset-classic');
        this.btnPresetNextGen = document.getElementById('preset-nextgen');
        this.btnPresetNextGenFingers = document.getElementById('preset-nextgen-fingers');
        this.btnClose = document.getElementById('btn-close-control-menu');
        this.btnCloseAdv = document.getElementById('btn-close-advanced-menu');
        this.btnQuick = document.getElementById('btn-quick-control');
        this.btnAdv = document.getElementById('btn-advanced-control');

        this.toggles = {
            keyboard: document.getElementById('toggle-keyboard'),
            phone: document.getElementById('toggle-phone'),
            camera: document.getElementById('toggle-camera'),
            fingers: document.getElementById('toggle-fingers')
        };

        this.setupDrawers();
        this.setupEvents();
        this.setupAdvancedSettings();
    }

    setupDrawers() {
        document.querySelectorAll('.drawer-header').forEach(header => {
            header.onclick = () => {
                header.parentElement.classList.toggle('open');
            };
        });
    }

    setupEvents() {
        this.btnQuick.onclick = () => this.toggle();
        this.btnAdv.onclick = () => this.toggleAdvanced();
        this.btnClose.onclick = () => this.close();
        this.btnCloseAdv.onclick = () => this.toggleAdvanced();
        
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyR' && document.activeElement.tagName !== 'INPUT') {
                this.toggle();
            }
        });

        this.btnPresetClassic.onclick = () => this.setPreset('classic');
        this.btnPresetNextGen.onclick = () => this.setPreset('nextgen');
        
        // Add listener for new preset button if it doesn't exist yet (we'll inject it)
        if (!this.btnPresetNextGenFingers) {
             const btn = document.createElement('button');
             btn.id = 'preset-nextgen-fingers';
             btn.style.cssText = 'background: #2c3e50; border: 1px solid #555; padding: 20px; text-align: left; margin-top: 15px;';
             btn.innerHTML = `
                <div style="font-size: 18px; color: #f1c40f;">NEXT-GEN + FINGERS</div>
                <div style="font-size: 12px; opacity: 0.7;">Full Hand & Finger Tracking (Experimental)</div>
             `;
             btn.onclick = () => this.setPreset('nextgen-fingers');
             this.btnPresetNextGen.parentElement.appendChild(btn);
             this.btnPresetNextGenFingers = btn;
        }

        // Add finger toggle if it doesn't exist
        if (!this.toggles.fingers) {
            const drawerContent = document.querySelector('#manual-toggles-drawer .drawer-content');
            const row = document.createElement('div');
            row.className = 'toggle-row';
            row.innerHTML = `
                <span>Finger Tracking (Landmarks)</span>
                <label class="switch">
                    <input type="checkbox" id="toggle-fingers">
                    <span class="slider"></span>
                </label>
            `;
            drawerContent.appendChild(row);
            this.toggles.fingers = row.querySelector('input');
        }
    }

    setupAdvancedSettings() {
        const container = document.getElementById('camera-settings-list');
        if (!container || !this.game.handTracker) return;

        const viewRow = document.createElement('div');
        viewRow.className = 'toggle-row';
        viewRow.style.marginBottom = "20px";
        viewRow.innerHTML = `
            <span>Show Landmark Overlay</span>
            <label class="switch">
                <input type="checkbox" id="toggle-landmark-view">
                <span class="slider"></span>
            </label>
        `;
        container.appendChild(viewRow);
        
        const viewToggle = viewRow.querySelector('input');
        viewToggle.onchange = () => {
            this.game.handTracker.showDebug = viewToggle.checked;
        };

        const thumbRow = document.createElement('div');
        thumbRow.className = 'toggle-row';
        thumbRow.style.marginBottom = "20px";
        thumbRow.innerHTML = `
            <span>Disable Thumb Base Joint</span>
            <label class="switch">
                <input type="checkbox" id="toggle-thumb-meta">
                <span class="slider"></span>
            </label>
        `;
        container.appendChild(thumbRow);
        
        const thumbToggle = thumbRow.querySelector('input');
        thumbToggle.onchange = () => {
            if (this.game.player) this.game.player.disableThumbMeta = thumbToggle.checked;
        };

        const config = this.game.handTracker.config;
        const definitions = {
            cameraFov: { min: 30, max: 120, step: 1, label: "Camera FOV" },
            zOffset: { min: 0, max: 3, step: 0.1, label: "Z Offset (Depth)" },
            palmActualSize: { min: 0.01, max: 0.2, step: 0.001, label: "Real Palm Size (m)" },
            eyeHeight: { min: -1, max: 1, step: 0.01, label: "Height Offset" },
            lerpAmount: { min: 0.01, max: 1, step: 0.01, label: "Smoothing (Speed)" },
            separation: { min: 0.5, max: 5, step: 0.1, label: "Horizontal Separation" }
        };

        Object.entries(definitions).forEach(([key, def]) => {
            const div = document.createElement('div');
            div.className = 'advanced-setting-item';
            div.style.flexDirection = 'row';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.style.marginBottom = '12px';
            div.style.background = '#222';
            div.style.padding = '10px';
            div.style.borderRadius = '8px';
            
            const label = document.createElement('label');
            label.textContent = def.label;
            label.style.color = '#fff';
            label.style.fontSize = '13px';
            
            const input = document.createElement('input');
            input.type = 'number';
            input.min = def.min;
            input.max = def.max;
            input.step = def.step;
            input.value = config[key];

            input.onchange = () => {
                let val = parseFloat(input.value);
                if (isNaN(val)) val = config[key];
                val = Math.max(def.min, Math.min(def.max, val));
                input.value = val;
                this.game.handTracker.config[key] = val;
            };

            div.appendChild(label);
            div.appendChild(input);
            container.appendChild(div);
        });
    }

    toggleAdvanced() {
        if (this.advMenu.classList.contains('hidden')) {
            this.advMenu.classList.remove('hidden');
            this.menu.classList.add('hidden');
            if (this.game.renderer) document.exitPointerLock();
        } else {
            this.advMenu.classList.add('hidden');
        }
    }

    setPreset(type) {
        if (type === 'classic') {
            this.toggles.keyboard.checked = true;
            this.toggles.phone.checked = true;
            this.toggles.camera.checked = false;
            this.toggles.fingers.checked = false;
        } else if (type === 'nextgen') {
            this.toggles.keyboard.checked = false;
            this.toggles.phone.checked = false;
            this.toggles.camera.checked = true;
            this.toggles.fingers.checked = false;
        } else if (type === 'nextgen-fingers') {
            this.toggles.keyboard.checked = false;
            this.toggles.phone.checked = false;
            this.toggles.camera.checked = true;
            this.toggles.fingers.checked = true;
        }
        this.updateButtons();
    }

    updateButtons() {
        const isClassic = this.toggles.keyboard.checked && this.toggles.phone.checked && !this.toggles.camera.checked;
        const isNextGen = !this.toggles.keyboard.checked && !this.toggles.phone.checked && this.toggles.camera.checked && !this.toggles.fingers.checked;
        const isNextGenFingers = this.toggles.camera.checked && this.toggles.fingers.checked;

        this.btnPresetClassic.style.borderColor = isClassic ? '#3498db' : '#555';
        this.btnPresetNextGen.style.borderColor = isNextGen ? '#00ff00' : '#555';
        this.btnPresetNextGenFingers.style.borderColor = isNextGenFingers ? '#f1c40f' : '#555';
    }

    toggle() {
        if (this.menu.classList.contains('hidden')) {
            this.menu.classList.remove('hidden');
            if (this.game.renderer) document.exitPointerLock();
        } else {
            this.close();
        }
    }

    close() {
        this.menu.classList.add('hidden');
        this.applySettings();
    }

    applySettings() {
        if (!this.game.player || !this.game.controls) return;

        const settings = {
            keyboard: this.toggles.keyboard.checked,
            phone: this.toggles.phone.checked,
            camera: this.toggles.camera.checked,
            fingers: this.toggles.fingers.checked
        };
        
        this.game.controls.inputsEnabled = settings;

        // Reset logic for fingers
        if (!settings.fingers) {
            this.game.player.externalHands.left.landmarks = null;
            this.game.player.externalHands.right.landmarks = null;
            this.game.controls.animationStates.left = 'Default';
            this.game.controls.animationStates.right = 'Default';
        }

        // Reset logic for camera tracking (hand position)
        if (!settings.camera) {
            ['left', 'right'].forEach(side => {
                const ext = this.game.player.externalHands[side];
                if (ext.source === 'camera') {
                    ext.active = false;
                    ext.hasPos = false;
                    ext.hasRot = false;
                    const block = (side === 'left') ? this.game.player.leftBlock : this.game.player.rightBlock;
                    const anchor = (side === 'left') ? this.game.player.leftAnchor : this.game.player.rightAnchor;
                    if (block && anchor) block.position.copy(anchor);
                }
            });
        }

        if (this.game.handTracker) {
            this.game.handTracker.config.handTracking = settings.camera;
            this.game.handTracker.config.fingerTracking = settings.fingers;

            if (settings.camera || settings.fingers) {
                this.game.handTracker.start();
            } else {
                this.game.handTracker.stop();
            }
        }
    }
}
