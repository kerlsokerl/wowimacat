import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Player, BONE_NAMES } from './player.js';
import { World } from './world.js';
import { Controls } from './controls.js';
import { HandTracker } from './HandTracker.js';
import { ControlMenu } from './ControlMenu.js';

class Game {
    constructor() {
        this.room = new WebsimSocket();
        this.isControllerMode = false;
        this.controllerTargetId = null;
        this.activeHand = 'left';
        this.activeAnim = 'Default';
        this.controllerCode = null;

        this.initEntry();
    }

    initTutorial() {
        const tutorial = document.getElementById('tutorial-overlay');
        const hideTutorial = localStorage.getItem('hide_tutorial');
        
        if (!hideTutorial) {
            tutorial.classList.remove('hidden');
        }

        document.getElementById('btn-tutorial-ok').onclick = () => {
            tutorial.classList.add('hidden');
        };

        document.getElementById('btn-tutorial-dont-show').onclick = () => {
            localStorage.setItem('hide_tutorial', 'true');
            tutorial.classList.add('hidden');
        };
    }

    async initEntry() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            document.getElementById('mobile-splash').classList.remove('hidden');
            document.getElementById('btn-mode-controller').onclick = () => this.startAsController();
            document.getElementById('btn-mode-player').onclick = () => this.startAsPlayer();
        } else {
            this.startAsPlayer();
        }
    }

    async startAsController() {
        this.isControllerMode = true;
        this.controllerRecalibrationOffset = { pos: new THREE.Vector3(), rot: new THREE.Quaternion() };
        document.getElementById('mobile-splash').classList.add('hidden');
        document.getElementById('phone-controller-ui').classList.remove('hidden');
        
        await this.room.initialize();
        this.room.updatePresence({ isController: true });
        
        const log = (msg) => {
            const el = document.getElementById('debug-log');
            if (el) el.innerHTML = msg + "<br>" + el.innerHTML;
        };

        const tabRemote = document.getElementById('tab-remote');
        const tabOptions = document.getElementById('tab-options');
        const pageRemote = document.getElementById('remote-page');
        const pageOptions = document.getElementById('options-page');

        tabRemote.onclick = () => {
            pageRemote.classList.remove('hidden');
            pageOptions.classList.add('hidden');
            tabRemote.style.background = '#222'; tabRemote.style.opacity = '1';
            tabOptions.style.background = '#111'; tabOptions.style.opacity = '0.6';
        };

        tabOptions.onclick = () => {
            pageRemote.classList.add('hidden');
            pageOptions.classList.remove('hidden');
            tabRemote.style.background = '#111'; tabRemote.style.opacity = '0.6';
            tabOptions.style.background = '#222'; tabOptions.style.opacity = '1';
        };

        const btnShowModels = document.getElementById('btn-show-models');
        const btnExitModels = document.getElementById('btn-exit-models');
        const controlsStandard = document.getElementById('controls-standard');
        const controlsModels = document.getElementById('controls-models');
        const controllerModelList = document.getElementById('controller-model-list');

        btnShowModels.onclick = () => {
            controlsStandard.classList.add('hidden');
            controlsModels.classList.remove('hidden');
        };

        btnExitModels.onclick = () => {
            controlsStandard.classList.remove('hidden');
            controlsModels.classList.add('hidden');
        };

        try {
            const res = await fetch('hand_models.json');
            const data = await res.json();
            data.models.forEach(m => {
                const btn = document.createElement('button');
                btn.style.margin = '2px 0';
                btn.style.padding = '8px';
                btn.style.fontSize = '12px';
                btn.style.background = '#333';
                btn.textContent = m.name;
                btn.onclick = () => {
                    if (this.controllerTargetId) {
                        this.room.requestPresenceUpdate(this.controllerTargetId, {
                            type: 'changeModel',
                            path: m.path
                        });
                        log("Requested Model: " + m.name);
                        btnExitModels.click();
                    }
                };
                controllerModelList.appendChild(btn);
            });
        } catch(e) { log("Failed to load models list"); }

        const btnConnect = document.getElementById('btn-connect-to-pc');
        const updateHandUI = () => {
            document.getElementById('btn-select-left').classList.toggle('active-hand-btn', this.activeHand === 'left');
            document.getElementById('btn-select-right').classList.toggle('active-hand-btn', this.activeHand === 'right');
        };

        btnConnect.onclick = () => {
            const input = document.getElementById('pc-code-input').value;
            let found = false;
            for (const id in this.room.presence) {
                if (this.room.presence[id].controllerCode === input) {
                    this.controllerTargetId = id;
                    found = true;
                    document.getElementById('phone-setup').classList.add('hidden');
                    document.getElementById('phone-active').classList.remove('hidden');
                    document.getElementById('target-name').textContent = this.room.peers[id].username;
                    log("Linked to " + this.room.peers[id].username);
                    updateHandUI();
                    break;
                }
            }
            if (!found) log("Invalid Code");
        };

        document.getElementById('btn-select-left').onclick = () => { this.activeHand = 'left'; updateHandUI(); };
        document.getElementById('btn-select-right').onclick = () => { this.activeHand = 'right'; updateHandUI(); };
        document.getElementById('btn-anim-default').onclick = () => { this.activeAnim = 'Default'; };
        document.getElementById('btn-anim-point').onclick = () => { this.activeAnim = 'Point'; };
        document.getElementById('btn-recalibrate').onclick = () => { this.shouldRecalibrate = true; };
        document.getElementById('btn-reset-session').onclick = () => { window.location.reload(); };
        document.getElementById('btn-start-ar').onclick = () => this.startAR(log);
    }

    async startAR(log) {
        try {
            if (!navigator.xr) throw new Error("WebXR not supported");
            const canvas = document.createElement("canvas");
            const gl = canvas.getContext("webgl", { xrCompatible: true });
            const sessionOptions = {
                requiredFeatures: ['local'],
                optionalFeatures: ['dom-overlay'],
                domOverlay: { root: document.getElementById('phone-active') }
            };
            const session = await navigator.xr.requestSession('immersive-ar', sessionOptions);
            document.getElementById('btn-start-ar').style.display = 'none';
            document.getElementById('ar-status').textContent = "TRACKING ACTIVE";
            session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
            const refSpace = await session.requestReferenceSpace('local');
            session.requestAnimationFrame(function onFrame(time, frame) {
                const pose = frame.getViewerPose(refSpace);
                if (pose && this.controllerTargetId) {
                    const pos = pose.transform.position;
                    const ori = pose.transform.orientation;
                    if (this.shouldRecalibrate) {
                        this.controllerRecalibrationOffset.pos.set(pos.x, pos.y, pos.z);
                        this.controllerRecalibrationOffset.rot.set(ori.x, ori.y, ori.z, ori.w).invert();
                        this.shouldRecalibrate = false;
                    }
                    const relX = pos.x - this.controllerRecalibrationOffset.pos.x;
                    const relY = pos.y - this.controllerRecalibrationOffset.pos.y;
                    const relZ = pos.z - this.controllerRecalibrationOffset.pos.z;
                    const relativePos = { x: relX, y: relY, z: relZ };
                    const currentRot = new THREE.Quaternion(ori.x, ori.y, ori.z, ori.w);
                    currentRot.premultiply(this.controllerRecalibrationOffset.rot);
                    this.room.requestPresenceUpdate(this.controllerTargetId, {
                        type: 'handTracking',
                        hand: this.activeHand,
                        pos: relativePos,
                        rot: { x: currentRot.x, y: currentRot.y, z: currentRot.z, w: currentRot.w },
                        anim: this.activeAnim
                    });
                }
                session.requestAnimationFrame(onFrame.bind(this));
            }.bind(this));
        } catch (e) { log("Error: " + e.message); }
    }

    async startAsPlayer() {
        document.getElementById('mobile-splash').classList.add('hidden');
        this.initTutorial();
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.xr.enabled = true;
        document.body.appendChild(this.renderer.domElement);
        this.setupVR();
        this.world = new World(this.scene);
        this.scene.userData.renderer = this.renderer; 
        this.player = new Player(this.scene, this.camera);
        this.controls = new Controls(this.player, this.renderer.domElement);
        this.handTracker = new HandTracker(this.player);
        this.controlMenu = new ControlMenu(this);
        this.initModelMenu();
        this.remotePlayers = new Map();
        window.addEventListener('resize', () => this.onWindowResize());
        this.lastTime = performance.now();
        await this.room.initialize();
        this.controllerCode = Math.floor(1000 + Math.random() * 9000).toString();
        const codeDisplay = document.getElementById('pc-code-display');
        codeDisplay.style.display = 'flex';
        document.getElementById('code-text').textContent = this.controllerCode;
        document.getElementById('sidebar-toggle').onclick = (e) => {
            e.stopPropagation();
            codeDisplay.classList.toggle('collapsed');
        };
        this.room.subscribePresence((presence) => { this.updateRemotePlayers(presence); });
        this.room.subscribePresenceUpdateRequests((req, fromId) => {
            if (req.type === 'handTracking' && this.controls.inputsEnabled.phone) {
                this.player.applyExternalHand(req.hand, req.pos, req.rot, req.anim, 'phone', req.landmarks);
            } else if (req.type === 'changeModel' && req.path) {
                this.player.loadHandModel(req.path);
            }
        });
        this.setupChat();
        this.renderer.setAnimationLoop(() => this.animate());
    }

    async setupVR() {
        if ('xr' in navigator) {
            const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
            if (isSupported) {
                const vrBtn = document.getElementById('btn-enter-vr');
                vrBtn.classList.remove('hidden');
                vrBtn.onclick = async () => {
                    const sessionInit = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
                    const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
                    this.renderer.xr.setSession(session);
                    vrBtn.classList.add('hidden');
                    session.addEventListener('end', () => vrBtn.classList.remove('hidden'));
                };
            }
        }
    }

    async initModelMenu() {
        const menuOverlay = document.getElementById('model-menu-overlay');
        const listContainer = document.getElementById('model-list');
        const closeBtn = document.getElementById('btn-close-models');
        window.addEventListener('open-model-menu', () => {
            menuOverlay.classList.remove('hidden');
            if (this.renderer) document.exitPointerLock();
        });
        closeBtn.onclick = () => menuOverlay.classList.add('hidden');
        try {
            const response = await fetch('hand_models.json');
            const data = await response.json();
            for (const model of data.models) {
                const item = document.createElement('div');
                item.className = 'model-item';
                if (model.path === this.player.handModelPath) item.classList.add('selected');
                const img = document.createElement('img');
                img.className = 'model-preview';
                img.src = await this.generateModelPreview(model.path);
                const label = document.createElement('div');
                label.textContent = model.name;
                label.style.fontSize = '12px'; label.style.marginTop = '5px';
                item.appendChild(img); item.appendChild(label);
                item.onclick = async () => {
                    document.querySelectorAll('.model-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    await this.player.loadHandModel(model.path);
                };
                listContainer.appendChild(item);
            }
        } catch (e) { console.error("Failed to load models list", e); }
    }

    async generateModelPreview(path) {
        const width = 150, height = 150;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
        camera.position.set(0.5, 0.5, 1.2); camera.lookAt(0, 0, 0);
        scene.add(new THREE.AmbientLight(0xffffff, 1));
        const dl = new THREE.DirectionalLight(0xffffff, 2); dl.position.set(1, 2, 3);
        scene.add(dl);
        const loader = new GLTFLoader();
        try {
            const gltf = await new Promise((res, rej) => loader.load(path, res, undefined, rej));
            const model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            model.scale.multiplyScalar(0.8 / maxDim);
            model.position.sub(center.multiplyScalar(0.8 / maxDim));
            scene.add(model); renderer.render(scene, camera);
            const dataUrl = renderer.domElement.toDataURL(); renderer.dispose();
            return dataUrl;
        } catch (e) { return ''; }
    }

    setupChat() {
        const chatInput = document.getElementById('chat-input');
        const chatMessages = document.getElementById('chat-messages');
        const appendMessage = (username, text) => {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'chat-msg';
            msgDiv.innerHTML = `<span class="username">${username}:</span> ${text}`;
            chatMessages.appendChild(msgDiv); chatMessages.scrollTop = chatMessages.scrollHeight;
        };
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const text = chatInput.value.trim();
                if (text) { this.room.send({ type: 'chat', text: text }); chatInput.value = ''; }
                chatInput.blur();
                if (this.renderer) this.renderer.domElement.requestPointerLock();
            }
            e.stopPropagation();
        });
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && document.activeElement !== chatInput) chatInput.focus();
        });
        this.room.onmessage = (event) => {
            const data = event.data;
            if (data.type === 'chat') {
                const sender = this.room.peers[data.clientId]?.username || 'Guest';
                appendMessage(sender, data.text);
            } else if (data.type === 'connected') appendMessage('System', `${data.username} joined.`);
            else if (data.type === 'disconnected') appendMessage('System', `${data.username} left.`);
        };
    }

    updateRemotePlayers(presence) {
        for (const [id, remotePlayer] of this.remotePlayers) {
            if (!presence[id]) { this.scene.remove(remotePlayer.group); this.remotePlayers.delete(id); }
        }
        for (const id in presence) {
            if (id === this.room.clientId) continue;
            const data = presence[id];
            if (data.isController || !data.pos) continue;
            let remotePlayer = this.remotePlayers.get(id);
            if (!remotePlayer) {
                remotePlayer = this.createRemotePlayerMesh();
                this.remotePlayers.set(id, remotePlayer); this.scene.add(remotePlayer.group);
            }
            if (data.pos) remotePlayer.group.position.set(data.pos.x, data.pos.y, data.pos.z);
            if (data.yaw !== undefined) remotePlayer.group.rotation.y = data.yaw;
            if (data.pitch !== undefined) remotePlayer.head.rotation.x = data.pitch;
            if (data.lPos) remotePlayer.leftBlock.position.set(data.lPos.x, data.lPos.y, data.lPos.z);
            if (data.lRot) remotePlayer.leftBlock.quaternion.set(data.lRot.x, data.lRot.y, data.lRot.z, data.lRot.w);
            if (data.rPos) remotePlayer.rightBlock.position.set(data.rPos.x, data.rPos.y, data.rPos.z);
            if (data.rRot) remotePlayer.rightBlock.quaternion.set(data.rRot.x, data.rRot.y, data.rRot.z, data.rRot.w);
            if (data.handModel && remotePlayer.currentModelPath !== data.handModel) this.updateRemoteHandModel(remotePlayer, data.handModel);
            
            // Store landmarks for processing in the render loop
            remotePlayer.landmarks.left = data.lLandmarks;
            remotePlayer.landmarks.right = data.rLandmarks;

            ['left', 'right'].forEach(side => {
                const animKey = side === 'left' ? 'lAnim' : 'rAnim';
                const targetAnim = data[animKey] || 'Default';
                
                if (remotePlayer.mixers[side]) {
                    if (remotePlayer.currentAnims[side] !== targetAnim) {
                        const oldAction = remotePlayer.actions[side][remotePlayer.currentAnims[side]];
                        const newAction = remotePlayer.actions[side][targetAnim];
                        if (newAction) {
                            if (oldAction) oldAction.fadeOut(0.2);
                            newAction.reset().fadeIn(0.2).play();
                            remotePlayer.currentAnims[side] = targetAnim;
                        }
                    }
                }
            });
        }
    }

    updateRemoteFingerBones(remote, side, landmarks) {
        if (!remote.handBones[side]) return;
        remote.head.updateMatrixWorld();
        const boneAxis = remote.boneAxis || 'z';
        const disableThumbMeta = this.player?.disableThumbMeta || false;
        let boneForward = new THREE.Vector3(0, 1, 0); 
        if (boneAxis === 'x') boneForward.set(1, 0, 0);
        if (boneAxis === 'z') boneForward.set(0, 0, 1);
        if (boneAxis === 'xn') boneForward.set(-1, 0, 0);
        if (boneAxis === 'yn') boneForward.set(0, -1, 0);
        if (boneAxis === 'zn') boneForward.set(0, 0, -1);
        const fingerIndices = { thumb: [1, 2, 3, 4], index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };
        const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion(), mInv = new THREE.Matrix4();
        for (const [finger, bones] of Object.entries(remote.handBones[side])) {
            const indices = fingerIndices[finger]; if (!indices) continue;
            for (let i = 0; i < bones.length; i++) {
                const bone = bones[i]; if (!bone) continue;
                if (finger === 'thumb' && i === 0 && disableThumbMeta) continue;
                const idxStart = indices[i]; const idxEnd = indices[i+1];
                v1.copy(landmarks[idxStart]); v2.copy(landmarks[idxEnd]);
                v1.x = -v1.x; v1.y = -v1.y; v2.x = -v2.x; v2.y = -v2.y;
                const targetDir = new THREE.Vector3().subVectors(v2, v1).normalize();
                
                // For remote players, head acts as the camera reference
                targetDir.transformDirection(remote.head.matrixWorld);

                if (bone.parent) { 
                    mInv.copy(bone.parent.matrixWorld).invert(); 
                    targetDir.transformDirection(mInv); 
                }
                q1.setFromUnitVectors(boneForward, targetDir); bone.quaternion.slerp(q1, 0.4);
            }
        }
    }

    async updateRemoteHandModel(remotePlayer, path) {
        remotePlayer.currentModelPath = path;
        const loader = new GLTFLoader();
        try {
            const registryRes = await fetch('hand_models.json');
            const registry = await registryRes.json();
            const meta = registry.models.find(m => m.path === path);
            if (meta && meta.boneAxis) remotePlayer.boneAxis = meta.boneAxis;

            const gltf = await new Promise((res, rej) => loader.load(path, res, undefined, rej));
            while(remotePlayer.leftBlock.children.length > 0) remotePlayer.leftBlock.remove(remotePlayer.leftBlock.children[0]);
            while(remotePlayer.rightBlock.children.length > 0) remotePlayer.rightBlock.remove(remotePlayer.rightBlock.children[0]);
            const scale = 0.11;
            const leftHand = SkeletonUtils.clone(gltf.scene);
            const rightHand = SkeletonUtils.clone(gltf.scene);
            
            this.scanRemoteBones(remotePlayer, leftHand, 'left');
            this.scanRemoteBones(remotePlayer, rightHand, 'right');

            remotePlayer.mixers.left = new THREE.AnimationMixer(leftHand);
            remotePlayer.mixers.right = new THREE.AnimationMixer(rightHand);
            remotePlayer.actions.left = {}; remotePlayer.actions.right = {};
            gltf.animations.forEach(clip => {
                remotePlayer.actions.left[clip.name] = remotePlayer.mixers.left.clipAction(clip);
                remotePlayer.actions.right[clip.name] = remotePlayer.mixers.right.clipAction(clip);
            });
            leftHand.scale.set(-scale, scale, scale);
            leftHand.traverse(c => { if(c.isMesh) { c.material = c.material.clone(); c.material.side = THREE.DoubleSide; }});
            rightHand.scale.set(scale, scale, scale);
            remotePlayer.leftBlock.add(leftHand); remotePlayer.rightBlock.add(rightHand);
            remotePlayer.currentAnims.left = ''; remotePlayer.currentAnims.right = '';
        } catch (e) { console.error("Remote model load failed", path); }
    }

    scanRemoteBones(remote, root, side) {
        remote.handBones[side] = {};
        root.traverse((obj) => {
            if (obj.isBone) {
                const name = obj.name.toLowerCase();
                const getSeg = (n) => {
                    if(n.includes('1') || n.includes('prox') || n.includes('meta')) return 0;
                    if(n.includes('2') || n.includes('inter')) return 1;
                    if(n.includes('3') || n.includes('dist')) return 2;
                    return -1;
                }
                for (const [finger, triggers] of Object.entries(BONE_NAMES)) {
                    if (triggers.some(t => name.includes(t))) {
                        const segIndex = getSeg(name);
                        if (segIndex !== -1) {
                            if (!remote.handBones[side][finger]) remote.handBones[side][finger] = [];
                            remote.handBones[side][finger][segIndex] = obj;
                        }
                    }
                }
            }
        });
    }

    createRemotePlayerMesh() {
        const group = new THREE.Group();
        const bodyGeo = new THREE.CapsuleGeometry(0.4, 1.4, 4, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = -0.7; body.castShadow = true;
        group.add(body);
        const head = new THREE.Group(); group.add(head);
        const leftBlock = new THREE.Group(); const rightBlock = new THREE.Group();
        head.add(leftBlock); head.add(rightBlock);
        
        // Initial state for remote player - model will be loaded by updateRemotePlayers loop
        return { 
            group, head, leftBlock, rightBlock, 
            mixers: { left: null, right: null }, 
            actions: { left: {}, right: {} }, 
            currentAnims: { left: '', right: '' }, 
            handBones: { left: {}, right: {} }, 
            boneAxis: 'z',
            currentModelPath: null,
            landmarks: { left: null, right: null }
        };
    }

    onWindowResize() {
        if (!this.camera) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        const time = performance.now();
        const deltaTime = Math.min((time - this.lastTime) / 1000, 0.1);
        this.lastTime = time;
        if (this.player) {
            this.player.update(deltaTime, this.controls);
            if (this.room.clientId) {
                this.room.updatePresence({
                    pos: { x: this.player.yaw.position.x, y: this.player.yaw.position.y, z: this.player.yaw.position.z },
                    yaw: this.player.yaw.rotation.y,
                    pitch: this.player.pitch.rotation.x,
                    lPos: { x: this.player.leftBlock.position.x, y: this.player.leftBlock.position.y, z: this.player.leftBlock.position.z },
                    lRot: { x: this.player.leftBlock.quaternion.x, y: this.player.leftBlock.quaternion.y, z: this.player.leftBlock.quaternion.z, w: this.player.leftBlock.quaternion.w },
                    rPos: { x: this.player.rightBlock.position.x, y: this.player.rightBlock.position.y, z: this.player.rightBlock.position.z },
                    rRot: { x: this.player.rightBlock.quaternion.x, y: this.player.rightBlock.quaternion.y, z: this.player.rightBlock.quaternion.z, w: this.player.rightBlock.quaternion.w },
                    lAnim: this.player.currentAnims.left,
                    rAnim: this.player.currentAnims.right,
                    lLandmarks: this.player.externalHands.left.landmarks,
                    rLandmarks: this.player.externalHands.right.landmarks,
                    handModel: this.player.handModelPath,
                    controllerCode: this.controllerCode
                });
            }
        }
        for (const [id, remotePlayer] of this.remotePlayers) {
            if (remotePlayer.mixers.left) remotePlayer.mixers.left.update(deltaTime);
            if (remotePlayer.mixers.right) remotePlayer.mixers.right.update(deltaTime);
            
            // Update matrices once per remote player to ensure bone parent transforms are correct
            remotePlayer.group.updateMatrixWorld();

            // Manual overrides happen AFTER mixer update to ensure landmarks win
            if (remotePlayer.landmarks.left) this.updateRemoteFingerBones(remotePlayer, 'left', remotePlayer.landmarks.left);
            if (remotePlayer.landmarks.right) this.updateRemoteFingerBones(remotePlayer, 'right', remotePlayer.landmarks.right);
        }
        if (this.renderer) this.renderer.render(this.scene, this.camera);
    }
}
new Game();
