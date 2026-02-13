import * as THREE from 'three';

export class World {
    constructor(scene) {
        this.scene = scene;
        this.init();
    }

    init() {
        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        // Floor
        const floorGeometry = new THREE.PlaneGeometry(100, 100);
        const floorMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x333333,
            roughness: 0.8,
            metalness: 0.2
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);

        // Grid helper
        const grid = new THREE.GridHelper(200, 100, 0x555555, 0x222222);
        this.scene.add(grid);

        // Skybox - Equirectangular
        const loader = new THREE.TextureLoader();
        loader.load('/skybox.webp', (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            texture.colorSpace = THREE.SRGBColorSpace;
            this.scene.background = texture;
            this.scene.environment = texture;
        });
    }
}
