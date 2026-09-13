import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
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

  it('rotates rear doors around the model front edge instead of their center', () => {
    const root = new Group();
    for (const [name, x] of [['DOOR2', -1], ['DOOR4', 1]] as const) {
      const door = new Mesh(new BoxGeometry(0.2, 1, 1.134), new MeshStandardMaterial());
      door.name = name;
      door.position.set(x, 0.7, 0.73);
      root.add(door);
    }
    root.updateMatrixWorld(true);
    const vehicle = createLoadedVehicle(root);

    for (const [id, x, angle] of [
      ['rearLeft', -1, -0.92],
      ['rearRight', 1, 0.92],
    ] as const) {
      const pivot = vehicle.doors[id]!;
      const door = pivot.getObjectByName(id === 'rearLeft' ? 'DOOR2' : 'DOOR4') as Mesh;
      const hingeEdge = door.localToWorld(new Vector3(0, 0, -0.567));
      const rearEdgeBefore = door.localToWorld(new Vector3(0, 0, 0.567));

      pivot.rotation.y = angle;
      root.updateMatrixWorld(true);

      const hingeEdgeAfter = door.localToWorld(new Vector3(0, 0, -0.567));
      const rearEdgeAfter = door.localToWorld(new Vector3(0, 0, 0.567));
      expect(hingeEdgeAfter.distanceTo(hingeEdge), `${id} hinge edge drift`).toBeLessThan(0.08);
      expect(rearEdgeAfter.distanceTo(rearEdgeBefore), `${id} rear edge travel`).toBeGreaterThan(0.8);
      expect(Math.abs(pivot.position.x - x)).toBeLessThan(0.06);
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

  it('culls exterior shell backfaces so cabin cameras are not covered by opaque body geometry', () => {
    const root = new Group();
    const exteriorNames = ['Car_body', 'M_BODY_inside.004', 'M_BODY_black.004', 'Car_window'];
    const exteriorMaterials = exteriorNames.map((name) => {
      const material = new MeshPhysicalMaterial({ side: DoubleSide });
      material.name = name;
      root.add(new Mesh(new BoxGeometry(1, 1, 1), material));
      return material;
    });
    const interior = new MeshPhysicalMaterial({ side: DoubleSide });
    interior.name = 'interior1.001';
    root.add(new Mesh(new BoxGeometry(1, 1, 1), interior));

    createLoadedVehicle(root);

    for (const material of exteriorMaterials) expect(material.side).toBe(FrontSide);
    expect(interior.side).toBe(DoubleSide);
  });

  it('removes only static outer-shell occluders in cabin mode and restores reflective glass', () => {
    const root = new Group();
    const outside = new Group();
    outside.name = 'OUTSIDE';
    const roofShell = new Group();
    roofShell.name = 'polySurface116';
    const interior = new Group();
    interior.name = 'INSIDE';
    const door = new Group();
    door.name = 'DOOR1';
    const windowMaterial = new MeshPhysicalMaterial({ envMapIntensity: 1 });
    windowMaterial.name = 'Car_window';
    door.add(new Mesh(new PlaneGeometry(1, 1), windowMaterial));
    root.add(outside, roofShell, interior, door);

    const vehicle = createLoadedVehicle(root);
    const exteriorWindowIntensity = windowMaterial.envMapIntensity;
    vehicle.setCabinPresentation(true);

    expect(outside.visible).toBe(false);
    expect(roofShell.visible).toBe(true);
    expect(interior.visible).toBe(true);
    expect(door.visible).toBe(true);
    expect(windowMaterial.envMapIntensity).toBe(0.25);

    vehicle.setCabinPresentation(false);
    expect(outside.visible).toBe(true);
    expect(roofShell.visible).toBe(true);
    expect(interior.visible).toBe(true);
    expect(door.visible).toBe(true);
    expect(windowMaterial.envMapIntensity).toBe(exteriorWindowIntensity);
  });

  it('adds both cabin display overlays and exposes their materials', () => {
    const root = new Group();

    const vehicle = createLoadedVehicle(root);

    const centerDisplay = root.getObjectByName('cabin-center-display') as Mesh;
    const instrumentDisplay = root.getObjectByName('cabin-instrument-display') as Mesh;
    expect(centerDisplay).toBeInstanceOf(Mesh);
    expect(centerDisplay.position.z).toBeLessThanOrEqual(-0.7);
    expect((centerDisplay.geometry as PlaneGeometry).parameters).toMatchObject({ width: 0.3, height: 0.17 });
    expect(instrumentDisplay).toBeInstanceOf(Mesh);
    expect((instrumentDisplay.geometry as PlaneGeometry).parameters).toMatchObject({ width: 0.16, height: 0.07 });
    expect(vehicle.screenMaterials).toEqual([
      centerDisplay.material,
      instrumentDisplay.material,
    ]);
    expect(vehicle.capabilities.screenGlow).toBe(true);
    for (const material of vehicle.screenMaterials as MeshStandardMaterial[]) {
      expect(material).toBeInstanceOf(MeshStandardMaterial);
      expect(material.color.getHex()).toBe(0x050608);
      expect(material.emissive.getHex()).toBe(0x000000);
      expect(material.emissiveIntensity).toBe(0);
      expect(material.map).toBeNull();
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBeGreaterThan(0.2);
      expect(material.opacity).toBeLessThan(0.6);
      expect(material.toneMapped).toBe(false);
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
