/** @jsxImportSource react */
// Sede virtuale 3D: sei reparti su un pavimento di marmo, 25 dipendenti alle loro scrivanie.
// Ogni personaggio rappresenta un agente reale: postura, schermo e anello luminoso seguono lo stato
// letto dal database (al lavoro, in attesa, in coda, completato, errore, non collegato, disattivato).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ACTIVITY_LABEL, STATUS_COLOR, STATUS_LABEL, type AgentView, type CompanyState } from './types';

// Disposizione dei reparti: due file da tre zone
const ZONES: Record<string, { x: number; z: number; tint: string; glass?: boolean }> = {
  advisory: { x: -10.5, z: -4.6, tint: '#e9e2d4', glass: true },
  direzione: { x: 0, z: -4.6, tint: '#e4dccb', glass: true },
  prodotto: { x: 10.5, z: -4.6, tint: '#ece7dd' },
  vendite: { x: -10.5, z: 4.6, tint: '#ece7dd' },
  marketing: { x: 0, z: 4.6, tint: '#efeae1' },
  operazioni: { x: 10.5, z: 4.6, tint: '#ece7dd' },
};
const ZONE_W = 9.2;
const ZONE_D = 7.4;

// Colori degli abiti per reparto, tonalità della pelle e dei capelli
const CLOTHES: Record<string, string[]> = {
  direzione: ['#1f2a36', '#2b2b30', '#38302a'],
  advisory: ['#3b3f4a', '#4a3b33', '#2f3d3a', '#443848', '#2d3545'],
  vendite: ['#7a5e36', '#5d6b7a', '#6e4f3c', '#4f5f52', '#7b6a55'],
  marketing: ['#8a4f4a', '#5f5a7a', '#a07a4f', '#4f6f7a'],
  prodotto: ['#5c6b5a', '#6a5d4f', '#4f5c6b', '#7a6f5c'],
  operazioni: ['#4a5560', '#5a4a3f', '#3f5a52'],
};
const SKIN = ['#f1d3bd', '#e0b896', '#c99a76', '#a87555', '#8a5a3c', '#f5dccb', '#d6a988'];
const HAIR = ['#2a1d14', '#4a3222', '#1b1714', '#7a5a3a', '#b9a58a', '#3a2a20', '#6b6460'];

function seedOf(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function marbleTexture() {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f1eb';
  g.fillRect(0, 0, size, size);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 28; i++) {
    g.strokeStyle = `rgba(${120 + rnd() * 40},${118 + rnd() * 30},${112 + rnd() * 30},${0.05 + rnd() * 0.16})`;
    g.lineWidth = 0.6 + rnd() * 2.6;
    g.beginPath();
    let x = rnd() * size;
    let y = rnd() * size;
    g.moveTo(x, y);
    for (let k = 0; k < 9; k++) {
      const nx = x + (rnd() - 0.3) * 220;
      const ny = y + (rnd() - 0.5) * 160;
      g.quadraticCurveTo(x + (rnd() - 0.5) * 120, y + (rnd() - 0.5) * 120, nx, ny);
      x = nx;
      y = ny;
    }
    g.stroke();
  }
  // giunti tra le lastre
  g.strokeStyle = 'rgba(150,140,125,0.35)';
  g.lineWidth = 2;
  for (let p = 0; p <= size; p += size / 2) {
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, size);
    g.moveTo(0, p);
    g.lineTo(size, p);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 7);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function Floor() {
  const tex = useMemo(() => marbleTexture(), []);
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, 0, 0]}>
      <planeGeometry args={[90, 60]} />
      <meshStandardMaterial map={tex} roughness={0.32} metalness={0.02} />
    </mesh>
  );
}

type Portal = React.MutableRefObject<HTMLElement>;

function Zone({ id, label, count, portal }: { id: string; label: string; count: number; portal?: Portal }) {
  const z = ZONES[id];
  if (!z) return null;
  return (
    <group position={[z.x, 0, z.z]}>
      <mesh position={[0, 0.015, 0]} receiveShadow>
        <boxGeometry args={[ZONE_W, 0.03, ZONE_D]} />
        <meshStandardMaterial color={z.tint} roughness={0.85} />
      </mesh>
      {[
        [-ZONE_W / 2 + 0.45, -ZONE_D / 2 + 0.45],
        [ZONE_W / 2 - 0.45, ZONE_D / 2 - 0.45],
      ].map(([px, pz], i) => (
        <group key={`p${i}`} position={[px, 0, pz]}>
          <mesh position={[0, 0.22, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.16, 0.44, 16]} />
            <meshStandardMaterial color="#f1ece2" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.78, 0]} castShadow>
            <sphereGeometry args={[0.36, 14, 12]} />
            <meshStandardMaterial color="#5f7a5a" roughness={0.9} />
          </mesh>
          <mesh position={[0.12, 1.08, 0.05]} castShadow>
            <sphereGeometry args={[0.22, 12, 10]} />
            <meshStandardMaterial color="#6f8a64" roughness={0.9} />
          </mesh>
        </group>
      ))}
      {z.glass &&
        [
          [0, -ZONE_D / 2, ZONE_W, 0],
          [-ZONE_W / 2, 0, ZONE_D, Math.PI / 2],
          [ZONE_W / 2, 0, ZONE_D, Math.PI / 2],
        ].map(([x, zz, w, r], i) => (
          <mesh key={i} position={[x, 0.9, zz]} rotation-y={r}>
            <boxGeometry args={[w, 1.8, 0.04]} />
            <meshPhysicalMaterial color="#dfe8ea" transparent opacity={0.12} roughness={0.05} metalness={0} />
          </mesh>
        ))}
      <Html position={[0, 0.05, ZONE_D / 2 - 0.35]} center transform rotation-x={-Math.PI / 2} distanceFactor={12} zIndexRange={[5, 0]} portal={portal}>
        <div className="pointer-events-none select-none whitespace-nowrap text-center" style={{ fontFamily: 'Georgia, serif' }}>
          <div style={{ fontSize: 15, letterSpacing: '0.28em', color: '#5c5850', textTransform: 'uppercase' }}>{label}</div>
          <div style={{ fontSize: 11, color: '#8f8a80' }}>{count} {count === 1 ? 'agente' : 'agenti'}</div>
        </div>
      </Html>
    </group>
  );
}

function Desk({ big, status }: { big?: boolean; status: AgentView['status'] }) {
  const w = big ? 2.1 : 1.5;
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  const on = status !== 'offline' && status !== 'disabled';
  useFrame(({ clock }) => {
    if (!screen.current) return;
    const base = status === 'working' ? 1.1 : on ? 0.45 : 0;
    screen.current.emissiveIntensity = base + (status === 'working' ? Math.sin(clock.elapsedTime * 9) * 0.12 : 0);
  });
  const glow = status === 'working' ? '#f3e3c2' : status === 'waiting' ? '#e8c77a' : status === 'failed' || status === 'blocked' ? '#d77b70' : '#cfe0e6';
  return (
    <group>
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.05, 0.8]} />
        <meshStandardMaterial color={big ? '#efe9de' : '#f6f3ee'} roughness={0.25} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[(sx * (w - 0.12)) / 2, 0.36, sz * 0.33]} castShadow>
            <cylinderGeometry args={[0.022, 0.022, 0.72, 8]} />
            <meshStandardMaterial color="#b9b3a8" roughness={0.35} metalness={0.7} />
          </mesh>
        )),
      )}
      {/* monitor rivolto verso il dipendente */}
      <group position={[0.46, 0.77, 0.02]} rotation-y={0.56}>
        <mesh position={[0, 0.06, 0]} castShadow>
          <boxGeometry args={[0.06, 0.12, 0.06]} />
          <meshStandardMaterial color="#2b2b30" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[0.62, 0.38, 0.03]} />
          <meshStandardMaterial color="#2b2b30" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.3, -0.017]} rotation-y={Math.PI}>
          <planeGeometry args={[0.58, 0.34]} />
          <meshStandardMaterial ref={screen} color="#0d0f12" emissive={glow} emissiveIntensity={on ? 0.45 : 0} roughness={0.2} />
        </mesh>
      </group>
      <mesh position={[0, 0.775, -0.22]}>
        <boxGeometry args={[0.42, 0.02, 0.14]} />
        <meshStandardMaterial color="#d6ccbb" />
      </mesh>
      {big && (
        <mesh position={[0.75, 0.8, 0.12]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.1, 16]} />
          <meshStandardMaterial color="#a8875a" metalness={0.6} roughness={0.3} />
        </mesh>
      )}
    </group>
  );
}

function Chair() {
  return (
    <group position={[0, 0, -0.75]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.5, 0.07, 0.5]} />
        <meshStandardMaterial color="#26262a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.82, -0.24]} castShadow>
        <boxGeometry args={[0.48, 0.62, 0.06]} />
        <meshStandardMaterial color="#26262a" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.42, 8]} />
        <meshStandardMaterial color="#5c5850" metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.04, 16]} />
        <meshStandardMaterial color="#3a3a3e" metalness={0.5} />
      </mesh>
    </group>
  );
}

/** Personaggio seduto, costruito con forme semplici e animato secondo lo stato dell'agente. */
function Person({ agent, reduced }: { agent: AgentView; reduced: boolean }) {
  const seed = seedOf(agent.id);
  const offline = agent.status === 'offline' || agent.status === 'disabled';
  const outfit = (CLOTHES[agent.department] ?? CLOTHES.vendite)[seed % (CLOTHES[agent.department]?.length ?? 1)];
  const skin = SKIN[seed % SKIN.length];
  const hair = HAIR[(seed >> 3) % HAIR.length];
  const longHair = (seed >> 5) % 2 === 0;
  const grey = '#a9a49b';
  const mat = (c: string) => ({ color: offline ? grey : c, transparent: agent.status === 'disabled', opacity: agent.status === 'disabled' ? 0.35 : 1, roughness: 0.75 });
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const phase = (seed % 100) / 10;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    const k = reduced ? 0.25 : 1;
    if (!body.current || !head.current || !armL.current || !armR.current) return;
    body.current.position.y = Math.sin(t * 1.6) * 0.006 * k; // respiro
    switch (agent.status) {
      case 'working': {
        armL.current.rotation.x = -1.15 + Math.sin(t * 14) * 0.09 * k;
        armR.current.rotation.x = -1.15 + Math.sin(t * 14 + 1.7) * 0.09 * k;
        armL.current.rotation.z = 0.12;
        armR.current.rotation.z = -0.12;
        head.current.rotation.x = 0.12 + Math.sin(t * 2.2) * 0.04 * k;
        head.current.rotation.y = Math.sin(t * 0.7) * 0.18 * k;
        break;
      }
      case 'waiting': {
        armL.current.rotation.x = -1.35;
        armR.current.rotation.x = -1.35;
        armL.current.rotation.z = 0.75;
        armR.current.rotation.z = -0.75; // braccia conserte
        head.current.rotation.x = -0.05;
        head.current.rotation.y = Math.sin(t * 0.5) * 0.45 * k; // si guarda intorno
        break;
      }
      case 'failed':
      case 'blocked': {
        armL.current.rotation.x = -0.6;
        armR.current.rotation.x = -2.2; // mano alla testa
        armR.current.rotation.z = -0.35;
        armL.current.rotation.z = 0.1;
        head.current.rotation.x = 0.35;
        head.current.rotation.y = 0;
        break;
      }
      case 'completed': {
        armL.current.rotation.x = -0.4;
        armR.current.rotation.x = -2.6 + Math.sin(t * 3) * 0.15 * k; // braccio alzato
        armR.current.rotation.z = -0.2;
        armL.current.rotation.z = 0.1;
        head.current.rotation.x = -0.1;
        head.current.rotation.y = 0.2;
        break;
      }
      case 'offline':
      case 'disabled': {
        armL.current.rotation.x = -0.25;
        armR.current.rotation.x = -0.25;
        armL.current.rotation.z = 0.05;
        armR.current.rotation.z = -0.05;
        head.current.rotation.x = 0.45; // testa china: non operativo
        head.current.rotation.y = 0;
        break;
      }
      default: {
        armL.current.rotation.x = -0.95 + Math.sin(t * 0.8) * 0.03 * k;
        armR.current.rotation.x = -0.95;
        armL.current.rotation.z = 0.08;
        armR.current.rotation.z = -0.08;
        head.current.rotation.x = 0.02;
        head.current.rotation.y = Math.sin(t * 0.35) * 0.25 * k;
      }
    }
  });

  return (
    <group position={[0, 0, -0.72]}>
      <group ref={body}>
        {/* gambe */}
        {[-0.1, 0.1].map((x) => (
          <group key={x}>
            <mesh position={[x, 0.5, 0.2]} rotation-x={Math.PI / 2} castShadow>
              <capsuleGeometry args={[0.07, 0.32, 4, 10]} />
              <meshStandardMaterial {...mat('#2b2b30')} />
            </mesh>
            <mesh position={[x, 0.26, 0.42]} castShadow>
              <capsuleGeometry args={[0.06, 0.34, 4, 10]} />
              <meshStandardMaterial {...mat('#2b2b30')} />
            </mesh>
            <mesh position={[x, 0.05, 0.47]} castShadow>
              <boxGeometry args={[0.1, 0.06, 0.2]} />
              <meshStandardMaterial {...mat('#1a1a1c')} />
            </mesh>
          </group>
        ))}
        {/* busto */}
        <mesh position={[0, 0.83, 0]} castShadow>
          <capsuleGeometry args={[0.17, 0.32, 6, 14]} />
          <meshStandardMaterial {...mat(outfit)} />
        </mesh>
        <mesh position={[0, 1.02, 0.03]}>
          <boxGeometry args={[0.14, 0.06, 0.02]} />
          <meshStandardMaterial {...mat('#f1ece2')} />
        </mesh>
        {/* braccia: perno alla spalla */}
        {(
          [
            [armL, -0.22],
            [armR, 0.22],
          ] as const
        ).map(([ref, x]) => (
          <group key={x} ref={ref} position={[x, 1.0, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <capsuleGeometry args={[0.055, 0.3, 4, 10]} />
              <meshStandardMaterial {...mat(outfit)} />
            </mesh>
            <mesh position={[0, -0.41, 0]} castShadow>
              <sphereGeometry args={[0.05, 12, 10]} />
              <meshStandardMaterial {...mat(skin)} />
            </mesh>
          </group>
        ))}
        {/* testa */}
        <group ref={head} position={[0, 1.13, 0]}>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.05, 0.055, 0.08, 10]} />
            <meshStandardMaterial {...mat(skin)} />
          </mesh>
          <mesh position={[0, 0.17, 0]} castShadow>
            <sphereGeometry args={[0.12, 20, 16]} />
            <meshStandardMaterial {...mat(skin)} />
          </mesh>
          <mesh position={[0, 0.21, -0.015]} scale={[1.05, longHair ? 1.0 : 0.82, 1.05]}>
            <sphereGeometry args={[0.122, 20, 16, 0, Math.PI * 2, 0, Math.PI / (longHair ? 1.7 : 2.1)]} />
            <meshStandardMaterial {...mat(hair)} />
          </mesh>
          {longHair && (
            <mesh position={[0, 0.11, -0.07]}>
              <boxGeometry args={[0.2, 0.2, 0.06]} />
              <meshStandardMaterial {...mat(hair)} />
            </mesh>
          )}
          {[-0.04, 0.04].map((x) => (
            <mesh key={x} position={[x, 0.18, 0.112]}>
              <sphereGeometry args={[0.013, 8, 6]} />
              <meshStandardMaterial color={offline ? '#6b6460' : '#1a1a1c'} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

function StatusRing({ status, selected }: { status: AgentView['status']; selected: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const color = STATUS_COLOR[status];
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = status === 'working' || status === 'waiting' ? 1 + Math.sin(clock.elapsedTime * 3) * 0.06 : 1;
    ref.current.scale.setScalar(pulse * (selected ? 1.12 : 1));
  });
  if (status === 'offline' || status === 'disabled') {
    return selected ? (
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, -0.4]}>
        <ringGeometry args={[0.95, 1.02, 48]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    ) : null;
  }
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, 0.04, -0.4]}>
      <ringGeometry args={[0.92, selected ? 1.06 : 1.0, 48]} />
      <meshBasicMaterial color={selected ? '#ffffff' : color} transparent opacity={selected ? 1 : 0.85} />
    </mesh>
  );
}

function Workstation({ agent, position, selected, onSelect, reduced, portal }: { agent: AgentView; position: [number, number, number]; selected: boolean; onSelect: (id: string) => void; reduced: boolean; portal?: Portal }) {
  const [hover, setHover] = useState(false);
  const big = agent.id === '01-ai-ceo';
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(agent.id);
  };
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hover]);
  return (
    <group
      position={position}
      onClick={click}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      <StatusRing status={agent.status} selected={selected || hover} />
      <Chair />
      <Person agent={agent} reduced={reduced} />
      <Desk big={big} status={agent.status} />
      <Html position={[0, 1.85, -0.7]} center zIndexRange={[20, 10]} portal={portal}>
        <button
          type="button"
          onClick={() => onSelect(agent.id)}
          className="whitespace-nowrap rounded-full border px-2.5 py-1 text-left shadow-sm"
          style={{
            background: selected ? '#1a1a1c' : 'rgba(248,246,241,0.94)',
            color: selected ? '#f8f6f1' : '#1a1a1c',
            borderColor: selected ? '#1a1a1c' : 'rgba(26,26,28,0.12)',
            fontSize: 11,
            lineHeight: 1.15,
            opacity: agent.status === 'disabled' ? 0.6 : 1,
            pointerEvents: 'auto',
          }}
          aria-label={`${agent.name}: ${STATUS_LABEL[agent.status]}`}
        >
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: STATUS_COLOR[agent.status], marginRight: 6 }} />
          <strong style={{ fontWeight: 600 }}>{agent.name}</strong>
          {(selected || hover || agent.status === 'working') && (
            <span style={{ display: 'block', fontSize: 10.5, opacity: 0.75, marginTop: 2 }}>
              {agent.status === 'working' && agent.activity ? `${ACTIVITY_LABEL[agent.activity] ?? agent.activity} · ` : ''}
              {STATUS_LABEL[agent.status]}
            </span>
          )}
        </button>
      </Html>
    </group>
  );
}

function deskSlots(n: number): [number, number][] {
  const back = Math.min(3, n);
  const front = n - back;
  const out: [number, number][] = [];
  for (let i = 0; i < back; i++) out.push([(i - (back - 1) / 2) * 3.0, -1.55]);
  for (let i = 0; i < front; i++) out.push([(i - (front - 1) / 2) * 3.0, 1.75]);
  return out;
}

export function positionsFor(agents: AgentView[]): Record<string, [number, number, number]> {
  const pos: Record<string, [number, number, number]> = {};
  const byDept: Record<string, AgentView[]> = {};
  for (const a of agents) (byDept[a.department] ??= []).push(a);
  for (const [dept, list] of Object.entries(byDept)) {
    const z = ZONES[dept] ?? { x: 0, z: 12 };
    const sorted = [...list].sort((a, b) => (a.id === '01-ai-ceo' ? -1 : b.id === '01-ai-ceo' ? 1 : a.id.localeCompare(b.id)));
    // il CEO al centro della direzione
    const slots = deskSlots(sorted.length);
    if (dept === 'direzione' && sorted.length >= 2) [slots[0], slots[1]] = [slots[1], slots[0]];
    sorted.forEach((a, i) => (pos[a.id] = [z.x + slots[i][0], 0, z.z + slots[i][1]]));
  }
  return pos;
}

function CameraRig({ target }: { target: [number, number, number] | null }) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const goal = useMemo(() => new THREE.Vector3(), []);
  const prev = useMemo(() => new THREE.Vector3(0, 0, -1.5), []);
  const step = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const c = controls.current;
    if (!c) return;
    // la camera si sposta insieme al punto osservato: la vista non ruota quando si seleziona un agente
    goal.set(target ? target[0] : 0, target ? 0.8 : 0, target ? target[2] : -1.5);
    step.copy(goal).sub(c.target).multiplyScalar(0.07);
    if (step.lengthSq() > 1e-8) {
      c.target.add(step);
      camera.position.add(step);
    }
    prev.copy(c.target);
    c.update();
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan
      enableDamping
      target={[0, 0, -1.5]}
      minDistance={6}
      maxDistance={42}
      minPolarAngle={0.25}
      maxPolarAngle={1.25}
    />
  );
}

export default function Scene({ state, selected, onSelect, portal }: { state: CompanyState; selected: string | null; onSelect: (id: string | null) => void; portal?: Portal }) {
  const pos = useMemo(() => positionsFor(state.agents), [state.agents]);
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of state.agents) c[a.department] = (c[a.department] ?? 0) + 1;
    return c;
  }, [state.agents]);
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 14, 15.5], fov: 44, near: 0.1, far: 200 }}
      onPointerMissed={() => onSelect(null)}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
    >
      <color attach="background" args={['#ece6db']} />
      <fog attach="fog" args={['#ece6db', 28, 70]} />
      <ambientLight intensity={0.8} />
      <hemisphereLight args={['#fffaf0', '#cbbfa8', 0.75]} />
      <directionalLight
        position={[12, 22, 10]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-bias={-0.0004}
      />
      <Floor />
      {state.departments.map((d) => (
        <Zone key={d.id} id={d.id} label={d.label} count={counts[d.id] ?? 0} portal={portal} />
      ))}
      {state.agents.map((a) => (
        <Workstation key={a.id} agent={a} position={pos[a.id] ?? [0, 0, 12]} selected={selected === a.id} onSelect={onSelect} reduced={reduced} portal={portal} />
      ))}
      <CameraRig target={selected ? pos[selected] ?? null : null} />
    </Canvas>
  );
}
