import { describe, expect, it } from 'vitest';
import {
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Texture,
  Vector3,
} from 'three';
import { createLoadedVehicle } from '../src/scene/load-vehicle';

function createFourDoorFixture() {
  const root = new Group();
  const body = new Group();
  body.name = 'body';
  root.add(body);

  ['DOOR1', 'DOOR2', 'DOOR3', 'DOOR4'].forEach((name, index) => {
    const door = new Group();
    door.name = name;
    door.position.set(index * 0.2, index * 0.1, index * -0.3);
    body.add(door);
  });

  return { root, body };
}

describe('createLoadedVehicle', () => {
  it('creates four independent hinges while preserving each door world transform', () => {
    const { root, body } = createFourDoorFixture();
    root.updateMatrixWorld(true);
    const originalWorldPositions = new Map(
      ['DOOR1', 'DOOR2', 'DOOR3', 'DOOR4'].map((name) => [
        name,
        root.getObjectByName(name)!.getWorldPosition(new Vector3()).clone(),
      ]),
    );

    const vehicle = createLoadedVehicle(root);

    expect(Object.keys(vehicle.doors).sort()).toEqual([
      'frontLeft',
      'frontRight',
      'rearLeft',
      'rearRight',
    ]);
    expect(new Set(Object.values(vehicle.doors)).size).toBe(4);
    expect(vehicle.capabilities.doors).toEqual({
      frontLeft: true,
      frontRight: true,
      rearLeft: true,
      rearRight: true,
    });
    expect(body.parent).toBe(root);
    for (const name of ['DOOR1', 'DOOR2', 'DOOR3', 'DOOR4']) {
      const actualPosition = root.getObjectByName(name)!.getWorldPosition(new Vector3());
      expect(actualPosition.distanceTo(originalWorldPositions.get(name)!)).toBeLessThan(1e-10);
    }
  });

  it('reports unavailable doors without throwing for a partial model', () => {
    const root = new Group();
    const door = new Group();
    door.name = 'DOOR1';
    root.add(door);

    const vehicle = createLoadedVehicle(root);

    expect(Object.keys(vehicle.doors)).toEqual(['frontLeft']);
    expect(vehicle.capabilities.doors).toEqual({
      frontLeft: true,
      frontRight: false,
      rearLeft: false,
      rearRight: false,
    });
  });

  it('adds both cabin display overlays and exposes their materials', () => {
    const root = new Group();

    const vehicle = createLoadedVehicle(root);

    const centerDisplay = root.getObjectByName('cabin-center-display') as Mesh;
    const instrumentDisplay = root.getObjectByName('cabin-instrument-display') as Mesh;
    expect(centerDisplay).toBeInstanceOf(Mesh);
    expect(instrumentDisplay).toBeInstanceOf(Mesh);
    expect(vehicle.screenMaterials).toEqual([
      centerDisplay.material,
      instrumentDisplay.material,
    ]);
    expect(vehicle.capabilities.screenGlow).toBe(true);
    for (const material of vehicle.screenMaterials as MeshStandardMaterial[]) {
      expect(material.color.getHex()).toBe(0x010305);
      expect(material.emissiveIntensity).toBeLessThanOrEqual(0.6);
    }
  });
});

describe('LoadedVehicle lifecycle', () => {
  it('removes the vehicle and disposes shared and display GPU resources exactly once', () => {
    const parent = new Scene();
    const root = new Group();
    const geometry = new BufferGeometry();
    const texture = new Texture();
    const sharedMaterial = new MeshStandardMaterial({ map: texture });
    const secondMaterial = new MeshStandardMaterial({ emissiveMap: texture });
    const disposeCounts = {
      geometry: 0,
      texture: 0,
      sharedMaterial: 0,
      secondMaterial: 0,
      displayGeometries: 0,
      displayMaterials: 0,
    };
    geometry.addEventListener('dispose', () => disposeCounts.geometry += 1);
    texture.addEventListener('dispose', () => disposeCounts.texture += 1);
    sharedMaterial.addEventListener('dispose', () => disposeCounts.sharedMaterial += 1);
    secondMaterial.addEventListener('dispose', () => disposeCounts.secondMaterial += 1);

    root.add(
      new Mesh(geometry, sharedMaterial),
      new Mesh(geometry, [sharedMaterial, secondMaterial]),
    );
    parent.add(root);
    const vehicle = createLoadedVehicle(root);
    for (const name of ['cabin-center-display', 'cabin-instrument-display']) {
      const display = root.getObjectByName(name) as Mesh;
      display.geometry.addEventListener('dispose', () => disposeCounts.displayGeometries += 1);
      (display.material as MeshStandardMaterial).addEventListener(
        'dispose',
        () => disposeCounts.displayMaterials += 1,
      );
    }

    vehicle.dispose();
    vehicle.dispose();

    expect(root.parent).toBeNull();
    expect(parent.children).not.toContain(root);
    expect(disposeCounts).toEqual({
      geometry: 1,
      texture: 1,
      sharedMaterial: 1,
      secondMaterial: 1,
      displayGeometries: 2,
      displayMaterials: 2,
    });
  });
});
