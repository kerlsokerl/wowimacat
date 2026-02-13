import nipplejs from 'nipplejs';

export class Controls {
    constructor(player, domElement) {
        this.player = player;
        this.domElement = domElement;
        
        this.moveInput = { x: 0, z: 0 };
        this.lookInput = { x: 0, y: 0 };
        this.keys = {};
        this.isRunning = false;
        
        this.mouseSensitivity = 0.002;
        this.touchSensitivity = 0.004;
        this.activeBlockMode = null; // 'left', 'right', or null
        this.animationStates = { left: 'Default', right: 'Default' };

        this.inputsEnabled = {
            keyboard: true,
            phone: true,
            camera: false
        };

        this.initKeyboard();
        this.initMouse();
        this.initMobile();
    }

    initKeyboard() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            if (this.inputsEnabled.keyboard) {
                if (e.code === 'KeyQ') {
                    this.toggleBlockMode('left');
                }
                if (e.code === 'KeyE') {
                    this.toggleBlockMode('right');
                }
            }

            if (e.code === 'KeyO') {
                window.dispatchEvent(new CustomEvent('open-model-menu'));
            }

            // Handle numeric keys 1-9 for gestures
            const digitMatch = e.code.match(/^Digit([1-9])$/);
            if (digitMatch && this.activeBlockMode) {
                const index = parseInt(digitMatch[1]) - 1;
                const availableAnims = this.player.getSortedAnimations(this.activeBlockMode);
                if (availableAnims[index]) {
                    this.animationStates[this.activeBlockMode] = availableAnims[index];
                }
            }
            
            if (e.shiftKey || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                this.isRunning = true;
            }
            
            this.updateMoveInputFromKeys();
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            
            if (!(e.shiftKey || this.keys['ShiftLeft'] || this.keys['ShiftRight'])) {
                this.isRunning = false;
            }
            
            this.updateMoveInputFromKeys();
        });
    }

    toggleBlockMode(mode) {
        if (this.activeBlockMode === mode) {
            this.activeBlockMode = null;
        } else {
            this.activeBlockMode = mode;
        }

        const indicator = document.getElementById('mode-indicator');
        if (indicator) {
            if (this.activeBlockMode) {
                indicator.style.display = 'block';
                indicator.textContent = `Manipulating ${this.activeBlockMode} block`;
                this.moveInput.x = 0;
                this.moveInput.z = 0;
            } else {
                indicator.style.display = 'none';
            }
        }
    }

    updateMoveInputFromKeys() {
        this.moveInput.x = 0;
        this.moveInput.z = 0;

        // Don't move if typing in chat
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
            return;
        }

        if (this.keys['KeyW'] || this.keys['ArrowUp']) this.moveInput.z -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) this.moveInput.z += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) this.moveInput.x -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) this.moveInput.x += 1;

        // Normalize move input
        const length = Math.sqrt(this.moveInput.x * this.moveInput.x + this.moveInput.z * this.moveInput.z);
        if (length > 0) {
            this.moveInput.x /= length;
            this.moveInput.z /= length;
        }
    }

    initMouse() {
        this.domElement.addEventListener('click', () => {
            if (document.pointerLockElement !== this.domElement) {
                this.domElement.requestPointerLock();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.domElement) {
                if (this.activeBlockMode === 'left') {
                    this.player.leftBlock.position.x += e.movementX * 0.005;
                    this.player.leftBlock.position.y -= e.movementY * 0.005;
                } else if (this.activeBlockMode === 'right') {
                    this.player.rightBlock.position.x += e.movementX * 0.005;
                    this.player.rightBlock.position.y -= e.movementY * 0.005;
                } else {
                    this.lookInput.x += e.movementX * this.mouseSensitivity;
                    this.lookInput.y += e.movementY * this.mouseSensitivity;
                }
            }
        });
    }

    initMobile() {
        const zone = document.getElementById('joystick-zone');
        const sprintBtn = document.getElementById('sprint-btn');
        if (!zone) return;

        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        if (!isTouchDevice) return;

        // Show sprint button on mobile
        if (sprintBtn) {
            sprintBtn.style.display = 'flex';
            const startSprint = (e) => {
                e.preventDefault();
                this.isRunning = true;
                sprintBtn.classList.add('active');
            };
            const endSprint = (e) => {
                e.preventDefault();
                this.isRunning = false;
                sprintBtn.classList.remove('active');
            };
            sprintBtn.addEventListener('touchstart', startSprint);
            sprintBtn.addEventListener('touchend', endSprint);
            sprintBtn.addEventListener('mousedown', startSprint);
            sprintBtn.addEventListener('mouseup', endSprint);
        }

        // Joystick for movement
        this.manager = nipplejs.create({
            zone: zone,
            mode: 'static',
            position: { left: '75px', bottom: '75px' },
            color: 'white'
        });

        this.manager.on('move', (evt, data) => {
            if (this.isMenuOpen) return;
            this.moveInput.x = data.vector.x;
            this.moveInput.z = -data.vector.y;
        });

        this.manager.on('end', () => {
            this.moveInput.x = 0;
            this.moveInput.z = 0;
        });

        // Touch for looking (anywhere else on screen)
        let lastTouchX = 0;
        let lastTouchY = 0;

        window.addEventListener('touchstart', (e) => {
            // Only handle if touch is NOT on the joystick zone
            if (!zone.contains(e.target)) {
                lastTouchX = e.touches[0].pageX;
                lastTouchY = e.touches[0].pageY;
            }
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (!zone.contains(e.target) && !this.isMenuOpen) {
                const touchX = e.touches[0].pageX;
                const touchY = e.touches[0].pageY;
                
                this.lookInput.x += (touchX - lastTouchX) * -this.touchSensitivity;
                this.lookInput.y += (touchY - lastTouchY) * -this.touchSensitivity;
                
                lastTouchX = touchX;
                lastTouchY = touchY;
            }
        }, { passive: false });
    }
}
