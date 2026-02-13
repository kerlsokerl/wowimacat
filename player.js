import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const HAND_SCALE = 0.11;
export const BONE_NAMES = {
    thumb:  ['thumb'],
    index:  ['index', 'point'],
    middle: ['middle'],
    ring:   ['ring'],
    pinky:  ['pinky', 'little']
};

export class Player {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        
        this.walkSpeed = 8;
        this.runSpeed = 18;
        this.acceleration = 80;
        this.runAcceleration = 140;
        this.friction = 10;
        this.eyeHeight = 2.2;
        
        this.velocity = new THREE.Vector3();
        this.bobTimer = 0;
        this.baseFOV = camera.fov;
        
        this.externalHands = {
            left: { active: false, pos: new THREE.Vector3(), rot: new THREE.Quaternion(), hasPos: false, hasRot: false, anim: 'Default', lastUpdate: 0, source: 'phone', landmarks: null },
            right: { active: false, pos: new THREE.Vector3(), rot: new THREE.Quaternion(), hasPos: false, hasRot: false, anim: 'Default', lastUpdate: 0, source: 'phone', landmarks: null }
        };
       
        const geometry = new THREE.CapsuleGeometry(0.4, 1.4, 4, 8);
        const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, visible: false });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.y = 1.1;
        this.mesh.castShadow = true;
        this.scene.add(this.mesh);

        this.yaw = new THREE.Object3D();
        this.pitch = new THREE.Object3D();
        this.bobGroup = new THREE.Object3D();
        
        this.scene.add(this.yaw);
        this.yaw.add(this.pitch);
        this.pitch.add(this.bobGroup);
        this.bobGroup.add(this.camera);

        this.leftBlock = new THREE.Group();
        this.rightBlock = new THREE.Group();
        
        this.leftBlock.position.set(-0.6, -0.2, -1.0);
        this.rightBlock.position.set(0.6, -0.2, -1.0);
        
        this.leftAnchor = this.leftBlock.position.clone();
        this.rightAnchor = this.rightBlock.position.clone();
        
        this.camera.add(this.leftBlock);
        this.camera.add(this.rightBlock);

        this.mixers = { left: null, right: null };
        this.actions = { left: {}, right: {} };
        this.currentAnims = { left: 'Default', right: 'Default' };
        this.handBones = { left: {}, right: {} };
        this.handModelPath = '/hand.glb';
        this.boneAxis = 'z';
        this.disableThumbMeta = false;

        this.loadHandModel(this.handModelPath);
        
        this.yaw.position.set(0, this.eyeHeight, 0);

        this.vrButtonState = {
            left: { primary: false },
            right: { primary: false }
        };
    }

    getSortedAnimations(side) {
        if (!this.actions[side]) return ['Default'];
        const names = Object.keys(this.actions[side]).filter(n => n !== 'Default').sort();
        return ['Default', ...names];
    }

    scanBones(root, side) {
        this.handBones[side] = {};
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
                            if (!this.handBones[side][finger]) this.handBones[side][finger] = [];
                            this.handBones[side][finger][segIndex] = obj;
                        }
                    }
                }
            }
        });
    }

    async loadHandModel(path) {
        const loader = new GLTFLoader();
        try {
            const gltf = await new Promise((resolve, reject) => loader.load(path, resolve, undefined, reject));
            
            this.handModelPath = path;
            
            // Try to find bone axis from models metadata if we had a registry lookup
            try {
                const registryRes = await fetch('hand_models.json');
                const registry = await registryRes.json();
                const meta = registry.models.find(m => m.path === path);
                if (meta && meta.boneAxis) this.boneAxis = meta.boneAxis;
            } catch(e) {}

            while(this.leftBlock.children.length > 0) this.leftBlock.remove(this.leftBlock.children[0]);
            while(this.rightBlock.children.length > 0) this.rightBlock.remove(this.rightBlock.children[0]);

            const leftHand = SkeletonUtils.clone(gltf.scene);
            const rightHand = SkeletonUtils.clone(gltf.scene);

            this.scanBones(leftHand, 'left');
            this.scanBones(rightHand, 'right');

            this.mixers.left = new THREE.AnimationMixer(leftHand);
            this.mixers.right = new THREE.AnimationMixer(rightHand);
            this.actions.left = {};
            this.actions.right = {};

            gltf.animations.forEach(clip => {
                this.actions.left[clip.name] = this.mixers.left.clipAction(clip);
                this.actions.right[clip.name] = this.mixers.right.clipAction(clip);
            });

            if (this.actions.left['Default']) this.actions.left['Default'].play();
            if (this.actions.right['Default']) this.actions.right['Default'].play();
            this.currentAnims.left = 'Default';
            this.currentAnims.right = 'Default';

            leftHand.scale.set(-HAND_SCALE, HAND_SCALE, HAND_SCALE);
            leftHand.traverse((child) => {
                if (child.isMesh) {
                    child.material = child.material.clone();
                    child.material.side = THREE.DoubleSide;
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            rightHand.scale.set(HAND_SCALE, HAND_SCALE, HAND_SCALE);
            rightHand.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            this.leftBlock.add(leftHand);
            this.rightBlock.add(rightHand);
            
            return gltf;
        } catch (e) {
            console.error("Failed to load hand model:", path, e);
        }
    }

    applyExternalHand(hand, pos, rot, anim = 'Default', source = 'phone', landmarks = null) {
        if (!this.externalHands[hand]) return;
        const h = this.externalHands[hand];
        h.active = true;
        h.source = source;
        if (pos) {
            h.pos.set(pos.x, pos.y, pos.z);
            h.hasPos = true;
        } else {
            h.hasPos = false;
        }
        if (rot) {
            h.rot.set(rot.x, rot.y, rot.z, rot.w);
            h.hasRot = true;
        } else {
            h.hasRot = false;
        }
        h.anim = anim;
        h.landmarks = landmarks;
        h.lastUpdate = performance.now();
    }

    update(deltaTime, controls) {
        const now = performance.now();
        const isFrozen = controls.activeBlockMode !== null;

        if (!isFrozen) {
            this.yaw.rotation.y -= controls.lookInput.x;
            this.pitch.rotation.x -= controls.lookInput.y;
        }
        
        const minPitch = -Math.PI / 2 + 0.1;
        const maxPitch = Math.PI / 2 - 0.1;
        this.pitch.rotation.x = Math.max(minPitch, Math.min(maxPitch, this.pitch.rotation.x));

        controls.lookInput.x = 0;
        controls.lookInput.y = 0;

        const moveX = isFrozen ? 0 : controls.moveInput.x;
        const moveZ = isFrozen ? 0 : controls.moveInput.z;

        const isRunning = controls.isRunning;
        const currentMaxSpeed = isRunning ? this.runSpeed : this.walkSpeed;
        const currentAccel = isRunning ? this.runAcceleration : this.acceleration;

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.yaw.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.yaw.quaternion);
        forward.y = 0; right.y = 0; forward.normalize(); right.normalize();

        const wishDir = new THREE.Vector3().addScaledVector(forward, -moveZ).addScaledVector(right, moveX);
        if (wishDir.length() > 1) wishDir.normalize();

        if (wishDir.length() > 0) {
            this.velocity.addScaledVector(wishDir, currentAccel * deltaTime);
        }

        const frictionMultiplier = Math.max(0, 1 - this.friction * deltaTime);
        this.velocity.multiplyScalar(frictionMultiplier);

        if (this.velocity.length() > currentMaxSpeed) this.velocity.setLength(currentMaxSpeed);

        this.yaw.position.addScaledVector(this.velocity, deltaTime);

        const horizontalSpeed = new THREE.Vector3(this.velocity.x, 0, this.velocity.z).length();
        if (horizontalSpeed > 0.1) {
            this.bobTimer += deltaTime * horizontalSpeed * 1.5;
            this.bobGroup.position.y = Math.sin(this.bobTimer * 2) * 0.05;
            this.bobGroup.position.x = Math.cos(this.bobTimer) * 0.03;
        } else {
            this.bobTimer = 0;
            this.bobGroup.position.lerp(new THREE.Vector3(0, 0, 0), 0.1);
        }

        const targetTilt = -(this.velocity.dot(right)) * 0.01;
        this.bobGroup.rotation.z = THREE.MathUtils.lerp(this.bobGroup.rotation.z, targetTilt, 0.1);

        const targetFOV = this.baseFOV + (horizontalSpeed * 1.2);
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, 0.1);
        this.camera.updateProjectionMatrix();

        const updateBlock = (block, anchor, handKey, isActiveManual) => {
            const external = this.externalHands[handKey];
            const isTracking = external.active && (now - external.lastUpdate < 1000);
            
            if (isTracking && external.hasPos) {
                const useAnchorX = external.source === 'phone';
                const offsetPos = new THREE.Vector3(
                    external.pos.x * 2.0 + (useAnchorX ? anchor.x : 0),
                    external.pos.y * 2.0 + anchor.y,
                    external.pos.z * 2.5 + anchor.z
                );
                block.position.lerp(offsetPos, 0.2);
                if (external.hasRot) block.quaternion.slerp(external.rot, 0.2);
            } else if (!isActiveManual) {
                const range = 0.6;
                const returnSpeed = 8;
                const targetX = THREE.MathUtils.clamp(block.position.x, anchor.x - range, anchor.x + range);
                const targetY = THREE.MathUtils.clamp(block.position.y, anchor.y - range, anchor.y + range);
                block.position.x = THREE.MathUtils.lerp(block.position.x, targetX, deltaTime * returnSpeed);
                block.position.y = THREE.MathUtils.lerp(block.position.y, targetY, deltaTime * returnSpeed);
                block.quaternion.slerp(new THREE.Quaternion(), 0.1);
            }
        };

        const renderer = this.scene.userData.renderer || (window.game && window.game.renderer);
        if (renderer && renderer.xr.isPresenting) {
            for (let i = 0; i < 2; i++) {
                const controller = renderer.xr.getController(i);
                if (controller) {
                    const inputSource = controller.userData.inputSource;
                    if (inputSource) {
                        const hand = inputSource.handedness;
                        if (hand !== 'left' && hand !== 'right') continue;
                        const targetBlock = (hand === 'left') ? this.leftBlock : this.rightBlock;
                        if (targetBlock) {
                            targetBlock.position.copy(controller.position);
                            targetBlock.quaternion.copy(controller.quaternion);
                            if (targetBlock.parent !== this.yaw) this.yaw.add(targetBlock);
                        }
                    }
                }
            }
        } else {
            if (this.leftBlock.parent !== this.camera) this.camera.add(this.leftBlock);
            if (this.rightBlock.parent !== this.camera) this.camera.add(this.rightBlock);
            updateBlock(this.leftBlock, this.leftAnchor, 'left', controls.activeBlockMode === 'left');
            updateBlock(this.rightBlock, this.rightAnchor, 'right', controls.activeBlockMode === 'right');
        }

        ['left', 'right'].forEach(side => {
            if (this.mixers[side]) {
                const external = this.externalHands[side];
                const isTrackingFingers = external.active && external.landmarks && (now - external.lastUpdate < 1000);
                
                // Always update the mixer so blending works correctly when tracking stops
                this.mixers[side].update(deltaTime);

                if (isTrackingFingers) {
                    this.updateFingerBones(side, external.landmarks);
                }
                
                let targetAnim = this.animationStates ? this.animationStates[side] : controls.animationStates[side];
                if (external.active && (now - external.lastUpdate < 1000)) targetAnim = external.anim;

                if (this.currentAnims[side] !== targetAnim) {
                    const oldAction = this.actions[side][this.currentAnims[side]];
                    const newAction = this.actions[side][targetAnim];
                    if (newAction) {
                        if (oldAction) oldAction.fadeOut(0.2);
                        newAction.reset().fadeIn(0.2).play();
                        this.currentAnims[side] = targetAnim;
                    }
                }
            }
        });

        this.mesh.position.x = this.yaw.position.x;
        this.mesh.position.z = this.yaw.position.z;
    }

    updateFingerBones(side, landmarks) {
        const bonesSet = this.handBones[side];
        if (!bonesSet) return;

        this.camera.updateMatrixWorld();

        let boneForward = new THREE.Vector3(0, 1, 0); 
        if (this.boneAxis === 'x') boneForward.set(1, 0, 0);
        if (this.boneAxis === 'z') boneForward.set(0, 0, 1);
        if (this.boneAxis === 'xn') boneForward.set(-1, 0, 0);
        if (this.boneAxis === 'yn') boneForward.set(0, -1, 0);
        if (this.boneAxis === 'zn') boneForward.set(0, 0, -1);

        const fingerIndices = {
            thumb: [1, 2, 3, 4],
            index: [5, 6, 7, 8],
            middle: [9, 10, 11, 12],
            ring: [13, 14, 15, 16],
            pinky: [17, 18, 19, 20]
        };

        const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion(), mInv = new THREE.Matrix4();

        for (const [finger, bones] of Object.entries(bonesSet)) {
            const indices = fingerIndices[finger];
            if (!indices) continue;
            for (let i = 0; i < bones.length; i++) {
                const bone = bones[i];
                if (!bone) continue;
                if (finger === 'thumb' && i === 0 && this.disableThumbMeta) continue;
                const idxStart = indices[i];
                const idxEnd = indices[i+1];
                v1.copy(landmarks[idxStart]); v2.copy(landmarks[idxEnd]);
                v1.x = -v1.x; v1.y = -v1.y; v2.x = -v2.x; v2.y = -v2.y;
                const targetDir = new THREE.Vector3().subVectors(v2, v1).normalize();
                
                // Transform direction from camera local space to world space
                targetDir.transformDirection(this.camera.matrixWorld);

                if (bone.parent) {
                    mInv.copy(bone.parent.matrixWorld).invert();
                    targetDir.transformDirection(mInv);
                }
                q1.setFromUnitVectors(boneForward, targetDir);
                bone.quaternion.slerp(q1, 0.4); 
            }
        }
    }
}
