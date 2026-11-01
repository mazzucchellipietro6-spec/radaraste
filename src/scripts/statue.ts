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
float smax(float a,float b,float k){return -smin(-a,-b,k);}
float sdEll(vec3 p,vec3 r){float k0=length(p/r);float k1=length(p/(r*r));return k0*(k0-1.0)/k1;}
float sdBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0);}
float sdCap(vec3 p,vec3 a,vec3 b,float r){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);return length(pa-ba*h)-r;}
float sdRC(vec3 p,vec3 a,vec3 b,float r1,float r2){
  vec3 ba=b-a;float l2=dot(ba,ba);float rr=r1-r2;float a2=l2-rr*rr;float il2=1.0/l2;
  vec3 pa=p-a;float y=dot(pa,ba);float z=y-l2;vec3 xv=pa*l2-ba*y;float x2=dot(xv,xv);
  float y2=y*y*l2;float z2=z*z*l2;float k=sign(rr)*rr*rr*x2;
  if(sign(z)*a2*z2>k)return sqrt(x2+z2)*il2-r2;
  if(sign(y)*a2*y2<k)return sqrt(x2+y2)*il2-r1;
  return (sqrt(x2*a2*il2)+y*rr)*il2-r1;}

// ---------------------------------------------------------------- testa
// Testa reclinata all'indietro e girata, occhi chiusi, capelli a riccioli lavorati col trapano.
const vec3 HEAD=vec3(0.03,0.85,0.025);
float head(vec3 q){
  vec3 h=(q-HEAD)/1.13;
  h.yz=rot(-0.38)*h.yz;
  h.xz=rot(0.42)*h.xz;
  float d=sdEll(h-vec3(0.0,0.035,-0.015),vec3(0.094,0.108,0.112));
  d=smin(d,sdEll(h-vec3(0.0,-0.03,0.04),vec3(0.072,0.085,0.074)),0.035);
  d=smin(d,sdEll(h-vec3(0.0,-0.074,0.035),vec3(0.064,0.044,0.06)),0.03);
  d=smin(d,sdEll(h-vec3(0.0,-0.106,0.074),vec3(0.028,0.022,0.02)),0.02);
  d=smin(d,sdEll(h-vec3(0.048,-0.006,0.068),vec3(0.028,0.019,0.024)),0.02);
  d=smin(d,sdEll(h-vec3(-0.048,-0.006,0.068),vec3(0.028,0.019,0.024)),0.02);
  d=smin(d,sdEll(h-vec3(0.0,0.03,0.086),vec3(0.068,0.016,0.026)),0.018);
  // orbite e palpebre chiuse
  d=smax(d,-sdEll(h-vec3(0.032,0.008,0.101),vec3(0.021,0.013,0.016)),0.01);
  d=smax(d,-sdEll(h-vec3(-0.032,0.008,0.101),vec3(0.021,0.013,0.016)),0.01);
  d=smin(d,sdEll(h-vec3(0.032,0.005,0.092),vec3(0.019,0.01,0.011)),0.005);
  d=smin(d,sdEll(h-vec3(-0.032,0.005,0.092),vec3(0.019,0.01,0.011)),0.005);
  // naso
  d=smin(d,sdRC(h,vec3(0.0,0.02,0.1),vec3(0.0,-0.034,0.121),0.01,0.014),0.012);
  d=smin(d,sdEll(h-vec3(0.011,-0.043,0.111),vec3(0.01,0.008,0.01)),0.006);
  d=smin(d,sdEll(h-vec3(-0.011,-0.043,0.111),vec3(0.01,0.008,0.01)),0.006);
  // labbra
  d=smin(d,sdEll(h-vec3(0.0,-0.066,0.099),vec3(0.024,0.008,0.012)),0.008);
  d=smin(d,sdEll(h-vec3(0.0,-0.081,0.096),vec3(0.021,0.009,0.012)),0.008);
  d=smax(d,-sdEll(h-vec3(0.0,-0.0735,0.106),vec3(0.021,0.0022,0.009)),0.003);
  // orecchie
  d=smin(d,sdEll(h-vec3(0.09,0.0,-0.01),vec3(0.012,0.029,0.019)),0.01);
  d=smin(d,sdEll(h-vec3(-0.09,0.0,-0.01),vec3(0.012,0.029,0.019)),0.01);
  // capelli: calotta con riccioli
  float hair=sdEll(h-vec3(0.0,0.06,-0.03),vec3(0.104,0.098,0.118));
  float mask=smoothstep(-0.01,0.03,h.y-0.012-h.z*0.55);
  vec3 c=h*62.0;
  float curls=sin(c.x)*sin(c.y+1.3)*sin(c.z+0.7);
  hair-=mask*(0.007*curls+0.006*noise(h*90.0));
  d=smin(d,mix(d+0.02,hair,mask),0.012);
  return d*1.13;
}

// ---------------------------------------------------------------- mani
float hand(vec3 q,vec3 palm,vec3 dir,vec3 side,float s){
  float d=sdEll(q-palm,vec3(0.05,0.035,0.022)*s);
  for(int i=0;i<4;i++){
    float k=float(i)-1.5;
    vec3 a=palm+side*(k*0.017*s)+dir*0.03*s;
    vec3 b=a+dir*(0.055-abs(k)*0.008)*s+side*k*0.006*s;
    d=smin(d,sdCap(q,a,b,0.0095*s),0.01);
  }
  return d;
}

// ---------------------------------------------------------------- corpo
float figure(vec3 p){
  vec3 q=p;
  q.xz=rot(0.22*smoothstep(-0.4,0.7,q.y))*q.xz;
  q.xy=rot(-0.06*smoothstep(-0.2,0.6,q.y))*q.xy;
  // gabbia toracica e petto
  float d=sdEll(q-vec3(0.0,0.30,-0.02),vec3(0.27,0.30,0.17));
  d=smin(d,sdEll(q-vec3(0.12,0.405,0.082),vec3(0.145,0.074,0.066)),0.025);
  d=smin(d,sdEll(q-vec3(-0.12,0.405,0.082),vec3(0.145,0.074,0.066)),0.025);
  d=smin(d,sdEll(q-vec3(0.235,0.45,0.04),vec3(0.08,0.06,0.07)),0.04);
  d=smin(d,sdEll(q-vec3(-0.235,0.45,0.04),vec3(0.08,0.06,0.07)),0.04);
  d=smax(d,-sdCap(q,vec3(0.0,0.35,0.182),vec3(0.0,0.46,0.172),0.014),0.03);
  // clavicole, trapezio, collo
  d=smin(d,sdEll(q-vec3(0.0,0.585,-0.05),vec3(0.21,0.085,0.1)),0.07);
  d=smin(d,sdEll(q-vec3(0.0,0.555,0.06),vec3(0.17,0.04,0.06)),0.05);
  d=smin(d,sdRC(q,vec3(0.0,0.55,-0.01),vec3(0.015,0.74,0.005),0.092,0.078),0.05);
  d=smin(d,sdCap(q,vec3(0.06,0.79,-0.01),vec3(0.022,0.575,0.075),0.026),0.025);
  d=smin(d,sdCap(q,vec3(-0.05,0.79,-0.01),vec3(-0.022,0.575,0.075),0.026),0.025);
  // spalle
  d=smin(d,sdEll(q-vec3(0.335,0.505,-0.005),vec3(0.105,0.125,0.11)),0.045);
  d=smin(d,sdEll(q-vec3(-0.335,0.505,-0.005),vec3(0.105,0.125,0.11)),0.045);
  // dentato e obliqui
  for(int i=0;i<3;i++){float y=0.28-float(i)*0.065;
    d=smin(d,sdEll(q-vec3(0.2,y,0.075),vec3(0.04,0.022,0.04)),0.03);
    d=smin(d,sdEll(q-vec3(-0.2,y,0.075),vec3(0.04,0.022,0.04)),0.03);}
  // addome: retto con i "quadretti", linea alba, ombelico
  d=smin(d,sdEll(q-vec3(0.0,0.05,0.025),vec3(0.175,0.26,0.13)),0.08);
  for(int i=0;i<3;i++){float y=0.17-float(i)*0.088;
    d=smin(d,sdEll(q-vec3(0.046,y,0.126),vec3(0.048,0.042,0.026)),0.032);
    d=smin(d,sdEll(q-vec3(-0.046,y,0.126),vec3(0.048,0.042,0.026)),0.032);}
  d=smax(d,-sdEll(q-vec3(0.0,-0.115,0.158),vec3(0.012,0.014,0.012)),0.008);
  d=smin(d,sdEll(q-vec3(0.18,-0.1,0.02),vec3(0.09,0.12,0.11)),0.06);
  d=smin(d,sdEll(q-vec3(-0.18,-0.1,0.02),vec3(0.09,0.12,0.11)),0.06);
  // bacino e pieghe inguinali
  d=smin(d,sdEll(q-vec3(0.0,-0.3,-0.01),vec3(0.22,0.15,0.15)),0.08);
  d=smax(d,-sdCap(q,vec3(0.17,-0.17,0.085),vec3(0.05,-0.33,0.135),0.01),0.022);
  d=smax(d,-sdCap(q,vec3(-0.17,-0.17,0.085),vec3(-0.05,-0.33,0.135),0.01),0.022);
  // cosce
  d=smin(d,sdRC(q,vec3(0.12,-0.33,0.02),vec3(0.17,-0.98,0.15),0.145,0.105),0.06);
  d=smin(d,sdRC(q,vec3(-0.12,-0.33,0.0),vec3(-0.14,-0.98,-0.02),0.145,0.105),0.06);
  // braccio alzato dietro la testa: omero, bicipite, avambraccio, mano sui capelli
  vec3 e1=vec3(0.42,0.93,0.0);
  vec3 w1=vec3(0.16,1.035,-0.02);
  float ab=length(q-vec3(0.3,0.8,0.0))-0.43;
  if(ab<0.05){
    float a=sdRC(q,vec3(0.345,0.53,0.0),e1,0.085,0.06);
    a=smin(a,sdEll(q-vec3(0.39,0.72,0.035),vec3(0.068,0.13,0.066)),0.04);
    a=smin(a,sdEll(q-vec3(0.37,0.7,-0.035),vec3(0.06,0.12,0.06)),0.04);
    a=smin(a,sdRC(q,e1,w1,0.06,0.04),0.03);
    a=smin(a,sdEll(q-vec3(0.34,0.975,0.01),vec3(0.085,0.05,0.058)),0.035);
    a=smin(a,hand(q,vec3(0.11,1.03,-0.02),normalize(vec3(-0.6,-0.5,0.3)),normalize(vec3(0.2,-0.3,-0.9)),1.0),0.02);
    d=smin(d,a,0.04);
  } else d=min(d,ab);
  // braccio che attraversa il petto, mano aperta sul petto
  vec3 e2=vec3(-0.41,0.15,0.06);
  float bb=length(q-vec3(-0.28,0.3,0.08))-0.38;
  if(bb<0.05){
    float b=sdRC(q,vec3(-0.345,0.52,0.0),e2,0.085,0.06);
    b=smin(b,sdEll(q-vec3(-0.395,0.34,0.075),vec3(0.068,0.12,0.066)),0.04);
    b=smin(b,sdEll(q-vec3(-0.385,0.33,-0.02),vec3(0.06,0.12,0.06)),0.04);
    b=smin(b,sdRC(q,e2,vec3(-0.13,0.3,0.19),0.06,0.04),0.03);
    b=smin(b,sdEll(q-vec3(-0.35,0.18,0.08),vec3(0.07,0.055,0.06)),0.035);
    b=smin(b,hand(q,vec3(-0.08,0.335,0.205),normalize(vec3(1.0,0.15,-0.1)),normalize(vec3(0.0,1.0,0.25)),1.0),0.02);
    d=smin(d,b,0.04);
  } else d=min(d,bb);
  // testa
  float hb=length(q-HEAD)-0.24;
  if(hb<0.03)d=smin(d,head(q),0.035);else d=min(d,hb);
  return d+0.0007*noise(p*70.0);
}

// ---------------------------------------------------------------- blocco
// Blocco di marmo: si toglie tutto ciò che sta davanti al fronte di scavo. Sulle facce grezze
// restano i segni della gradina (scalpello a denti), a gruppi con direzioni diverse.
float chisel(vec3 p){
  // due direzioni di colpi che si alternano a chiazze morbide, più la granulosità della subbia
  float m=smoothstep(0.35,0.65,noise(p*2.6));
  float a1=0.5+noise(p*1.3)*0.6;
  float a2=a1+1.25;
  vec3 r=p+0.02*vec3(noise(p*9.0),noise(p*9.0+4.0),0.0);
  float g1=sin(dot(r.xy+r.z*0.4,vec2(cos(a1),sin(a1)))*80.0);
  float g2=sin(dot(r.zy+r.x*0.4,vec2(cos(a2),sin(a2)))*80.0);
  float g=mix(g1,g2,m)*(0.6+0.4*noise(p*14.0));
  return 0.0015*g+0.011*(fbm(p*10.0)-0.5);
}
float stone(vec3 p){
  float b=sdBox(p-vec3(0.0,0.08,-0.12),vec3(0.62,1.12,0.42))-0.02;
  float zf=mix(-0.13,0.4,smoothstep(-0.42,-0.8,p.y))+0.07*(fbm(p*3.0)-0.5);
  float zc=mix(0.62,zf,uCarve);
  float r=max(b,p.z-zc);
  return r+chisel(p);
}

vec3 toLocal(vec3 p){
  p.x*=uMirror;
  p-=vec3(0.0,0.1,-0.05);
  p.xz=rot(uYaw)*p.xz;
  p.yz=rot(uPitch)*p.yz;
  return p+vec3(0.0,0.1,-0.05);
}
float map(vec3 p){p=toLocal(p);return smin(figure(p),stone(p),0.025);}

vec3 calcNormal(vec3 p){vec2 e=vec2(0.0011,-0.0011);
  return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx));}
float softShadow(vec3 ro,vec3 rd){float res=1.0;float t=0.02;
  for(int i=0;i<24;i++){float h=map(ro+rd*t);res=min(res,9.0*h/t);t+=clamp(h,0.012,0.18);if(res<0.02||t>2.5)break;}
  return clamp(res,0.0,1.0);}
float calcAO(vec3 p,vec3 n){float o=0.0,s=1.0;for(int i=0;i<5;i++){float h=0.012+0.05*float(i);o+=(h-map(p+n*h))*s;s*=0.75;}
  return clamp(1.0-2.4*o,0.0,1.0);}

// Statuario: bianco caldo, venature grigie molto sottili e qualche cristallo di calcite che brilla
vec3 marble(vec3 p,float polish){
  float v=fbm(p*2.0);
  float vein=1.0-smoothstep(0.0,0.05,abs(sin((p.x*1.2+p.y*2.0+p.z*0.7)*2.6+v*7.0)));
  float fine=1.0-smoothstep(0.0,0.03,abs(sin((p.x*2.1-p.y*1.2+p.z)*6.5+fbm(p*5.0)*9.0)));
  vec3 c=vec3(0.925,0.91,0.885)*(0.96+0.04*noise(p*40.0));
  c=mix(c,vec3(0.58,0.6,0.63),vein*0.22+fine*0.07);
  return mix(c*vec3(0.88,0.86,0.82),c,polish);
}

vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}

void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  vec2 c0=uv-uShift;
  vec3 bg=mix(vec3(0.03,0.03,0.035),vec3(0.105,0.1,0.095),smoothstep(-0.9,0.9,uv.x*0.25+uv.y*0.6+0.25));
  bg+=vec3(0.2,0.17,0.13)*exp(-dot(c0-vec2(0.05,0.12),c0-vec2(0.05,0.12))*3.2)*0.5;
  vec3 col=bg;
  vec3 ro=vec3(0.0,0.15,3.4);
  vec3 rd=normalize(vec3((uv-uShift)*0.68*uZoom,-1.0));
  vec3 oc=ro-vec3(0.0,0.1,-0.05);
  float bq=dot(oc,rd);float cq=dot(oc,oc)-1.5*1.5;float disc=bq*bq-cq;
  if(disc>0.0){
    float t=max(0.0,-bq-sqrt(disc));float tmax=-bq+sqrt(disc);
    bool hit=false;
    for(int i=0;i<110;i++){vec3 p=ro+rd*t;float d=map(p);if(d<0.0009*t){hit=true;break;}t+=d*0.85;if(t>tmax)break;}
    if(hit){
      vec3 p=ro+rd*t;vec3 n=calcNormal(p);vec3 lp=toLocal(p);
      float fig=figure(lp);float st=stone(lp);
      float polish=smoothstep(-0.004,0.02,st-fig);
      float fresh=(1.0-polish)*smoothstep(0.08,0.0,abs(lp.z-mix(0.62,-0.13,uCarve)))*(1.0-uCarve)*1.5;
      float ao=calcAO(p,n);
      vec3 alb=marble(lp,polish);
      // patina nelle cavità, come sulle statue vere
      alb*=mix(vec3(0.74,0.69,0.6),vec3(1.0),smoothstep(0.15,0.9,ao));
      vec3 L1=normalize(vec3(0.85,0.55,0.4));
      vec3 L2=normalize(vec3(-0.85,0.3,-0.45));
      vec3 L3=normalize(vec3(-0.5,0.2,0.85));
      float sh=softShadow(p+n*0.004,L1);
      float ndl=dot(n,L1);
      float dif=clamp((ndl+0.1)/1.1,0.0,1.0);
      // luce che entra nel marmo: banda calda sul terminatore e ombre meno nere
      float sss=smoothstep(-0.35,0.15,ndl)*(1.0-smoothstep(0.0,0.55,ndl));
      vec3 hv=normalize(L1-rd);
      float rough=mix(0.75,0.32,polish);
      float spe=pow(clamp(dot(n,hv),0.0,1.0),2.0/(rough*rough*rough))*mix(0.03,0.32,polish)*sh;
      float fre=pow(clamp(1.0+dot(n,rd),0.0,1.0),4.0);
      float glint=step(0.985,noise(lp*420.0))*pow(clamp(dot(n,hv),0.0,1.0),6.0)*sh*polish;
      col=alb*vec3(1.0,0.93,0.82)*1.85*dif*mix(0.2,1.0,sh);
      col+=alb*vec3(1.0,0.72,0.55)*sss*0.26*mix(0.6,1.0,sh);
      col+=alb*vec3(0.3,0.33,0.4)*(0.55+0.45*n.y)*0.3*ao;
      col+=alb*vec3(0.5,0.58,0.72)*pow(clamp(dot(n,L2),0.0,1.0),1.4)*1.0*ao;
      col+=alb*vec3(0.42,0.44,0.5)*clamp(dot(n,L3),0.0,1.0)*0.1*ao;
      col+=alb*vec3(0.9,0.85,0.8)*fre*0.22*ao;
      col+=spe*vec3(1.0,0.96,0.9)+glint*vec3(1.2,1.15,1.05);
      col+=fresh*vec3(0.32,0.28,0.22);
      col=mix(col,bg,smoothstep(2.6,4.6,t));
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
  col=aces(col*0.98);
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
  const qs = new URLSearchParams(location.search);
  const debugT = Number(qs.get('statueTime') ?? NaN);
  const debugYaw = Number(qs.get('statueYaw') ?? NaN);
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
    gl.uniform1f(U.yaw, Number.isFinite(debugYaw) ? debugYaw : (opts.mirror ? -1 : 1) * (0.5 * intro + 0.32 + 0.16 * Math.sin(t * 0.13)) + smooth.x * 0.28);
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
