import * as THREE from 'three';

export interface SkyDef {
  top: string;
  horizon: string;
  bottom: string;
  sun: string;
  sunDir: [number, number, number];
  sunSize?: number;
  clouds?: number;
  cloudColor?: string;
  stars?: number;
  crack?: number;
  ring?: number; // ouroboros ring in the sky
  ringColor?: string;
  nebula?: number;
  nebulaColor?: string;
}

const vert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position,1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // push to far plane
}`;

const frag = /* glsl */ `
uniform vec3 uTop, uHorizon, uBottom, uSun, uSunDir, uCloudColor, uRingColor, uNebulaColor;
uniform float uSunSize, uClouds, uStars, uCrack, uTime, uRing, uNebula, uIntensity;
varying vec3 vDir;

float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){
  vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5;} return s; }
vec2 voronoi(vec3 p){
  vec3 b=floor(p); vec3 f=fract(p); float d1=8.0,d2=8.0;
  for(int k=-1;k<=1;k++)for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec3 g=vec3(i,j,k); vec3 o=vec3(hash(b+g),hash(b+g+11.3),hash(b+g+27.1));
    float d=length(g+o-f); if(d<d1){d2=d1;d1=d;} else if(d<d2){d2=d;}
  }
  return vec2(d1,d2);
}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h,0.0,1.0), 0.55)) : mix(uHorizon, uBottom, pow(clamp(-h,0.0,1.0),0.4));
  // horizon glow
  col += uHorizon * 0.25 * exp(-abs(h)*10.0);
  // sun
  vec3 sd = normalize(uSunDir);
  float sdot = max(dot(d, sd), 0.0);
  col += uSun * pow(sdot, 900.0/uSunSize) * 22.0;
  col += uSun * pow(sdot, 12.0) * 0.35;
  col += uSun * pow(sdot, 3.0) * 0.12;
  // nebula
  if(uNebula > 0.0){
    float n = fbm(d*2.5 + vec3(0.0, uTime*0.004, 0.0));
    float n2 = fbm(d*5.0 - 3.0);
    col += uNebulaColor * pow(n, 3.0) * uNebula * 2.2 * smoothstep(-0.1,0.4,h);
    col += uNebulaColor.bgr * pow(n2, 5.0) * uNebula * 1.2 * smoothstep(-0.1,0.4,h);
  }
  // stars
  if(uStars > 0.0){
    vec3 sp = d*220.0;
    float s = hash(floor(sp));
    float tw = 0.6 + 0.4*sin(uTime*2.0 + s*50.0);
    col += vec3(pow(s, 90.0)) * 3.0 * uStars * tw * smoothstep(0.0,0.2,h);
  }
  // clouds (projected dome)
  if(uClouds > 0.0 && h > -0.05){
    vec2 uv = d.xz / (h + 0.18);
    float c = fbm(vec3(uv*1.2 + vec2(uTime*0.01, uTime*0.004), uTime*0.01));
    c = smoothstep(0.45, 0.85, c) * uClouds;
    vec3 cc = mix(uCloudColor, uSun, pow(sdot, 4.0)*0.6);
    col = mix(col, cc, c * smoothstep(-0.05, 0.25, h));
  }
  // ouroboros ring in the sky
  if(uRing > 0.0){
    vec3 axis = normalize(vec3(0.3, 0.55, -0.78));
    float band = abs(dot(d, axis) - 0.35);
    float r = smoothstep(0.035, 0.0, band);
    float glow = exp(-band*38.0);
    float ang = atan(dot(d, normalize(cross(axis, vec3(0,1,0)))), dot(d, vec3(0,1,0)));
    float scales = 0.7 + 0.3*sin(ang*260.0);
    col += uRingColor * (r*scales*1.4 + glow*0.6) * uRing * smoothstep(-0.2, 0.2, h);
  }
  // sky cracks (the world breaking)
  if(uCrack > 0.0){
    vec2 v = voronoi(d*4.0);
    float e = smoothstep(0.06, 0.0, v.y - v.x);
    vec2 v2 = voronoi(d*11.0 + 3.0);
    float e2 = smoothstep(0.04, 0.0, v2.y - v2.x) * step(0.55, noise(d*6.0));
    float pulse = 0.7 + 0.3*sin(uTime*3.0 + v.x*10.0);
    col += vec3(1.0, 0.95, 0.85) * (e + e2*0.6) * uCrack * 4.0 * pulse * smoothstep(-0.1, 0.3, h);
    col = mix(col, col*vec3(1.2,0.7,0.6), uCrack*0.3);
  }
  gl_FragColor = vec4(col * uIntensity, 1.0);
}`;

export function createSky(def: SkyDef) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(def.top) },
      uHorizon: { value: new THREE.Color(def.horizon) },
      uBottom: { value: new THREE.Color(def.bottom) },
      uSun: { value: new THREE.Color(def.sun) },
      uSunDir: { value: new THREE.Vector3(...def.sunDir).normalize() },
      uSunSize: { value: def.sunSize ?? 1 },
      uClouds: { value: def.clouds ?? 0 },
      uCloudColor: { value: new THREE.Color(def.cloudColor ?? '#554444') },
      uStars: { value: def.stars ?? 0 },
      uCrack: { value: def.crack ?? 0 },
      uRing: { value: def.ring ?? 0 },
      uRingColor: { value: new THREE.Color(def.ringColor ?? '#ffcf8a') },
      uNebula: { value: def.nebula ?? 0 },
      uNebulaColor: { value: new THREE.Color(def.nebulaColor ?? '#4a2a7a') },
      uTime: { value: 0 },
      uIntensity: { value: 1 },
    },
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
