// Statua in marmo generata in tempo reale (WebGL, nessun modello esterno): all'apertura un blocco di
// marmo viene "scolpito" e ne emerge una figura originale ispirata ai Prigioni di Michelangelo; poi la
// statua ruota lentamente e segue il puntatore. Se WebGL non c'è, resta l'immagine di riserva.
// Con "riduci animazioni" si disegna un solo fotogramma, già scolpito.

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FRAG = `precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uCarve;
uniform float uYaw;
uniform float uPitch;
uniform vec2 uShift;
uniform float uZoom;
uniform float uMirror;

mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c);}
float hash3(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float s=0.0,a=0.5;for(int i=0;i<4;i++){s+=a*noise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=0.5;}return s;}
float smin(float a,float b,float k){float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0);return mix(b,a,h)-k*h*(1.0-h);}
float sdEll(vec3 p,vec3 r){float k0=length(p/r);float k1=length(p/(r*r));return k0*(k0-1.0)/k1;}
float sdBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0);}
float sdRC(vec3 p,vec3 a,vec3 b,float r1,float r2){
  vec3 ba=b-a;float l2=dot(ba,ba);float rr=r1-r2;float a2=l2-rr*rr;float il2=1.0/l2;
  vec3 pa=p-a;float y=dot(pa,ba);float z=y-l2;vec3 xv=pa*l2-ba*y;float x2=dot(xv,xv);
  float y2=y*y*l2;float z2=z*z*l2;float k=sign(rr)*rr*rr*x2;
  if(sign(z)*a2*z2>k)return sqrt(x2+z2)*il2-r2;
  if(sign(y)*a2*y2<k)return sqrt(x2+y2)*il2-r1;
  return (sqrt(x2*a2*il2)+y*rr)*il2-r1;}

// Figura: torso in contrapposto, braccio destro alzato dietro la testa, sinistro sul petto.
float figure(vec3 p){
  vec3 q=p;
  q.xz=rot(0.22*smoothstep(-0.4,0.7,q.y))*q.xz;
  q.xy=rot(-0.06*smoothstep(-0.2,0.6,q.y))*q.xy;
  float d=sdEll(q-vec3(0.0,0.31,-0.01),vec3(0.285,0.29,0.175));
  d=smin(d,sdEll(q-vec3(0.13,0.415,0.085),vec3(0.15,0.075,0.062)),0.03);
  d=smin(d,sdEll(q-vec3(-0.13,0.415,0.085),vec3(0.15,0.075,0.062)),0.03);
  d=smin(d,sdEll(q-vec3(0.0,0.03,0.02),vec3(0.205,0.24,0.14)),0.09);
  for(int i=0;i<3;i++){float y=0.15-float(i)*0.095;
    d=smin(d,sdEll(q-vec3(0.05,y,0.122),vec3(0.047,0.04,0.03)),0.035);
    d=smin(d,sdEll(q-vec3(-0.05,y,0.122),vec3(0.047,0.04,0.03)),0.035);}
  d=smin(d,sdEll(q-vec3(0.17,-0.06,0.0),vec3(0.095,0.17,0.12)),0.07);
  d=smin(d,sdEll(q-vec3(-0.17,-0.06,0.0),vec3(0.095,0.17,0.12)),0.07);
  d=smin(d,sdEll(q-vec3(0.0,-0.27,-0.01),vec3(0.225,0.16,0.155)),0.09);
  for(int i=0;i<3;i++){float y=0.27-float(i)*0.07;
    d=smin(d,sdEll(q-vec3(0.215,y,0.06),vec3(0.05,0.028,0.05)),0.03);
    d=smin(d,sdEll(q-vec3(-0.215,y,0.06),vec3(0.05,0.028,0.05)),0.03);}
  d=smin(d,sdRC(q,vec3(0.12,-0.33,0.02),vec3(0.17,-0.98,0.15),0.145,0.105),0.07);
  d=smin(d,sdRC(q,vec3(-0.12,-0.33,0.0),vec3(-0.14,-0.98,-0.02),0.145,0.105),0.07);
  d=smin(d,sdEll(q-vec3(0.0,0.56,-0.04),vec3(0.25,0.065,0.10)),0.07);
  d=smin(d,sdEll(q-vec3(0.335,0.51,-0.01),vec3(0.11,0.125,0.115)),0.05);
  d=smin(d,sdEll(q-vec3(-0.335,0.51,-0.01),vec3(0.11,0.125,0.115)),0.05);
  d=smin(d,sdRC(q,vec3(0.0,0.55,-0.01),vec3(0.015,0.73,0.005),0.08,0.066),0.05);
  vec3 e1=vec3(0.42,0.93,0.0);
  d=smin(d,sdRC(q,vec3(0.35,0.53,0.0),e1,0.088,0.064),0.04);
  d=smin(d,sdRC(q,e1,vec3(0.13,1.04,-0.02),0.062,0.048),0.03);
  d=smin(d,sdEll(q-vec3(0.09,1.03,-0.01),vec3(0.06,0.04,0.055)),0.02);
  vec3 e2=vec3(-0.41,0.15,0.06);
  d=smin(d,sdRC(q,vec3(-0.35,0.51,0.0),e2,0.088,0.064),0.04);
  d=smin(d,sdRC(q,e2,vec3(-0.12,0.31,0.19),0.062,0.048),0.03);
  d=smin(d,sdEll(q-vec3(-0.07,0.34,0.2),vec3(0.065,0.038,0.055)),0.02);
  vec3 h=q-vec3(0.025,0.86,0.01);
  h.yz=rot(-0.35)*h.yz;
  h.xz=rot(0.4)*h.xz;
  float hd=sdEll(h-vec3(0.0,0.03,-0.01),vec3(0.10,0.125,0.115));
  hd=smin(hd,sdEll(h-vec3(0.0,-0.05,0.035),vec3(0.075,0.075,0.085)),0.04);
  hd=smin(hd,sdRC(h,vec3(0.0,0.0,0.105),vec3(0.0,-0.035,0.125),0.012,0.016),0.012);
  hd=smin(hd,sdEll(h-vec3(0.0,0.035,0.085),vec3(0.075,0.02,0.035)),0.02);
  float hair=smoothstep(0.0,0.06,h.y+0.01-h.z*0.4);
  hd-=hair*0.012*(noise(h*38.0)-0.3);
  return smin(d,hd,0.04);
}

// Blocco di marmo: viene tolto tutto ciò che sta davanti al fronte di scavo.
float stone(vec3 p){
  float b=sdBox(p-vec3(0.0,0.08,-0.12),vec3(0.62,1.12,0.42))-0.02;
  float zf=mix(-0.13,0.4,smoothstep(-0.42,-0.8,p.y))+0.07*(fbm(p*3.0)-0.5);
  float zc=mix(0.62,zf,uCarve);
  float r=max(b,p.z-zc);
  r+=0.014*(fbm(p*13.0)-0.5)+0.004*sin(dot(p,vec3(38.0,24.0,0.0)));
  return r;
}

vec3 toLocal(vec3 p){
  p.x*=uMirror;
  p-=vec3(0.0,0.1,-0.05);
  p.xz=rot(uYaw)*p.xz;
  p.yz=rot(uPitch)*p.yz;
  return p+vec3(0.0,0.1,-0.05);
}
float map(vec3 p){p=toLocal(p);return smin(figure(p),stone(p),0.03);}

vec3 calcNormal(vec3 p){vec2 e=vec2(0.0015,-0.0015);
  return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx));}
float softShadow(vec3 ro,vec3 rd){float res=1.0;float t=0.02;
  for(int i=0;i<22;i++){float h=map(ro+rd*t);res=min(res,10.0*h/t);t+=clamp(h,0.015,0.2);if(res<0.02||t>2.5)break;}
  return clamp(res,0.0,1.0);}
float calcAO(vec3 p,vec3 n){float o=0.0,s=1.0;for(int i=0;i<4;i++){float h=0.02+0.07*float(i);o+=(h-map(p+n*h))*s;s*=0.7;}
  return clamp(1.0-2.2*o,0.0,1.0);}

vec3 marble(vec3 p,float polish){
  float v=fbm(p*2.2);
  float vein=1.0-smoothstep(0.0,0.07,abs(sin((p.x*1.3+p.y*2.1+p.z*0.7)*3.0+v*7.0)));
  float fine=1.0-smoothstep(0.0,0.035,abs(sin((p.x*2.1-p.y*1.2+p.z)*7.0+fbm(p*5.0)*9.0)));
  vec3 c=vec3(0.92,0.905,0.88)*(0.95+0.05*noise(p*30.0));
  c=mix(c,vec3(0.52,0.55,0.59),vein*0.32+fine*0.1);
  return mix(c*vec3(0.86,0.84,0.8),c,polish);
}

vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}

void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  // sfondo: grafite con una luce calda che cade da destra
  vec2 c0=uv-uShift;
  vec3 bg=mix(vec3(0.035,0.035,0.04),vec3(0.11,0.105,0.1),smoothstep(-0.9,0.9,uv.x*0.25+uv.y*0.6+0.25));
  bg+=vec3(0.2,0.17,0.13)*exp(-dot(c0-vec2(0.05,0.12),c0-vec2(0.05,0.12))*3.2)*0.55;
  vec3 col=bg;
  vec3 ro=vec3(0.0,0.15,3.4);
  vec3 rd=normalize(vec3((uv-uShift)*0.68*uZoom,-1.0));
  // sfera che contiene la scultura: fuori da lì solo sfondo
  vec3 oc=ro-vec3(0.0,0.1,-0.05);
  float bq=dot(oc,rd);float cq=dot(oc,oc)-1.5*1.5;float disc=bq*bq-cq;
  if(disc>0.0){
    float t=max(0.0,-bq-sqrt(disc));float tmax=-bq+sqrt(disc);
    bool hit=false;
    for(int i=0;i<96;i++){vec3 p=ro+rd*t;float d=map(p);if(d<0.0012*t){hit=true;break;}t+=d*0.9;if(t>tmax)break;}
    if(hit){
      vec3 p=ro+rd*t;vec3 n=calcNormal(p);vec3 lp=toLocal(p);
      float fig=figure(lp);float st=stone(lp);
      float polish=smoothstep(-0.004,0.02,st-fig);
      float fresh=(1.0-polish)*smoothstep(0.08,0.0,abs(lp.z-mix(0.62,-0.13,uCarve)))*(1.0-uCarve)*1.5;
      vec3 alb=marble(lp,polish);
      vec3 L1=normalize(vec3(0.85,0.55,0.4));
      vec3 L2=normalize(vec3(-0.85,0.3,-0.45));
      float sh=softShadow(p+n*0.004,L1);
      float ao=calcAO(p,n);
      float dif=clamp((dot(n,L1)+0.12)/1.12,0.0,1.0);
      vec3 hv=normalize(L1-rd);
      float spe=pow(clamp(dot(n,hv),0.0,1.0),mix(10.0,70.0,polish))*mix(0.04,0.4,polish)*sh;
      float fre=pow(clamp(1.0+dot(n,rd),0.0,1.0),3.0);
      col=alb*(vec3(1.0,0.93,0.82)*2.0*dif*mix(0.18,1.0,sh)+vec3(0.3,0.33,0.4)*(0.55+0.45*n.y)*0.32*ao);
      col+=alb*vec3(0.5,0.58,0.72)*pow(clamp(dot(n,L2),0.0,1.0),1.4)*1.1*ao;
      col+=alb*vec3(1.0,0.86,0.72)*fre*0.28*ao*polish;
      col+=spe*vec3(1.0,0.96,0.9);
      col+=fresh*vec3(0.32,0.28,0.22);
      float fog=smoothstep(2.6,4.6,t);
      col=mix(col,bg,fog);
    }
  }
  // polvere di marmo sospesa nella luce
  vec2 g=uv*vec2(26.0,26.0)+vec2(0.0,-uTime*0.35);
  vec2 id=floor(g);vec2 f=fract(g)-0.5;
  float rnd=hash2(id);
  vec2 off=vec2(hash2(id+3.1),hash2(id+7.7))-0.5;
  float mote=smoothstep(0.06,0.0,length(f-off*0.7))*step(0.86,rnd);
  float beam=exp(-dot(c0-vec2(0.1,0.2),c0-vec2(0.1,0.2))*2.0);
  col+=vec3(1.0,0.92,0.8)*mote*beam*(0.35+0.65*(1.0-uCarve*0.6))*(0.5+0.5*sin(uTime*1.7+rnd*30.0));
  col*=1.0-0.35*dot(uv*0.8,uv*0.8);
  col=aces(col*1.05);
  col=pow(col,vec3(0.4545));
  col+=(hash2(gl_FragCoord.xy+fract(uTime)*100.0)-0.5)*0.02;
  gl_FragColor=vec4(col,1.0);
}`;

type Opts = {
  onReady?: () => void;
  /** 'intro': si scolpisce all'apertura; 'scroll': si scolpisce mentre la sezione scorre nello schermo */
  mode?: 'intro' | 'scroll';
  /** figura specchiata, per variare la seconda statua */
  mirror?: boolean;
  /** lato dello schermo in cui sta la statua sugli schermi larghi */
  side?: 'left' | 'right';
};

export function mountStatue(canvas: HTMLCanvasElement, opts: Opts = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  try {
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
  } catch (e) {
    console.warn('statua: WebGL non disponibile', e);
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n: string) => gl.getUniformLocation(prog, n);
  const U = { mirror: u('uMirror'), res: u('uRes'), time: u('uTime'), carve: u('uCarve'), yaw: u('uYaw'), pitch: u('uPitch'), shift: u('uShift'), zoom: u('uZoom') };

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const debugT = Number(new URLSearchParams(location.search).get('statueTime') ?? NaN);
  // risoluzione interna: si abbassa da sola se il dispositivo fatica
  let scale = Math.min(1, (window.devicePixelRatio || 1) * 0.8);
  let maxSide = 960;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const k = Math.min(scale, maxSide / Math.max(r.width, r.height, 1));
    canvas.width = Math.max(2, Math.round(r.width * k));
    canvas.height = Math.max(2, Math.round(r.height * k));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();

  let pointer = { x: 0, y: 0 };
  let smooth = { x: 0, y: 0 };
  const onMove = (e: PointerEvent) => {
    pointer = { x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1 };
  };
  if (!reduced) addEventListener('pointermove', onMove, { passive: true });

  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const start = performance.now();
  let visible = true;
  let raf = 0;
  let frames = 0;
  let slowFrames = 0;
  let last = performance.now();
  let ready = false;
  let still = false;

  const draw = (now: number) => {
    const t = Number.isFinite(debugT) ? debugT : reduced ? 20 : (now - start) / 1000;
    let carve = ease(Math.min(1, Math.max(0, (t - 0.6) / 3.4)));
    if (opts.mode === 'scroll' && !reduced && !still && !Number.isFinite(debugT)) {
      const r = canvas.getBoundingClientRect();
      const vh = innerHeight || 1;
      carve = ease(Math.min(1, Math.max(0, (vh * 0.9 - r.top) / (vh * 0.95))));
    }
    smooth.x += (pointer.x - smooth.x) * 0.05;
    smooth.y += (pointer.y - smooth.y) * 0.05;
    const w = canvas.width;
    const h = canvas.height;
    const aspect = w / h;
    // su schermi larghi la statua sta a destra del testo; in verticale al centro, un po' più in alto
    const shiftX = (aspect > 1.15 ? Math.min(0.42, aspect * 0.5 - 0.5) : 0) * (opts.side === 'left' ? -1 : 1);
    const shiftY = aspect > 1.15 ? -0.06 : 0.15;
    const zoom = aspect > 1.15 ? 1.28 : Math.max(1.45, (1.7 / Math.max(aspect, 0.4)) * 0.5);
    const intro = 1 - carve;
    gl.uniform1f(U.mirror, opts.mirror ? -1 : 1);
    gl.uniform2f(U.res, w, h);
    gl.uniform1f(U.time, t);
    gl.uniform1f(U.carve, carve);
    gl.uniform1f(U.yaw, (opts.mirror ? -1 : 1) * (0.5 * intro + 0.42 + 0.2 * Math.sin(t * 0.13)) + smooth.x * 0.28);
    gl.uniform1f(U.pitch, 0.04 * Math.sin(t * 0.09) + smooth.y * 0.06);
    gl.uniform2f(U.shift, shiftX, shiftY);
    gl.uniform1f(U.zoom, zoom * (1 + 0.08 * intro));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!ready) {
      ready = true;
      opts.onReady?.();
    }
  };

  // qualità adattiva: ogni 6 fotogrammi si guarda la media e si regola la risoluzione;
  // se anche al minimo il dispositivo non regge, si passa a un'immagine ferma (già scolpita)
  let acc = 0;
  let n = 0;
  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    if (frames > 2 && dt < 2000) {
      acc += dt;
      n++;
      if (n === 6) {
        const avg = acc / n;
        if (avg > 42 && maxSide > 420) {
          maxSide = Math.max(420, Math.round(maxSide * 0.72));
          resize();
        } else if (avg > 120) {
          // immagine ferma: un solo fotogramma, quindi lo si può disegnare nitido
          still = true;
          maxSide = 1100;
          resize();
        } else if (avg < 20 && maxSide < 1280) {
          maxSide = Math.min(1280, Math.round(maxSide * 1.15));
          resize();
        }
        acc = 0;
        n = 0;
      }
    } else if (frames > 2 && dt >= 2000 && maxSide > 420) {
      maxSide = 420;
      resize();
    }
    frames++;
    if (still) {
      draw(start + 20000);
      return;
    }
    draw(now);
    if (visible && !reduced && !Number.isFinite(debugT)) raf = requestAnimationFrame(loop);
  };

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting && !document.hidden;
    cancelAnimationFrame(raf);
    if (visible && !reduced && !still) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    cancelAnimationFrame(raf);
    if (visible && !reduced && !still) raf = requestAnimationFrame(loop);
  });
  const ro = new ResizeObserver(() => {
    resize();
    if (reduced || Number.isFinite(debugT)) draw(performance.now());
    else if (still) draw(start + 20000);
  });
  ro.observe(canvas);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    canvas.remove();
  });
  raf = requestAnimationFrame(loop);
  return { stop: () => cancelAnimationFrame(raf) };
}
