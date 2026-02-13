import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

export class HandTracker {
    constructor(player) {
        this.player = player;
        this.config = {
            cameraFov: 60,
            zOffset: 0.8,
            palmActualSize: 0.08,
            eyeHeight: -0.1, 
            inverse: true,
            lerpAmount: 0.20,
            separation: 3.0,
            handTracking: false,
            fingerTracking: false
        };
        this.handLandmarker = null;
        this.video = document.getElementById("webcam");
        this.debugCanvas = document.getElementById("landmark-canvas");
        this.debugCtx = this.debugCanvas?.getContext('2d');
        this.showDebug = false;
        this.active = false;
        this.stream = null;

        this.hands = {
            left: { pos: new THREE.Vector3(-0.5, 0, -1), quat: new THREE.Quaternion() },
            right: { pos: new THREE.Vector3(0.5, 0, -1), quat: new THREE.Quaternion() }
        };

        this._m4 = new THREE.Matrix4();
        this._vWrist = new THREE.Vector3();
        this._vIndex = new THREE.Vector3();
        this._vPinky = new THREE.Vector3();
        this._vForward = new THREE.Vector3();
        this._vRight = new THREE.Vector3();
        this._vUp = new THREE.Vector3();
        this._correctionQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

        this.init();
    }

    async init() {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO", numHands: 2
        });
    }

    async start() {
        if (this.active) return;
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
            this.video.srcObject = this.stream;
            this.video.play();
            this.active = true;
            this.predict();
        } catch (e) {
            console.error("Camera access failed:", e);
        }
    }

    stop() {
        this.active = false;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.video) {
            this.video.pause();
            this.video.srcObject = null;
        }
        this.player.externalHands.left.active = false;
        this.player.externalHands.right.active = false;
    }

    predict() {
        if (!this.active) return;
        
        if (this.handLandmarker && this.video.readyState >= 2) {
            const results = this.handLandmarker.detectForVideo(this.video, performance.now());
            
            if (this.showDebug && this.debugCtx) {
                this.debugCanvas.style.display = 'block';
                this.drawDebug(results);
            } else {
                this.debugCanvas.style.display = 'none';
            }

            if (results.landmarks) {
                results.landmarks.forEach((landmarks, i) => {
                    const label = results.handednesses[i][0].categoryName;
                    const side = (label === "Left") ? 'right' : 'left'; 
                    
                    let targetPos = null;
                    let targetQuat = null;

                    if (this.config.handTracking) {
                        const extractedPos = this.extractWorldPosition(landmarks);
                        const extractedQuat = this.extractRotation(landmarks, side);
                        this.hands[side].pos.lerp(extractedPos, this.config.lerpAmount);
                        this.hands[side].quat.slerp(extractedQuat, this.config.lerpAmount);
                        targetPos = this.hands[side].pos;
                        targetQuat = this.hands[side].quat;
                    }
                    
                    let fingerData = null;
                    if (this.config.fingerTracking) {
                        fingerData = landmarks.map(p => ({ x: p.x, y: p.y, z: p.z }));
                    }

                    this.player.applyExternalHand(
                        side, 
                        targetPos, 
                        targetQuat, 
                        'Default',
                        'camera',
                        fingerData
                    );
                });
            }
        }
        requestAnimationFrame(() => this.predict());
    }

    drawDebug(results) {
        const ctx = this.debugCtx;
        const canvas = this.debugCanvas;
        
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);

        if (results.landmarks) {
            results.landmarks.forEach((landmarks, i) => {
                const label = results.handednesses[i][0].categoryName;
                ctx.fillStyle = label === "Left" ? "#e74c3c" : "#3498db";
                ctx.strokeStyle = "white";
                ctx.lineWidth = 2;

                landmarks.forEach(point => {
                    ctx.beginPath();
                    ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                });
            });
        }
        ctx.restore();
    }

    extractWorldPosition(landmarks) {
        const palmPoints = [0, 1, 2, 5, 9, 13, 17];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        palmPoints.forEach(idx => {
            const x = landmarks[idx].x; const y = landmarks[idx].y;
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        });

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const palmSize = Math.max(maxX - minX, maxY - minY);

        const palmAngle = this.config.cameraFov * palmSize;
        const palmDistance = (this.config.palmActualSize / 2) / Math.tan(THREE.MathUtils.degToRad(palmAngle / 2));
        
        const frustumWidth = 2 * palmDistance * Math.tan(THREE.MathUtils.degToRad(this.config.cameraFov / 2));
        
        let palmX = frustumWidth * (0.5 - centerX) * this.config.separation;
        let palmY = frustumWidth * (0.5 - centerY);

        let depth;
        if (this.config.inverse) {
            depth = -(this.config.zOffset - palmDistance);
        } else {
            depth = -(palmDistance + this.config.zOffset);
        }

        return new THREE.Vector3(palmX, palmY + this.config.eyeHeight, depth);
    }

    extractRotation(landmarks, side) {
        this._vWrist.copy(landmarks[0]);
        this._vIndex.copy(landmarks[5]);
        this._vPinky.copy(landmarks[17]);
        
        [this._vWrist, this._vIndex, this._vPinky].forEach(v => { v.x = -v.x; v.y = -v.y; });

        this._vForward.subVectors(this._vIndex, this._vWrist).normalize();
        this._vRight.subVectors(this._vPinky, this._vIndex).normalize();

        if (side === 'right') {
            this._vUp.crossVectors(this._vForward, this._vRight).normalize();
        } else {
            this._vUp.crossVectors(this._vRight, this._vForward).normalize();
        }

        this._vRight.crossVectors(this._vUp, this._vForward).normalize();

        this._m4.makeBasis(this._vRight, this._vUp, this._vForward);
        const quat = new THREE.Quaternion().setFromRotationMatrix(this._m4);
        quat.multiply(this._correctionQuat);
        
        return quat;
    }
}
